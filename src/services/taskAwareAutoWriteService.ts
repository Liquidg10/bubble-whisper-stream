/**
 * P12 - Task-Aware Auto-Write Service
 * Integrates Task system with existing Auto-Write infrastructure
 */

import type { Task } from '@/types/task';
import { taskCalendarAdapter } from '@/services/taskCalendarAdapter';
import { autoWriteCalendarService, type CalendarWriteResult } from '@/services/autoWriteCalendarService';
import { decisionTraceService } from '@/services/decisionTraceService';
import { isFeatureEnabled } from '@/config/flags';
import { logger } from '@/utils/logger';

export interface TaskCalendarMapping {
  taskId: string;
  eventId?: string;
  traceId: string;
  createdAt: number;
}

export interface TaskEmailMapping {
  taskId: string;
  draftId?: string;
  traceId: string;
  subject: string;
  recipients: string[];
  confidence: number;
  createdAt: number;
}

class TaskAwareAutoWriteService {
  private taskCalendarMappings = new Map<string, TaskCalendarMapping>();
  private taskEmailMappings = new Map<string, TaskEmailMapping>();

  async processTaskForAutoWrite(task: Task): Promise<void> {
    if (!isFeatureEnabled('autoWriteCalendar')) return;
    
    const validation = taskCalendarAdapter.validateGreenConditions(task);
    if (!validation.isValid) return;

    const intent = taskCalendarAdapter.createCalendarIntent(task);
    if (!intent || intent.confidence < 0.85) return;

    try {
      const result: CalendarWriteResult = await autoWriteCalendarService.processCalendarIntent(intent);
      if (result.decision === 'auto-write' && result.eventId) {
        this.taskCalendarMappings.set(task.id, {
          taskId: task.id,
          eventId: result.eventId,
          traceId: result.traceId,
          createdAt: Date.now()
        });
      }
    } catch (error) {
      logger.error('Task auto-write failed', error);
    }
  }

  // Required by components
  evaluateTask(task: Task): Promise<void> {
    return this.processTaskForAutoWrite(task);
  }

  async undoTaskCalendarWrite(taskId: string, traceId?: string): Promise<boolean> {
    const mapping = this.taskCalendarMappings.get(taskId);
    if (!mapping) return false;

    try {
      // Use existing calendar service undo
      const success = await autoWriteCalendarService.undoCalendarWrite(mapping.traceId);
      if (success) {
        this.taskCalendarMappings.delete(taskId);
      }
      return success;
    } catch (error) {
      logger.error('Failed to undo task calendar write', error);
      return false;
    }
  }

  async undoTaskEmailWrite(taskId: string, traceId?: string): Promise<boolean> {
    const mapping = this.taskEmailMappings.get(taskId);
    if (!mapping) return false;
    
    // For now, just remove mapping (email undo would need email service integration)
    this.taskEmailMappings.delete(taskId);
    return true;
  }

  getAllMappings() { return this.taskCalendarMappings; }
  getAllEmailMappings() { return this.taskEmailMappings; }
}

export const taskAwareAutoWriteService = new TaskAwareAutoWriteService();