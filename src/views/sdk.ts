/**
 * ViewSDK - Unified interface contracts for all view implementations
 * 
 * This SDK provides standard interfaces that all views (Bubble, Atomic, List, Kanban, Matrix)
 * implement to ensure consistent task management across different visualization paradigms.
 */

import type { Task, TaskId } from '@/types/task';

/**
 * View context providing identification and mode information
 */
export interface ViewContext {
  viewId: string;
  mode: 'bubble' | 'atomic' | 'list' | 'kanban' | 'matrix';
  now: number;
}

/**
 * View data containing tasks and selection state
 */
export interface ViewData {
  tasks: Task[];
  selection?: TaskId[];
}

/**
 * Standardized actions that all views can perform on tasks
 */
export interface ViewActions {
  /** Create or update a single task */
  upsert(task: Task): Promise<void>;
  
  /** Create or update multiple tasks efficiently */
  bulkUpsert(tasks: Task[]): Promise<void>;
  
  /** Remove a task by ID */
  remove(id: TaskId): Promise<void>;
  
  /** Reorder tasks within or between containers (optional for views that support ordering) */
  reorder?(ids: TaskId[], dest: { columnId?: string; index: number }): Promise<void>;
  
  /** Focus on a specific task (optional) */
  focus?(id: TaskId): void;
  
  /** Undo a specific operation by undo ID (optional) */
  undo?(undoId: string): Promise<void>;
}

/**
 * Complete ViewSDK interface combining context, data, and actions
 */
export interface ViewSDK {
  ctx: ViewContext;
  data: ViewData;
  actions: ViewActions;
}

/**
 * Helper to create ViewContext with current timestamp
 */
export function createViewContext(
  viewId: string, 
  mode: ViewContext['mode']
): ViewContext {
  return {
    viewId,
    mode,
    now: Date.now()
  };
}

/**
 * Helper to create ViewData from tasks and optional selection
 */
export function createViewData(
  tasks: Task[], 
  selection?: TaskId[]
): ViewData {
  return {
    tasks,
    selection
  };
}