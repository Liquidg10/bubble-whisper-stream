/**
 * Task Adapter - bi-directional conversion between Bubble persistence and the
 * Canonical Task Contract v0.1.
 *
 * BubbleStore/IndexedDB remains the single persisted owner during this
 * migration. Task-only semantics are stored in a versioned
 * Bubble.metadata.canonicalTask envelope, while legacy Bubble fields remain
 * readable and directly editable.
 */

import type {
  Bubble,
  BubbleMetadata,
  BubbleType,
} from '@/types/bubble';
import {
  CANONICAL_TASK_CONTRACT_VERSION,
  type CanonicalTaskContractV1,
  type Task,
  type TaskDomainLink,
  type TaskMetadata,
  type TaskType,
  type TaskViewMetadata,
} from '@/types/task';
import { getHorizon, getHorizonEmoji } from '@/lib/horizon';
import { classifyDomain } from '@/lib/classifyDomain';
import { logger } from '@/utils/logger';

const VIEW_METADATA_KEYS = [
  'atomic',
  'list',
  'kanban',
  'matrix',
  'pinboard',
  'calendar',
  'email',
] as const;

const LEGACY_HORIZON_TAG_PREFIX = 'canonical-task-horizon:';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Convert Bubble priority/size (0-1) to Task priority (0-100).
 */
function sizeToPriority(size?: number): number {
  if (!isFiniteNumber(size)) return 50;
  return Math.round(Math.max(0, Math.min(1, size)) * 100);
}

/**
 * Convert Task priority (0-100) to Bubble size (0-1).
 */
function priorityToSize(priority?: number): number {
  if (!isFiniteNumber(priority)) return 0.5;
  return Math.max(0, Math.min(100, priority)) / 100;
}

/**
 * Fallback: higher on the canvas (lower y) maps to higher priority.
 */
function yToPriority(y?: number, canvasHeight: number = 1000): number {
  if (!isFiniteNumber(y)) return 50;
  return Math.round((1 - Math.max(0, Math.min(canvasHeight, y)) / canvasHeight) * 100);
}

function bubbleTypeToTaskType(bubbleType?: BubbleType): TaskType {
  const typeMap: Record<BubbleType, TaskType> = {
    Thought: 'thought',
    Task: 'task',
    Memory: 'memory',
    Mood: 'mood',
    ReminderNote: 'reminder',
  };

  return bubbleType ? typeMap[bubbleType] ?? 'task' : 'task';
}

function taskTypeToBubbleType(taskType?: TaskType): BubbleType {
  const typeMap: Record<TaskType, BubbleType> = {
    thought: 'Thought',
    task: 'Task',
    memory: 'Memory',
    mood: 'Mood',
    reminder: 'ReminderNote',
    photo: 'Task',
    event: 'Task',
  };

  return taskType ? typeMap[taskType] ?? 'Task' : 'Task';
}

function getCanonicalEnvelope(metadata?: BubbleMetadata): CanonicalTaskContractV1 | undefined {
  const envelope = metadata?.canonicalTask;
  return envelope?.schemaVersion === CANONICAL_TASK_CONTRACT_VERSION
    ? envelope
    : undefined;
}

export class UnsupportedCanonicalTaskVersionError extends Error {
  constructor(version: unknown) {
    super(`Cannot safely edit canonical Task schema version ${String(version)}.`);
    this.name = 'UnsupportedCanonicalTaskVersionError';
  }
}

function getRawCanonicalEnvelope(metadata?: BubbleMetadata): Record<string, unknown> | undefined {
  const envelope = metadata?.canonicalTask as unknown;
  return envelope && typeof envelope === 'object'
    ? envelope as Record<string, unknown>
    : undefined;
}

function mergeCanonicalEnvelopeMetadata(
  originalMetadata: BubbleMetadata | undefined,
  projectedMetadata: BubbleMetadata | undefined,
): BubbleMetadata | undefined {
  const originalEnvelope = getRawCanonicalEnvelope(originalMetadata);
  if (
    originalEnvelope
    && originalEnvelope.schemaVersion !== CANONICAL_TASK_CONTRACT_VERSION
  ) {
    throw new UnsupportedCanonicalTaskVersionError(originalEnvelope.schemaVersion);
  }

  const projectedEnvelope = projectedMetadata?.canonicalTask;
  if (!originalEnvelope || !projectedEnvelope) return projectedMetadata;

  return {
    ...projectedMetadata,
    canonicalTask: {
      ...originalEnvelope,
      ...projectedEnvelope,
    } as unknown as CanonicalTaskContractV1,
  };
}

/**
 * Projection metadata belongs in Task.view. Domain metadata stays in
 * Task.metadata. Direct Bubble-side edits win over an older envelope.
 */
function extractTaskMetadata(
  metadata: BubbleMetadata | undefined,
  envelope: CanonicalTaskContractV1 | undefined,
): TaskMetadata | undefined {
  const directMetadata: TaskMetadata = {};

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (key === 'canonicalTask' || VIEW_METADATA_KEYS.includes(key as typeof VIEW_METADATA_KEYS[number])) {
        continue;
      }
      directMetadata[key] = value;
    }
  }

  const merged = {
    ...(envelope?.metadata ?? {}),
    ...directMetadata,
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function extractCalendarView(
  metadata: BubbleMetadata | undefined,
  envelope: CanonicalTaskContractV1 | undefined,
): TaskViewMetadata['calendar'] | undefined {
  const directCalendar = metadata?.calendar;
  if (!directCalendar) return envelope?.view?.calendar;

  const {
    start: _legacyStart,
    end: _legacyEnd,
    ...calendarView
  } = directCalendar;

  return {
    ...(envelope?.view?.calendar ?? {}),
    ...calendarView,
  };
}

function buildTaskView(
  bubble: Bubble,
  priority: number,
  envelope: CanonicalTaskContractV1 | undefined,
): TaskViewMetadata {
  const metadata = bubble.metadata;
  const savedView = envelope?.view;
  const horizon = getHorizon(bubble);

  const view: TaskViewMetadata = {
    ...(savedView ?? {}),
    bubble: {
      ...(savedView?.bubble ?? {}),
      x: bubble.x ?? savedView?.bubble?.x ?? 0,
      y: bubble.y ?? savedView?.bubble?.y ?? 0,
      size: bubble.size ?? savedView?.bubble?.size ?? priorityToSize(priority),
      colorHex: bubble.moodColor ?? savedView?.bubble?.colorHex,
    },
  };

  const atomicShell = horizon ?? savedView?.atomic?.shell;
  if (atomicShell) {
    view.atomic = {
      ...(savedView?.atomic ?? {}),
      ...(metadata?.atomic ?? {}),
      shell: atomicShell,
      domain:
        metadata?.atomic?.domain
        ?? savedView?.atomic?.domain
        ?? classifyDomain(bubble)
        ?? undefined,
    };
  }

  view.list = metadata?.list ?? savedView?.list;
  view.kanban = metadata?.kanban ?? savedView?.kanban;
  view.matrix = metadata?.matrix ?? savedView?.matrix;
  view.pinboard = metadata?.pinboard ?? savedView?.pinboard;
  view.calendar = extractCalendarView(metadata, envelope);
  view.email = metadata?.email ?? savedView?.email;

  for (const key of VIEW_METADATA_KEYS) {
    if (view[key] === undefined) {
      delete view[key];
    }
  }

  return view;
}

/**
 * Convert persisted Bubble data to the canonical Task representation.
 */
export function bubbleToTask(bubble: Bubble): Task {
  try {
    const envelope = getCanonicalEnvelope(bubble.metadata);
    const priority = isFiniteNumber(bubble.size)
      ? sizeToPriority(bubble.size)
      : yToPriority(bubble.y);
    const now = Date.now();

    const task: Task = {
      id: bubble.id,
      type: envelope?.type ?? bubbleTypeToTaskType(bubble.type),
      title: bubble.content ?? 'Untitled',
      description: bubble.caption,
      // Direct Bubble edits are authoritative over a stale migration envelope.
      completed: bubble.completed ?? envelope?.completed ?? false,
      priority,
      actionability: envelope?.actionability,
      energyFit: envelope?.energyFit,
      urgency: envelope?.urgency,
      readiness: envelope?.readiness,
      domainLinks: envelope?.domainLinks,
      tags: (bubble.tags ?? [])
        .filter(tag => !envelope || !tag.id.startsWith(LEGACY_HORIZON_TAG_PREFIX))
        .map(tag => ({ ...tag })),
      createdAt: bubble.createdAt ?? now,
      updatedAt: bubble.updatedAt ?? now,
      due: envelope?.due,
      start: envelope?.start ?? bubble.metadata?.calendar?.start,
      end: envelope?.end ?? bubble.metadata?.calendar?.end,
      estimatedMinutes:
        envelope?.estimatedMinutes
        ?? bubble.metadata?.outliner?.estimateMin
        ?? bubble.metadata?.outliner?.estimatedMinutes,
      view: buildTaskView(bubble, priority, envelope),
      metadata: extractTaskMetadata(bubble.metadata, envelope),
    };

    logger.debug('Converted Bubble to canonical Task', {
      bubbleId: bubble.id,
      taskId: task.id,
      contractVersion: envelope?.schemaVersion ?? 'legacy',
      priority,
    });
    return task;
  } catch (error) {
    logger.error('Failed to convert Bubble to Task', error, { bubbleId: bubble.id });
    const now = Date.now();
    return {
      id: bubble.id,
      type: 'task',
      title: bubble.content ?? 'Untitled',
      completed: bubble.completed ?? false,
      priority: 50,
      tags: [],
      createdAt: bubble.createdAt ?? now,
      updatedAt: bubble.updatedAt ?? now,
      view: {
        bubble: { x: bubble.x ?? 0, y: bubble.y ?? 0, size: 0.5 },
      },
    };
  }
}

function buildBubbleMetadata(task: Task): BubbleMetadata {
  const metadata: BubbleMetadata = {
    ...(task.metadata ?? {}),
  };

  if (task.view?.atomic) {
    metadata.atomic = task.view.atomic;
  }
  if (task.view?.list) {
    metadata.list = task.view.list;
  }
  if (task.view?.kanban) {
    metadata.kanban = task.view.kanban;
  }
  if (task.view?.matrix) {
    metadata.matrix = task.view.matrix;
  }
  if (task.view?.pinboard) {
    metadata.pinboard = task.view.pinboard;
  }
  if (task.view?.calendar) {
    metadata.calendar = {
      ...task.view.calendar,
      start: task.start,
      end: task.end,
    };
  }
  if (task.view?.email) {
    metadata.email = task.view.email;
  }

  const canonicalTask: CanonicalTaskContractV1 = {
    schemaVersion: CANONICAL_TASK_CONTRACT_VERSION,
    type: task.type ?? 'task',
    completed: task.completed ?? false,
    due: task.due,
    start: task.start,
    end: task.end,
    estimatedMinutes: task.estimatedMinutes,
    actionability: task.actionability,
    energyFit: task.energyFit,
    urgency: task.urgency,
    readiness: task.readiness,
    domainLinks: task.domainLinks,
    view: task.view,
    metadata: task.metadata,
  };

  metadata.canonicalTask = canonicalTask;
  return metadata;
}

/**
 * Atomic still reads legacy horizon tags. Add a clearly marked transport tag
 * when the canonical Task does not already contain the requested horizon.
 * The marked tag is filtered back out when the versioned envelope is read.
 */
function applyLegacyHorizonTag(bubble: Bubble, targetHorizon: NonNullable<TaskViewMetadata['atomic']>['shell']): Bubble {
  const existingTargetTag = (bubble.tags ?? []).find(
    tag => tag.name.toLowerCase() === targetHorizon,
  );
  const withoutHorizons = (bubble.tags ?? []).filter(tag => {
    const name = tag.name.toLowerCase();
    return name !== 'today' && name !== 'week' && name !== 'later';
  });

  return {
    ...bubble,
    tags: [
      ...withoutHorizons,
      existingTargetTag ?? {
        id: `${LEGACY_HORIZON_TAG_PREFIX}${bubble.id}`,
        name: targetHorizon,
        emoji: getHorizonEmoji(targetHorizon),
      },
    ],
  };
}

/**
 * Convert a canonical Task to the single BubbleStore persistence record.
 */
export function taskToBubble(task: Task): Bubble {
  try {
    const now = Date.now();
    const taskType = task.type ?? 'task';
    const updatedAt = task.updatedAt ?? now;
    let bubble: Bubble = {
      id: task.id,
      type: taskTypeToBubbleType(taskType),
      content: task.title ?? task.id ?? 'Untitled',
      caption: task.description,
      completed: task.completed ?? false,
      tags: (task.tags ?? []).map(tag => ({ ...tag })),
      createdAt: task.createdAt ?? now,
      updatedAt,
      x: task.view?.bubble?.x ?? 0,
      y: task.view?.bubble?.y ?? 0,
      size: priorityToSize(task.priority),
      moodColor: task.view?.bubble?.colorHex,
      metadata: buildBubbleMetadata(task),
    };

    const targetHorizon = task.view?.atomic?.shell;
    if (targetHorizon && getHorizon(bubble) !== targetHorizon) {
      bubble = applyLegacyHorizonTag(bubble, targetHorizon);
    }

    logger.debug('Converted canonical Task to Bubble', {
      taskId: task.id,
      bubbleId: bubble.id,
      contractVersion: CANONICAL_TASK_CONTRACT_VERSION,
      size: bubble.size,
    });
    return bubble;
  } catch (error) {
    logger.error('Failed to convert Task to Bubble', error, { taskId: task.id });
    const now = Date.now();
    return {
      id: task.id,
      type: 'Task',
      content: task.title ?? task.id ?? 'Untitled',
      completed: task.completed ?? false,
      tags: [],
      createdAt: task.createdAt ?? now,
      updatedAt: task.updatedAt ?? now,
      x: 0,
      y: 0,
      size: 0.5,
      metadata: {
        canonicalTask: {
          schemaVersion: CANONICAL_TASK_CONTRACT_VERSION,
          type: task.type ?? 'task',
          completed: task.completed ?? false,
        },
      },
    };
  }
}

/**
 * Project a Task update without discarding Bubble-only fields that do not
 * exist in the canonical Task facade yet (attachments, location, mood, and
 * reminder linkage). This is the safe write path for TaskStore updates.
 */
export function mergeTaskIntoBubble(originalBubble: Bubble, task: Task): Bubble {
  const projectedBubble = taskToBubble(task);

  return {
    ...originalBubble,
    ...projectedBubble,
    audioUri: originalBubble.audioUri,
    imageUri: originalBubble.imageUri,
    location: originalBubble.location,
    reminderId: originalBubble.reminderId,
    mood: originalBubble.mood,
    metadata: mergeCanonicalEnvelopeMetadata(
      originalBubble.metadata,
      projectedBubble.metadata,
    ),
  };
}

/**
 * Patch only canonical domain-link metadata from the active Bubble editor.
 * Every Bubble-only field and direct visual edit stays byte-for-byte intact.
 */
export function withBubbleDomainLinks(
  bubble: Bubble,
  domainLinks: readonly TaskDomainLink[],
  updatedAt: number = Date.now(),
): Bubble {
  const projectedBubble = taskToBubble({
    ...bubbleToTask(bubble),
    domainLinks: domainLinks.map(link => ({ ...link })),
    updatedAt,
  });

  return {
    ...bubble,
    updatedAt,
    metadata: mergeCanonicalEnvelopeMetadata(bubble.metadata, projectedBubble.metadata),
  };
}

/**
 * Verify that Bubble → Task → Bubble preserves the existing core record.
 */
export function validateRoundTrip(originalBubble: Bubble): {
  isValid: boolean;
  errors: string[];
  task: Task;
  convertedBubble: Bubble;
} {
  const errors: string[] = [];

  try {
    const task = bubbleToTask(originalBubble);
    const convertedBubble = taskToBubble(task);

    if (originalBubble.id !== convertedBubble.id) {
      errors.push(`ID mismatch: ${originalBubble.id} → ${convertedBubble.id}`);
    }

    if (originalBubble.content !== convertedBubble.content) {
      errors.push(`Content mismatch: "${originalBubble.content}" → "${convertedBubble.content}"`);
    }

    if ((originalBubble.completed ?? false) !== (convertedBubble.completed ?? false)) {
      errors.push(
        `Completion mismatch: ${originalBubble.completed ?? false} → ${convertedBubble.completed ?? false}`,
      );
    }

    const originalPriority = sizeToPriority(originalBubble.size);
    const convertedPriority = sizeToPriority(convertedBubble.size);
    if (Math.abs(originalPriority - convertedPriority) > 1) {
      errors.push(`Priority drift: ${originalPriority} → ${convertedPriority}`);
    }

    if ((originalBubble.tags ?? []).length !== (convertedBubble.tags ?? []).length) {
      errors.push(
        `Tag count mismatch: ${(originalBubble.tags ?? []).length} → ${(convertedBubble.tags ?? []).length}`,
      );
    }

    if (originalBubble.metadata?.outliner && !convertedBubble.metadata?.outliner) {
      errors.push('Outliner metadata lost');
    }

    return {
      isValid: errors.length === 0,
      errors,
      task,
      convertedBubble,
    };
  } catch (error) {
    const task = bubbleToTask(originalBubble);
    return {
      isValid: false,
      errors: [`Round-trip failed: ${error}`],
      task,
      convertedBubble: taskToBubble(task),
    };
  }
}
