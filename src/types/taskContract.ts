/**
 * Canonical Task Contract v0.1
 *
 * This module contains only JSON-serializable domain types so both the Task
 * facade and the Bubble persistence envelope can depend on it without a
 * circular import.
 */

export const CANONICAL_TASK_CONTRACT_VERSION = 1 as const;

export type TaskId = string;

export type TaskType =
  | 'task'
  | 'thought'
  | 'memory'
  | 'mood'
  | 'reminder'
  | 'photo'
  | 'event';

export type TimeHorizon = 'today' | 'week' | 'later';

export type TaskActionability = 'actionable' | 'reference';

export type TaskEnergyFit = 'low' | 'medium' | 'high' | 'flexible';

export type TaskUrgency = 0 | 1 | 2 | 3;

export type TaskReadinessBand = 'now' | 'possible' | 'later' | 'blocked' | 'unknown';

export type TaskReadinessFactorKey = 'energy' | 'time' | 'urgency' | 'priority';

export interface TaskReadinessFactor {
  key: TaskReadinessFactorKey;
  score: number;
  weight: number;
  available: boolean;
  explanation: string;
}

export interface TaskReadiness {
  band: TaskReadinessBand;
  source: 'computed' | 'user';
  score?: number;
  reason?: string;
  factors?: TaskReadinessFactor[];
  evaluatedAt?: number;
  override?: {
    band: TaskReadinessBand;
    setAt: number;
    reason?: string;
    expiresAt?: number;
  };
  inputSnapshot?: {
    currentEnergy?: Exclude<TaskEnergyFit, 'flexible'>;
    energyMatch?: number;
    estimatedMinutes?: number;
    availableMinutes?: number;
    effectiveAvailableMinutes?: number;
    capacityRatio?: number;
    timeFit?: number;
    contextFit?: number;
    urgency?: TaskUrgency;
    priority?: number;
    actionable?: boolean;
    blocked?: boolean;
  };
}

/**
 * AI and rule-based systems may suggest a link, but downstream ripple logic
 * must use only links whose userConfirmed flag is true.
 */
export interface TaskDomainLink {
  id: string;
  domainId: string;
  label?: string;
  userConfirmed: boolean;
  source: 'user' | 'assistant' | 'import';
  strength?: 'primary' | 'secondary';
  createdAt?: number;
  updatedAt?: number;
}

export interface TaskTag {
  id: string;
  name: string;
  emoji?: string;
  colorHex?: string;
}

export interface TaskViewMetadata {
  bubble?: {
    x: number;
    y: number;
    size: number;
    colorHex?: string;
  };
  atomic?: {
    shell: TimeHorizon;
    domain?: string;
    angle?: number;
  };
  list?: {
    group?: string;
    order?: number;
  };
  kanban?: {
    boardId: string;
    columnId: string;
    pos: number;
  };
  matrix?: {
    urgency: TaskUrgency;
    importance: 0 | 1 | 2 | 3;
    quadrant?: 1 | 2 | 3 | 4;
  };
  pinboard?: {
    x?: number;
    y?: number;
    size?: number;
    ordering?: number;
    energy?: 'low' | 'medium' | 'high';
    mood?: 'positive' | 'neutral' | 'negative';
    lastMoved?: number;
    context?: string;
  };
  calendar?: {
    startTime?: string;
    durationMin?: number;
    location?: string;
    attendees?: string[];
    calendarId?: string;
  };
  email?: {
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
    accountId?: string;
    threadId?: string;
  };
}

export interface TaskOutlinerMetadata {
  // Canonical Task-facing shape
  parentId?: string;
  steps?: Array<{
    id: string;
    title: string;
    completed: boolean;
    estimateMin?: number;
    dependencies?: string[];
  }>;
  estimateMin?: number;
  progressPercent?: number;

  // Legacy Bubble-facing shape. Retained losslessly during migration.
  parentTaskId?: string;
  stepId?: string;
  estimatedMinutes?: number;
  dependsOn?: string;
}

export interface TaskFinanceMetadata {
  accountId?: string;
  transactionId?: string;
  amount?: number;
  merchant?: string;
  category?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: number;
  itemLines?: Array<{
    name: string;
    price: number;
    category?: string;
    confidence?: number;
  }>;

  // Legacy receipt metadata
  total?: number;
  date?: string;
  currency?: string;
  receiptProcessed?: boolean;
}

export interface TaskFocusSessionMetadata {
  targetMin?: number;
  actualMin?: number;
  startedAt?: number;
  completedAt?: number;
  notes?: string;
  breaks?: Array<{
    startAt: number;
    endAt: number;
    type: 'micro' | 'planned';
  }>;

  // Legacy Bubble-facing shape. Retained losslessly during migration.
  duration?: number;
  stepsCompleted?: number;
  log?: string[];
}

export interface TaskMetadata {
  outliner?: TaskOutlinerMetadata;
  finance?: TaskFinanceMetadata;
  focusSession?: TaskFocusSessionMetadata;
  // Legacy Bubble metadata is schema-less; v0.1 must preserve unknown keys.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Versioned Task data persisted inside Bubble.metadata.canonicalTask.
 *
 * BubbleStore/IndexedDB remains the one persisted owner for v0.1. The
 * envelope preserves Task-only semantics and exact projection metadata while
 * legacy Bubble fields remain readable during the migration.
 */
export interface CanonicalTaskContractV1 {
  schemaVersion: typeof CANONICAL_TASK_CONTRACT_VERSION;
  type: TaskType;
  completed: boolean;
  due?: number;
  start?: number;
  end?: number;
  estimatedMinutes?: number;
  actionability?: TaskActionability;
  energyFit?: TaskEnergyFit;
  urgency?: TaskUrgency;
  readiness?: TaskReadiness;
  domainLinks?: TaskDomainLink[];
  view?: TaskViewMetadata;
  metadata?: TaskMetadata;
}
