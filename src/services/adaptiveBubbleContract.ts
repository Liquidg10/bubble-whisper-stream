/**
 * Pure semantic contract for a future Adaptive Bubble renderer.
 *
 * This module does not render, animate, hide, or persist anything. It turns the
 * canonical Task plus readiness result into the minimum accessibility-facing
 * semantics every future visual implementation must preserve.
 */

import type {
  Task,
  TaskReadiness,
  TaskReadinessBand,
  TaskUrgency,
} from '@/types/task';
import {
  rankTasksByReadiness,
  type ReadinessContext,
} from './readinessEngine';

export const ADAPTIVE_BUBBLE_CONTRACT_VERSION = 1 as const;

export interface AdaptiveBubbleSemantics {
  contractVersion: typeof ADAPTIVE_BUBBLE_CONTRACT_VERSION;
  taskId: string;
  readinessLabel: string;
  urgencyLabel: string;
  /**
   * Every Task must remain reachable even when density or declutter changes
   * what is drawn on the canvas.
   */
  mustRemainReachable: true;
  /**
   * Moderate/high urgency must have a persistent semantic cue independent of
   * readiness band, position, size, color, or motion.
   */
  requiresPersistentUrgencyCue: boolean;
  /**
   * The complete status is available as text, so reduced motion loses no
   * meaning.
   */
  motionIndependent: true;
  accessibleSummary: string;
}

export interface AdaptiveBubbleProjection {
  task: Task;
  readiness: TaskReadiness;
  semantics: AdaptiveBubbleSemantics;
}

const READINESS_LABELS: Record<TaskReadinessBand, string> = {
  now: 'Ready now',
  possible: 'Possible now',
  later: 'Better for later',
  blocked: 'Waiting on something',
  unknown: 'Needs a next-action decision',
};

const URGENCY_LABELS: Record<TaskUrgency, string> = {
  0: 'No urgency',
  1: 'Low urgency',
  2: 'Moderate urgency',
  3: 'High urgency',
};

function urgencyLabel(urgency: TaskUrgency | undefined): string {
  return urgency === undefined ? 'Urgency not set' : URGENCY_LABELS[urgency];
}

function isPersistentlyUrgent(urgency: TaskUrgency | undefined): boolean {
  return urgency !== undefined && urgency >= 2;
}

export function createAdaptiveBubbleSemantics(
  task: Task,
  readiness: TaskReadiness,
): AdaptiveBubbleSemantics {
  const readinessLabel = READINESS_LABELS[readiness.band];
  const taskUrgencyLabel = urgencyLabel(task.urgency);

  return {
    contractVersion: ADAPTIVE_BUBBLE_CONTRACT_VERSION,
    taskId: task.id,
    readinessLabel,
    urgencyLabel: taskUrgencyLabel,
    mustRemainReachable: true,
    requiresPersistentUrgencyCue: isPersistentlyUrgent(task.urgency),
    motionIndependent: true,
    accessibleSummary: [
      task.title,
      `Readiness: ${readinessLabel}.`,
      `Urgency: ${taskUrgencyLabel}.`,
      readiness.reason,
    ].filter(Boolean).join(' '),
  };
}

/**
 * Project every canonical Task exactly once using the readiness engine's
 * stable ordering. This is the only ordering contract a future Adaptive Bubble
 * renderer should consume.
 */
export function projectAdaptiveBubbles(
  tasks: readonly Task[],
  context: ReadinessContext,
): AdaptiveBubbleProjection[] {
  return rankTasksByReadiness(tasks, context).map(({ task, readiness }) => ({
    task,
    readiness,
    semantics: createAdaptiveBubbleSemantics(task, readiness),
  }));
}
