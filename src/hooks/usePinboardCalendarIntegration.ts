/**
 * Pinboard-Calendar Integration
 * 
 * Handles moving tasks from pinboard to calendar when AI suggestions are accepted,
 * and provides smart suggestions for pinboard tasks.
 */

import { useCallback, useEffect } from 'react';
import { Task } from '@/types/task';
import { useTaskStore } from '@/stores/taskStore';
import { useToast } from '@/hooks/use-toast';
import { decisionTraceService } from '@/services/decisionTraceService';

export interface PinboardIntegration {
  moveTaskFromPinboardToCalendar: (taskId: string, scheduledTime: Date, durationMin?: number) => Promise<void>;
  findPinboardTaskForSuggestion: (suggestionTitle: string) => Task | null;
  markTaskAsScheduled: (taskId: string, source: 'ai-suggestion' | 'manual') => Promise<void>;
}

export function usePinboardCalendarIntegration(): PinboardIntegration {
  const { tasks, updateTask } = useTaskStore();
  const { toast } = useToast();

  const moveTaskFromPinboardToCalendar = useCallback(async (
    taskId: string, 
    scheduledTime: Date, 
    durationMin: number = 60
  ) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Check if task is on pinboard
    const isOnPinboard = task.view?.pinboard && 
      !task.view?.calendar?.startTime && 
      !task.completed;

    if (!isOnPinboard) {
      console.warn('Task is not on pinboard, skipping move');
      return;
    }

    // Update task to move from pinboard to calendar
    const updatedTask: Task = {
      ...task,
      view: {
        ...task.view,
        calendar: {
          startTime: scheduledTime.toISOString(),
          durationMin
        },
        pinboard: {
          ...task.view.pinboard,
          lastMoved: Date.now()
        }
      },
      updatedAt: Date.now()
    };

    await updateTask(taskId, updatedTask);

    // Add decision trace
    decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [
        {
          type: 'pinboard_to_calendar',
          value: task.title,
          confidence: 0.9,
          source: 'integration',
          privacyLayer: 'surface'
        }
      ],
      confidenceThreshold: 0.8,
      finalConfidence: 0.9,
      decision: 'auto-write',
      action: 'move_pinboard_to_calendar',
      becauseText: `Moved "${task.title}" from pinboard to calendar schedule`,
      metadata: { 
        taskId, 
        scheduledTime: scheduledTime.toISOString(),
        duration: durationMin 
      },
      undoable: true
    });

    toast({
      title: "Task Moved",
      description: `"${task.title}" moved from pinboard to calendar`,
    });
  }, [tasks, updateTask, toast]);

  const findPinboardTaskForSuggestion = useCallback((suggestionTitle: string): Task | null => {
    // Find tasks on pinboard that match the suggestion
    const pinboardTasks = tasks.filter(task => 
      task.view?.pinboard && 
      !task.view?.calendar?.startTime && 
      !task.completed
    );

    // Look for exact title match first
    let matchingTask = pinboardTasks.find(task => 
      task.title.toLowerCase() === suggestionTitle.toLowerCase()
    );

    // If no exact match, try partial match
    if (!matchingTask) {
      matchingTask = pinboardTasks.find(task =>
        task.title.toLowerCase().includes(suggestionTitle.toLowerCase()) ||
        suggestionTitle.toLowerCase().includes(task.title.toLowerCase())
      );
    }

    return matchingTask || null;
  }, [tasks]);

  const markTaskAsScheduled = useCallback(async (
    taskId: string, 
    source: 'ai-suggestion' | 'manual'
  ) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Update metadata to mark as scheduled
    const updatedTask: Task = {
      ...task,
      metadata: {
        ...task.metadata,
        schedulingSource: source,
        scheduledAt: Date.now()
      },
      updatedAt: Date.now()
    };

    await updateTask(taskId, updatedTask);
  }, [tasks, updateTask]);

  return {
    moveTaskFromPinboardToCalendar,
    findPinboardTaskForSuggestion,
    markTaskAsScheduled
  };
}

/**
 * Hook to automatically handle pinboard-calendar integration for AI suggestions
 */
export function useAutomaticPinboardIntegration() {
  const integration = usePinboardCalendarIntegration();
  
  useEffect(() => {
    // Listen for AI suggestion acceptance events
    const handleSuggestionAccepted = async (event: CustomEvent) => {
      const { suggestion, scheduledTask } = event.detail;
      
      // Try to find matching pinboard task
      const pinboardTask = integration.findPinboardTaskForSuggestion(suggestion.title);
      
      if (pinboardTask) {
        try {
          // Move existing pinboard task instead of creating new one
          await integration.moveTaskFromPinboardToCalendar(
            pinboardTask.id,
            suggestion.suggestedTime,
            suggestion.estimatedDuration
          );
          
          // Mark as AI-scheduled
          await integration.markTaskAsScheduled(pinboardTask.id, 'ai-suggestion');
        } catch (error) {
          console.error('Failed to move pinboard task to calendar:', error);
        }
      }
    };

    window.addEventListener('ai-suggestion-accepted', handleSuggestionAccepted as EventListener);
    
    return () => {
      window.removeEventListener('ai-suggestion-accepted', handleSuggestionAccepted as EventListener);
    };
  }, [integration]);

  return integration;
}