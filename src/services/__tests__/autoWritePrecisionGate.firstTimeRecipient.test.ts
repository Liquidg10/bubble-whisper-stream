import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoWritePrecisionGate,
  type PrecisionGateInput
} from '../autoWritePrecisionGate';
import { decisionTraceService } from '../decisionTraceService';

vi.mock('../contextEngineService', () => ({
  contextEngineService: {
    generateScore: vi.fn(async () => ({
      score: 1,
      signals: [],
      because: [],
      confidence: 1,
      metadata: {
        signalCount: 0,
        totalWeight: 0,
        deterministic: true,
        timestamp: Date.now()
      }
    }))
  }
}));

vi.mock('@/integrations/supabase/client', () => {
  const query = {
    data: [],
    error: null,
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn()
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  return { supabase: { from: vi.fn(() => query) } };
});

const highConfidenceInput = (
  userTrust: PrecisionGateInput['userTrust']
): PrecisionGateInput => ({
  content: 'Lunch with Dana on Thursday at 1pm at Kaimana Beach',
  intentConfidence: 1,
  entities: {
    dateTime: {
      value: 'Thursday 1pm',
      confidence: 1,
      parsed: new Date('2026-08-27T13:00:00.000Z')
    },
    location: { value: 'Kaimana Beach', confidence: 1 },
    recipients: { emails: ['dana@example.com'], confidence: 1 }
  },
  feature: 'calendar',
  userTrust,
  currentTime: new Date('2026-08-26T12:00:00'),
  userPreferences: { autoWriteEnabled: true, featureEnabled: true }
});

describe('autoWritePrecisionGate first-time recipient tier', () => {
  beforeEach(() => {
    decisionTraceService.clear();
    for (let index = 0; index < 10; index += 1) {
      const traceId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [],
        confidenceThreshold: 0.85,
        finalConfidence: 1,
        decision: 'auto-write',
        action: 'Historical calendar decision',
        becauseText: 'Accepted provider-backed calendar action',
        metadata: {
          telemetryKind: 'acceptance',
          outcomeFeature: 'calendar',
          idempotencyKey: `first-time-history-${index}`
        },
        undoable: true
      });
      decisionTraceService.recordUserAction(traceId, 'accept', {
        source: 'test',
        artifactId: `event-${index}`
      });
    }
  });

  it('demotes an otherwise auto-writeable action with an explicit first-time receipt', async () => {
    const result = await autoWritePrecisionGate.evaluateDecision(
      highConfidenceInput({
        calendarWhitelisted: true,
        recipientAllowlisted: true,
        recipientFirstTime: true,
        contactTrustScore: 0.9
      })
    );

    expect(result.score).toBeGreaterThanOrEqual(0.85);
    expect(result.decision).toBe('draft-ask');
  });

  it('preserves auto-write for an explicitly allowlisted recipient', async () => {
    const result = await autoWritePrecisionGate.evaluateDecision(
      highConfidenceInput({
        calendarWhitelisted: true,
        recipientAllowlisted: true,
        recipientFirstTime: false,
        contactTrustScore: 0.9
      })
    );

    expect(result.score).toBeGreaterThanOrEqual(0.85);
    expect(result.decision).toBe('auto-write');
  });

  it('tightens an existing draft to draft-ask without treating it as auto-write', async () => {
    const input = highConfidenceInput({
      calendarWhitelisted: true,
      recipientAllowlisted: true,
      recipientFirstTime: true,
      contactTrustScore: 0.9
    });
    input.intentConfidence = 0.4;

    const result = await autoWritePrecisionGate.evaluateDecision(input);

    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.score).toBeLessThan(0.85);
    expect(result.decision).toBe('draft-ask');
  });

  it('does not reinterpret an absent recipient signal as a negative receipt', async () => {
    const result = await autoWritePrecisionGate.evaluateDecision(
      highConfidenceInput({ calendarWhitelisted: true, contactTrustScore: 0.9 })
    );

    expect(result.score).toBeGreaterThanOrEqual(0.85);
    expect(result.decision).toBe('auto-write');
  });

  it('never promotes a sub-threshold decision to draft-ask', async () => {
    const result = await autoWritePrecisionGate.evaluateDecision({
      content: 'maybe something sometime',
      intentConfidence: 0,
      entities: {},
      feature: 'calendar',
      userTrust: { recipientAllowlisted: false, recipientFirstTime: true },
      currentTime: new Date('2026-08-26T12:00:00'),
      userPreferences: { autoWriteEnabled: true, featureEnabled: true }
    });

    expect(result.score).toBeLessThan(0.6);
    expect(result.decision).toBe('suggest');
    expect(decisionTraceService.getTrace(result.traceId)?.signals[0]?.value).toBe(0);
  });
});
