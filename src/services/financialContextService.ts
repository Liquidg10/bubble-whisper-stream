import { recurringTransactionService, RecurringInsight } from './recurringTransactionService';
import { contextEngineService } from './contextEngineService';

export interface FinancialContextSignal {
  type: 'financial_pressure' | 'payment_due' | 'income_expected' | 'budget_warning';
  confidence: number;
  weight: number;
  reason: string;
  metadata: {
    merchant?: string;
    amount?: number;
    daysAway?: number;
    category?: string;
  };
}

export interface FinancialContext {
  signals: FinancialContextSignal[];
  overallPressure: number;
  upcomingPayments: RecurringInsight[];
  budgetStatus: 'healthy' | 'warning' | 'critical';
  explanation: string[];
}

class FinancialContextService {
  
  /**
   * Generate financial context signals for the Context Engine
   */
  async generateFinancialContext(userId: string): Promise<FinancialContext> {
    try {
      const upcomingInsights = await recurringTransactionService.getUpcomingRecurringInsights(userId);
      const signals = await this.analyzeFinancialSignals(upcomingInsights);
      
      const overallPressure = this.calculateOverallPressure(signals);
      const budgetStatus = this.determineBudgetStatus(signals, overallPressure);
      const explanation = this.generateExplanations(signals);

      return {
        signals,
        overallPressure,
        upcomingPayments: upcomingInsights,
        budgetStatus,
        explanation
      };
    } catch (error) {
      console.error('Failed to generate financial context:', error);
      return {
        signals: [],
        overallPressure: 0,
        upcomingPayments: [],
        budgetStatus: 'healthy',
        explanation: []
      };
    }
  }

  /**
   * Analyze recurring insights to generate financial signals
   */
  private async analyzeFinancialSignals(insights: RecurringInsight[]): Promise<FinancialContextSignal[]> {
    const signals: FinancialContextSignal[] = [];

    insights.forEach(insight => {
      // Payment due signals
      if (insight.type === 'upcoming_bill' || insight.type === 'overdue_payment') {
        let pressureLevel = 0;
        let reason = '';

        if (insight.daysAway < 0) {
          // Overdue payment - high pressure
          pressureLevel = 0.9;
          reason = `Overdue payment to ${insight.merchant} (${Math.abs(insight.daysAway)} days late)`;
        } else if (insight.daysAway <= 1) {
          // Due today/tomorrow - high pressure
          pressureLevel = 0.8;
          reason = `Payment to ${insight.merchant} due ${insight.daysAway === 0 ? 'today' : 'tomorrow'}`;
        } else if (insight.daysAway <= 3) {
          // Due soon - medium pressure
          pressureLevel = 0.6;
          reason = `Payment to ${insight.merchant} due in ${insight.daysAway} days`;
        } else if (insight.daysAway <= 7) {
          // Due this week - low pressure
          pressureLevel = 0.3;
          reason = `Payment to ${insight.merchant} due this week`;
        } else {
          // Due later - minimal pressure
          pressureLevel = 0.1;
          reason = `Upcoming payment to ${insight.merchant}`;
        }

        // Adjust pressure based on amount
        if (insight.amount > 1000) {
          pressureLevel += 0.1; // Large amounts increase pressure
        } else if (insight.amount < 50) {
          pressureLevel -= 0.1; // Small amounts decrease pressure
        }

        signals.push({
          type: insight.type === 'overdue_payment' ? 'financial_pressure' : 'payment_due',
          confidence: insight.confidence,
          weight: Math.min(1, pressureLevel),
          reason,
          metadata: {
            merchant: insight.merchant,
            amount: insight.amount,
            daysAway: insight.daysAway
          }
        });
      }

      // Income expected signals (positive)
      if (insight.type === 'salary_expected') {
        signals.push({
          type: 'income_expected',
          confidence: insight.confidence,
          weight: 0.2, // Positive signal
          reason: `Expected income from ${insight.merchant} in ${insight.daysAway} days`,
          metadata: {
            merchant: insight.merchant,
            amount: insight.amount,
            daysAway: insight.daysAway
          }
        });
      }
    });

    return signals;
  }

  /**
   * Calculate overall financial pressure score
   */
  private calculateOverallPressure(signals: FinancialContextSignal[]): number {
    if (signals.length === 0) return 0;

    let totalPressure = 0;
    let totalWeight = 0;

    signals.forEach(signal => {
      const signalPressure = signal.type === 'income_expected' ? -signal.weight : signal.weight;
      totalPressure += signalPressure * signal.confidence;
      totalWeight += signal.confidence;
    });

    return totalWeight > 0 ? Math.max(0, Math.min(1, totalPressure / totalWeight)) : 0;
  }

  /**
   * Determine budget status based on signals
   */
  private determineBudgetStatus(signals: FinancialContextSignal[], overallPressure: number): 'healthy' | 'warning' | 'critical' {
    const overduePayments = signals.filter(s => s.type === 'financial_pressure' && s.metadata.daysAway && s.metadata.daysAway < 0);
    const dueSoon = signals.filter(s => s.type === 'payment_due' && s.metadata.daysAway && s.metadata.daysAway <= 3);

    if (overduePayments.length > 0 || overallPressure > 0.8) {
      return 'critical';
    } else if (dueSoon.length > 2 || overallPressure > 0.5) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Generate human-readable explanations
   */
  private generateExplanations(signals: FinancialContextSignal[]): string[] {
    const explanations: string[] = [];

    // Group signals by priority
    const criticalSignals = signals.filter(s => s.weight > 0.7);
    const warningSignals = signals.filter(s => s.weight > 0.3 && s.weight <= 0.7);
    const infoSignals = signals.filter(s => s.weight <= 0.3);

    if (criticalSignals.length > 0) {
      explanations.push(`⚠️ ${criticalSignals.length} critical payment${criticalSignals.length > 1 ? 's' : ''} requiring attention`);
    }

    if (warningSignals.length > 0) {
      explanations.push(`📅 ${warningSignals.length} payment${warningSignals.length > 1 ? 's' : ''} due soon`);
    }

    if (infoSignals.length > 0) {
      explanations.push(`📊 ${infoSignals.length} upcoming financial item${infoSignals.length > 1 ? 's' : ''} to track`);
    }

    return explanations;
  }

  /**
   * Integration with Context Engine - add financial signals
   */
  async addFinancialSignalsToContext(userId: string, contextInput: any): Promise<any> {
    try {
      const financialContext = await this.generateFinancialContext(userId);
      
      // Add financial pressure as a new signal type
      const financialSignals = financialContext.signals.map(signal => ({
        type: 'financial_pressure',
        value: signal.weight,
        confidence: signal.confidence,
        weight: 0.15, // Weight in overall context calculation
        reason: signal.reason,
        metadata: signal.metadata
      }));

      return {
        ...contextInput,
        financialSignals,
        financialContext
      };
    } catch (error) {
      console.error('Failed to add financial signals to context:', error);
      return contextInput;
    }
  }

  /**
   * Generate calendar draft suggestions for bill due dates
   */
  async generateCalendarSuggestions(userId: string): Promise<any[]> {
    try {
      const insights = await recurringTransactionService.getUpcomingRecurringInsights(userId);
      const suggestions: any[] = [];

      insights.forEach(insight => {
        if (insight.daysAway >= 0 && insight.daysAway <= 14) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + insight.daysAway);
          
          // Create reminder 3 days before
          const reminderDate = new Date(dueDate);
          reminderDate.setDate(reminderDate.getDate() - 3);

          suggestions.push({
            id: `bill-reminder-${insight.id}`,
            type: 'bill_reminder',
            title: `💳 ${insight.merchant} Payment Due`,
            description: `Recurring payment of $${insight.amount.toFixed(2)} due`,
            start_time: reminderDate.toISOString(),
            all_day: true,
            confidence: insight.confidence,
            metadata: {
              amount: insight.amount,
              merchant: insight.merchant,
              originalInsightId: insight.id
            }
          });

          // Create due date event
          suggestions.push({
            id: `bill-due-${insight.id}`,
            type: 'bill_due',
            title: `💰 ${insight.merchant} Payment Due ($${insight.amount.toFixed(2)})`,
            description: `Payment due - ${insight.reason}`,
            start_time: dueDate.toISOString(),
            all_day: true,
            confidence: insight.confidence,
            metadata: {
              amount: insight.amount,
              merchant: insight.merchant,
              originalInsightId: insight.id
            }
          });
        }
      });

      return suggestions;
    } catch (error) {
      console.error('Failed to generate calendar suggestions:', error);
      return [];
    }
  }
}

export const financialContextService = new FinancialContextService();