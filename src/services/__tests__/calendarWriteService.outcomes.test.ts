import { beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateDecision, invoke } = vi.hoisted(() => ({
  evaluateDecision: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } }
}));

vi.mock('../autoWritePrecisionGate', () => ({
  autoWritePrecisionGate: { evaluateDecision }
}));

import { calendarWriteService } from '../calendarWriteService';
import { decisionTraceService, getDecisionUserAction } from '../decisionTraceService';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('calendarWriteService observed outcomes', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
    evaluateDecision.mockReset();
    invoke.mockReset();
  });

  it('creates a canonical trace for direct draft producers', async () => {
    const draft = await calendarWriteService.createEventDraft('account-1', {
      title: 'Direct draft',
      confidence: 0.72
    });

    const trace = decisionTraceService.getTrace(draft.traceId!);
    expect(trace?.metadata.telemetryKind).toBe('acceptance');
    expect(trace?.metadata.outcomeFeature).toBe('calendar');
    expect(trace?.metadata.draftId).toBe(draft.id);
    expect(trace?.finalConfidence).toBe(0.72);
    expect(getDecisionUserAction(trace!)).toBeNull();
  });

  it('coalesces concurrent confirmation so one user action creates one event', async () => {
    const provider = deferred<{
      data: { event: { id: string } };
      error: null;
    }>();
    invoke.mockReturnValue(provider.promise);
    const traceId = decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [],
      confidenceThreshold: 0.6,
      finalConfidence: 0.8,
      decision: 'draft',
      action: 'Calendar gate',
      becauseText: 'Test',
      metadata: { telemetryKind: 'acceptance' },
      undoable: true
    });
    const draft = await calendarWriteService.createEventDraft('account-1', {
      title: 'One event',
      startTime: '2026-09-01T10:00:00.000Z',
      endTime: '2026-09-01T11:00:00.000Z',
      traceId
    });

    const first = calendarWriteService.confirmDraft(draft.id, { recordUserAcceptance: true });
    const second = calendarWriteService.confirmDraft(draft.id, { recordUserAcceptance: true });
    expect(invoke).toHaveBeenCalledOnce();

    provider.resolve({ data: { event: { id: 'event-1' } }, error: null });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.eventId).toBe('event-1');
    expect(secondResult.eventId).toBe('event-1');
    expect(invoke).toHaveBeenCalledOnce();
    expect(getDecisionUserAction(decisionTraceService.getTrace(traceId)!)).toBe('accept');
    expect(decisionTraceService.getTrace(traceId)!.metadata.outcomes).toHaveLength(2);
  });

  it('does not fabricate user acceptance for a programmatic draft confirmation', async () => {
    invoke.mockResolvedValue({ data: { event: { id: 'event-sync-1' } }, error: null });
    const draft = await calendarWriteService.createEventDraft('account-1', {
      title: 'Task sync event',
      startTime: '2026-09-01T10:00:00.000Z',
      endTime: '2026-09-01T11:00:00.000Z'
    });

    const result = await calendarWriteService.confirmDraft(draft.id);

    expect(result.eventId).toBe('event-sync-1');
    const trace = decisionTraceService.getTrace(draft.traceId!)!;
    expect(trace.metadata.executionStatus).toBe('succeeded');
    expect(getDecisionUserAction(trace)).toBeNull();
  });

  it('keeps a draft pending when Calendar returns no provider event ID', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const draft = await calendarWriteService.createEventDraft('account-1', {
      title: 'Keep this draft',
      startTime: '2026-09-01T10:00:00.000Z',
      endTime: '2026-09-01T11:00:00.000Z'
    });

    await expect(calendarWriteService.confirmDraft(draft.id))
      .rejects.toThrow('Calendar provider returned no event ID');

    expect(calendarWriteService.getDrafts()).toEqual([
      expect.objectContaining({ id: draft.id })
    ]);
    const trace = decisionTraceService.getTrace(draft.traceId!);
    expect(trace?.metadata.executionStatus).toBe('failed');
    expect(getDecisionUserAction(trace!)).toBeNull();
  });

  it('keeps provider success successful when local draft cleanup fails', async () => {
    invoke.mockResolvedValue({ data: { event: { id: 'event-cleanup-1' } }, error: null });
    const draft = await calendarWriteService.createEventDraft('account-1', {
      title: 'Cleanup recovery',
      startTime: '2026-09-01T10:00:00.000Z',
      endTime: '2026-09-01T11:00:00.000Z'
    });
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'calendar_drafts') throw new Error('quota exceeded');
      return originalSetItem.call(this, key, value);
    });

    try {
      const first = await calendarWriteService.confirmDraft(draft.id, {
        recordUserAcceptance: true
      });
      const second = await calendarWriteService.confirmDraft(draft.id, {
        recordUserAcceptance: true
      });

      expect(first.eventId).toBe('event-cleanup-1');
      expect(second.eventId).toBe('event-cleanup-1');
      expect(invoke).toHaveBeenCalledOnce();
      expect(calendarWriteService.getDrafts()).toEqual([]);
      expect(decisionTraceService.getTrace(draft.traceId!)?.metadata.executionStatus).toBe('succeeded');
    } finally {
      setItem.mockRestore();
    }
  });

  it('downgrades an unsafe auto-write to a draft on the canonical trace', async () => {
    const traceId = decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [],
      confidenceThreshold: 0.85,
      finalConfidence: 0.9,
      decision: 'auto-write',
      action: 'Calendar gate',
      becauseText: 'Test',
      metadata: { telemetryKind: 'acceptance' },
      undoable: true
    });
    evaluateDecision.mockResolvedValue({
      score: 0.9,
      decision: 'auto-write',
      reasons: ['high confidence'],
      entityFillRate: 1,
      policyGatesApplied: [],
      userTrustScore: 1,
      historyInfluence: 0.5,
      canAutoWrite: true,
      traceId
    });

    const result = await calendarWriteService.createEvent('account-1', {
      title: 'External meeting',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      attendees: [{ email: 'guest@example.com' }],
      confidence: 0.9
    }, { autoWrite: true });

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      traceId,
      drafted: true,
      autoWritten: false,
      downgradedFrom: 'auto-write'
    });
    expect(calendarWriteService.getDrafts()).toEqual([
      expect.objectContaining({ id: result.id, traceId })
    ]);
    expect(decisionTraceService.getTrace(traceId)?.metadata.executionStatus).toBe('pending');
  });

  it('fails closed after a provider error without retrying a direct write', async () => {
    const traceId = decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [],
      confidenceThreshold: 0.85,
      finalConfidence: 0.9,
      decision: 'auto-write',
      action: 'Calendar gate',
      becauseText: 'Test',
      metadata: { telemetryKind: 'acceptance' },
      undoable: true
    });
    evaluateDecision.mockResolvedValue({
      score: 0.9,
      decision: 'auto-write',
      reasons: ['high confidence'],
      entityFillRate: 1,
      policyGatesApplied: [],
      userTrustScore: 1,
      historyInfluence: 0.5,
      canAutoWrite: true,
      traceId
    });
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'provider unavailable' }
    });

    await expect(calendarWriteService.createEvent('account-1', {
      title: 'Safe local event',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      attendees: []
    }, { autoWrite: true })).rejects.toThrow('Auto-write failed: provider unavailable');

    expect(invoke).toHaveBeenCalledOnce();
    expect(decisionTraceService.getTrace(traceId)?.metadata.executionStatus).toBe('failed');
  });

  it('does not count an auto-write without a provider event ID as succeeded', async () => {
    const traceId = decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [],
      confidenceThreshold: 0.85,
      finalConfidence: 0.9,
      decision: 'auto-write',
      action: 'Calendar gate',
      becauseText: 'Test',
      metadata: { telemetryKind: 'acceptance' },
      undoable: true
    });
    evaluateDecision.mockResolvedValue({
      score: 0.9,
      decision: 'auto-write',
      reasons: ['high confidence'],
      entityFillRate: 1,
      policyGatesApplied: [],
      userTrustScore: 1,
      historyInfluence: 0.5,
      canAutoWrite: true,
      traceId
    });
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    await expect(calendarWriteService.createEvent('account-1', {
      title: 'Safe local event',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      attendees: []
    }, { autoWrite: true })).rejects.toThrow('Calendar provider returned no event ID');

    expect(invoke).toHaveBeenCalledOnce();
    expect(decisionTraceService.getTrace(traceId)?.metadata.executionStatus).toBe('failed');
  });

  it('fails closed when the precision gate fails', async () => {
    evaluateDecision.mockRejectedValue(new Error('gate unavailable'));

    await expect(calendarWriteService.createEvent('account-1', {
      title: 'No bypass',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      attendees: []
    }, { autoWrite: true })).rejects.toThrow('gate unavailable');

    expect(invoke).not.toHaveBeenCalled();
  });
});
