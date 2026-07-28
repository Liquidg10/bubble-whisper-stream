/**
 * Task Interface - the one canonical entity projected into multiple views.
 *
 * BubbleStore remains the persisted owner during the v0.1 migration. Tasks
 * are converted to/from a versioned Bubble metadata envelope by taskAdapter.
 */

import type {
  TaskActionability,
  TaskDomainLink,
  TaskEnergyFit,
  TaskId,
  TaskMetadata,
  TaskReadiness,
  TaskTag,
  TaskType,
  TaskUrgency,
  TaskViewMetadata,
} from './taskContract';

export {
  CANONICAL_TASK_CONTRACT_VERSION,
} from './taskContract';

export type {
  CanonicalTaskContractV1,
  TaskActionability,
  TaskDomainLink,
  TaskEnergyFit,
  TaskFinanceMetadata,
  TaskFocusSessionMetadata,
  TaskId,
  TaskMetadata,
  TaskOutlinerMetadata,
  TaskReadiness,
  TaskReadinessBand,
  TaskReadinessFactor,
  TaskReadinessFactorKey,
  TaskTag,
  TaskType,
  TaskUrgency,
  TaskViewMetadata,
  TimeHorizon,
} from './taskContract';

export interface Task {
  // Core identification
  id: TaskId;
  type: TaskType;
  title: string;
  description?: string;
  completed: boolean;
  
  // Priority (0-100 mapped from prioritizer 0-1)
  priority: number;

  // Canonical action-fit semantics. Optional during the legacy migration.
  actionability?: TaskActionability;
  energyFit?: TaskEnergyFit;
  urgency?: TaskUrgency;
  readiness?: TaskReadiness;

  // Only user-confirmed links may contribute to Ripple/Molecule projections.
  domainLinks?: TaskDomainLink[];
  
  // Tagging and categorization
  tags: TaskTag[];
  
  // Temporal metadata
  createdAt: number;
  updatedAt: number;
  due?: number;
  start?: number;
  end?: number;
  estimatedMinutes?: number;
  
  // View-specific positioning and metadata
  view?: TaskViewMetadata;
  
  // Preserve: carry Bubble.metadata forward intact
  // Enhanced metadata structure from Implementation Bible
  metadata?: TaskMetadata;
}

/**
 * Task creation helper with sensible defaults
 */
export function createTask(
  title: string,
  type: TaskType = 'task',
  options: Partial<Omit<Task, 'id' | 'title' | 'type' | 'createdAt' | 'updatedAt'>> = {}
): Omit<Task, 'id'> {
  const now = Date.now();
  
  return {
    ...options,
    type,
    title,
    description: options.description,
    completed: options.completed ?? false,
    priority: options.priority ?? 50, // Default medium priority
    actionability: options.actionability,
    energyFit: options.energyFit,
    urgency: options.urgency,
    readiness: options.readiness,
    domainLinks: options.domainLinks,
    tags: options.tags ?? [],
    createdAt: now,
    updatedAt: now,
    due: options.due,
    start: options.start,
    end: options.end,
    estimatedMinutes: options.estimatedMinutes,
    view: options.view,
    metadata: options.metadata,
  };
}

/**
 * Task update helper that preserves metadata and timestamps
 */
export function updateTask(
  task: Task,
  updates: Partial<Omit<Task, 'id' | 'createdAt'>>
): Task {
  return {
    ...task,
    ...updates,
    updatedAt: Date.now()
  };
}
