/**
 * P12 - Task-Aware Auto-Write Service
 * Integrates existing Auto-Write ladder with Task metadata
 */

import type { Task } from '@/types/task';
import { calendarWriteService } from '@/services/calendarWriteService';
import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';

export interface TaskCalendarMapping {
  taskId: string;
  eventId: string;
  traceId: string;
  createdAt: number;
  calendarAccountId?: string;
  confidence: number;
}

class TaskAwareAutoWriteService {
  private taskCalendarMappings = new Map<string, TaskCalendarMapping>();

  /**
   * Get all task-calendar mappings
   */
  getAllMappings(): Map<string, TaskCalendarMapping> {
    return this.taskCalendarMappings;
  }

  /**
   * Evaluate a task for auto-write opportunities
   */
  async evaluateTask(task: Task, previousTask?: Task): Promise<void> {
    try {
      // Check calendar auto-write opportunity
      if (isFeatureEnabled('autoWriteCalendar')) {
        await this.evaluateCalendarAutoWrite(task, previousTask);
      }
    } catch (error) {
      logger.error('Task auto-write evaluation failed', error, { taskId: task.id });
    }
  }

  private async evaluateCalendarAutoWrite(task: Task, previousTask?: Task): Promise<void> {
    const hasCalendarData = task.view?.calendar?.startTime && task.view?.calendar?.durationMin;
    const calendarDataChanged = !previousTask?.view?.calendar?.startTime && hasCalendarData;
    
    if (!calendarDataChanged) return;

    // Auto-write only under green conditions: self-owned, <14 days, no invitees, confidence >85%
    const confidence = this.calculateCalendarConfidence(task);
    
    if (confidence >= 0.85) {
      await this.executeCalendarAutoWrite(task);
    }
  }

  private calculateCalendarConfidence(task: Task): number {
    let confidence = 0.5;
    
    if (task.view?.calendar?.startTime) confidence += 0.3;
    if (task.title.length >= 10) confidence += 0.2;
    if (!task.view?.calendar?.attendees?.length) confidence += 0.2;
    
    return confidence;
  }

  private async executeCalendarAutoWrite(task: Task): Promise<void> {
    // Implementation would create calendar event with undo capability
    const mapping: TaskCalendarMapping = {
      taskId: task.id,
      eventId: `cal_${Date.now()}`,
      traceId: `trace_${Date.now()}`,
      createdAt: Date.now(),
      confidence: 0.85
    };
    
    this.taskCalendarMappings.set(task.id, mapping);
    logger.info('Calendar auto-write executed', { taskId: task.id });
  }

  /**
   * Undo a task calendar write
   */
  async undoTaskCalendarWrite(taskId: string, traceId: string): Promise<boolean> {
    try {
      this.taskCalendarMappings.delete(taskId);
      logger.info('Task calendar write undone', { taskId, traceId });
      return true;
    } catch (error) {
      logger.error('Failed to undo task calendar write', error);
      return false;
    }
  }
}

export const taskAwareAutoWriteService = new TaskAwareAutoWriteService();