/**
 * Email→Task Auto-Creation Service
 * Converts high-confidence email intents directly to Task entities
 */

import type { Task, TaskType } from '@/types/task';
import type { EmailMetadata, IntentClassification } from './gmailIntentClassifier';
import { useTaskStore } from '@/stores/taskStore';
import { createTask } from '@/types/task';
import { decisionTraceService } from './decisionTraceService';
import { logger } from '@/utils/logger';

export interface EmailTaskCreationResult {
  success: boolean;
  taskId?: string;
  traceId?: string;
  confidence: number;
  reason: string;
}

export interface EmailTaskCreationOptions {
  minConfidence?: number;
  autoCreate?: boolean;
  preserveEmailMetadata?: boolean;
}

class EmailTaskCreationService {
  private readonly DEFAULT_MIN_CONFIDENCE = 0.75;
  private createdTaskIds = new Map<string, string>(); // emailId -> taskId

  /**
   * Evaluates an email and creates a task if confidence is high enough
   */
  async createTaskFromEmail(
    emailMetadata: EmailMetadata,
    classification: IntentClassification,
    options: EmailTaskCreationOptions = {}
  ): Promise<EmailTaskCreationResult> {
    const minConfidence = options.minConfidence || this.DEFAULT_MIN_CONFIDENCE;
    
    // Check if we already created a task for this email
    if (this.createdTaskIds.has(emailMetadata.id)) {
      return {
        success: false,
        confidence: classification.confidence,
        reason: 'Task already exists for this email'
      };
    }

    // Confidence gate
    if (classification.confidence < minConfidence) {
      return {
        success: false,
        confidence: classification.confidence,
        reason: `Confidence ${classification.confidence} below threshold ${minConfidence}`
      };
    }

    try {
      const task = this.buildTaskFromEmail(emailMetadata, classification, options);
      
      // Create decision trace
      const traceId = decisionTraceService.addTrace({
        feature: 'email',
        signals: [
          {
            type: 'email_intent',
            value: classification.intent,
            confidence: classification.confidence,
            source: 'gmail_classifier'
          },
          {
            type: 'email_subject',
            value: emailMetadata.subject,
            confidence: 0.9,
            source: 'email_metadata'
          }
        ],
        confidenceThreshold: minConfidence,
        finalConfidence: classification.confidence,
        decision: options.autoCreate ? 'auto-write' : 'suggest',
        action: 'create_task_from_email',
        becauseText: `Created task because: ${classification.reasoning}`,
        undoable: true,
        metadata: {
          emailId: emailMetadata.id,
          subject: emailMetadata.subject,
          sender: emailMetadata.senderEmail,
          intent: classification.intent
        }
      });

      if (options.autoCreate) {
        // Auto-create the task
        const taskStore = useTaskStore.getState();
        const taskWithId = { ...task, id: crypto.randomUUID() };
        await taskStore.addTask(taskWithId);
        
        this.createdTaskIds.set(emailMetadata.id, taskWithId.id);
        
        logger.info('Auto-created task from email', {
          emailId: emailMetadata.id,
          taskId: taskWithId.id,
          confidence: classification.confidence
        });

        return {
          success: true,
          taskId: taskWithId.id,
          traceId,
          confidence: classification.confidence,
          reason: 'Task auto-created successfully'
        };
      } else {
        // Just return the suggestion
        return {
          success: true,
          confidence: classification.confidence,
          reason: 'Task suggestion ready for user approval',
          traceId
        };
      }
    } catch (error) {
      logger.error('Failed to create task from email', error, {
        emailId: emailMetadata.id,
        intent: classification.intent
      });

      return {
        success: false,
        confidence: classification.confidence,
        reason: `Creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Creates a task suggestion that can be presented to the user
   */
  createTaskSuggestion(
    emailMetadata: EmailMetadata,
    classification: IntentClassification
  ): Omit<Task, 'id'> {
    return this.buildTaskFromEmail(emailMetadata, classification, { preserveEmailMetadata: true });
  }

  /**
   * Undoes a task creation from email
   */
  async undoTaskCreation(emailId: string, taskId?: string): Promise<boolean> {
    try {
      const actualTaskId = taskId || this.createdTaskIds.get(emailId);
      if (!actualTaskId) return false;

      const taskStore = useTaskStore.getState();
      await taskStore.deleteTask(actualTaskId);
      
      this.createdTaskIds.delete(emailId);
      
      logger.info('Undid task creation from email', { emailId, taskId: actualTaskId });
      return true;
    } catch (error) {
      logger.error('Failed to undo task creation', error, { emailId, taskId });
      return false;
    }
  }

  /**
   * Gets the task ID associated with an email (if any)
   */
  getTaskIdForEmail(emailId: string): string | undefined {
    return this.createdTaskIds.get(emailId);
  }

  /**
   * Checks if a task was created from a specific email
   */
  wasTaskCreatedFromEmail(emailId: string): boolean {
    return this.createdTaskIds.has(emailId);
  }

  private buildTaskFromEmail(
    emailMetadata: EmailMetadata,
    classification: IntentClassification,
    options: EmailTaskCreationOptions
  ): Omit<Task, 'id'> {
    // Determine task type from intent
    const taskType = this.mapIntentToTaskType(classification.intent);
    
    // Generate title from email subject
    const title = this.generateTaskTitle(emailMetadata, classification);
    
    // Build description with email context
    const description = this.generateTaskDescription(emailMetadata, classification);
    
    // Calculate priority from urgency and confidence
    const priority = this.calculateTaskPriority(emailMetadata, classification);
    
    // Set due date based on horizon
    const due = this.calculateDueDate(classification.horizon);
    
    // Build tags
    const tags = classification.tags.map((tagName, index) => ({
      id: `email-tag-${index}`,
      name: tagName,
      colorHex: this.getTagColor(tagName)
    }));

    const taskData = createTask(title, taskType, {
      description,
      priority,
      due,
      tags,
      view: {
        // Add email metadata if requested
        ...(options.preserveEmailMetadata && {
          email: {
            to: [emailMetadata.senderEmail],
            subject: `Re: ${emailMetadata.subject}`,
            threadId: emailMetadata.threadId
          }
        })
      },
      metadata: {
        email: {
          sourceEmailId: emailMetadata.id,
          subject: emailMetadata.subject,
          sender: emailMetadata.senderEmail,
          receivedAt: emailMetadata.receivedAt.getTime(),
          classification: classification,
          autoCreated: true
        }
      }
    });

    return taskData;
  }

  private mapIntentToTaskType(intent: string): TaskType {
    switch (intent) {
      case 'meeting_invite':
        return 'event';
      case 'bill':
        return 'reminder';
      case 'confirmation':
        return 'memory';
      case 'thought':
        return 'thought';
      case 'task':
      default:
        return 'task';
    }
  }

  private generateTaskTitle(emailMetadata: EmailMetadata, classification: IntentClassification): string {
    const subject = emailMetadata.subject;
    const intent = classification.intent;
    
    // Clean up common email prefixes
    let cleanTitle = subject
      .replace(/^(Re:|Fwd?:|FW:)\s*/i, '')
      .trim();
    
    // Add context based on intent
    switch (intent) {
      case 'meeting_invite':
        return cleanTitle.includes('meeting') ? cleanTitle : `Meeting: ${cleanTitle}`;
      case 'bill':
        return cleanTitle.includes('pay') ? cleanTitle : `Pay: ${cleanTitle}`;
      case 'task':
        return cleanTitle.includes('action') ? cleanTitle : cleanTitle;
      default:
        return cleanTitle;
    }
  }

  private generateTaskDescription(emailMetadata: EmailMetadata, classification: IntentClassification): string {
    const parts = [
      `From: ${emailMetadata.sender} <${emailMetadata.senderEmail}>`,
      `Received: ${emailMetadata.receivedAt.toLocaleDateString()}`,
      ''
    ];

    if (emailMetadata.snippet) {
      parts.push('Email preview:');
      parts.push(emailMetadata.snippet);
      parts.push('');
    }

    parts.push(`AI Classification: ${classification.intent} (${Math.round(classification.confidence * 100)}% confidence)`);
    parts.push(`Reason: ${classification.reasoning}`);

    return parts.join('\n');
  }

  private calculateTaskPriority(emailMetadata: EmailMetadata, classification: IntentClassification): number {
    let priority = 50; // Base priority
    
    // Boost priority based on intent
    switch (classification.intent) {
      case 'bill':
        priority += 20;
        break;
      case 'meeting_invite':
        priority += 15;
        break;
      case 'task':
        priority += 10;
        break;
    }
    
    // Boost based on confidence
    priority += (classification.confidence - 0.5) * 30;
    
    // Check for urgency keywords in subject
    const urgentKeywords = ['urgent', 'asap', 'immediate', 'deadline'];
    if (urgentKeywords.some(keyword => 
      emailMetadata.subject.toLowerCase().includes(keyword))) {
      priority += 25;
    }
    
    return Math.min(100, Math.max(0, Math.round(priority)));
  }

  private calculateDueDate(horizon?: string): number | undefined {
    if (!horizon) return undefined;
    
    const now = new Date();
    
    switch (horizon) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).getTime();
      case 'thisWeek':
        const daysUntilSunday = 7 - now.getDay();
        const endOfWeek = new Date(now.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
        return endOfWeek.getTime();
      case 'thisMonth':
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
        return endOfMonth.getTime();
      default:
        return undefined;
    }
  }

  private getTagColor(tagName: string): string {
    const colorMap: Record<string, string> = {
      'meeting': '#4F46E5',
      'bill': '#DC2626',
      'task': '#059669',
      'email': '#7C3AED',
      'urgent': '#DC2626',
      'finance': '#F59E0B',
      'confirmation': '#10B981'
    };
    
    return colorMap[tagName] || '#6B7280';
  }
}

export const emailTaskCreationService = new EmailTaskCreationService();