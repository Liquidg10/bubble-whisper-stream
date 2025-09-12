/**
 * Task Calendar Adapter - Converts tasks to calendar intents for auto-write
 * 
 * This service bridges the task system with the auto-write calendar infrastructure,
 * applying green conditions validation and generating proper calendar intents.
 */

import type { Task } from '@/types/task';
import type { CalendarIntent } from './autoWriteCalendarService';
import { idempotencyService } from './idempotencyService';
import { logger } from '@/utils/logger';

export interface TaskCalendarMapping {
  taskId: string;
  eventId?: string;
  draftId?: string;
  traceId: string;
  createdAt: number;
}

export interface GreenConditionsValidation {
  isValid: boolean;
  violations: string[];
  confidence: number;
}

class TaskCalendarAdapter {
  /**
   * Check if task should trigger auto-write evaluation
   */
  shouldTriggerAutoWrite(task: Task): boolean {
    return Boolean(
      task.view?.calendar?.startTime &&
      !task.completed &&
      this.isValidDateTime(task.view.calendar.startTime)
    );
  }

  /**
   * Validate green conditions for task calendar auto-write
   */
  validateGreenConditions(task: Task): GreenConditionsValidation {
    const violations: string[] = [];
    let confidence = 1.0;

    if (!task.view?.calendar?.startTime) {
      violations.push('No start time specified');
      return { isValid: false, violations, confidence: 0 };
    }

    const startTime = new Date(task.view.calendar.startTime);
    const now = new Date();
    const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Check if event is in future
    if (startTime <= now) {
      violations.push('Event time is in the past');
      confidence -= 0.3;
    }

    // Check if within 14 days
    if (startTime > fourteenDaysOut) {
      violations.push('Event is more than 14 days away');
      confidence -= 0.2;
    }

    // Check for external attendees (red flag for auto-write)
    const attendees = task.view.calendar.attendees || [];
    if (attendees.length > 0) {
      violations.push('External attendees detected');
      confidence -= 0.4;
    }

    // Check for conflicting calendar metadata
    if (task.view.calendar.calendarId && !task.view.calendar.calendarId.includes('primary')) {
      violations.push('Not targeting primary calendar');
      confidence -= 0.1;
    }

    const isValid = violations.length === 0 && confidence >= 0.7;
    return { isValid, violations, confidence: Math.max(0, confidence) };
  }

  /**
   * Convert task to calendar intent
   */
  createCalendarIntent(task: Task): CalendarIntent | null {
    if (!task.view?.calendar?.startTime) {
      logger.warn('Cannot create calendar intent: no start time', { taskId: task.id });
      return null;
    }

    try {
      const startTime = new Date(task.view.calendar.startTime);
      const endTime = task.view.calendar.durationMin 
        ? new Date(startTime.getTime() + task.view.calendar.durationMin * 60 * 1000)
        : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

      // Calculate confidence based on task properties
      const confidence = this.calculateTaskConfidence(task);

      return {
        title: task.title,
        description: task.description || this.generateDescriptionFromTask(task),
        location: task.view.calendar.location,
        startTime,
        endTime,
        attendees: task.view.calendar.attendees || [],
        confidence,
        source: 'voice' as const, // Use supported source type
        originalContent: `Task: ${task.title}${task.description ? `\n${task.description}` : ''}`
      };
    } catch (error) {
      logger.error('Failed to create calendar intent from task', error, { taskId: task.id });
      return null;
    }
  }

  /**
   * Generate idempotency key for task calendar event
   */
  generateIdempotencyKey(task: Task): string {
    if (!task.view?.calendar?.startTime) {
      throw new Error('Cannot generate idempotency key: no start time');
    }

    return idempotencyService.generateCalendarEventKey({
      title: task.title,
      startTime: task.view.calendar.startTime,
      calendarId: task.view.calendar.calendarId || 'primary',
      userId: task.metadata?.userId
    });
  }

  /**
   * Calculate confidence score for task-based calendar event
   */
  private calculateTaskConfidence(task: Task): number {
    let confidence = 0.6; // Base confidence for task-derived events

    // Boost confidence for explicit time formats
    if (this.hasExplicitTime(task.view?.calendar?.startTime)) {
      confidence += 0.2;
    }

    // Boost for specified duration
    if (task.view?.calendar?.durationMin) {
      confidence += 0.1;
    }

    // Boost for location
    if (task.view?.calendar?.location) {
      confidence += 0.1;
    }

    // Boost for high priority tasks
    if (task.priority >= 80) {
      confidence += 0.1;
    }

    // Reduce for very recent creation (might be accidental)
    const ageHours = (Date.now() - task.createdAt) / (1000 * 60 * 60);
    if (ageHours < 0.1) { // Less than 6 minutes
      confidence -= 0.2;
    }

    // Reduce for tasks with many tags (might be complex)
    if (task.tags.length > 3) {
      confidence -= 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Check if datetime string represents explicit time vs vague time
   */
  private hasExplicitTime(startTime?: string): boolean {
    if (!startTime) return false;
    
    const timeStr = startTime.toLowerCase();
    
    // Check for explicit time patterns
    const explicitPatterns = [
      /\d{1,2}:\d{2}/, // HH:MM format
      /\d{1,2}\s*(am|pm)/, // 3pm, 3 pm format
      /\d{1,2}(am|pm)/ // 3pm format
    ];

    // Check for vague time patterns
    const vaguePatterns = [
      /morning|afternoon|evening|night/i,
      /early|late|around|about/i,
      /sometime/i
    ];

    const hasExplicit = explicitPatterns.some(pattern => pattern.test(timeStr));
    const hasVague = vaguePatterns.some(pattern => pattern.test(timeStr));

    return hasExplicit && !hasVague;
  }

  /**
   * Validate if datetime string is valid
   */
  private isValidDateTime(startTime: string): boolean {
    try {
      const date = new Date(startTime);
      return !isNaN(date.getTime()) && date.getTime() > Date.now() - 86400000; // Not more than 1 day old
    } catch {
      return false;
    }
  }

  /**
   * Generate description from task properties
   */
  private generateDescriptionFromTask(task: Task): string {
    const parts: string[] = [];

    if (task.tags.length > 0) {
      parts.push(`Tags: ${task.tags.map(t => t.name).join(', ')}`);
    }

    if (task.priority > 75) {
      parts.push('High Priority');
    }

    parts.push(`Created from task on ${new Date(task.createdAt).toLocaleDateString()}`);

    return parts.join('\n');
  }
}

export const taskCalendarAdapter = new TaskCalendarAdapter();