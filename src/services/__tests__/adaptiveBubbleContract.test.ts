import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_BUBBLE_CONTRACT_VERSION,
  projectAdaptiveBubbles,
} from '../adaptiveBubbleContract';
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

describe('Adaptive Bubble semantic contract v0.1', () => {
  it('keeps urgent-but-not-ready semantics persistent and motion-independent', () => {
    const [projection] = projectAdaptiveBubbles([task({
      id: 'urgent-later',
      title: 'Resolve the urgent complex filing',
      energyFit: 'high',
      estimatedMinutes: 60,
      urgency: 3,
      priority: 90,
    })], {
      currentEnergy: 'low',
      availableMinutes: 10,
      now: NOW,
    });

    expect(projection).toMatchObject({
      readiness: {
        band: 'later',
        score: 0.425,
      },
      semantics: {
        contractVersion: ADAPTIVE_BUBBLE_CONTRACT_VERSION,
        taskId: 'urgent-later',
        readinessLabel: 'Better for later',
        urgencyLabel: 'High urgency',
        mustRemainReachable: true,
        requiresPersistentUrgencyCue: true,
        motionIndependent: true,
      },
    });
    expect(projection.semantics.accessibleSummary).toContain(
      'Readiness: Better for later. Urgency: High urgency.',
    );
  });

  it('returns every canonical Task exactly once with a text summary', () => {
    const tasks = [
      task({
        id: 'ready',
        energyFit: 'low',
        estimatedMinutes: 5,
        urgency: 1,
      }),
      task({
        id: 'reference',
        type: 'photo',
        actionability: 'reference',
        urgency: 2,
      }),
      task({
        id: 'complete',
        completed: true,
        urgency: 3,
      }),
    ];

    const projections = projectAdaptiveBubbles(tasks, {
      currentEnergy: 'low',
      availableMinutes: 15,
      now: NOW,
    });

    expect(projections).toHaveLength(tasks.length);
    expect(new Set(projections.map(item => item.task.id)).size).toBe(tasks.length);
    expect(projections.every(item => item.semantics.mustRemainReachable)).toBe(true);
    expect(projections.every(item => item.semantics.motionIndependent)).toBe(true);
    expect(projections.every(item => item.semantics.accessibleSummary.length > 0))
      .toBe(true);
  });
});
