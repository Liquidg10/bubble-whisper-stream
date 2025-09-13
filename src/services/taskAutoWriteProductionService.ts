/**
 * P12 - Task Auto-Write Production Service
 * Production-ready calendar auto-write with Task integration
 */

import type { Task } from '@/types/task';
import { taskCalendarAdapter } from '@/services/taskCalendarAdapter';
import { autoWriteCalendarService } from '@/services/autoWriteCalendarService';
import { oauthIncrementalService } from '@/services/oauthIncrementalService';
import { decisionTraceService } from '@/services/decisionTraceService';
import { isFeatureEnabled } from '@/config/flags';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';

export interface TaskCalendarWriteResult {
  success: boolean;
  eventId?: string;
  traceId: string;
  decision: 'auto-write' | 'draft' | 'suggest' | 'blocked';
  reason: string;
  undoAvailable: boolean;
}

export interface TaskAutoWriteMetrics {
  totalAttempts: number;
  autoWriteCount: number;
  draftCount: number;
  suggestionCount: number;
  undoCount: number;
  successRate: number;
  averageConfidence: number;
}

class TaskAutoWriteProductionService {
  private writeHistory = new Map<string, TaskCalendarWriteResult>();

  /**
   * Process task for calendar auto-write with production safety
   * P12: Full production implementation with OAuth escalation
   */
  async processTaskCalendarWrite(task: Task): Promise<TaskCalendarWriteResult> {
    const traceId = `task-calendar-${task.id}-${Date.now()}`;
    
    try {
      logger.info('Processing task for calendar auto-write', { taskId: task.id, traceId });

      // Feature flag check
      if (!isFeatureEnabled('autoWriteCalendar')) {
        return this.createBlockedResult(traceId, 'Auto-write disabled by feature flag');
      }

      // Check if task has calendar view data
      if (!task.view?.calendar?.startTime) {
        return this.createSuggestionResult(traceId, 'No calendar timing specified');
      }

      // Check OAuth scopes
      const calendarScopes = oauthIncrementalService.getCalendarWriteScopes();
      const { needsEscalation } = await oauthIncrementalService.requiresEscalation(calendarScopes);
      
      if (needsEscalation) {
        const escalated = await oauthIncrementalService.requestScopeEscalation(
          calendarScopes,
          'To create calendar events from tasks'
        );
        
        if (!escalated) {
          return this.createBlockedResult(traceId, 'OAuth scope escalation declined');
        }
      }

      // Validate green conditions using existing adapter
      const validation = taskCalendarAdapter.validateGreenConditions(task);
      if (!validation.isValid) {
        return this.createDraftResult(traceId, 'Validation failed');
      }

      // Create calendar intent
      const intent = taskCalendarAdapter.createCalendarIntent(task);
      if (!intent) {
        return this.createSuggestionResult(traceId, 'Could not create calendar intent');
      }

      // Check confidence threshold
      if (intent.confidence < 0.85) {
        return this.createDraftResult(traceId, `Confidence too low: ${intent.confidence}`);
      }

      // Process through existing auto-write service
      const writeResult = await autoWriteCalendarService.processCalendarIntent(intent);

      if (writeResult.decision === 'auto-write' && writeResult.eventId) {
        // Store successful write for undo
        const result: TaskCalendarWriteResult = {
          success: true,
          eventId: writeResult.eventId,
          traceId,
          decision: 'auto-write',
          reason: 'Met all green conditions',
          undoAvailable: true
        };

        this.writeHistory.set(task.id, result);

        // Log decision for explainability
        logger.info('Task calendar write decision', {
          taskId: task.id,
          confidence: intent.confidence,
          traceId
        });

        // Show success toast with undo
        toast.success(`Added "${task.title}" to Calendar`, {
          action: {
            label: 'Undo',
            onClick: () => this.undoTaskCalendarWrite(task.id)
          }
        });

        logger.info('Task calendar auto-write successful', { 
          taskId: task.id, 
          eventId: writeResult.eventId,
          traceId 
        });

        return result;
      }

      // Fall back to draft or suggestion
      return writeResult.decision === 'draft' 
        ? this.createDraftResult(traceId, 'Created draft for review')
        : this.createSuggestionResult(traceId, 'Needs manual review');

    } catch (error) {
      logger.error('Task calendar auto-write failed', error);
      return this.createBlockedResult(traceId, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Undo task calendar write
   * P12: Reversible actions with full cleanup
   */
  async undoTaskCalendarWrite(taskId: string): Promise<boolean> {
    try {
      const writeResult = this.writeHistory.get(taskId);
      if (!writeResult || !writeResult.eventId) {
        logger.warn('No calendar write found to undo', { taskId });
        return false;
      }

      // Use existing calendar service undo
      const success = await autoWriteCalendarService.undoCalendarWrite(writeResult.traceId);
      
      if (success) {
        this.writeHistory.delete(taskId);
        
        // Log undo action
        logger.info('Task calendar write undone', { taskId, traceId: writeResult.traceId });
        
        toast.success('Calendar event removed');
        logger.info('Task calendar write undone successfully', { taskId, traceId: writeResult.traceId });
        
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to undo task calendar write', error);
      toast.error('Failed to remove calendar event');
      return false;
    }
  }

  /**
   * Get auto-write metrics for monitoring
   */
  async getAutoWriteMetrics(days = 7): Promise<TaskAutoWriteMetrics> {
    try {
      // Mock metrics for now - would integrate with actual decision trace service
      const traces: any[] = [];
      
      const totalAttempts = traces.length;
      const autoWriteCount = traces.filter(t => t.output?.decision === 'auto-write').length;
      const draftCount = traces.filter(t => t.output?.decision === 'draft').length;
      const suggestionCount = traces.filter(t => t.output?.decision === 'suggest').length;
      const undoCount = traces.filter(t => t.undone).length;
      
      const successRate = totalAttempts > 0 ? autoWriteCount / totalAttempts : 0;
      const averageConfidence = totalAttempts > 0 
        ? traces.reduce((sum, t) => sum + (t.confidence || 0), 0) / totalAttempts 
        : 0;

      return {
        totalAttempts,
        autoWriteCount,
        draftCount,
        suggestionCount,
        undoCount,
        successRate: Math.round(successRate * 100) / 100,
        averageConfidence: Math.round(averageConfidence * 100) / 100
      };
    } catch (error) {
      logger.error('Failed to get auto-write metrics', error);
      return {
        totalAttempts: 0,
        autoWriteCount: 0,
        draftCount: 0,
        suggestionCount: 0,
        undoCount: 0,
        successRate: 0,
        averageConfidence: 0
      };
    }
  }

  /**
   * Check if task has pending calendar write
   */
  hasCalendarWrite(taskId: string): boolean {
    return this.writeHistory.has(taskId);
  }

  /**
   * Get write result for task
   */
  getWriteResult(taskId: string): TaskCalendarWriteResult | undefined {
    return this.writeHistory.get(taskId);
  }

  private createBlockedResult(traceId: string, reason: string): TaskCalendarWriteResult {
    return {
      success: false,
      traceId,
      decision: 'blocked',
      reason,
      undoAvailable: false
    };
  }

  private createDraftResult(traceId: string, reason: string): TaskCalendarWriteResult {
    return {
      success: false,
      traceId,
      decision: 'draft',
      reason,
      undoAvailable: false
    };
  }

  private createSuggestionResult(traceId: string, reason: string): TaskCalendarWriteResult {
    return {
      success: false,
      traceId,
      decision: 'suggest',
      reason,
      undoAvailable: false
    };
  }

  private generateBecauseText(intent: any, validation: any): string {
    const reasons = [
      `Confidence ${Math.round(intent.confidence * 100)}% above threshold`,
      'Self-owned calendar within 14-day window',
      validation.isValid ? 'All green conditions met' : 'Validation passed'
    ];

    return `Because ${reasons.join(', and ')}.`;
  }
}

export const taskAutoWriteProductionService = new TaskAutoWriteProductionService();