import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contextEngineService', () => ({
  contextEngineService: {
    updateSignalWeights: vi.fn(),
    getSignalWeights: vi.fn().mockResolvedValue(new Map([['intent', 0.3]]))
  }
}));

import { backgroundCalibrationService } from '../backgroundCalibrationService';
import { contextEngineService } from '../contextEngineService';
import { decisionTraceService } from '../decisionTraceService';

function addCalendarTrace() {
  return decisionTraceService.addTrace({
    feature: 'calendar',
    signals: [{ type: 'intent', value: 1, confidence: 0.8, source: 'test' }],
    confidenceThreshold: 0.6,
    finalConfidence: 0.8,
    decision: 'draft',
    action: 'Calendar draft',
    becauseText: 'Test',
    metadata: {},
    undoable: true
  });
}

describe('backgroundCalibrationService outcome evidence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    decisionTraceService.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips threshold recommendations when no user outcomes exist', async () => {
    addCalendarTrace();
    const taskId = await backgroundCalibrationService.startPrecisionAnalysis();
    await vi.runAllTimersAsync();

    const task = backgroundCalibrationService.getTaskStatus(taskId)!;
    expect(task.status).toBe('completed');
    expect(task.result?.kind).toBe('precision-threshold-analysis');
    if (task.result?.kind !== 'precision-threshold-analysis') throw new Error('Expected precision analysis');
    expect(task.result.evidenceStatus).toBe('insufficient-data');
    expect(task.result.applied).toBe(false);
    expect(task.result.recommendations).toEqual([]);
    expect(contextEngineService.updateSignalWeights).not.toHaveBeenCalled();

    const trace = decisionTraceService.getTrace(task.result.traceId)!;
    expect(trace.action).toBe('Precision threshold analysis found insufficient evidence');
    expect(trace.becauseText).toContain('no thresholds were changed');
    expect(trace.metadata).toMatchObject({
      analysisKind: 'precision-threshold-recommendations',
      applied: false,
      recommendations: []
    });
  });

  it('calculates feature performance only from explicit outcomes', async () => {
    for (let index = 0; index < 3; index += 1) {
      const accepted = addCalendarTrace();
      decisionTraceService.recordUserAction(accepted, 'accept', {
        source: 'test',
        eventId: `precision-accept-${index}`
      });
    }
    for (let index = 0; index < 2; index += 1) {
      const rejected = addCalendarTrace();
      decisionTraceService.recordUserAction(rejected, 'reject', {
        source: 'test',
        eventId: `precision-reject-${index}`
      });
    }
    addCalendarTrace(); // unresolved

    const taskId = await backgroundCalibrationService.startPrecisionAnalysis();
    await vi.runAllTimersAsync();

    const task = backgroundCalibrationService.getTaskStatus(taskId)!;
    expect(task.status).toBe('completed');
    expect(task.result?.kind).toBe('precision-threshold-analysis');
    if (task.result?.kind !== 'precision-threshold-analysis') throw new Error('Expected precision analysis');
    expect(task.result.evidenceStatus).toBe('measured');
    expect(task.result.applied).toBe(false);
    expect(task.result.recommendations).toEqual([{
      feature: 'calendar',
      currentScore: 8 / 15,
      suggestedAdjustment: 'increase_threshold'
    }]);
    expect(contextEngineService.updateSignalWeights).not.toHaveBeenCalled();

    const trace = decisionTraceService.getTrace(task.result.traceId)!;
    expect(trace.action).toBe('Generated precision threshold recommendations');
    expect(trace.becauseText).toContain('no thresholds were changed');
    expect(trace.metadata).toMatchObject({
      applied: false,
      recommendations: task.result.recommendations
    });
  });

  it('does not rewrite a signal weight from a single observed outcome', async () => {
    const accepted = addCalendarTrace();
    decisionTraceService.recordUserAction(accepted, 'accept', { source: 'test' });

    const taskId = await backgroundCalibrationService.startContextRecalibration();
    await vi.runAllTimersAsync();

    const task = backgroundCalibrationService.getTaskStatus(taskId)!;
    expect(task.status).toBe('completed');
    expect(task.result?.kind).toBe('context-weight-calibration');
    if (task.result?.kind !== 'context-weight-calibration') throw new Error('Expected context calibration');
    expect(task.result.evidenceStatus).toBe('insufficient-data');
    expect(task.result.applied).toBe(false);
    expect(task.result.adjustedWeights).toEqual({});
    expect(contextEngineService.updateSignalWeights).not.toHaveBeenCalled();
  });

  it('shrinks repeated outcome evidence toward the current configured weight', async () => {
    for (let index = 0; index < 5; index += 1) {
      const accepted = addCalendarTrace();
      decisionTraceService.recordUserAction(accepted, 'accept', {
        source: 'test',
        eventId: `accept-${index}`
      });
    }

    const taskId = await backgroundCalibrationService.startContextRecalibration();
    await vi.runAllTimersAsync();

    const task = backgroundCalibrationService.getTaskStatus(taskId)!;
    const updatedWeights = vi.mocked(contextEngineService.updateSignalWeights).mock.calls[0]?.[0];
    expect(task.result?.kind).toBe('context-weight-calibration');
    if (task.result?.kind !== 'context-weight-calibration') throw new Error('Expected context calibration');
    expect(task.result.evidenceStatus).toBe('measured');
    expect(task.result.applied).toBe(true);
    expect(updatedWeights?.get('intent')).toBeCloseTo(0.5333, 3);
    expect(updatedWeights?.get('intent')).toBeLessThan(0.9);
  });

  it('runs both calibration operations for a combined task', async () => {
    const taskId = await backgroundCalibrationService.startCombinedCalibrationReview();
    await vi.runAllTimersAsync();

    const task = backgroundCalibrationService.getTaskStatus(taskId)!;
    expect(task.status).toBe('completed');
    expect(task.progress).toBe(100);
    expect(task.result?.kind).toBe('context-calibration-and-precision-analysis');
    if (task.result?.kind !== 'context-calibration-and-precision-analysis') {
      throw new Error('Expected combined calibration and analysis');
    }
    expect(task.result.applied).toBe(false);
    expect(task.result.context).toMatchObject({
      kind: 'context-weight-calibration',
      applied: false,
      adjustedWeights: {},
      evidenceStatus: 'insufficient-data'
    });
    expect(task.result.precision).toMatchObject({
      kind: 'precision-threshold-analysis',
      applied: false,
      recommendations: [],
      evidenceStatus: 'insufficient-data'
    });
    expect(decisionTraceService.getTrace(task.result.precision.traceId)?.action)
      .toBe('Precision threshold analysis found insufficient evidence');
  });
});
