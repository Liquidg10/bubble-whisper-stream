/**
 * ViewBus - Lightweight event bus for task-related events
 * 
 * Provides type-safe pub/sub system for task updates, movements, and view changes.
 * Designed for memory efficiency with automatic cleanup.
 */

import type { Task, TaskId } from '@/types/task';
import type { ViewContext } from './sdk';

/**
 * Task event payloads
 */
export interface TaskUpdatedEvent {
  task: Task;
  previousTask?: Task;
  source: ViewContext;
  timestamp: number;
}

export interface TaskMovedEvent {
  taskId: TaskId;
  fromView?: Partial<Task['view']>;
  toView: Partial<Task['view']>;
  source: ViewContext;
  timestamp: number;
}

export interface ViewChangedEvent {
  viewId: string;
  mode: ViewContext['mode'];
  changeType: 'activated' | 'deactivated' | 'updated';
  timestamp: number;
}

export interface SelectionChangedEvent {
  viewId: string;
  selected: TaskId[];
  deselected: TaskId[];
  source: ViewContext;
  timestamp: number;
}

/**
 * Event type mapping
 */
export interface ViewBusEvents {
  'task.updated': TaskUpdatedEvent;
  'task.moved': TaskMovedEvent;
  'view.changed': ViewChangedEvent;
  'selection.changed': SelectionChangedEvent;
}

export type ViewBusEventType = keyof ViewBusEvents;
export type ViewBusEventHandler<T extends ViewBusEventType> = (event: ViewBusEvents[T]) => void;

/**
 * Subscription management
 */
interface Subscription {
  id: string;
  eventType: ViewBusEventType;
  handler: ViewBusEventHandler<any>;
  cleanup?: () => void;
}

/**
 * Simple, lightweight event bus for view coordination
 */
class ViewEventBus {
  private subscriptions = new Map<string, Subscription>();
  private eventCounter = 0;

  /**
   * Subscribe to a specific event type
   */
  subscribe<T extends ViewBusEventType>(
    eventType: T,
    handler: ViewBusEventHandler<T>,
    cleanup?: () => void
  ): () => void {
    const id = `sub_${++this.eventCounter}`;
    
    this.subscriptions.set(id, {
      id,
      eventType,
      handler,
      cleanup
    });

    // Return unsubscribe function
    return () => {
      const sub = this.subscriptions.get(id);
      if (sub) {
        sub.cleanup?.();
        this.subscriptions.delete(id);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  emit<T extends ViewBusEventType>(eventType: T, event: ViewBusEvents[T]): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.eventType === eventType) {
        try {
          subscription.handler(event);
        } catch (error) {
          console.error(`ViewBus: Error in ${eventType} handler:`, error);
        }
      }
    }
  }

  /**
   * Get current subscription count (for debugging)
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Clear all subscriptions (for cleanup/testing)
   */
  clear(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.cleanup?.();
    }
    this.subscriptions.clear();
  }

  /**
   * Get active event types (for debugging)
   */
  getActiveEventTypes(): ViewBusEventType[] {
    const types = new Set<ViewBusEventType>();
    for (const sub of this.subscriptions.values()) {
      types.add(sub.eventType);
    }
    return Array.from(types);
  }
}

/**
 * Global ViewBus instance
 */
export const ViewBus = new ViewEventBus();

/**
 * React hook for subscribing to ViewBus events
 */
import { useEffect } from 'react';

export function useViewBusSubscription<T extends ViewBusEventType>(
  eventType: T,
  handler: ViewBusEventHandler<T>,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    const unsubscribe = ViewBus.subscribe(eventType, handler);
    return unsubscribe;
  }, deps);
}

/**
 * Helper functions for creating events
 */
export const ViewBusHelpers = {
  createTaskUpdatedEvent(
    task: Task,
    source: ViewContext,
    previousTask?: Task
  ): TaskUpdatedEvent {
    return {
      task,
      previousTask,
      source,
      timestamp: Date.now()
    };
  },

  createTaskMovedEvent(
    taskId: TaskId,
    toView: Partial<Task['view']>,
    source: ViewContext,
    fromView?: Partial<Task['view']>
  ): TaskMovedEvent {
    return {
      taskId,
      fromView,
      toView,
      source,
      timestamp: Date.now()
    };
  },

  createViewChangedEvent(
    viewId: string,
    mode: ViewContext['mode'],
    changeType: ViewChangedEvent['changeType']
  ): ViewChangedEvent {
    return {
      viewId,
      mode,
      changeType,
      timestamp: Date.now()
    };
  },

  createSelectionChangedEvent(
    viewId: string,
    selected: TaskId[],
    deselected: TaskId[],
    source: ViewContext
  ): SelectionChangedEvent {
    return {
      viewId,
      selected,
      deselected,
      source,
      timestamp: Date.now()
    };
  }
};