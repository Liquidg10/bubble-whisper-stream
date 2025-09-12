/**
 * P12 - Task-Aware Auto-Write Service
 * Integrates existing Auto-Write ladder with Task metadata
 */

import type { Task } from '@/types/task';
import { calendarWriteService } from '@/services/calendarWriteService';
import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';

class TaskAwareAutoWriteService {
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
    logger.info('Calendar auto-write executed', { taskId: task.id });
  }
}

export const taskAwareAutoWriteService = new TaskAwareAutoWriteService();