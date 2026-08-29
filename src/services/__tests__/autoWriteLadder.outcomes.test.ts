import { beforeEach, describe, expect, it } from 'vitest';
import { autoWriteLadderService } from '../autoWriteLadder';
import {
  decisionTraceService,
  getDecisionUserAction
} from '../decisionTraceService';

function addDraftTrace() {
  return decisionTraceService.addTrace({
    feature: 'task',
    signals: [],
    confidenceThreshold: 0.6,
    finalConfidence: 0.75,
    decision: 'draft',
    action: 'Create task',
    becauseText: 'Test',
    metadata: {},
    undoable: true
  });
}

function storeDraft(id: string, traceId: string) {
  localStorage.setItem('mm-drafts', JSON.stringify([{
    id,
    feature: 'task',
    action: 'Create task',
    context: {
      feature: 'task',
      action: 'Create task',
      confidence: 0.75,
      signals: []
    },
    traceId,
    createdAt: Date.now()
  }]));
}

describe('autoWriteLadderService draft outcomes', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
  });

  it('fails closed, retains the draft, and records no acceptance without a task-store adapter', async () => {
    const traceId = addDraftTrace();
    storeDraft('draft-1', traceId);

    await expect(autoWriteLadderService.executeDraft('draft-1')).rejects.toThrow(
      'Task execution is unavailable in AutoWriteLadder'
    );

    const trace = decisionTraceService.getTrace(traceId)!;
    expect(getDecisionUserAction(trace)).toBeNull();
    expect(trace.metadata.executionStatus).toBe('failed');
    expect(trace.metadata.executionReference).toContain('no task-store write was attempted');
    expect(autoWriteLadderService.getDrafts()).toHaveLength(1);
    expect(autoWriteLadderService.getDrafts()[0].id).toBe('draft-1');
  });

  it('cannot fabricate calendar success from a high-confidence auto-write decision', async () => {
    await expect(autoWriteLadderService.processAction({
      feature: 'calendar',
      action: { title: 'Provider-backed event required' },
      confidence: 0.95,
      signals: [],
      metadata: {
        isOwnCalendar: true,
        daysAhead: 1,
        hasTime: true,
        hasLocation: true,
        hasInvitees: false
      }
    })).rejects.toThrow('Calendar execution is unavailable in AutoWriteLadder');

    const trace = decisionTraceService.getTraces()[0];
    expect(trace.decision).toBe('auto-write');
    expect(trace.undoable).toBe(false);
    expect(trace.metadata.executionStatus).toBe('failed');
    expect(trace.metadata.executionReference).toContain('no provider-backed write was attempted');
    expect(getDecisionUserAction(trace)).toBeNull();
    expect(trace.metadata.outcomes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'execution', status: 'succeeded' }),
      expect.objectContaining({ kind: 'user-action', action: 'accept' })
    ]));
  });

  it('records rejection only after the draft is removed', () => {
    const traceId = addDraftTrace();
    storeDraft('draft-2', traceId);

    expect(autoWriteLadderService.deleteDraft('draft-2')).toBe(true);

    const trace = decisionTraceService.getTrace(traceId)!;
    expect(getDecisionUserAction(trace)).toBe('reject');
    expect(autoWriteLadderService.getDrafts()).toEqual([]);
  });

  it('does not fabricate an outcome for a missing draft', () => {
    const traceId = addDraftTrace();
    expect(autoWriteLadderService.deleteDraft('missing')).toBe(false);
    expect(getDecisionUserAction(decisionTraceService.getTrace(traceId)!)).toBeNull();
  });
});
