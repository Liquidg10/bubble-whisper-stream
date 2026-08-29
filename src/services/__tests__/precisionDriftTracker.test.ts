import { describe, it, expect, beforeEach } from 'vitest';
import { precisionDriftTracker } from '../precisionDriftTracker';
import { decisionTraceService } from '../decisionTraceService';

/**
 * Regression coverage for the metadata key-path defect.
 *
 * autoWritePrecisionGate writes its scoring components to `metadata.result`.
 * This tracker previously read them from the top level of `metadata`, so
 * `entityFillRate` and `userTrustAvg` were structurally pinned to 0 on every
 * snapshot — including the snapshot that feeds unifiedRollbackService's
 * `actionRequired` trigger.
 */

function gateShapedTrace(over: Partial<Record<string, unknown>> = {}) {
  return {
    feature: 'calendar' as const,
    signals: [],
    confidenceThreshold: 0.6,
    finalConfidence: 0.8,
    decision: 'draft' as const,
    action: 'Auto-write precision gate for calendar',
    becauseText: 'probe',
    metadata: {
      input: { feature: 'calendar', entityCount: 3, hasUserTrust: true },
      result: { score: 0.8, decision: 'draft', entityFillRate: 0.9, userTrustScore: 0.72, historyInfluence: 0.5, policyGates: [] },
      thresholds: {}
    },
    undoable: false,
    ...over
  };
}

describe('precisionDriftTracker — gate metadata key path', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
    precisionDriftTracker.clearSnapshots();
  });

  it('reports the entity fill rate the gate actually recorded', async () => {
    decisionTraceService.addTrace(gateShapedTrace() as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.totalDecisions).toBe(1);
    expect(snap.entityFillRate).toBeCloseTo(0.9, 5);
  });

  it('reports the user trust score the gate actually recorded', async () => {
    decisionTraceService.addTrace(gateShapedTrace() as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.userTrustAvg).toBeCloseTo(0.72, 5);
  });

  it('carries the metrics into the per-feature breakdown', async () => {
    decisionTraceService.addTrace(gateShapedTrace() as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.featureBreakdown.calendar?.entityFill).toBeCloseTo(0.9, 5);
  });

  it('still accepts a flat metadata shape from any other trace producer', async () => {
    decisionTraceService.addTrace(gateShapedTrace({
      metadata: { telemetryKind: 'acceptance', entityFillRate: 0.4, userTrustScore: 0.3 }
    }) as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.entityFillRate).toBeCloseTo(0.4, 5);
    expect(snap.userTrustAvg).toBeCloseTo(0.3, 5);
  });

  it('reports 0 rather than NaN when a trace carries no metrics at all', async () => {
    decisionTraceService.addTrace(gateShapedTrace({
      metadata: { telemetryKind: 'acceptance', note: 'no metrics here' }
    }) as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.entityFillRate).toBe(0);
    expect(snap.userTrustAvg).toBe(0);
    expect(Number.isNaN(snap.entityFillRate)).toBe(false);
  });

  it('keeps zero metrics in mixed averages instead of biasing upward', async () => {
    decisionTraceService.addTrace(gateShapedTrace({
      metadata: {
        telemetryKind: 'acceptance',
        result: { entityFillRate: 0, userTrustScore: 0 }
      }
    }) as never);
    decisionTraceService.addTrace(gateShapedTrace({
      metadata: {
        telemetryKind: 'acceptance',
        result: { entityFillRate: 1, userTrustScore: 1 }
      }
    }) as never);

    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.entityFillRate).toBe(0.5);
    expect(snap.userTrustAvg).toBe(0.5);
  });

  it('reports insufficient data when decisions have no explicit user outcomes', async () => {
    const traceId = decisionTraceService.addTrace(gateShapedTrace({
      decision: 'auto-write'
    }) as never);
    decisionTraceService.recordExecution(traceId, 'succeeded', { source: 'calendar-api' });

    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.accuracy).toBeNull();
    expect(snap.outcomeDecisions).toBe(0);
    expect(snap.outcomeCoverage).toBe(0);
    expect(snap.evidenceStatus).toBe('insufficient-data');
  });

  it('uses only explicit final outcomes in the acceptance denominator', async () => {
    const accepted = decisionTraceService.addTrace(gateShapedTrace() as never);
    const rejected = decisionTraceService.addTrace(gateShapedTrace() as never);
    const modified = decisionTraceService.addTrace(gateShapedTrace() as never);
    const undone = decisionTraceService.addTrace(gateShapedTrace() as never);
    decisionTraceService.addTrace(gateShapedTrace() as never); // unresolved

    decisionTraceService.recordUserAction(accepted, 'accept', { source: 'test' });
    decisionTraceService.recordUserAction(rejected, 'reject', { source: 'test' });
    decisionTraceService.recordUserAction(modified, 'modify', { source: 'test' });
    decisionTraceService.recordUserAction(undone, 'accept', { source: 'test' });
    decisionTraceService.recordUndoCompleted(undone, 'undo-1', 'test');

    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.totalDecisions).toBe(5);
    expect(snap.outcomeDecisions).toBe(4);
    expect(snap.accuracy).toBe(0.25);
    expect(snap.outcomeCoverage).toBe(0.8);
    expect(snap.featureBreakdown.calendar.accuracy).toBe(0.25);
    expect(snap.featureBreakdown.calendar.outcomeDecisions).toBe(4);
  });

  it('includes reminder gate traces using their canonical input feature', async () => {
    const traceId = decisionTraceService.addTrace(gateShapedTrace({
      feature: 'context',
      metadata: {
        input: { feature: 'reminder' },
        result: { entityFillRate: 0.5, userTrustScore: 0.5 }
      }
    }) as never);
    decisionTraceService.recordUserAction(traceId, 'accept', { source: 'test' });

    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.featureBreakdown.reminder.accuracy).toBe(1);
    expect(snap.featureBreakdown.reminder.decisions).toBe(1);
  });

  it('does not label an acceptance-rate improvement as degradation', () => {
    const baseline = {
      timestamp: 1,
      accuracy: 0.4,
      entityFillRate: 0.5,
      userTrustAvg: 0.5,
      featureBreakdown: {},
      totalDecisions: 5,
      outcomeDecisions: 5,
      outcomeCoverage: 1,
      evidenceStatus: 'measured' as const,
      avgConfidence: 0.7
    };
    const improved = { ...baseline, timestamp: 2, accuracy: 0.8 };

    const metrics = precisionDriftTracker.calculateDriftMetrics([baseline, improved]);

    expect(metrics?.weekOverWeekAccuracy).toBeCloseTo(0.4);
    expect(metrics?.featureDriftSeverity).toBe('stable');
  });

  it('still labels a material acceptance-rate decline as high drift', () => {
    const baseline = {
      timestamp: 1,
      accuracy: 0.8,
      entityFillRate: 0.5,
      userTrustAvg: 0.5,
      featureBreakdown: {},
      totalDecisions: 5,
      outcomeDecisions: 5,
      outcomeCoverage: 1,
      evidenceStatus: 'measured' as const,
      avgConfidence: 0.7
    };
    const declined = { ...baseline, timestamp: 2, accuracy: 0.4 };

    const metrics = precisionDriftTracker.calculateDriftMetrics([baseline, declined]);

    expect(metrics?.weekOverWeekAccuracy).toBeCloseTo(-0.4);
    expect(metrics?.featureDriftSeverity).toBe('high');
  });
});
