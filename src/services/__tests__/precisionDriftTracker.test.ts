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
      metadata: { entityFillRate: 0.4, userTrustScore: 0.3 }
    }) as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.entityFillRate).toBeCloseTo(0.4, 5);
    expect(snap.userTrustAvg).toBeCloseTo(0.3, 5);
  });

  it('reports 0 rather than NaN when a trace carries no metrics at all', async () => {
    decisionTraceService.addTrace(gateShapedTrace({ metadata: { note: 'no metrics here' } }) as never);
    const snap = await precisionDriftTracker.createSnapshot();
    expect(snap.entityFillRate).toBe(0);
    expect(snap.userTrustAvg).toBe(0);
    expect(Number.isNaN(snap.entityFillRate)).toBe(false);
  });
});
