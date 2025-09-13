/**
 * P12 - Task-Aware Auto-Write Service
 * Integrates Task system with existing Auto-Write infrastructure
 */

import type { Task } from '@/types/task';
import { taskCalendarAdapter } from '@/services/taskCalendarAdapter';
import { autoWriteCalendarService } from '@/services/autoWriteCalendarService';
import { decisionTraceService } from '@/services/decisionTraceService';
import { isFeatureEnabled } from '@/config/flags';
import { logger } from '@/utils/logger';

export interface TaskCalendarMapping {
  taskId: string;
  eventId?: string;
  traceId: string;
  createdAt: number;
}

class TaskAwareAutoWriteService {
  private taskCalendarMappings = new Map<string, TaskCalendarMapping>();

  async processTaskForAutoWrite(task: Task): Promise<void> {
    if (!isFeatureEnabled('autoWriteCalendar')) return;
    
    const validation = taskCalendarAdapter.validateGreenConditions(task);
    if (!validation.isValid) return;

    const intent = taskCalendarAdapter.createCalendarIntent(task);
    if (!intent || intent.confidence < 0.85) return;

    try {
      const result = await autoWriteCalendarService.processCalendarIntent(intent);
      if (result.success) {
        this.taskCalendarMappings.set(task.id, {
          taskId: task.id,
          eventId: result.eventId,
          traceId: `trace-${Date.now()}`,
          createdAt: Date.now()
        });
      }
    } catch (error) {
      logger.error('Task auto-write failed', error);
    }
  }

  getAllMappings() { return this.taskCalendarMappings; }
}

export const taskAwareAutoWriteService = new TaskAwareAutoWriteService();