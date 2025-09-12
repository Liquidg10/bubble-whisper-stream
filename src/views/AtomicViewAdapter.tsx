/**
 * AtomicViewAdapter - ViewSDK wrapper for AtomicView  
 * 
 * Wraps the existing AtomicView component to implement ViewSDK contracts,
 * publishes task events when shells/horizons change, and reads tasks via TaskStore.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { AtomicView } from '@/components/AtomicView';
import { useTaskStoreSync } from '@/stores/taskStore';
import { ViewBus, ViewBusHelpers } from './bus';
import { createViewContext, createViewData, type ViewSDK, type ViewActions } from './sdk';
import { bubbleToTask } from '@/adapters/taskAdapter';
import { useBubbleStore } from '@/stores/bubbleStore';
import { isFeatureEnabled } from '@/config/flags';
import type { Task, TaskId } from '@/types/task';
import type { TimeHorizon } from '@/types/task';

interface AtomicViewAdapterProps {
  viewId?: string;
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  className?: string;
}

export function AtomicViewAdapter({
  viewId = 'atomic-main',
  onBubbleSelect,
  onBubbleEdit,
  className
}: AtomicViewAdapterProps) {
  const taskStore = useTaskStoreSync();
  const bubbleStore = useBubbleStore();
  const previousHorizonsRef = useRef<Map<string, TimeHorizon>>(new Map());
  
  const viewContext = useMemo(() => 
    createViewContext(viewId, 'atomic'), 
    [viewId]
  );

  const viewData = useMemo(() => 
    createViewData(taskStore.tasks, Array.from(taskStore.selectedTaskIds)), 
    [taskStore.tasks, taskStore.selectedTaskIds]
  );

  // ViewSDK Actions implementation
  const actions: ViewActions = useMemo(() => ({
    async upsert(task: Task): Promise<void> {
      await taskStore.updateTask(task.id, task);
      
      if (isFeatureEnabled('viewSdk')) {
        ViewBus.emit('task.updated', ViewBusHelpers.createTaskUpdatedEvent(
          task,
          viewContext
        ));
      }
    },

    async bulkUpsert(tasks: Task[]): Promise<void> {
      for (const task of tasks) {
        await this.upsert(task);
      }
    },

    async remove(id: TaskId): Promise<void> {
      await taskStore.deleteTask(id);
    },

    reorder(ids: TaskId[], dest: { columnId?: string; index: number }): Promise<void> {
      // For atomic view, columnId could represent the time horizon shell
      const horizon = dest.columnId as TimeHorizon;
      if (horizon && ids.length === 1) {
        return taskStore.moveTaskToHorizon(ids[0], horizon);
      }
      return Promise.resolve();
    },

    focus(id: TaskId): void {
      onBubbleSelect?.(id);
    }
  }), [taskStore, viewContext, onBubbleSelect]);

  const sdk: ViewSDK = useMemo(() => ({
    ctx: viewContext,
    data: viewData,
    actions
  }), [viewContext, viewData, actions]);

  // Track task horizons to detect shell changes
  useEffect(() => {
    if (!isFeatureEnabled('viewSdk')) return;

    const currentHorizons = new Map<string, TimeHorizon>();
    
    // Extract horizon information from tasks
    for (const task of taskStore.tasks) {
      const horizon = task.view?.atomic?.shell || 'later';
      currentHorizons.set(task.id, horizon);
    }

    // Check for horizon changes
    for (const [taskId, currentHorizon] of currentHorizons) {
      const previousHorizon = previousHorizonsRef.current.get(taskId);
      
      if (previousHorizon && previousHorizon !== currentHorizon) {
        // Horizon changed - emit task.moved event
        const fromView = { atomic: { shell: previousHorizon } };
        const toView = { atomic: { shell: currentHorizon } };
        
        ViewBus.emit('task.moved', ViewBusHelpers.createTaskMovedEvent(
          taskId,
          toView,
          viewContext,
          fromView
        ));
      }
    }

    previousHorizonsRef.current = currentHorizons;
  }, [taskStore.tasks, viewContext]);

  // Emit view.changed when component mounts/unmounts
  useEffect(() => {
    if (!isFeatureEnabled('viewSdk')) return;

    ViewBus.emit('view.changed', ViewBusHelpers.createViewChangedEvent(
      viewId,
      'atomic',
      'activated'
    ));

    return () => {
      ViewBus.emit('view.changed', ViewBusHelpers.createViewChangedEvent(
        viewId,
        'atomic',
        'deactivated'
      ));
    };
  }, [viewId]);

  // Handle bubble selection changes
  const handleBubbleSelect = (bubbleId: string) => {
    if (isFeatureEnabled('viewSdk')) {
      const currentSelection = Array.from(taskStore.selectedTaskIds);
      const isSelected = currentSelection.includes(bubbleId);
      
      ViewBus.emit('selection.changed', ViewBusHelpers.createSelectionChangedEvent(
        viewId,
        isSelected ? [] : [bubbleId],
        isSelected ? [bubbleId] : [],
        viewContext
      ));
    }
    
    onBubbleSelect?.(bubbleId);
  };

  return (
    <AtomicView
      onBubbleSelect={handleBubbleSelect}
      onBubbleEdit={onBubbleEdit}
      className={className}
    />
  );
}

/**
 * Hook to access ViewSDK from within atomic components
 */
export function useAtomicViewSDK(viewId = 'atomic-main'): ViewSDK {
  const taskStore = useTaskStoreSync();
  
  const viewContext = useMemo(() => 
    createViewContext(viewId, 'atomic'), 
    [viewId]
  );

  const viewData = useMemo(() => 
    createViewData(taskStore.tasks, Array.from(taskStore.selectedTaskIds)), 
    [taskStore.tasks, taskStore.selectedTaskIds]
  );

  const actions: ViewActions = useMemo(() => ({
    async upsert(task: Task): Promise<void> {
      await taskStore.updateTask(task.id, task);
    },

    async bulkUpsert(tasks: Task[]): Promise<void> {
      for (const task of tasks) {
        await this.upsert(task);
      }
    },

    async remove(id: TaskId): Promise<void> {
      await taskStore.deleteTask(id);
    },

    async reorder(ids: TaskId[], dest: { columnId?: string; index: number }): Promise<void> {
      const horizon = dest.columnId as TimeHorizon;
      if (horizon && ids.length === 1) {
        await taskStore.moveTaskToHorizon(ids[0], horizon);
      }
    },

    focus(id: TaskId): void {
      console.log('Focus task in atomic view:', id);
    }
  }), [taskStore]);

  return useMemo(() => ({
    ctx: viewContext,
    data: viewData,
    actions
  }), [viewContext, viewData, actions]);
}