/**
 * P12 - Task Email Adapter
 * Converts task metadata to email intent and validates green conditions
 */

import type { Task } from '@/types/task';
import { logger } from '@/utils/logger';

export interface EmailIntent {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  confidence: number;
  accountId?: string;
}

export interface EmailValidationResult {
  isValid: boolean;
  confidence: number;
  violations: string[];
}

class TaskEmailAdapter {
  /**
   * Extract email intent from task metadata
   */
  extractEmailIntent(task: Task): EmailIntent | null {
    const emailData = task.view?.email;
    
    if (!emailData?.to?.length) {
      return null;
    }

    const confidence = this.calculateConfidence(task);
    
    return {
      to: emailData.to,
      cc: emailData.cc,
      subject: emailData.subject || this.generateSubject(task),
      body: this.generateBody(task),
      confidence,
      accountId: emailData.accountId
    };
  }

  /**
   * Validate green conditions for auto-write
   */
  validateGreenConditions(task: Task): EmailValidationResult {
    const violations: string[] = [];
    let confidence = 0.3;

    const emailData = task.view?.email;

    // Check required fields
    if (!emailData?.to?.length) {
      violations.push('No recipients specified');
    } else {
      confidence += 0.25;
    }

    if (!emailData?.subject && task.title.length < 5) {
      violations.push('Subject too short or missing');
    } else {
      confidence += 0.25;
    }

    // Check content quality
    if (!task.description || task.description.length < 10) {
      violations.push('Insufficient email content');
    } else {
      confidence += 0.2;
    }

    // Safety checks
    if (emailData?.to?.some(email => email.includes('@'))) {
      confidence += 0.1;
    } else {
      violations.push('Invalid email format detected');
    }

    // Avoid work emails without explicit confirmation
    if (emailData?.to?.some(email => email.includes('@company.com'))) {
      violations.push('Work email requires manual review');
      confidence -= 0.2;
    }

    // Check for external recipients (safer for auto-send)
    if (!emailData?.cc?.length && emailData?.to?.length === 1) {
      confidence += 0.1;
    }

    return {
      isValid: violations.length === 0 && confidence >= 0.85,
      confidence: Math.max(0, Math.min(1, confidence)),
      violations
    };
  }

  private calculateConfidence(task: Task): number {
    let confidence = 0.3;
    
    const emailData = task.view?.email;
    
    if (emailData?.to?.length) confidence += 0.25;
    if (emailData?.subject && emailData.subject.length >= 5) confidence += 0.25;
    if (task.description && task.description.length >= 20) confidence += 0.2;
    if (task.priority >= 70) confidence += 0.1;
    
    // Penalize risky conditions
    if (emailData?.cc?.length && emailData.cc.length > 2) confidence -= 0.1;
    if (emailData?.to?.some(email => email.includes('@company.com'))) confidence -= 0.15;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private generateSubject(task: Task): string {
    const emailData = task.view?.email;
    if (emailData?.subject) return emailData.subject;
    
    let subject = task.title;
    
    if (task.due) {
      const dueDate = new Date(task.due);
      const isUrgent = dueDate.getTime() - Date.now() < 24 * 60 * 60 * 1000; // < 24 hours
      if (isUrgent) subject = `URGENT: ${subject}`;
    }
    
    return subject;
  }

  private generateBody(task: Task): string {
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
    
    if (task.tags?.length) {
      const tagNames = task.tags.map(tag => tag.name).join(', ');
      body += `\nTags: ${tagNames}\n`;
    }
    
    body += '\nBest regards';
    
    return body;
  }
}

export const taskEmailAdapter = new TaskEmailAdapter();