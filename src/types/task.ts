/**
 * Task Interface - Thin wrapper around Bubble with view-namespaced metadata
 * 
 * This provides a Task abstraction while preserving all existing Bubble functionality.
 * Tasks are converted to/from Bubbles via adapters, maintaining data integrity.
 */

import type { Bubble } from './bubble';

export type TaskId = string;

export type TaskType = 'task' | 'thought' | 'memory' | 'mood' | 'reminder' | 'photo' | 'event';

export type TimeHorizon = 'today' | 'week' | 'later';

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
    urgency: 0 | 1 | 2 | 3;
    importance: 0 | 1 | 2 | 3;
    quadrant?: 1 | 2 | 3 | 4;
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

export interface Task {
  // Core identification
  id: TaskId;
  type: TaskType;
  title: string;
  description?: string;
  completed: boolean;
  
  // Priority (0-100 mapped from prioritizer 0-1)
  priority: number;
  
  // Tagging and categorization
  tags: TaskTag[];
  
  // Temporal metadata
  createdAt: number;
  updatedAt: number;
  due?: number;
  start?: number;
  end?: number;
  
  // View-specific positioning and metadata
  view?: TaskViewMetadata;
  
  // Preserve: carry Bubble.metadata forward intact
  // Enhanced metadata structure from Implementation Bible
  metadata?: {
    outliner?: {
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
    };
    finance?: {
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
    };
    focusSession?: {
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
    };
    // Preserve Bubble compatibility
    [key: string]: any;
  };
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
    type,
    title,
    description: options.description,
    completed: options.completed || false,
    priority: options.priority || 50, // Default medium priority
    tags: options.tags || [],
    createdAt: now,
    updatedAt: now,
    due: options.due,
    start: options.start,
    end: options.end,
    view: options.view,
    metadata: options.metadata,
    ...options
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