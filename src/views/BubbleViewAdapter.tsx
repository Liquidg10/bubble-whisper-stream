/**
 * BubbleViewAdapter - ViewSDK wrapper for BubbleCanvas
 * 
 * Wraps the existing BubbleCanvas component to implement ViewSDK contracts,
 * publishes task events when bubbles are moved/merged, and reads tasks via TaskStore.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { useTaskStoreSync } from '@/stores/taskStore';
import { ViewBus, ViewBusHelpers } from './bus';
import { createViewContext, createViewData, type ViewSDK, type ViewActions } from './sdk';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { useBubbleStore } from '@/stores/bubbleStore';
import { isFeatureEnabled } from '@/config/flags';
import type { Bubble } from '@/types/bubble';
import type { Task, TaskId } from '@/types/task';

interface BubbleViewAdapterProps {
  viewId?: string;
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  className?: string;
}

export function BubbleViewAdapter({
  viewId = 'bubble-main',
  onBubbleSelect,
  onBubbleEdit,
  className
}: BubbleViewAdapterProps) {
  const taskStore = useTaskStoreSync();
  const bubbleStore = useBubbleStore();
  const previousPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  const viewContext = useMemo(() => 
    createViewContext(viewId, 'bubble'), 
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

    focus(id: TaskId): void {
      onBubbleSelect?.(id);
    }
  }), [taskStore, viewContext, onBubbleSelect]);

  const sdk: ViewSDK = useMemo(() => ({
    ctx: viewContext,
    data: viewData,
    actions
  }), [viewContext, viewData, actions]);

  // Track bubble positions to detect movement
  useEffect(() => {
    if (!isFeatureEnabled('viewSdk')) return;

    const currentPositions = new Map<string, { x: number; y: number }>();
    
    for (const bubble of bubbleStore.bubbles) {
      currentPositions.set(bubble.id, { x: bubble.x, y: bubble.y });
    }

    // Check for position changes
    for (const [bubbleId, currentPos] of currentPositions) {
      const previousPos = previousPositionsRef.current.get(bubbleId);
      
      if (previousPos && 
          (Math.abs(currentPos.x - previousPos.x) > 1 || 
           Math.abs(currentPos.y - previousPos.y) > 1)) {
        
        // Bubble moved - emit task.moved event
        const fromView = { bubble: { ...previousPos, size: 0 } };
        const toView = { bubble: { ...currentPos, size: 0 } };
        
        ViewBus.emit('task.moved', ViewBusHelpers.createTaskMovedEvent(
          bubbleId,
          toView,
          viewContext,
          fromView
        ));
      }
    }

    previousPositionsRef.current = currentPositions;
  }, [bubbleStore.bubbles, viewContext]);

  // Emit view.changed when component mounts/unmounts
  useEffect(() => {
    if (!isFeatureEnabled('viewSdk')) return;

    ViewBus.emit('view.changed', ViewBusHelpers.createViewChangedEvent(
      viewId,
      'bubble',
      'activated'
    ));

    return () => {
      ViewBus.emit('view.changed', ViewBusHelpers.createViewChangedEvent(
        viewId,
        'bubble',
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

  // Handle bubble merges (detect via bubble count changes)
  const bubbleCountRef = useRef(bubbleStore.bubbles.length);
  useEffect(() => {
    if (!isFeatureEnabled('viewSdk')) return;

    const currentCount = bubbleStore.bubbles.length;
    const previousCount = bubbleCountRef.current;
    
    if (currentCount < previousCount) {
      // Potential merge detected - emit task.updated for remaining bubbles
      // This is a simplified detection; real implementation would track merge operations
      console.log('BubbleViewAdapter: Potential bubble merge detected');
    }
    
    bubbleCountRef.current = currentCount;
  }, [bubbleStore.bubbles.length, viewContext]);

  const handleBubbleInteraction = (bubble: any) => {
    // Handle both bubble objects and IDs
    const bubbleId = typeof bubble === 'string' ? bubble : bubble.id;
    handleBubbleSelect(bubbleId);
  };

  const handleBubbleEditInteraction = (bubble: any) => {
    // Handle both bubble objects and IDs  
    const bubbleId = typeof bubble === 'string' ? bubble : bubble.id;
    onBubbleEdit?.(bubbleId);
  };

  return (
    <BubbleCanvas
      onBubbleSelect={handleBubbleInteraction}
      onBubbleEdit={handleBubbleEditInteraction}
      className={className}
    />
  );
}

/**
 * Hook to access ViewSDK from within bubble components
 */
export function useBubbleViewSDK(viewId = 'bubble-main'): ViewSDK {
  const taskStore = useTaskStoreSync();
  
  const viewContext = useMemo(() => 
    createViewContext(viewId, 'bubble'), 
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

    focus(id: TaskId): void {
      // Implementation depends on bubble focus requirements
      console.log('Focus task:', id);
    }
  }), [taskStore]);

  return useMemo(() => ({
    ctx: viewContext,
    data: viewData,
    actions
  }), [viewContext, viewData, actions]);
}