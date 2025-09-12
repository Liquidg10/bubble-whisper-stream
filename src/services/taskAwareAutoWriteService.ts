/**
 * Task-Aware Auto-Write Service
 * 
 * Orchestrates auto-write functionality triggered by task changes,
 * integrating with existing auto-write infrastructure and safety gates.
 */

import type { Task } from '@/types/task';
import { taskCalendarAdapter, type TaskCalendarMapping } from './taskCalendarAdapter';
import { autoWriteCalendarService, type CalendarWriteResult } from './autoWriteCalendarService';
import { thresholdLadderService } from './thresholdLadderService';
import { contextEngineService } from './contextEngineService';
import { decisionTraceService } from './decisionTraceService';
import { isFeatureEnabled } from '@/config/flags';
import { logger } from '@/utils/logger';

export interface TaskAutoWriteResult {
  decision: 'auto-write' | 'draft' | 'suggest' | 'skip';
  calendarResult?: CalendarWriteResult;
  taskId: string;
  traceId: string;
  becauseText: string;
  confidence: number;
  mapping?: TaskCalendarMapping;
}

// Re-export TaskCalendarMapping for components
export type { TaskCalendarMapping } from './taskCalendarAdapter';

class TaskAwareAutoWriteService {
  private taskCalendarMappings = new Map<string, TaskCalendarMapping>();

  /**
   * Evaluate task for auto-write opportunities
   */
  async evaluateTask(task: Task, previousTask?: Task): Promise<TaskAutoWriteResult | null> {
    // Check if auto-write is enabled
    if (!isFeatureEnabled('autoWriteCalendar')) {
      logger.debug('Auto-write calendar disabled', { taskId: task.id });
      return null;
    }

    // Check if task should trigger auto-write
    if (!taskCalendarAdapter.shouldTriggerAutoWrite(task)) {
      return null;
    }

    // Detect if this is a calendar change vs new calendar data
    const isCalendarChange = this.detectCalendarChange(task, previousTask);
    
    // Skip if this task already has a mapping and no change detected
    if (this.taskCalendarMappings.has(task.id) && !isCalendarChange) {
      return null;
    }

    logger.debug('Evaluating task for auto-write', { 
      taskId: task.id, 
      hasStartTime: Boolean(task.view?.calendar?.startTime),
      isCalendarChange 
    });

    try {
      // Validate green conditions
      const greenConditions = taskCalendarAdapter.validateGreenConditions(task);
      
      // Create calendar intent
      const calendarIntent = taskCalendarAdapter.createCalendarIntent(task);
      if (!calendarIntent) {
        logger.warn('Failed to create calendar intent from task', { taskId: task.id });
        return null;
      }

      // Generate context score for the intent
      const contextScore = await contextEngineService.generateScore({
        content: calendarIntent.originalContent,
        eventType: 'calendar',
        deadline: calendarIntent.startTime,
        location: calendarIntent.location,
        currentTime: new Date()
      });

      // Apply threshold ladder with task-specific policy context
      const thresholdResult = thresholdLadderService.applyThresholds(contextScore, {
        userAutoWriteEnabled: true, // We already checked feature flags
        feature: 'task-calendar',
        ...this.generatePolicyContext(task, greenConditions)
      });

      // Create decision trace for task evaluation
      const traceId = decisionTraceService.addTrace({
        feature: 'task-calendar',
        signals: [
          ...contextScore.signals.map(s => ({
            type: s.type,
            value: s.value,
            confidence: s.confidence,
            source: 'context_engine'
          })),
          {
            type: 'green_conditions',
            value: greenConditions.isValid ? 'valid' : 'invalid',
            confidence: greenConditions.confidence,
            source: 'task_adapter'
          },
          {
            type: 'task_confidence',
            value: calendarIntent.confidence.toString(),
            confidence: calendarIntent.confidence,
            source: 'task_adapter'
          }
        ],
        confidenceThreshold: 0.85,
        finalConfidence: thresholdResult.confidence,
        decision: thresholdResult.decision,
        action: `Process task calendar: ${task.title}`,
        becauseText: `Task evaluation: ${thresholdResult.reason}`,
        metadata: {
          taskId: task.id,
          task: {
            title: task.title,
            startTime: task.view?.calendar?.startTime,
            hasAttendees: Boolean(task.view?.calendar?.attendees?.length)
          },
          greenConditions,
          calendarIntent,
          isCalendarChange
        },
        undoable: true
      });

      // Execute the decision if conditions are met
      if (thresholdResult.decision !== 'suggest' && greenConditions.isValid) {
        // Process through existing calendar auto-write service
        const calendarResult = await autoWriteCalendarService.processCalendarIntent(calendarIntent);
        
        // Create task-calendar mapping
        const mapping: TaskCalendarMapping = {
          taskId: task.id,
          eventId: calendarResult.eventId,
          draftId: calendarResult.draftId,
          traceId,
          createdAt: Date.now()
        };

        this.taskCalendarMappings.set(task.id, mapping);

        return {
          decision: calendarResult.decision,
          calendarResult,
          taskId: task.id,
          traceId,
          becauseText: `${thresholdResult.reason}; ${calendarResult.becauseText}`,
          confidence: thresholdResult.confidence,
          mapping
        };
      }

      return {
        decision: 'skip',
        taskId: task.id,
        traceId,
        becauseText: greenConditions.isValid 
          ? thresholdResult.reason 
          : `Green conditions failed: ${greenConditions.violations.join(', ')}`,
        confidence: thresholdResult.confidence
      };

    } catch (error) {
      logger.error('Failed to evaluate task for auto-write', error, { taskId: task.id });
      
      // Create failure trace
      const traceId = decisionTraceService.addTrace({
        feature: 'task-calendar',
        signals: [{
          type: 'evaluation_error',
          value: error instanceof Error ? error.message : 'Unknown error',
          confidence: 1.0,
          source: 'task_service'
        }],
        confidenceThreshold: 0.85,
        finalConfidence: 0,
        decision: 'skip',
        action: `Failed to evaluate task: ${task.title}`,
        becauseText: `Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { taskId: task.id, error: error instanceof Error ? error.message : 'Unknown error' },
        undoable: false
      });

      return {
        decision: 'skip',
        taskId: task.id,
        traceId,
        becauseText: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0
      };
    }
  }

  /**
   * Undo task calendar auto-write with task metadata cleanup
   */
  async undoTaskCalendarWrite(taskId: string, traceId: string): Promise<boolean> {
    const mapping = this.taskCalendarMappings.get(taskId);
    if (!mapping) {
      logger.warn('No task-calendar mapping found for undo', { taskId, traceId });
      return false;
    }

    try {
      // Undo the calendar write using existing service
      const success = await autoWriteCalendarService.undoCalendarWrite(mapping.traceId);
      
      if (success) {
        // Clear task calendar metadata through task store
        // This would typically be done through a task store method
        // For now, we'll emit an event that the task store can listen to
        const undoEvent = new CustomEvent('task-calendar-undo', {
          detail: { taskId, mapping }
        });
        window.dispatchEvent(undoEvent);

        // Remove mapping
        this.taskCalendarMappings.delete(taskId);

        logger.debug('Successfully undid task calendar write', { taskId, traceId });
      }

      return success;
    } catch (error) {
      logger.error('Failed to undo task calendar write', error, { taskId, traceId });
      return false;
    }
  }

  /**
   * Get task-calendar mapping for a task
   */
  getTaskMapping(taskId: string): TaskCalendarMapping | undefined {
    return this.taskCalendarMappings.get(taskId);
  }

  /**
   * Get all task-calendar mappings
   */
  getAllMappings(): Map<string, TaskCalendarMapping> {
    return new Map(this.taskCalendarMappings);
  }

  /**
   * Detect if task calendar properties changed
   */
  private detectCalendarChange(currentTask: Task, previousTask?: Task): boolean {
    if (!previousTask) return true; // New task with calendar data

    const current = currentTask.view?.calendar;
    const previous = previousTask.view?.calendar;

    // If neither had calendar data, no change
    if (!current && !previous) return false;
    
    // If only one has calendar data, it's a change
    if (!current || !previous) return true;

    // Compare calendar properties
    return (
      current.startTime !== previous.startTime ||
      current.durationMin !== previous.durationMin ||
      current.location !== previous.location ||
      JSON.stringify(current.attendees) !== JSON.stringify(previous.attendees)
    );
  }

  /**
   * Generate policy context for threshold evaluation
   */
  private generatePolicyContext(task: Task, greenConditions: any) {
    const calendar = task.view?.calendar;
    
    return {
      isFirstTimeRecipient: Boolean(calendar?.attendees?.length), // Has attendees = potential new recipients
      userAutoWriteEnabled: true, // Already checked via feature flags
      feature: 'task-calendar',
      taskPriority: task.priority,
      taskAge: Date.now() - task.createdAt,
      hasAttendees: Boolean(calendar?.attendees?.length),
      greenConditionsValid: greenConditions.isValid,
      greenConditionsConfidence: greenConditions.confidence
    };
  }
}

export const taskAwareAutoWriteService = new TaskAwareAutoWriteService();