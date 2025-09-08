import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decisionTraceService, type DecisionSignal } from '../decisionTraceService';

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
      expect(text).toBe('Low confidence - suggest');
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