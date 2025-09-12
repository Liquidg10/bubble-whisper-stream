/**
 * Task Store Facade - Provides Task-oriented API over BubbleStore
 * 
 * During migration, this facade reads/writes through BubbleStore adapters,
 * maintaining BubbleStore as the single source of truth.
 */

import React from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Task, TaskId, TaskType, TimeHorizon } from '@/types/task';
import type { Bubble } from '@/types/bubble';
import { useBubbleStore } from './bubbleStore';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { logger } from '@/utils/logger';

interface TaskStoreState {
  // Computed state (derived from BubbleStore)
  tasks: Task[];
  isLoading: boolean;
  selectedTaskIds: Set<TaskId>;
  
  // Actions
  getTasks: () => Task[];
  getTask: (id: TaskId) => Task | undefined;
  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  updateTask: (id: TaskId, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: TaskId) => Promise<void>;
  toggleTaskCompletion: (id: TaskId) => Promise<void>;
  moveTaskToHorizon: (id: TaskId, horizon: TimeHorizon) => Promise<void>;
  
  // Selection management
  selectTask: (id: TaskId) => void;
  deselectTask: (id: TaskId) => void;
  clearSelection: () => void;
  isTaskSelected: (id: TaskId) => boolean;
  getSelectedTasks: () => Task[];
  
  // Filtering and organization
  getTasksByType: (type: TaskType) => Task[];
  getTasksByHorizon: (horizon: TimeHorizon) => Task[];
  getCompletedTasks: () => Task[];
  getPendingTasks: () => Task[];
  getTasksByPriority: (minPriority?: number, maxPriority?: number) => Task[];
  
  // Utility
  refreshFromBubbleStore: () => void;
}

export const useTaskStore = create<TaskStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    tasks: [],
    isLoading: false,
    selectedTaskIds: new Set(),

    // Core CRUD operations
    getTasks: () => {
      try {
        const bubbles = useBubbleStore.getState().bubbles;
        return bubbles.map(bubbleToTask);
      } catch (error) {
        logger.error('Failed to get tasks from bubbles', error);
        return [];
      }
    },

    getTask: (id: TaskId) => {
      try {
        const bubble = useBubbleStore.getState().bubbles.find(b => b.id === id);
        return bubble ? bubbleToTask(bubble) : undefined;
      } catch (error) {
        logger.error('Failed to get task', error, { taskId: id });
        return undefined;
      }
    },

    addTask: async (taskData: Omit<Task, 'id'>) => {
      try {
        set({ isLoading: true });
        
        // Convert task to bubble and add through BubbleStore
        const tempTask: Task = { 
          ...taskData, 
          id: crypto.randomUUID(),
          updatedAt: Date.now()
        };
        const bubble = taskToBubble(tempTask);
        
        const bubbleStore = useBubbleStore.getState();
        await bubbleStore.addBubble(bubble);
        
        // Refresh task list
        get().refreshFromBubbleStore();
        
        logger.debug('Added task via BubbleStore', { taskId: tempTask.id });
      } catch (error) {
        logger.error('Failed to add task', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    updateTask: async (id: TaskId, updates: Partial<Task>) => {
      try {
        set({ isLoading: true });
        
        const currentTask = get().getTask(id);
        if (!currentTask) {
          throw new Error(`Task ${id} not found`);
        }
        
        // Store previous task for change detection
        const previousTask = { ...currentTask };
        
        // Merge updates and convert to bubble
        const updatedTask: Task = { 
          ...currentTask, 
          ...updates, 
          id, // Ensure ID doesn't change
          updatedAt: Date.now()
        };
        const bubble = taskToBubble(updatedTask);
        
        const bubbleStore = useBubbleStore.getState();
        await bubbleStore.updateBubble(bubble);
        
        // Refresh task list
        get().refreshFromBubbleStore();
        
        // Trigger auto-write evaluation if calendar data changed
        // Import dynamically to avoid circular dependencies
        if (typeof window !== 'undefined') {
          import('../services/taskAwareAutoWriteService').then(({ taskAwareAutoWriteService }) => {
            taskAwareAutoWriteService.evaluateTask(updatedTask, previousTask).catch(error => {
              logger.error('Auto-write evaluation failed', error, { taskId: id });
            });
          });
        }
        
        logger.debug('Updated task via BubbleStore', { taskId: id, updates });
      } catch (error) {
        logger.error('Failed to update task', error, { taskId: id });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    deleteTask: async (id: TaskId) => {
      try {
        set({ isLoading: true });
        
        const bubbleStore = useBubbleStore.getState();
        bubbleStore.deleteBubble(id);
        
        // Remove from selection if selected
        const selectedTaskIds = new Set(get().selectedTaskIds);
        selectedTaskIds.delete(id);
        set({ selectedTaskIds });
        
        // Refresh task list
        get().refreshFromBubbleStore();
        
        logger.debug('Deleted task via BubbleStore', { taskId: id });
      } catch (error) {
        logger.error('Failed to delete task', error, { taskId: id });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    toggleTaskCompletion: async (id: TaskId) => {
      try {
        const task = get().getTask(id);
        if (!task) return;
        
        await get().updateTask(id, { completed: !task.completed });
      } catch (error) {
        logger.error('Failed to toggle task completion', error, { taskId: id });
        throw error;
      }
    },

    moveTaskToHorizon: async (id: TaskId, horizon: TimeHorizon) => {
      try {
        const task = get().getTask(id);
        if (!task) return;
        
        const updatedView = {
          ...task.view,
          atomic: {
            ...task.view?.atomic,
            shell: horizon
          }
        };
        
        await get().updateTask(id, { view: updatedView });
        
        logger.debug('Moved task to horizon', { taskId: id, horizon });
      } catch (error) {
        logger.error('Failed to move task to horizon', error, { taskId: id, horizon });
        throw error;
      }
    },

    // Selection management
    selectTask: (id: TaskId) => {
      const selectedTaskIds = new Set(get().selectedTaskIds);
      selectedTaskIds.add(id);
      set({ selectedTaskIds });
    },

    deselectTask: (id: TaskId) => {
      const selectedTaskIds = new Set(get().selectedTaskIds);
      selectedTaskIds.delete(id);
      set({ selectedTaskIds });
    },

    clearSelection: () => {
      set({ selectedTaskIds: new Set() });
    },

    isTaskSelected: (id: TaskId) => {
      return get().selectedTaskIds.has(id);
    },

    getSelectedTasks: () => {
      const selectedIds = get().selectedTaskIds;
      return get().getTasks().filter(task => selectedIds.has(task.id));
    },

    // Filtering and organization
    getTasksByType: (type: TaskType) => {
      return get().getTasks().filter(task => task.type === type);
    },

    getTasksByHorizon: (horizon: TimeHorizon) => {
      return get().getTasks().filter(task => task.view?.atomic?.shell === horizon);
    },

    getCompletedTasks: () => {
      return get().getTasks().filter(task => task.completed);
    },

    getPendingTasks: () => {
      return get().getTasks().filter(task => !task.completed);
    },

    getTasksByPriority: (minPriority = 0, maxPriority = 100) => {
      return get().getTasks().filter(task => 
        task.priority >= minPriority && task.priority <= maxPriority
      );
    },

    // Utility
    refreshFromBubbleStore: () => {
      try {
        const tasks = get().getTasks();
        set({ tasks });
      } catch (error) {
        logger.error('Failed to refresh tasks from BubbleStore', error);
      }
    }
  }))
);

// Subscribe to BubbleStore changes to keep TaskStore in sync
// Smart refresh logic: debounce bulk operations, not individual drags
let refreshTimeout: NodeJS.Timeout | null = null;
let lastBulkOpTime = 0;

useBubbleStore.subscribe(
  () => {
    const now = performance.now();
    
    // For bulk operations, use debounce to prevent excessive calls
    if (now - lastBulkOpTime > 100) {
      // Immediate refresh for individual operations (like drag)
      useTaskStore.getState().refreshFromBubbleStore();
      lastBulkOpTime = now;
    } else {
      // Debounce rapid successive calls (bulk operations)
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        useTaskStore.getState().refreshFromBubbleStore();
        lastBulkOpTime = performance.now();
      }, 50);
    }
  }
);

// Initial sync
useTaskStore.getState().refreshFromBubbleStore();

/**
 * Hook to get task store with automatic bubble store sync
 * Now relies solely on the global subscription for performance
 */
export function useTaskStoreSync() {
  const taskStore = useTaskStore();
  
  // Only sync on mount - global subscription handles updates
  React.useEffect(() => {
    taskStore.refreshFromBubbleStore();
  }, []); // Empty dependency array - no redundant subscriptions
  
  return taskStore;
}
