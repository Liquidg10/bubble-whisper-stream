import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contextEngineService', () => ({
  contextEngineService: {
    getSignalWeights: vi.fn().mockResolvedValue(new Map([
      ['time_pressure', 0.3],
      ['sender_trust', 0.2],
      ['content_certainty', 0.15],
      ['ambiguity', 0.15],
      ['quiet_hours', 0.15]
    ])),
    updateSignalWeights: vi.fn(),
    resetSignalWeights: vi.fn()
  }
}));

import { decisionTraceService } from '../decisionTraceService';
import { contextEngineService } from '../contextEngineService';
import { precisionDriftTracker } from '../precisionDriftTracker';
import { unifiedRollbackService } from '../unifiedRollbackService';

function addCalendarTrace(decision: 'draft' | 'auto-write' = 'draft') {
  return decisionTraceService.addTrace({
    feature: 'calendar',
    signals: [],
    confidenceThreshold: 0.6,
    finalConfidence: 0.8,
    decision,
    action: 'Calendar decision',
    becauseText: 'Test',
    metadata: {},
    undoable: true
  });
}

describe('unifiedRollbackService outcome evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    decisionTraceService.clear();
    precisionDriftTracker.clearSnapshots();
  });

  it('does not request rollback when no user outcomes have been observed', async () => {
    const traceId = addCalendarTrace('auto-write');
    decisionTraceService.recordExecution(traceId, 'succeeded', { source: 'calendar-api' });

    const snapshot = await unifiedRollbackService.createUnifiedSnapshot();

    expect(snapshot.context.acceptanceRate).toBeNull();
    expect(snapshot.context.outcomeDecisions).toBe(0);
    expect(snapshot.precision.accuracy).toBeNull();
    expect(snapshot.combined.overallHealth).toBeNull();
    expect(snapshot.combined.evidenceStatus).toBe('insufficient-data');
    expect(snapshot.combined.driftSeverity).toBe('stable');
    expect(snapshot.combined.actionRequired).toBe(false);
  });

  it('uses the same explicit-outcome formula for context and precision health', async () => {
    const accepted = addCalendarTrace();
    const rejected = addCalendarTrace();
    decisionTraceService.recordUserAction(accepted, 'accept', { source: 'test' });
    decisionTraceService.recordUserAction(rejected, 'reject', { source: 'test' });

    const snapshot = await unifiedRollbackService.createUnifiedSnapshot();

    expect(snapshot.context.acceptanceRate).toBe(0.5);
    expect(snapshot.context.outcomeDecisions).toBe(2);
    expect(snapshot.precision.accuracy).toBe(0.5);
    expect(snapshot.combined.overallHealth).toBe(0.5);
    expect(snapshot.combined.evidenceStatus).toBe('measured');
    expect(snapshot.combined.driftSeverity).toBe('stable');
    expect(snapshot.combined.actionRequired).toBe(true);
  });

  it('returns false for precision-only rollback while precision restore is unavailable', async () => {
    const stableSnapshot = await unifiedRollbackService.createUnifiedSnapshot();
    unifiedRollbackService.saveUnifiedSnapshot(stableSnapshot, true);

    const restored = await unifiedRollbackService.restoreToStable({
      restoreContext: false,
      restorePrecision: true,
      reason: 'Precision-only test'
    });

    expect(restored).toBe(false);
    expect(contextEngineService.updateSignalWeights).not.toHaveBeenCalled();
    expect(decisionTraceService.getTraces({ decision: 'rollback' })).toEqual([]);
  });

  it('reports only the context component actually restored during a combined rollback', async () => {
    const stableSnapshot = await unifiedRollbackService.createUnifiedSnapshot();
    stableSnapshot.context.weights = { intent: 0.7 };
    unifiedRollbackService.saveUnifiedSnapshot(stableSnapshot, true);

    const restored = await unifiedRollbackService.restoreToStable({
      restoreContext: true,
      restorePrecision: true,
      reason: 'Combined test'
    });

    expect(restored).toBe(true);
    expect(contextEngineService.updateSignalWeights).toHaveBeenCalledWith(new Map([['intent', 0.7]]));

    const rollbackTrace = decisionTraceService.getTraces({ decision: 'rollback' })[0];
    expect(rollbackTrace.action).toBe('Restored context weights to stable configuration');
    expect(rollbackTrace.becauseText).toContain('precision settings were not restored');
    expect(rollbackTrace.metadata).toMatchObject({
      requestedComponents: ['context', 'precision'],
      restoredComponents: ['context'],
      skippedComponents: ['precision'],
      precisionRestoreAvailable: false
    });
  });
});
