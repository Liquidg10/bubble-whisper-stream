import { Task, createTask } from '@/types/task';
import type { EmailMetadata, IntentClassification } from './gmailIntentClassifier';
import { FinancialEmailClassification, financialEmailClassifier } from './financialEmailClassifier';
import { emailTaskCreationService } from './emailTaskCreationService';
import { financialTaskCreationService } from './financialTaskCreationService';
import { DecisionTrace } from '@/types/decisionTrace';

export interface CrossDomainSuggestion {
  id: string;
  type: 'email_to_financial' | 'financial_to_email' | 'duplicate_detection' | 'enhancement';
  confidence: number;
  sourceTask?: Task;
  suggestedTask?: Omit<Task, 'id'>;
  suggestedEmail?: {
    to: string[];
    subject: string;
    body: string;
  };
  reason: string;
  metadata?: any;
}

export interface CrossDomainContext {
  emailFinancialClassifications: Map<string, FinancialEmailClassification>;
  financialEmailMappings: Map<string, string[]>; // taskId -> emailIds
  duplicateDetections: Map<string, string[]>; // primary taskId -> duplicate taskIds
  suggestions: CrossDomainSuggestion[];
}

export class CrossDomainIntelligenceService {
  private context: CrossDomainContext = {
    emailFinancialClassifications: new Map(),
    financialEmailMappings: new Map(),
    duplicateDetections: new Map(),
    suggestions: [],
  };

  async processEmailForFinancialTask(
    email: EmailMetadata,
    intentClassification: IntentClassification
  ): Promise<{ task?: Task; trace: DecisionTrace; suggestion?: CrossDomainSuggestion }> {
    // Classify email for financial content
    const financialClassification = financialEmailClassifier.classifyFinancialEmail(email, intentClassification);
    
    this.context.emailFinancialClassifications.set(email.id, financialClassification);

    const trace: DecisionTrace = {
      id: `cross-domain-${email.id}-${Date.now()}`,
      input: { email, intentClassification, financialClassification },
      rules: ['financial_email_detection', 'cross_domain_task_creation'],
      output: null,
      confidence: financialClassification.confidence,
      timestamp: Date.now(),
      becauseText: '',
      revertHook: () => this.revertEmailProcessing(email.id),
    };

    // If highly confident financial email, create financial task
    if (financialClassification.isFinancial && financialClassification.confidence > 0.7) {
      const task = await this.createFinancialTaskFromEmail(email, financialClassification);
      
      if (task) {
        trace.output = task;
        trace.becauseText = `Created financial task because email was classified as ${financialClassification.financialType} with ${Math.round(financialClassification.confidence * 100)}% confidence`;
        
        // Store mapping
        const emailIds = this.context.financialEmailMappings.get(task.id) || [];
        emailIds.push(email.id);
        this.context.financialEmailMappings.set(task.id, emailIds);

        return { task, trace };
      }
    }

    // If medium confidence, create suggestion
    if (financialClassification.isFinancial && financialClassification.confidence > 0.4) {
      const suggestion = await this.createFinancialTaskSuggestion(email, financialClassification);
      trace.becauseText = `Suggested financial task because email had ${Math.round(financialClassification.confidence * 100)}% financial confidence`;
      
      return { trace, suggestion };
    }

    trace.becauseText = `No financial task created - low financial confidence (${Math.round(financialClassification.confidence * 100)}%)`;
    return { trace };
  }

  async createFinancialTaskFromEmail(
    email: EmailMetadata,
    classification: FinancialEmailClassification
  ): Promise<Task | null> {
    try {
      const task = createTask(
        this.generateFinancialTaskTitle(email, classification),
        this.mapFinancialTypeToTaskType(classification.financialType),
        {
          description: this.generateFinancialTaskDescription(email, classification),
          priority: this.calculateFinancialTaskPriority(classification),
          due: classification.dueDate?.getTime(),
          tags: [
            { id: 'financial', name: 'Financial', emoji: '💰' },
            { id: classification.financialType, name: classification.financialType.replace('_', ' '), emoji: this.getFinancialTypeEmoji(classification.financialType) },
          ],
          metadata: {
            email: {
              messageId: email.id,
              subject: email.subject,
              from: email.sender,
              snippet: email.snippet,
            },
            finance: {
              amount: classification.amount,
              merchant: classification.merchant,
              category: classification.category,
              urgency: classification.urgency,
              dueDate: classification.dueDate?.getTime(),
            },
          },
        }
      );

      return { ...task, id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
    } catch (error) {
      console.error('Error creating financial task from email:', error);
      return null;
    }
  }

  async createFinancialTaskSuggestion(
    email: EmailMetadata,
    classification: FinancialEmailClassification
  ): Promise<CrossDomainSuggestion> {
    const suggestedTask = createTask(
      this.generateFinancialTaskTitle(email, classification),
      this.mapFinancialTypeToTaskType(classification.financialType),
      {
        description: this.generateFinancialTaskDescription(email, classification),
        priority: this.calculateFinancialTaskPriority(classification),
        due: classification.dueDate?.getTime(),
        tags: [
          { id: 'financial', name: 'Financial', emoji: '💰' },
          { id: classification.financialType, name: classification.financialType.replace('_', ' '), emoji: this.getFinancialTypeEmoji(classification.financialType) },
        ],
      }
    );

    return {
      id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'email_to_financial',
      confidence: classification.confidence,
      suggestedTask,
      reason: `Email appears to be a ${classification.financialType} ${classification.amount ? `for $${classification.amount}` : ''} and could benefit from financial task tracking`,
      metadata: { email, classification },
    };
  }

  async generateEmailFromFinancialTask(task: Task): Promise<CrossDomainSuggestion | null> {
    const financeMetadata = task.metadata?.finance;
    if (!financeMetadata) return null;

    const emailSuggestion = this.generateFinancialEmailContent(task, financeMetadata);
    
    return {
      id: `email_suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'financial_to_email',
      confidence: 0.8,
      sourceTask: task,
      suggestedEmail: emailSuggestion,
      reason: `Financial task suggests sending ${this.getEmailType(task)} email`,
      metadata: { financeMetadata },
    };
  }

  async detectDuplicateTasks(tasks: Task[]): Promise<Map<string, string[]>> {
    const duplicates = new Map<string, string[]>();
    
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const similarity = this.calculateTaskSimilarity(tasks[i], tasks[j]);
        
        if (similarity > 0.8) {
          const primaryId = tasks[i].id;
          const duplicateIds = duplicates.get(primaryId) || [];
          duplicateIds.push(tasks[j].id);
          duplicates.set(primaryId, duplicateIds);
        }
      }
    }

    this.context.duplicateDetections = duplicates;
    return duplicates;
  }

  private generateFinancialTaskTitle(email: EmailMetadata, classification: FinancialEmailClassification): string {
    const baseTitle = email.subject.replace(/^(re:|fwd?:)\s*/i, '').trim();
    
    if (classification.amount && classification.merchant) {
      return `${classification.financialType.replace('_', ' ')}: ${classification.merchant} - $${classification.amount}`;
    }
    
    if (classification.amount) {
      return `${classification.financialType.replace('_', ' ')}: $${classification.amount}`;
    }
    
    if (classification.merchant) {
      return `${classification.financialType.replace('_', ' ')}: ${classification.merchant}`;
    }
    
    return `${classification.financialType.replace('_', ' ')}: ${baseTitle}`;
  }

  private generateFinancialTaskDescription(email: EmailMetadata, classification: FinancialEmailClassification): string {
    let description = `Financial task created from email: ${email.subject}\n\n`;
    
    if (email.snippet) {
      description += `Email preview: ${email.snippet}\n\n`;
    }
    
    description += `Financial Details:\n`;
    description += `- Type: ${classification.financialType.replace('_', ' ')}\n`;
    description += `- Confidence: ${Math.round(classification.confidence * 100)}%\n`;
    description += `- Urgency: ${classification.urgency}\n`;
    
    if (classification.amount) {
      description += `- Amount: $${classification.amount}\n`;
    }
    
    if (classification.merchant) {
      description += `- Merchant: ${classification.merchant}\n`;
    }
    
    if (classification.category) {
      description += `- Category: ${classification.category}\n`;
    }
    
    if (classification.dueDate) {
      description += `- Due Date: ${classification.dueDate.toLocaleDateString()}\n`;
    }
    
    return description;
  }

  private mapFinancialTypeToTaskType(financialType: string): Task['type'] {
    const mapping: Record<string, Task['type']> = {
      bill: 'reminder',
      receipt: 'task',
      payment_notification: 'reminder',
      bank_statement: 'task',
      investment: 'task',
      insurance: 'reminder',
      tax: 'task',
      other: 'task',
    };
    
    return mapping[financialType] || 'task';
  }

  private calculateFinancialTaskPriority(classification: FinancialEmailClassification): number {
    const baseUrgencyScore = {
      low: 20,
      medium: 50,
      high: 75,
      critical: 95,
    };
    
    let priority = baseUrgencyScore[classification.urgency];
    
    // Boost priority for bills and payment notifications
    if (classification.financialType === 'bill' || classification.financialType === 'payment_notification') {
      priority += 10;
    }
    
    // Boost priority for larger amounts
    if (classification.amount && classification.amount > 100) {
      priority += 5;
    }
    
    return Math.min(100, priority);
  }

  private getFinancialTypeEmoji(type: string): string {
    const emojiMap: Record<string, string> = {
      bill: '📄',
      receipt: '🧾',
      payment_notification: '💳',
      bank_statement: '🏦',
      investment: '📈',
      insurance: '🛡️',
      tax: '📊',
      other: '💰',
    };
    
    return emojiMap[type] || '💰';
  }

  private generateFinancialEmailContent(task: Task, financeMetadata: any): { to: string[]; subject: string; body: string } {
    // This is a simplified example - in practice, this would be more sophisticated
    const emailType = this.getEmailType(task);
    
    return {
      to: [], // Would be determined based on task context
      subject: `${emailType}: ${task.title}`,
      body: `This is regarding: ${task.title}\n\n${task.description || ''}\n\nPlease let me know if you have any questions.`,
    };
  }

  private getEmailType(task: Task): string {
    const financeMetadata = task.metadata?.finance;
    if (!financeMetadata) return 'Financial Update';
    
    if (task.type === 'reminder') return 'Payment Reminder';
    if (financeMetadata.urgency === 'critical') return 'Urgent Financial Matter';
    
    return 'Financial Update';
  }

  private calculateTaskSimilarity(task1: Task, task2: Task): number {
    let similarity = 0;
    
    // Title similarity
    const titleSimilarity = this.stringSimilarity(task1.title.toLowerCase(), task2.title.toLowerCase());
    similarity += titleSimilarity * 0.4;
    
    // Type similarity
    if (task1.type === task2.type) {
      similarity += 0.2;
    }
    
    // Tag similarity
    const commonTags = task1.tags.filter(tag1 => 
      task2.tags.some(tag2 => tag2.name === tag1.name)
    ).length;
    const maxTags = Math.max(task1.tags.length, task2.tags.length);
    if (maxTags > 0) {
      similarity += (commonTags / maxTags) * 0.2;
    }
    
    // Metadata similarity (simplified)
    if (task1.metadata?.finance && task2.metadata?.finance) {
      const finance1 = task1.metadata.finance;
      const finance2 = task2.metadata.finance;
      
      if (finance1.amount === finance2.amount) similarity += 0.1;
      if (finance1.merchant === finance2.merchant) similarity += 0.1;
    }
    
    return similarity;
  }

  private stringSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    const commonWords = words1.filter(word => words2.includes(word)).length;
    const maxWords = Math.max(words1.length, words2.length);
    
    return maxWords > 0 ? commonWords / maxWords : 0;
  }

  private revertEmailProcessing(emailId: string): void {
    this.context.emailFinancialClassifications.delete(emailId);
    
    // Remove from mappings
    for (const [taskId, emailIds] of this.context.financialEmailMappings.entries()) {
      const filteredEmails = emailIds.filter(id => id !== emailId);
      if (filteredEmails.length === 0) {
        this.context.financialEmailMappings.delete(taskId);
      } else {
        this.context.financialEmailMappings.set(taskId, filteredEmails);
      }
    }
  }

  getContext(): CrossDomainContext {
    return this.context;
  }

  clearContext(): void {
    this.context = {
      emailFinancialClassifications: new Map(),
      financialEmailMappings: new Map(),
      duplicateDetections: new Map(),
      suggestions: [],
    };
  }
}

export const crossDomainIntelligenceService = new CrossDomainIntelligenceService();