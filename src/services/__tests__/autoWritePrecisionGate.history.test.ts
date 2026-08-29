import { beforeEach, describe, expect, it } from 'vitest';
import { autoWritePrecisionGate } from '../autoWritePrecisionGate';
import { decisionTraceService } from '../decisionTraceService';

const historyGate = autoWritePrecisionGate as unknown as {
  calculateHistoryInfluence(feature: string): Promise<number>;
};

function addTrace(options: {
  feature?: 'calendar' | 'context';
  inputFeature?: 'calendar' | 'reminder';
  guardrailOnly?: boolean;
}) {
  return decisionTraceService.addTrace({
    feature: options.feature || 'calendar',
    signals: [],
    confidenceThreshold: 0.6,
    finalConfidence: 0.8,
    decision: 'draft',
    action: options.guardrailOnly ? 'Email guardrail' : 'Auto-write precision gate',
    becauseText: 'Test trace',
    metadata: options.guardrailOnly ? {} : {
      telemetryKind: 'acceptance',
      input: { feature: options.inputFeature || 'calendar' },
      result: { entityFillRate: 0.8, userTrustScore: 0.7 }
    },
    undoable: false
  });
}

describe('autoWritePrecisionGate history evidence', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
  });

  it('keeps neutral history when activity has no observed user outcomes', async () => {
    for (let index = 0; index < 6; index += 1) {
      addTrace({ guardrailOnly: true });
    }

    await expect(historyGate.calculateHistoryInfluence('calendar')).resolves.toBe(0.5);
  });

  it('finds reminder outcomes stored under the context trace feature', async () => {
    const accepted = addTrace({ feature: 'context', inputFeature: 'reminder' });
    decisionTraceService.recordUserAction(accepted, 'accept', { source: 'test' });

    await expect(historyGate.calculateHistoryInfluence('reminder')).resolves.toBe(1);
  });

  it('uses only resolved canonical decisions in the history rate', async () => {
    const accepted = addTrace({ inputFeature: 'calendar' });
    const rejected = addTrace({ inputFeature: 'calendar' });
    addTrace({ inputFeature: 'calendar' });
    addTrace({ guardrailOnly: true });
    decisionTraceService.recordUserAction(accepted, 'accept', { source: 'test' });
    decisionTraceService.recordUserAction(rejected, 'reject', { source: 'test' });

    await expect(historyGate.calculateHistoryInfluence('calendar')).resolves.toBe(0.5);
  });
});
