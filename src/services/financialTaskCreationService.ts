/**
 * Financial Task Creation Service - Converts financial data into tasks
 * Handles receipts, transactions, budget alerts, and payment reminders
 */

import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';
import type { Task } from '@/types/task';
import type { ReceiptData } from '@/services/enhancedReceiptService';
import type { BudgetPaceAlert } from '@/services/budgetService';
import type { RecurringInsight } from '@/services/recurringTransactionService';
import type { FinancialContext } from '@/services/financialContextService';

export interface FinancialTaskMetadata {
  finance: {
    type: 'receipt' | 'payment' | 'budget' | 'investment' | 'bill';
    amount?: number;
    merchant?: string;
    category?: string;
    dueDate?: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    receiptId?: string;
    recurringId?: string;
    budgetEnvelopeId?: string;
    confidence?: number;
    actionRequired?: boolean;
    metadata?: Record<string, any>;
  };
}

interface TaskCreationConfig {
  autoCreate: boolean;
  confidenceThreshold: number;
  priorityMapping: Record<string, number>;
  dueDateRules: Record<string, number>; // days from now
}

class FinancialTaskCreationService {
  private readonly config: TaskCreationConfig = {
    autoCreate: true,
    confidenceThreshold: 0.75,
    priorityMapping: {
      'critical': 85,
      'high': 70,
      'medium': 50,
      'low': 30
    },
    dueDateRules: {
      'bill': 7, // bills due in 7 days
      'payment': 3, // payments due in 3 days
      'budget': 1, // budget reviews due tomorrow
      'receipt': 0 // receipt processing today
    }
  };

  /**
   * Creates tasks from receipt data with intelligent categorization
   */
  async createTasksFromReceipt(receiptData: ReceiptData): Promise<Task[]> {
    if (!isFeatureEnabled('budget') || !this.config.autoCreate) {
      return [];
    }

    const tasks: Task[] = [];

    try {
      // Main receipt task
      const receiptTask = this.createReceiptTask(receiptData);
      tasks.push(receiptTask);

      // Budget tracking task if overspending detected
      if (this.shouldCreateBudgetTask(receiptData)) {
        const budgetTask = this.createBudgetReviewTask(receiptData);
        tasks.push(budgetTask);
      }

      // Expense categorization task for high-value items
      if (receiptData.totals.total > 100) {
        const categorizeTask = this.createExpenseCategorizationTask(receiptData);
        tasks.push(categorizeTask);
      }

      logger.info('Financial tasks created from receipt', {
        receiptId: receiptData.id,
        tasksCreated: tasks.length,
        merchant: receiptData.merchant.name,
        amount: receiptData.totals.total
      });

      return tasks;

    } catch (error) {
      logger.error('Failed to create tasks from receipt', {
        receiptId: receiptData.id,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Creates payment reminder tasks from recurring transaction insights
   */
  async createTasksFromRecurringInsights(insights: RecurringInsight[]): Promise<Task[]> {
    if (!isFeatureEnabled('budget') || !this.config.autoCreate) {
      return [];
    }

    const tasks: Task[] = [];

    for (const insight of insights) {
      if (insight.type === 'upcoming_bill' || insight.type === 'overdue_payment') {
        const paymentTask = this.createPaymentReminderTask(insight);
        tasks.push(paymentTask);
      }
    }

    logger.info('Payment reminder tasks created', {
      tasksCreated: tasks.length,
      insights: insights.length
    });

    return tasks;
  }

  /**
   * Creates budget alert tasks from pace monitoring
   */
  async createTasksFromBudgetAlerts(alerts: BudgetPaceAlert[]): Promise<Task[]> {
    if (!isFeatureEnabled('budget') || !this.config.autoCreate) {
      return [];
    }

    const tasks: Task[] = [];

    for (const alert of alerts) {
      if (alert.severity === 'high' && !alert.isOnPace) {
        const budgetTask = this.createBudgetAdjustmentTask(alert);
        tasks.push(budgetTask);
      }
    }

    logger.info('Budget alert tasks created', {
      tasksCreated: tasks.length,
      alerts: alerts.length
    });

    return tasks;
  }

  /**
   * Creates financial planning tasks from context analysis
   */
  async createTasksFromFinancialContext(context: FinancialContext): Promise<Task[]> {
    if (!isFeatureEnabled('budget') || !this.config.autoCreate) {
      return [];
    }

    const tasks: Task[] = [];

    // Create budget review task if pressure is high
    if (context.overallPressure > 0.7) {
      const reviewTask = this.createFinancialReviewTask(context);
      tasks.push(reviewTask);
    }

    // Create emergency fund task if needed
    if (context.budgetStatus === 'critical') {
      const emergencyTask = this.createEmergencyPlanningTask(context);
      tasks.push(emergencyTask);
    }

    logger.info('Financial context tasks created', {
      tasksCreated: tasks.length,
      pressure: context.overallPressure,
      status: context.budgetStatus
    });

    return tasks;
  }

  /**
   * Enhance existing task with financial metadata
   */
  async enhanceTaskWithFinancialData(
    taskId: string, 
    financialData: Partial<FinancialTaskMetadata['finance']>
  ): Promise<Task | null> {
    // This would integrate with the task management system
    // For now, return null to indicate not implemented
    logger.info('Task enhancement requested', { taskId, financialData });
    return null;
  }

  private createReceiptTask(receiptData: ReceiptData): Task {
    const task: Task = {
      id: crypto.randomUUID(),
      type: 'task',
      title: `Categorize receipt: ${receiptData.merchant.name}`,
      description: `Review and categorize $${receiptData.totals.total.toFixed(2)} expense from ${receiptData.merchant.name}`,
      completed: false,
      priority: this.calculatePriority(receiptData.totals.total, 'receipt'),
      tags: [
        { id: crypto.randomUUID(), name: 'receipt', emoji: '🧾' },
        { id: crypto.randomUUID(), name: receiptData.categories.primary, emoji: '💰' },
        { id: crypto.randomUUID(), name: 'finance', emoji: '💳' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (this.config.dueDateRules.receipt * 24 * 60 * 60 * 1000),
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {
          amount: receiptData.totals.total,
          merchant: receiptData.merchant.name,
          category: receiptData.categories.primary,
          itemLines: receiptData.lineItems.map(item => ({
            name: item.name,
            price: item.price,
            category: item.category,
            confidence: item.confidence
          }))
        }
      }
    };

    return task;
  }

  private createBudgetReviewTask(receiptData: ReceiptData): Task {
    return {
      id: crypto.randomUUID(),
      type: 'task',
      title: `Review ${receiptData.categories.primary} budget`,
      description: `Large expense detected: $${receiptData.totals.total.toFixed(2)} at ${receiptData.merchant.name}. Review budget allocation.`,
      completed: false,
      priority: this.config.priorityMapping.high,
      tags: [
        { id: crypto.randomUUID(), name: 'budget', emoji: '📊' },
        { id: crypto.randomUUID(), name: receiptData.categories.primary, emoji: '💰' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (this.config.dueDateRules.budget * 24 * 60 * 60 * 1000),
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {
          amount: receiptData.totals.total,
          category: receiptData.categories.primary
        }
      }
    };
  }

  private createExpenseCategorizationTask(receiptData: ReceiptData): Task {
    return {
      id: crypto.randomUUID(),
      type: 'task',
      title: `Categorize high-value expense`,
      description: `Review and properly categorize $${receiptData.totals.total.toFixed(2)} expense for tax/budget purposes`,
      completed: false,
      priority: this.config.priorityMapping.medium,
      tags: [
        { id: crypto.randomUUID(), name: 'categorize', emoji: '📂' },
        { id: crypto.randomUUID(), name: 'high-value', emoji: '💎' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (this.config.dueDateRules.receipt * 24 * 60 * 60 * 1000),
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {
          amount: receiptData.totals.total,
          merchant: receiptData.merchant.name,
          category: receiptData.categories.primary
        }
      }
    };
  }

  private createPaymentReminderTask(insight: RecurringInsight): Task {
    const isOverdue = insight.type === 'overdue_payment';
    const priority = isOverdue ? 'critical' : 'high';
    
    return {
      id: crypto.randomUUID(),
      type: 'reminder',
      title: `${isOverdue ? 'OVERDUE: ' : ''}Pay ${insight.merchant}`,
      description: `${insight.merchant} payment of $${insight.amount.toFixed(2)} ${isOverdue ? 'is overdue' : 'due soon'}`,
      completed: false,
      priority: this.config.priorityMapping[priority],
      tags: [
        { id: crypto.randomUUID(), name: isOverdue ? 'overdue' : 'due-soon', emoji: isOverdue ? '🚨' : '⏰' },
        { id: crypto.randomUUID(), name: 'payment', emoji: '💸' },
        { id: crypto.randomUUID(), name: 'recurring', emoji: '🔄' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (insight.daysAway * 24 * 60 * 60 * 1000),
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {
          amount: insight.amount,
          merchant: insight.merchant
        }
      }
    };
  }

  private createBudgetAdjustmentTask(alert: BudgetPaceAlert): Task {
    return {
      id: crypto.randomUUID(),
      type: 'task',
      title: `Adjust ${alert.envelopeName} budget`,
      description: `Budget alert: ${alert.percentSpent}% of monthly budget used. ${alert.message}`,
      completed: false,
      priority: this.config.priorityMapping.high,
      tags: [
        { id: crypto.randomUUID(), name: 'budget-alert', emoji: '⚠️' },
        { id: crypto.randomUUID(), name: alert.isOnPace ? 'on-pace' : 'overspending', emoji: alert.isOnPace ? '✅' : '📈' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (this.config.dueDateRules.budget * 24 * 60 * 60 * 1000),
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {
          category: alert.envelopeName
        }
      }
    };
  }

  private createFinancialReviewTask(context: FinancialContext): Task {
    return {
      id: crypto.randomUUID(),
      type: 'task',
      title: 'Financial health review',
      description: `High financial pressure detected (${Math.round(context.overallPressure * 100)}%). Review budget and spending patterns.`,
      completed: false,
      priority: this.config.priorityMapping.critical,
      tags: [
        { id: crypto.randomUUID(), name: 'financial-review', emoji: '🔍' },
        { id: crypto.randomUUID(), name: 'high-pressure', emoji: '🚨' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (this.config.dueDateRules.budget * 24 * 60 * 60 * 1000),
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {}
      }
    };
  }

  private createEmergencyPlanningTask(context: FinancialContext): Task {
    return {
      id: crypto.randomUUID(),
      type: 'task',
      title: 'Create emergency financial plan',
      description: 'Critical financial status detected. Create action plan to address budget issues and upcoming payments.',
      completed: false,
      priority: this.config.priorityMapping.critical,
      tags: [
        { id: crypto.randomUUID(), name: 'emergency', emoji: '🆘' },
        { id: crypto.randomUUID(), name: 'financial-plan', emoji: '📋' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      due: Date.now() + (24 * 60 * 60 * 1000), // Due tomorrow
      view: {
        list: { order: 0 }
      },
      metadata: {
        finance: {}
      }
    };
  }

  private shouldCreateBudgetTask(receiptData: ReceiptData): boolean {
    // Create budget task for high-value purchases or specific categories
    return receiptData.totals.total > 75 || 
           ['utilities', 'healthcare', 'business'].includes(receiptData.categories.primary);
  }

  private calculatePriority(amount: number, type: string): number {
    const basePriority = this.config.priorityMapping.medium;
    
    // Adjust priority based on amount
    if (amount > 200) return this.config.priorityMapping.high;
    if (amount > 100) return basePriority + 10;
    if (amount < 20) return this.config.priorityMapping.low;
    
    return basePriority;
  }
}

export const financialTaskCreationService = new FinancialTaskCreationService();