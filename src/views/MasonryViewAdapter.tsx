/**
 * Masonry View Adapter - ViewSDK integration for Pinboard
 * 
 * Provides ViewSDK contract implementation for the Masonry/Pinboard view,
 * integrating with existing Task system and event bus.
 */

import React, { useEffect, useMemo } from 'react';
import { createViewContext, createViewData, type ViewSDK } from '@/views/sdk';
import { Task, TaskId } from '@/types/task';
import { useTaskStore } from '@/stores/taskStore';
import { useBubbleStore } from '@/stores/bubbleStore';
import { decisionTraceService } from '@/services/decisionTraceService';
import { usePinboardCalendarIntegration } from '@/hooks/usePinboardCalendarIntegration';
import MasonryView from '@/pages/MasonryView';
import { useToast } from '@/hooks/use-toast';

interface MasonryViewAdapterProps {
  viewId?: string;
  onTaskSelect?: (task: Task) => void;
  onTaskEdit?: (task: Task) => void;
  className?: string;
}

export function MasonryViewAdapter({ 
  viewId = 'masonry-main', 
  onTaskSelect, 
  onTaskEdit,
  className 
}: MasonryViewAdapterProps) {
  const { tasks, addTask, updateTask, deleteTask } = useTaskStore();
  const { settings } = useBubbleStore();
  const pinboardIntegration = usePinboardCalendarIntegration();
  const { toast } = useToast();

  // Create ViewSDK instance
  const sdk = useMemo((): ViewSDK => {
    const ctx = createViewContext(viewId, 'matrix'); // Use matrix mode as closest analog
    
    // Filter tasks relevant to pinboard (unscheduled)
    const relevantTasks = tasks.filter(task => 
      !task.completed && 
      (!task.view?.calendar?.startTime || !task.due || task.due > Date.now())
    );
    
    const data = createViewData(relevantTasks);

    const actions = {
      upsert: async (task: Task) => {
        const isNew = !tasks.find(t => t.id === task.id);
        
        if (isNew) {
          await addTask(task);
          
          // Add decision trace for new task
          decisionTraceService.addTrace({
            feature: 'task',
            signals: [{ type: 'pinboard_creation', value: task.title, confidence: 0.95, source: 'masonry' }],
            confidenceThreshold: 0.8,
            finalConfidence: 0.95,
            decision: 'auto-write',
            action: 'create_pinboard_task',
            becauseText: `Added "${task.title}" to pinboard for organization`,
            metadata: { taskId: task.id, position: task.view?.pinboard },
            undoable: true
          });
        } else {
          await updateTask(task.id, task);
          
          // Add decision trace for update
          decisionTraceService.addTrace({
            feature: 'task',
            signals: [{ type: 'pinboard_update', value: task.view?.pinboard, confidence: 0.9, source: 'masonry' }],
            confidenceThreshold: 0.8,
            finalConfidence: 0.9,
            decision: 'auto-write',
            action: 'update_pinboard_position',
            becauseText: `Updated "${task.title}" position on pinboard`,
            metadata: { taskId: task.id, newPosition: task.view?.pinboard },
            undoable: true
          });
        }

        // Emit view events (future: integrate with ViewBus)
        if (onTaskSelect) {
          onTaskSelect(task);
        }
      },

      bulkUpsert: async (tasksToUpdate: Task[]) => {
        // Process tasks in batches for performance
        const BATCH_SIZE = 10;
        
        for (let i = 0; i < tasksToUpdate.length; i += BATCH_SIZE) {
          const batch = tasksToUpdate.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(task => actions.upsert(task)));
        }

        toast({
          title: "Bulk update complete",
          description: `Updated ${tasksToUpdate.length} tasks on pinboard`,
        });
      },

      remove: async (id: TaskId) => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        await deleteTask(id);
        
        // Add decision trace for removal
        decisionTraceService.addTrace({
          feature: 'task',
          signals: [{ type: 'pinboard_removal', value: id, confidence: 1.0, source: 'masonry' }],
          confidenceThreshold: 0.8,
          finalConfidence: 1.0,
          decision: 'auto-write',
          action: 'remove_pinboard_task',
          becauseText: `Removed "${task.title}" from pinboard`,
          metadata: { taskId: id },
          undoable: true
        });

        toast({
          title: "Task removed",
          description: `Removed "${task.title}" from pinboard`,
        });
      },

      focus: (id: TaskId) => {
        const task = tasks.find(t => t.id === id);
        if (task && onTaskSelect) {
          onTaskSelect(task);
        }
      },

      undo: async (undoId: string) => {
        try {
          const traces = decisionTraceService.getTraces();
          const trace = traces.find(t => t.id === undoId);
          
          if (trace) {
            decisionTraceService.markAsUndone(undoId, crypto.randomUUID());
            
            toast({
              title: "Action undone",
              description: "Reverted pinboard change",
            });
          }
        } catch (error) {
          console.error('Failed to undo pinboard action:', error);
          toast({
            title: "Undo failed",
            description: "Could not revert the action",
            variant: "destructive"
          });
        }
      }
    };

    return { ctx, data, actions };
  }, [viewId, tasks, addTask, updateTask, deleteTask, onTaskSelect, toast]);

  // Emit view change events when tasks change
  useEffect(() => {
    // Future: emit to ViewBus
    console.log('Masonry view data changed:', sdk.data.tasks.length, 'tasks');
  }, [sdk.data.tasks.length]);

  return (
    <MasonryView 
      viewId={viewId}
      className={className}
    />
  );
}

/**
 * Hook to access Masonry ViewSDK from child components
 */
export function useMasonryViewSDK(viewId: string = 'masonry-main'): ViewSDK {
  const { tasks, addTask, updateTask, deleteTask } = useTaskStore();
  
  return useMemo(() => {
    const ctx = createViewContext(viewId, 'matrix');
    
    const relevantTasks = tasks.filter(task => 
      !task.completed && 
      (!task.view?.calendar?.startTime || !task.due || task.due > Date.now())
    );
    
    const data = createViewData(relevantTasks);

    const actions = {
      upsert: async (task: Task) => {
        const isNew = !tasks.find(t => t.id === task.id);
        if (isNew) {
          await addTask(task);
        } else {
          await updateTask(task.id, task);
        }
      },
      bulkUpsert: async (tasksToUpdate: Task[]) => {
        await Promise.all(tasksToUpdate.map(task => actions.upsert(task)));
      },
      remove: async (id: TaskId) => {
        await deleteTask(id);
      },
      focus: (id: TaskId) => {
        console.log('Focus task:', id);
      }
    };

    return { ctx, data, actions };
  }, [viewId, tasks, addTask, updateTask, deleteTask]);
}