/**
 * Pure readiness engine for the Adaptive Bubble projection.
 *
 * Readiness is contextual fit, not importance or moral value. This module does
 * not persist data, infer life-domain meaning, learn silently, or mutate Tasks.
 */

import type {
  Task,
  TaskEnergyFit,
  TaskId,
  TaskReadiness,
  TaskReadinessBand,
  TaskReadinessFactor,
  TaskType,
} from '@/types/task';

export type CurrentEnergy = Exclude<TaskEnergyFit, 'flexible'>;

export interface ReadinessContext {
  currentEnergy?: CurrentEnergy;
  availableMinutes?: number;
  /**
   * A 0..1 multiplier for a temporarily reduced-capacity window. It only
   * changes the effective available time and never rewrites the Task estimate.
   */
  capacityRatio?: number;
  /**
   * Explicit per-task blocks. A string is used as the user-facing explanation.
   */
  blocks?: Readonly<Record<TaskId, string | true>>;
  now?: number;
}

export interface RankedTaskReadiness {
  task: Task;
  readiness: TaskReadiness;
}

export const READINESS_WEIGHTS = {
  energy: 0.4,
  time: 0.25,
  urgency: 0.2,
  priority: 0.15,
} as const;

export const READINESS_THRESHOLDS = {
  now: 0.72,
  possible: 0.45,
} as const;

const ACTIONABLE_TASK_TYPES: ReadonlySet<TaskType> = new Set([
  'task',
  'reminder',
  'event',
]);

const BAND_ORDER: Record<TaskReadinessBand, number> = {
  now: 0,
  possible: 1,
  later: 2,
  blocked: 3,
  unknown: 4,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function finitePositive(value: unknown): number | undefined {
  const finite = finiteNonNegative(value);
  return finite !== undefined && finite > 0 ? finite : undefined;
}

function energyScore(
  taskEnergy: TaskEnergyFit | undefined,
  currentEnergy: CurrentEnergy | undefined,
): Pick<TaskReadinessFactor, 'score' | 'available' | 'explanation'> {
  if (taskEnergy === 'flexible') {
    return {
      score: 1,
      available: true,
      explanation: 'Energy fit is flexible.',
    };
  }

  if (!taskEnergy || !currentEnergy) {
    return {
      score: 0.5,
      available: false,
      explanation: 'Current energy or task energy is not set, so energy stays neutral.',
    };
  }

  const matrix: Record<CurrentEnergy, Record<CurrentEnergy, number>> = {
    low: { low: 1, medium: 0.35, high: 0.1 },
    medium: { low: 0.85, medium: 1, high: 0.55 },
    high: { low: 0.75, medium: 0.9, high: 1 },
  };
  const score = matrix[currentEnergy][taskEnergy];

  return {
    score,
    available: true,
    explanation: score >= 0.75
      ? 'Task energy fits the current energy.'
      : 'Task may need more energy than is available right now.',
  };
}

function timeScore(
  estimatedMinutes: number | undefined,
  availableMinutes: number | undefined,
  capacityRatio: number,
): Pick<TaskReadinessFactor, 'score' | 'available' | 'explanation'> & {
  effectiveAvailableMinutes?: number;
} {
  if (estimatedMinutes === undefined || availableMinutes === undefined) {
    return {
      score: 0.5,
      available: false,
      explanation: 'Estimate or available time is not set, so time stays neutral.',
    };
  }

  const effectiveAvailableMinutes = roundScore(availableMinutes * capacityRatio);
  const fitRatio = effectiveAvailableMinutes / estimatedMinutes;

  if (fitRatio >= 1) {
    return {
      score: 1,
      available: true,
      effectiveAvailableMinutes,
      explanation: 'The estimate fits the available time.',
    };
  }

  if (fitRatio >= 2 / 3) {
    return {
      score: 0.6,
      available: true,
      effectiveAvailableMinutes,
      explanation: 'The estimate needs a small stretch beyond the available time.',
    };
  }

  return {
    score: 0.2,
    available: true,
    effectiveAvailableMinutes,
    explanation: 'The estimate is larger than the available time window.',
  };
}

function urgencyScore(
  urgency: Task['urgency'],
): Pick<TaskReadinessFactor, 'score' | 'available' | 'explanation'> {
  if (urgency === undefined) {
    return {
      score: 0.5,
      available: false,
      explanation: 'Urgency is not set, so it stays neutral.',
    };
  }

  const score = [0.25, 0.5, 0.75, 1][urgency];
  return {
    score,
    available: true,
    explanation: urgency >= 2
      ? 'Explicit urgency raises current fit.'
      : 'Explicit urgency does not require immediate action.',
  };
}

function priorityScore(
  priority: number,
): Pick<TaskReadinessFactor, 'score' | 'available' | 'explanation'> {
  if (!Number.isFinite(priority)) {
    return {
      score: 0.5,
      available: false,
      explanation: 'Priority is not set, so it stays neutral.',
    };
  }

  const score = clamp(priority, 0, 100) / 100;
  return {
    score,
    available: true,
    explanation: score >= 0.7
      ? 'Explicit priority raises current fit.'
      : 'Explicit priority is moderate or low.',
  };
}

function toFactor(
  key: TaskReadinessFactor['key'],
  result: Pick<TaskReadinessFactor, 'score' | 'available' | 'explanation'>,
): TaskReadinessFactor {
  return {
    key,
    score: result.score,
    weight: READINESS_WEIGHTS[key],
    available: result.available,
    explanation: result.explanation,
  };
}

function scoreToBand(score: number): TaskReadinessBand {
  if (score >= READINESS_THRESHOLDS.now) return 'now';
  if (score >= READINESS_THRESHOLDS.possible) return 'possible';
  return 'later';
}

function reasonForBand(band: TaskReadinessBand): string {
  if (band === 'now') {
    return 'This fits the current energy and time window.';
  }
  if (band === 'possible') {
    return 'This may fit now; one or more inputs are neutral or need a small stretch.';
  }
  return 'This may fit better when energy or available time changes.';
}

function userOverrideReason(band: TaskReadinessBand, reason?: string): string {
  return reason ?? `You set this item to ${band}.`;
}

/**
 * Evaluate one Task without mutation or external I/O.
 */
export function evaluateTaskReadiness(
  task: Task,
  context: ReadinessContext,
): TaskReadiness {
  const now = finiteNonNegative(context.now) ?? Date.now();
  const capacityRatio = clamp(
    finiteNonNegative(context.capacityRatio) ?? 1,
    0,
    1,
  );
  const currentEnergy = context.currentEnergy;
  const estimatedMinutes = finitePositive(task.estimatedMinutes);
  const availableMinutes = finiteNonNegative(context.availableMinutes);

  const energy = energyScore(task.energyFit, currentEnergy);
  const time = timeScore(estimatedMinutes, availableMinutes, capacityRatio);
  const urgency = urgencyScore(task.urgency);
  const priority = priorityScore(task.priority);
  const factors: TaskReadinessFactor[] = [
    toFactor('energy', energy),
    toFactor('time', time),
    toFactor('urgency', urgency),
    toFactor('priority', priority),
  ];
  const score = roundScore(factors.reduce(
    (total, factor) => total + factor.score * factor.weight,
    0,
  ));
  const actionable = task.actionability === 'actionable'
    || (
      task.actionability === undefined
      && ACTIONABLE_TASK_TYPES.has(task.type)
    );
  const block = context.blocks?.[task.id];
  const blocked = block !== undefined;
  const inputSnapshot: NonNullable<TaskReadiness['inputSnapshot']> = {
    currentEnergy,
    energyMatch: energy.score,
    estimatedMinutes,
    availableMinutes,
    effectiveAvailableMinutes: time.effectiveAvailableMinutes,
    capacityRatio,
    timeFit: time.score,
    contextFit: actionable ? 1 : 0,
    urgency: task.urgency,
    priority: Number.isFinite(task.priority)
      ? clamp(task.priority, 0, 100)
      : undefined,
    actionable,
    blocked,
  };

  if (task.completed) {
    return {
      band: 'unknown',
      source: 'computed',
      score: 0,
      reason: 'This item is complete, so readiness no longer applies.',
      factors,
      evaluatedAt: now,
      override: task.readiness?.override,
      inputSnapshot,
    };
  }

  if (!actionable) {
    return {
      band: 'unknown',
      source: 'computed',
      score: 0,
      reason: 'Choose a next action before readiness applies to this item.',
      factors,
      evaluatedAt: now,
      override: task.readiness?.override,
      inputSnapshot,
    };
  }

  const override = task.readiness?.override;
  const overrideIsActive = override
    && (override.expiresAt === undefined || override.expiresAt > now);

  if (overrideIsActive) {
    return {
      band: override.band,
      source: 'user',
      score,
      reason: userOverrideReason(override.band, override.reason),
      factors,
      evaluatedAt: now,
      override,
      inputSnapshot,
    };
  }

  if (blocked) {
    return {
      band: 'blocked',
      source: 'computed',
      score: 0,
      reason: typeof block === 'string'
        ? `Waiting on: ${block}`
        : 'This is waiting on something else.',
      factors,
      evaluatedAt: now,
      override,
      inputSnapshot,
    };
  }

  const band = scoreToBand(score);
  return {
    band,
    source: 'computed',
    score,
    reason: reasonForBand(band),
    factors,
    evaluatedAt: now,
    override,
    inputSnapshot,
  };
}

/**
 * Stable, lossless ordering for the Adaptive Bubble projection.
 *
 * Every input Task is returned exactly once. Completion and public readiness
 * band sort before score; exact ties retain the caller's original order.
 */
export function rankTasksByReadiness(
  tasks: readonly Task[],
  context: ReadinessContext,
): RankedTaskReadiness[] {
  return tasks
    .map((task, index) => ({
      task,
      readiness: evaluateTaskReadiness(task, context),
      index,
    }))
    .sort((left, right) => {
      if (left.task.completed !== right.task.completed) {
        return left.task.completed ? 1 : -1;
      }

      const bandDifference =
        BAND_ORDER[left.readiness.band] - BAND_ORDER[right.readiness.band];
      if (bandDifference !== 0) return bandDifference;

      const scoreDifference =
        (right.readiness.score ?? 0) - (left.readiness.score ?? 0);
      if (scoreDifference !== 0) return scoreDifference;

      return left.index - right.index;
    })
    .map(({ task, readiness }) => ({ task, readiness }));
}
