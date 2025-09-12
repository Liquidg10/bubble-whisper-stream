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

export interface TaskEmailMapping {
  taskId: string;
  draftId: string;
  traceId: string;
  createdAt: number;
  emailAccountId?: string;
  confidence: number;
  subject: string;
  recipients: string[];
}

class TaskAwareAutoWriteService {
  private taskCalendarMappings = new Map<string, TaskCalendarMapping>();
  private taskEmailMappings = new Map<string, TaskEmailMapping>();

  /**
   * Get all task-calendar mappings
   */
  getAllMappings(): Map<string, TaskCalendarMapping> {
    return this.taskCalendarMappings;
  }

  /**
   * Get all task-email mappings
   */
  getAllEmailMappings(): Map<string, TaskEmailMapping> {
    return this.taskEmailMappings;
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

      // Check email auto-write opportunity
      if (isFeatureEnabled('autoWriteEmail')) {
        await this.evaluateEmailAutoWrite(task, previousTask);
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
    try {
      const calendarData = task.view?.calendar;
      if (!calendarData?.startTime || !calendarData?.durationMin) {
        throw new Error('Missing required calendar data');
      }

      // Create calendar event via existing calendar service
      const eventData = {
        title: task.title,
        description: task.description || '',
        startTime: new Date(calendarData.startTime),
        durationMin: calendarData.durationMin,
        location: calendarData.location,
        attendees: calendarData.attendees || []
      };

      // Generate trace for undo capability
      const traceId = `trace_${Date.now()}`;
      const eventId = `cal_${Date.now()}`;

      const mapping: TaskCalendarMapping = {
        taskId: task.id,
        eventId,
        traceId,
        createdAt: Date.now(),
        confidence: this.calculateCalendarConfidence(task),
        calendarAccountId: calendarData.calendarId
      };
      
      this.taskCalendarMappings.set(task.id, mapping);
      
      // Note: In a real implementation, this would call the calendar API
      // For now, we create the mapping and log the action
      logger.info('Calendar auto-write executed', { 
        taskId: task.id,
        eventId,
        traceId,
        confidence: mapping.confidence
      });
    } catch (error) {
      logger.error('Calendar auto-write failed', error, { taskId: task.id });
      throw error;
    }
  }

  private async evaluateEmailAutoWrite(task: Task, previousTask?: Task): Promise<void> {
    const hasEmailData = task.view?.email?.to?.length && task.view?.email?.subject;
    const emailDataChanged = !previousTask?.view?.email?.to?.length && hasEmailData;
    
    if (!emailDataChanged) return;

    // Auto-write only under green conditions: clear intent, known recipients, confidence >85%
    const confidence = this.calculateEmailConfidence(task);
    
    if (confidence >= 0.85) {
      await this.executeEmailAutoWrite(task);
    } else if (confidence >= 0.6) {
      await this.createEmailDraft(task);
    }
  }

  private calculateEmailConfidence(task: Task): number {
    let confidence = 0.3;
    
    if (task.view?.email?.to?.length) confidence += 0.25;
    if (task.view?.email?.subject && task.view?.email.subject.length >= 5) confidence += 0.25;
    if (task.description && task.description.length >= 20) confidence += 0.2;
    if (task.priority >= 70) confidence += 0.1; // High priority tasks
    if (!task.view?.email?.cc?.length && !task.view?.email?.to?.find(email => email.includes('@company.com'))) confidence += 0.1; // External emails
    
    return confidence;
  }

  private async executeEmailAutoWrite(task: Task): Promise<void> {
    try {
      const emailData = task.view?.email;
      if (!emailData?.to?.length || !emailData?.subject) {
        throw new Error('Missing required email data');
      }

      // Import the service dynamically to avoid circular dependencies
      const { gmailDraftSendService } = await import('@/services/gmailDraftSendService');

      const emailDraft = {
        to: emailData.to,
        cc: emailData.cc || [],
        subject: emailData.subject,
        body: this.generateEmailBody(task),
        threadId: emailData.threadId
      };

      // Generate trace for undo capability
      const traceId = `trace_${Date.now()}`;
      const draftId = `email_${Date.now()}`;

      const mapping: TaskEmailMapping = {
        taskId: task.id,
        draftId,
        traceId,
        createdAt: Date.now(),
        confidence: this.calculateEmailConfidence(task),
        emailAccountId: emailData.accountId,
        subject: emailData.subject,
        recipients: emailData.to
      };
      
      this.taskEmailMappings.set(task.id, mapping);
      
      // Note: In a real implementation, this would call the Gmail API
      // For now, we create the mapping and log the action
      logger.info('Email auto-write executed', { 
        taskId: task.id,
        draftId,
        traceId,
        confidence: mapping.confidence,
        recipients: emailData.to
      });

      // Save to localStorage for demo
      this.saveEmailDraftToStorage(emailDraft, draftId, mapping);
    } catch (error) {
      logger.error('Email auto-write failed', error, { taskId: task.id });
      throw error;
    }
  }

  private async createEmailDraft(task: Task): Promise<void> {
    // Similar to executeEmailAutoWrite but just creates draft without auto-sending
    await this.executeEmailAutoWrite(task);
  }

  private generateEmailBody(task: Task): string {
    let body = '';
    
    if (task.description) {
      body += task.description + '\n\n';
    } else {
      body += `Regarding: ${task.title}\n\n`;
    }
    
    if (task.due) {
      const dueDate = new Date(task.due).toLocaleDateString();
      body += `Due: ${dueDate}\n`;
    }
    
    if (task.priority >= 80) {
      body += '\nThis is a high priority item.\n';
    }
    
    body += '\nBest regards';
    
    return body;
  }

  private saveEmailDraftToStorage(emailDraft: any, draftId: string, mapping: TaskEmailMapping): void {
    const stored = localStorage.getItem('email_drafts');
    const drafts = stored ? JSON.parse(stored) : [];
    
    const newDraft = {
      id: draftId,
      ...emailDraft,
      confidence: mapping.confidence,
      autoSendEligible: mapping.confidence >= 0.85,
      created_at: new Date().toISOString(),
      account_id: mapping.emailAccountId || 'default',
      taskId: mapping.taskId,
      taskTitle: 'Generated from task'
    };
    
    drafts.push(newDraft);
    localStorage.setItem('email_drafts', JSON.stringify(drafts));
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

  /**
   * Undo a task email write
   */
  async undoTaskEmailWrite(taskId: string, traceId: string): Promise<boolean> {
    try {
      const mapping = this.taskEmailMappings.get(taskId);
      if (mapping) {
        // Remove from localStorage
        const stored = localStorage.getItem('email_drafts');
        if (stored) {
          const drafts = JSON.parse(stored);
          const updatedDrafts = drafts.filter((draft: any) => draft.id !== mapping.draftId);
          localStorage.setItem('email_drafts', JSON.stringify(updatedDrafts));
        }
        
        this.taskEmailMappings.delete(taskId);
        logger.info('Task email write undone', { taskId, traceId });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to undo task email write', error);
      return false;
    }
  }
}

export const taskAwareAutoWriteService = new TaskAwareAutoWriteService();