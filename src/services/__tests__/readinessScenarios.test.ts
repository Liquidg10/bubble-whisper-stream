import { describe, expect, it } from 'vitest';
import {
  evaluateTaskReadiness,
  rankTasksByReadiness,
  type ReadinessContext,
} from '../readinessEngine';
import type { Task } from '@/types/task';

const NOW = 1_753_700_400_000;
const PRESSURE_LANGUAGE = /\b(fail(?:ed|ure)?|lazy|behind|should|must)\b/i;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 'scenario-task',
    type: 'task',
    title: 'Scenario task',
    completed: false,
    priority: 50,
    tags: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function context(overrides: Partial<ReadinessContext> = {}): ReadinessContext {
  return {
    currentEnergy: 'low',
    availableMinutes: 20,
    now: NOW,
    ...overrides,
  };
}

function expectPressureSafe(reason: string | undefined) {
  expect(reason).toBeTruthy();
  expect(reason).not.toMatch(PRESSURE_LANGUAGE);
}

describe('Readiness Engine v0.1 representative scenarios', () => {
  it('1. low energy: surfaces a short low-energy task before a high-effort task', () => {
    const shortLowEnergyTask = task({
      id: 'short-low-energy',
      title: 'Reply with one sentence',
      energyFit: 'low',
      estimatedMinutes: 10,
      urgency: 1,
      priority: 50,
    });
    const highEffortTask = task({
      id: 'high-effort',
      title: 'Draft the full project proposal',
      energyFit: 'high',
      estimatedMinutes: 90,
      urgency: 1,
      priority: 70,
    });

    const ranked = rankTasksByReadiness(
      [highEffortTask, shortLowEnergyTask],
      context(),
    );

    expect(ranked.map(entry => ({
      id: entry.task.id,
      band: entry.readiness.band,
      score: entry.readiness.score,
    }))).toEqual([
      { id: 'short-low-energy', band: 'now', score: 0.825 },
      { id: 'high-effort', band: 'later', score: 0.295 },
    ]);
    ranked.forEach(entry => expectPressureSafe(entry.readiness.reason));
  });

  it('2. high urgency: does not let urgency erase an energy/time mismatch', () => {
    const result = evaluateTaskReadiness(task({
      id: 'urgent-mismatch',
      title: 'Resolve the urgent complex filing',
      energyFit: 'high',
      estimatedMinutes: 60,
      urgency: 3,
      priority: 90,
    }), context({
      availableMinutes: 10,
    }));

    expect(result).toMatchObject({
      band: 'later',
      source: 'computed',
      score: 0.425,
      inputSnapshot: {
        currentEnergy: 'low',
        energyMatch: 0.1,
        estimatedMinutes: 60,
        effectiveAvailableMinutes: 10,
        timeFit: 0.2,
        urgency: 3,
      },
    });
    expect(result.factors?.find(factor => factor.key === 'urgency')?.score)
      .toBe(1);
    expectPressureSafe(result.reason);
  });

  it('3. not now: honors a temporary override and lets the task drift back', () => {
    const overriddenTask = task({
      id: 'not-now',
      title: 'Make the quick phone call',
      energyFit: 'low',
      estimatedMinutes: 10,
      urgency: 2,
      priority: 70,
      readiness: {
        band: 'later',
        source: 'user',
        override: {
          band: 'later',
          setAt: NOW - 1000,
          expiresAt: NOW + 60_000,
          reason: 'Not now; I need a quieter window.',
        },
      },
    });

    const whileActive = evaluateTaskReadiness(overriddenTask, context());
    const afterExpiry = evaluateTaskReadiness(
      overriddenTask,
      context({ now: NOW + 60_001 }),
    );

    expect(whileActive).toMatchObject({
      band: 'later',
      source: 'user',
      score: 0.905,
      reason: 'Not now; I need a quieter window.',
    });
    expect(afterExpiry).toMatchObject({
      band: 'now',
      source: 'computed',
      score: 0.905,
      reason: 'This fits the current energy and time window.',
    });
    expectPressureSafe(whileActive.reason);
    expectPressureSafe(afterExpiry.reason);
  });

  it('4. blocked: preserves a clear dependency reason despite perfect fit', () => {
    const result = evaluateTaskReadiness(task({
      id: 'blocked',
      title: 'Confirm the refill',
      energyFit: 'flexible',
      estimatedMinutes: 5,
      urgency: 3,
      priority: 100,
    }), context({
      blocks: {
        blocked: 'the prescription refill response',
      },
    }));

    expect(result).toMatchObject({
      band: 'blocked',
      source: 'computed',
      score: 0,
      reason: 'Waiting on: the prescription refill response',
      inputSnapshot: {
        blocked: true,
      },
    });
    expect(result.factors?.every(factor => factor.score === 1)).toBe(true);
    expectPressureSafe(result.reason);
  });

  it('5. captured photo: stays unknown until explicitly made actionable', () => {
    const capturedPhoto = task({
      id: 'photo-next-action',
      type: 'photo',
      title: 'Photo of the school form',
      energyFit: 'flexible',
      estimatedMinutes: 5,
      urgency: 2,
      priority: 50,
    });

    const beforeDecision = evaluateTaskReadiness(capturedPhoto, context());
    const afterDecision = evaluateTaskReadiness({
      ...capturedPhoto,
      actionability: 'actionable',
    }, context());

    expect(beforeDecision).toMatchObject({
      band: 'unknown',
      score: 0,
      reason: 'Choose a next action before readiness applies to this item.',
    });
    expect(afterDecision).toMatchObject({
      band: 'now',
      source: 'computed',
      score: 0.875,
      reason: 'This fits the current energy and time window.',
    });
    expectPressureSafe(beforeDecision.reason);
    expectPressureSafe(afterDecision.reason);
  });
});
