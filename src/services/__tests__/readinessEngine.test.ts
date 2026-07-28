import { describe, expect, it } from 'vitest';
import {
  evaluateTaskReadiness,
  rankTasksByReadiness,
  type ReadinessContext,
} from '../readinessEngine';
import type { Task } from '@/types/task';

const NOW = 1_753_700_400_000;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 'task-1',
    type: 'task',
    title: 'A task',
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
    currentEnergy: 'medium',
    availableMinutes: 30,
    now: NOW,
    ...overrides,
  };
}

describe('readinessEngine', () => {
  it('places an energy-and-time fit in now with factor receipts', () => {
    const result = evaluateTaskReadiness(task({
      energyFit: 'medium',
      estimatedMinutes: 25,
      urgency: 2,
      priority: 70,
    }), context());

    expect(result).toMatchObject({
      band: 'now',
      source: 'computed',
      score: 0.905,
      reason: 'This fits the current energy and time window.',
      evaluatedAt: NOW,
      inputSnapshot: {
        currentEnergy: 'medium',
        energyMatch: 1,
        estimatedMinutes: 25,
        availableMinutes: 30,
        effectiveAvailableMinutes: 30,
        capacityRatio: 1,
        timeFit: 1,
        urgency: 2,
        priority: 70,
        actionable: true,
        blocked: false,
      },
    });
    expect(result.factors).toHaveLength(4);
    expect(result.factors?.map(factor => factor.key))
      .toEqual(['energy', 'time', 'urgency', 'priority']);
  });

  it('does not frame a high-energy task as ready during a low-energy window', () => {
    const result = evaluateTaskReadiness(task({
      energyFit: 'high',
      estimatedMinutes: 60,
      urgency: 0,
      priority: 40,
    }), context({
      currentEnergy: 'low',
      availableMinutes: 20,
    }));

    expect(result.band).toBe('later');
    expect(result.score).toBe(0.2);
    expect(result.reason).toContain('may fit better');
  });

  it('treats flexible energy as a fit without inventing current energy', () => {
    const result = evaluateTaskReadiness(task({
      energyFit: 'flexible',
      estimatedMinutes: 10,
      urgency: 1,
      priority: 50,
    }), context({ currentEnergy: undefined }));

    expect(result.inputSnapshot?.energyMatch).toBe(1);
    expect(result.factors?.find(factor => factor.key === 'energy')).toMatchObject({
      available: true,
      explanation: 'Energy fit is flexible.',
    });
  });

  it('keeps missing and invalid inputs neutral instead of punishing the task', () => {
    const result = evaluateTaskReadiness(task({
      energyFit: undefined,
      estimatedMinutes: -10,
      urgency: undefined,
      priority: Number.NaN,
    }), context({
      currentEnergy: undefined,
      availableMinutes: undefined,
    }));

    expect(result).toMatchObject({
      band: 'possible',
      score: 0.5,
      inputSnapshot: {
        energyMatch: 0.5,
        timeFit: 0.5,
      },
    });
    expect(result.inputSnapshot?.estimatedMinutes).toBeUndefined();
    expect(result.factors?.every(factor => factor.available === false)).toBe(true);
  });

  it('uses explicit urgency independently from optional Matrix metadata', () => {
    const lowUrgency = evaluateTaskReadiness(task({
      urgency: 0,
      view: { matrix: { urgency: 3, importance: 3, quadrant: 1 } },
    }), context());
    const highUrgency = evaluateTaskReadiness(task({
      urgency: 3,
      view: { matrix: { urgency: 0, importance: 0, quadrant: 4 } },
    }), context());

    expect(highUrgency.score).toBeGreaterThan(lowUrgency.score ?? 0);
    expect(highUrgency.inputSnapshot?.urgency).toBe(3);
    expect(lowUrgency.inputSnapshot?.urgency).toBe(0);
  });

  it('applies reduced capacity to time fit without rewriting the estimate', () => {
    const standard = evaluateTaskReadiness(task({
      energyFit: 'medium',
      estimatedMinutes: 30,
      urgency: 1,
    }), context());
    const reduced = evaluateTaskReadiness(task({
      energyFit: 'medium',
      estimatedMinutes: 30,
      urgency: 1,
    }), context({ capacityRatio: 0.5 }));

    expect(standard.inputSnapshot?.timeFit).toBe(1);
    expect(reduced.inputSnapshot).toMatchObject({
      estimatedMinutes: 30,
      availableMinutes: 30,
      effectiveAvailableMinutes: 15,
      capacityRatio: 0.5,
      timeFit: 0.2,
    });
    expect(reduced.score).toBeLessThan(standard.score ?? 0);
  });

  it('uses an explicit block and keeps its explanation', () => {
    const result = evaluateTaskReadiness(task({
      id: 'blocked-task',
      energyFit: 'medium',
      estimatedMinutes: 10,
      urgency: 3,
      priority: 100,
    }), context({
      blocks: { 'blocked-task': 'a reply from the clinic' },
    }));

    expect(result).toMatchObject({
      band: 'blocked',
      source: 'computed',
      score: 0,
      reason: 'Waiting on: a reply from the clinic',
      inputSnapshot: { blocked: true },
    });
  });

  it('lets an active user override win over computed fit and a block', () => {
    const result = evaluateTaskReadiness(task({
      id: 'override-task',
      energyFit: 'high',
      estimatedMinutes: 120,
      urgency: 0,
      priority: 0,
      readiness: {
        band: 'later',
        source: 'user',
        override: {
          band: 'now',
          setAt: NOW - 1000,
          reason: 'I have support for this now.',
        },
      },
    }), context({
      currentEnergy: 'low',
      availableMinutes: 5,
      blocks: { 'override-task': true },
    }));

    expect(result).toMatchObject({
      band: 'now',
      source: 'user',
      reason: 'I have support for this now.',
      override: {
        band: 'now',
        setAt: NOW - 1000,
      },
    });
    expect(result.score).toBe(0.14);
  });

  it('lets an expired not-now override drift back to computed readiness', () => {
    const result = evaluateTaskReadiness(task({
      energyFit: 'medium',
      estimatedMinutes: 10,
      urgency: 3,
      priority: 90,
      readiness: {
        band: 'later',
        source: 'user',
        override: {
          band: 'later',
          setAt: NOW - 10_000,
          expiresAt: NOW - 1,
        },
      },
    }), context());

    expect(result.band).toBe('now');
    expect(result.source).toBe('computed');
    expect(result.override?.expiresAt).toBe(NOW - 1);
  });

  it('does not assign readiness to completed or non-actionable items', () => {
    const completed = evaluateTaskReadiness(task({ completed: true }), context());
    const thought = evaluateTaskReadiness(task({ type: 'thought' }), context());

    expect(completed).toMatchObject({
      band: 'unknown',
      score: 0,
      reason: 'This item is complete, so readiness no longer applies.',
    });
    expect(thought).toMatchObject({
      band: 'unknown',
      score: 0,
      reason: 'Choose a next action before readiness applies to this item.',
    });
  });

  it('supports an explicit actionable decision for another captured kind', () => {
    const result = evaluateTaskReadiness(
      task({
        type: 'photo',
        actionability: 'actionable',
        energyFit: 'flexible',
        estimatedMinutes: 5,
        urgency: 2,
      }),
      context(),
    );

    expect(result.band).toBe('now');
    expect(result.inputSnapshot?.actionable).toBe(true);
  });

  it('honors a persisted reference decision for an otherwise actionable kind', () => {
    const result = evaluateTaskReadiness(
      task({
        type: 'task',
        actionability: 'reference',
        energyFit: 'flexible',
        estimatedMinutes: 5,
        urgency: 3,
      }),
      context(),
    );

    expect(result).toMatchObject({
      band: 'unknown',
      score: 0,
      inputSnapshot: {
        actionable: false,
      },
    });
  });

  it('is deterministic and timezone-independent when supplied the same inputs', () => {
    const input = task({
      energyFit: 'low',
      estimatedMinutes: 15,
      urgency: 2,
      priority: 60,
      due: Date.parse('2026-11-01T01:30:00-07:00'),
    });
    const first = evaluateTaskReadiness(input, context({ now: NOW }));
    const second = evaluateTaskReadiness(input, context({ now: NOW + 12 * 60 * 60 * 1000 }));

    expect({ ...first, evaluatedAt: undefined })
      .toEqual({ ...second, evaluatedAt: undefined });
  });

  it('ranks every task once, leaves inputs untouched, and preserves exact ties', () => {
    const tasks = [
      task({ id: 'tie-a', urgency: 1 }),
      task({ id: 'later', energyFit: 'high', estimatedMinutes: 90, urgency: 0, priority: 0 }),
      task({ id: 'tie-b', urgency: 1 }),
      task({ id: 'blocked', urgency: 3 }),
      task({ id: 'complete', completed: true, urgency: 3 }),
    ];
    const original = structuredClone(tasks);
    const ranked = rankTasksByReadiness(tasks, context({
      currentEnergy: 'low',
      availableMinutes: 10,
      blocks: { blocked: true },
    }));

    expect(ranked.map(entry => entry.task.id))
      .toEqual(['tie-a', 'tie-b', 'later', 'blocked', 'complete']);
    expect(new Set(ranked.map(entry => entry.task.id)).size).toBe(tasks.length);
    expect(tasks).toEqual(original);
  });
});
