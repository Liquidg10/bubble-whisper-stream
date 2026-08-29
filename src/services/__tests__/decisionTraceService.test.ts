import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  decisionTraceService,
  getDecisionUserAction,
  isAcceptanceTelemetryTrace,
  summarizeDecisionOutcomes,
  type DecisionSignal
} from '../decisionTraceService';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('DecisionTraceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.setItem.mockReset();
    decisionTraceService.clear();
  });

  describe('addTrace', () => {
    it('should add a new trace with generated ID and timestamp', () => {
      const signals: DecisionSignal[] = [
        { type: 'intent', value: 'schedule', confidence: 0.8, source: 'nlp' }
      ];

      const traceId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals,
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'auto-write',
        action: 'Created meeting with John',
        becauseText: 'Because clear intent detected',
        metadata: { title: 'Meeting with John' },
        undoable: true
      });

      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');

      const traces = decisionTraceService.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].id).toBe(traceId);
      expect(traces[0].feature).toBe('calendar');
    });

    it('should maintain maximum trace limit', () => {
      // Add more traces than the limit
      for (let i = 0; i < 1005; i++) {
        decisionTraceService.addTrace({
          feature: 'calendar',
          signals: [],
          confidenceThreshold: 0.7,
          finalConfidence: 0.8,
          decision: 'suggest',
          action: `Action ${i}`,
          becauseText: 'Test',
          metadata: {},
          undoable: false
        });
      }

      const traces = decisionTraceService.getTraces();
      expect(traces.length).toBe(1000); // Should be capped at max
    });

    it('marks a failed storage write as memory-only and excludes it from calibration', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('quota exceeded');
      });

      const traceId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.9,
        decision: 'draft',
        action: 'Review event',
        becauseText: 'Test',
        metadata: { telemetryKind: 'acceptance' },
        undoable: true
      });

      const trace = decisionTraceService.getTrace(traceId)!;
      expect(decisionTraceService.getPersistenceStatus(traceId)).toBe('memory-only');
      expect(trace.metadata.telemetryPersistence).toBe('memory-only');
      expect(isAcceptanceTelemetryTrace(trace)).toBe(false);
    });
  });

  describe('getTraces', () => {
    beforeEach(() => {
      // Add some test traces
      decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'auto-write',
        action: 'Calendar action',
        becauseText: 'Test',
        metadata: {},
        undoable: true
      });

      decisionTraceService.addTrace({
        feature: 'email',
        signals: [],
        confidenceThreshold: 0.6,
        finalConfidence: 0.7,
        decision: 'draft',
        action: 'Email action',
        becauseText: 'Test',
        metadata: {},
        undoable: false
      });
    });

    it('should return all traces when no filters applied', () => {
      const traces = decisionTraceService.getTraces();
      expect(traces).toHaveLength(2);
    });

    it('should filter by feature', () => {
      const traces = decisionTraceService.getTraces({ feature: 'calendar' });
      expect(traces).toHaveLength(1);
      expect(traces[0].feature).toBe('calendar');
    });

    it('should filter by decision', () => {
      const traces = decisionTraceService.getTraces({ decision: 'draft' });
      expect(traces).toHaveLength(1);
      expect(traces[0].decision).toBe('draft');
    });

    it('should filter undoable only', () => {
      const traces = decisionTraceService.getTraces({ undoableOnly: true });
      expect(traces).toHaveLength(1);
      expect(traces[0].undoable).toBe(true);
    });

    it('should apply limit', () => {
      const traces = decisionTraceService.getTraces({ limit: 1 });
      expect(traces).toHaveLength(1);
    });
  });

  describe('generateBecauseText', () => {
    it('should generate text from signals', () => {
      const signals: DecisionSignal[] = [
        { type: 'intent', value: 'schedule', confidence: 0.8, source: 'nlp' },
        { type: 'calendar', value: 'free', confidence: 0.7, source: 'google' }
      ];

      const text = decisionTraceService.generateBecauseText(signals, 'auto-write');
      expect(text).toContain('clear intent detected');
      expect(text).toContain('calendar shows availability');
    });

    it('should handle low confidence signals', () => {
      const signals: DecisionSignal[] = [
        { type: 'intent', value: 'maybe', confidence: 0.3, source: 'nlp' }
      ];

      const text = decisionTraceService.generateBecauseText(signals, 'suggest');
      // `generateBecauseText` gained a `privacyLayer` parameter (default
      // 'surface') that this assertion predated; it appends " • SURFACE".
      // Pin both the message and the layer rather than the old exact string.
      expect(text).toContain('Low confidence - suggest');
      expect(text).toContain('SURFACE');
    });

    it('should reflect a non-default privacy layer', () => {
      const signals: DecisionSignal[] = [
        { type: 'intent', value: 'maybe', confidence: 0.3, source: 'nlp' }
      ];

      const text = decisionTraceService.generateBecauseText(signals, 'suggest', 'deep');
      expect(text).toContain('DEEP');
      expect(text).not.toContain('SURFACE');
    });
  });

  describe('markAsUndone', () => {
    it('should mark trace as undone', () => {
      const traceId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'auto-write',
        action: 'Test action',
        becauseText: 'Test',
        metadata: {},
        undoable: true
      });

      const undoId = 'undo-123';
      const result = decisionTraceService.markAsUndone(traceId, undoId);
      
      expect(result).toBe(true);
      
      const trace = decisionTraceService.getTrace(traceId);
      expect(trace?.undoId).toBe(undoId);
    });

    it('should return false for non-existent trace', () => {
      const result = decisionTraceService.markAsUndone('non-existent', 'undo-123');
      expect(result).toBe(false);
    });
  });

  describe('observed outcomes', () => {
    const addDraftTrace = (metadata: Record<string, unknown> = {}) =>
      decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'draft',
        action: 'Test draft',
        becauseText: 'Test',
        metadata,
        undoable: true
      });

    it('records user action separately from execution status', () => {
      const traceId = addDraftTrace();

      expect(decisionTraceService.recordExecution(traceId, 'succeeded', {
        source: 'calendar-api',
        reference: 'event-1'
      })).toBe(true);
      expect(getDecisionUserAction(decisionTraceService.getTrace(traceId)!)).toBeNull();

      expect(decisionTraceService.recordUserAction(traceId, 'accept', {
        source: 'calendar-draft-widget',
        artifactId: 'event-1'
      })).toBe(true);

      const trace = decisionTraceService.getTrace(traceId)!;
      expect(trace.metadata.executionStatus).toBe('succeeded');
      expect(trace.metadata.userAction).toBe('accept');
      expect(trace.metadata.outcomes).toHaveLength(2);
    });

    it('is idempotent for retried user actions and trace creation', () => {
      const firstId = addDraftTrace({ idempotencyKey: 'surface:item:window' });
      const secondId = addDraftTrace({ idempotencyKey: 'surface:item:window' });
      expect(secondId).toBe(firstId);
      expect(decisionTraceService.getTraces()).toHaveLength(1);

      const options = {
        source: 'calendar-ai-scheduling',
        artifactId: 'task-1',
        eventId: 'accept-task-1'
      };
      decisionTraceService.recordUserAction(firstId, 'accept', options);
      const firstTimestamp = decisionTraceService.getTrace(firstId)!.metadata.userActionAt;
      decisionTraceService.recordUserAction(firstId, 'accept', options);

      const trace = decisionTraceService.getTrace(firstId)!;
      expect(trace.metadata.outcomes).toHaveLength(1);
      expect(trace.metadata.userActionAt).toBe(firstTimestamp);
    });

    it('preserves modify, accept, and completed undo as an append-only lifecycle', () => {
      const traceId = addDraftTrace();
      decisionTraceService.recordUserAction(traceId, 'modify', {
        source: 'email-draft-editor',
        eventId: 'modify-1'
      });
      decisionTraceService.recordUserAction(traceId, 'accept', {
        source: 'email-draft-editor',
        eventId: 'accept-1'
      });
      decisionTraceService.recordUndoCompleted(traceId, 'undo-1', 'email-undo');
      // A delayed retry of the earlier acceptance must not overwrite undo.
      decisionTraceService.recordUserAction(traceId, 'accept', {
        source: 'email-draft-editor',
        eventId: 'accept-1'
      });

      const trace = decisionTraceService.getTrace(traceId)!;
      expect(trace.metadata.outcomes?.map(event =>
        event.kind === 'user-action' ? event.action : event.status
      )).toEqual(['modify', 'accept', 'undo', 'reverted']);
      expect(trace.metadata.userAction).toBe('undo');
      expect(trace.metadata.executionStatus).toBe('reverted');
      expect(trace.undoId).toBe('undo-1');
    });

    it('calculates acceptance only from explicit final user outcomes', () => {
      const pendingId = addDraftTrace();
      const autoWriteId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.85,
        finalConfidence: 0.9,
        decision: 'auto-write',
        action: 'Automatic event',
        becauseText: 'Test',
        metadata: {},
        undoable: true
      });
      const acceptedId = addDraftTrace();
      const rejectedId = addDraftTrace();
      decisionTraceService.recordExecution(autoWriteId, 'succeeded', { source: 'calendar-api' });
      decisionTraceService.recordUserAction(acceptedId, 'accept', { source: 'test' });
      decisionTraceService.recordUserAction(rejectedId, 'reject', { source: 'test' });

      const summary = summarizeDecisionOutcomes(decisionTraceService.getTraces());
      expect(summary.totalDecisions).toBe(4);
      expect(summary.resolvedDecisions).toBe(2);
      expect(summary.accepted).toBe(1);
      expect(summary.acceptanceRate).toBe(0.5);
      expect(summary.outcomeCoverage).toBe(0.5);
      expect(getDecisionUserAction(decisionTraceService.getTrace(pendingId)!)).toBeNull();
    });

    it('keeps legacy outcome aliases readable without fabricating history', () => {
      const traceId = addDraftTrace({ userAction: 'accepted' });
      const trace = decisionTraceService.getTrace(traceId)!;
      expect(getDecisionUserAction(trace)).toBe('accept');
      expect(trace.metadata.outcomes).toBeUndefined();
    });

    it('excludes unrelated guardrail traces from acceptance telemetry', () => {
      const guardrailId = addDraftTrace();
      const gateId = addDraftTrace({
        input: { feature: 'calendar' },
        result: { entityFillRate: 0.8 }
      });

      expect(isAcceptanceTelemetryTrace(
        decisionTraceService.getTrace(guardrailId)!
      )).toBe(false);
      expect(isAcceptanceTelemetryTrace(
        decisionTraceService.getTrace(gateId)!
      )).toBe(true);
    });

    it('returns false when recording an outcome for a missing trace', () => {
      expect(decisionTraceService.recordUserAction('missing', 'accept', {
        source: 'test'
      })).toBe(false);
      expect(decisionTraceService.recordExecution('missing', 'failed', {
        source: 'test'
      })).toBe(false);
    });
  });

  describe('getRecentUndoable', () => {
    it('should return only undoable traces that are not undone', () => {
      const traceId1 = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'auto-write',
        action: 'Action 1',
        becauseText: 'Test',
        metadata: {},
        undoable: true
      });

      decisionTraceService.addTrace({
        feature: 'email',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'auto-write',
        action: 'Action 2',
        becauseText: 'Test',
        metadata: {},
        undoable: false // Not undoable
      });

      const traceId3 = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.7,
        finalConfidence: 0.8,
        decision: 'auto-write',
        action: 'Action 3',
        becauseText: 'Test',
        metadata: {},
        undoable: true
      });

      // Mark one as undone
      decisionTraceService.markAsUndone(traceId1, 'undo-123');

      const undoable = decisionTraceService.getRecentUndoable();
      expect(undoable).toHaveLength(1);
      expect(undoable[0].id).toBe(traceId3);
    });
  });
});
