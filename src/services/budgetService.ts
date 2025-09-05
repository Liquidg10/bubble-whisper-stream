/**
 * Budget service for envelope budgeting with receipt tracking
 * Local-first budget management with pace alerts
 */

export interface BudgetEnvelope {
  id: string;
  name: string;
  monthlyLimit: number;
  spent: number;
  currency: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetTransaction {
  id: string;
  envelopeId: string;
  bubbleId: string;
  amount: number;
  merchant: string;
  date: Date;
  description?: string;
}

export interface BudgetPaceAlert {
  envelopeId: string;
  envelopeName: string;
  percentSpent: number;
  percentThroughMonth: number;
  isOnPace: boolean;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

class BudgetService {
  private static instance: BudgetService;
  private storagePrefix = 'budget_';

  static getInstance(): BudgetService {
    if (!BudgetService.instance) {
      BudgetService.instance = new BudgetService();
    }
    return BudgetService.instance;
  }

  // Envelope Management
  async getEnvelopes(): Promise<BudgetEnvelope[]> {
    const data = localStorage.getItem(`${this.storagePrefix}envelopes`);
    if (!data) return [];
    
    return JSON.parse(data).map((envelope: any) => ({
      ...envelope,
      createdAt: new Date(envelope.createdAt),
      updatedAt: new Date(envelope.updatedAt)
    }));
  }

  async saveEnvelope(envelope: Omit<BudgetEnvelope, 'id' | 'createdAt' | 'updatedAt'>): Promise<BudgetEnvelope> {
    const envelopes = await this.getEnvelopes();
    const newEnvelope: BudgetEnvelope = {
      ...envelope,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    envelopes.push(newEnvelope);
    localStorage.setItem(`${this.storagePrefix}envelopes`, JSON.stringify(envelopes));
    
    return newEnvelope;
  }

  async updateEnvelope(id: string, updates: Partial<BudgetEnvelope>): Promise<BudgetEnvelope | null> {
    const envelopes = await this.getEnvelopes();
    const index = envelopes.findIndex(e => e.id === id);
    
    if (index === -1) return null;
    
    envelopes[index] = {
      ...envelopes[index],
      ...updates,
      updatedAt: new Date()
    };
    
    localStorage.setItem(`${this.storagePrefix}envelopes`, JSON.stringify(envelopes));
    return envelopes[index];
  }

  async deleteEnvelope(id: string): Promise<boolean> {
    const envelopes = await this.getEnvelopes();
    const filtered = envelopes.filter(e => e.id !== id);
    
    if (filtered.length === envelopes.length) return false;
    
    localStorage.setItem(`${this.storagePrefix}envelopes`, JSON.stringify(filtered));
    
    // Also remove associated transactions
    const transactions = await this.getTransactions();
    const filteredTransactions = transactions.filter(t => t.envelopeId !== id);
    localStorage.setItem(`${this.storagePrefix}transactions`, JSON.stringify(filteredTransactions));
    
    return true;
  }

  // Transaction Management
  async getTransactions(): Promise<BudgetTransaction[]> {
    const data = localStorage.getItem(`${this.storagePrefix}transactions`);
    if (!data) return [];
    
    return JSON.parse(data).map((transaction: any) => ({
      ...transaction,
      date: new Date(transaction.date)
    }));
  }

  async addTransaction(transaction: Omit<BudgetTransaction, 'id'>): Promise<BudgetTransaction> {
    const transactions = await this.getTransactions();
    const newTransaction: BudgetTransaction = {
      ...transaction,
      id: crypto.randomUUID()
    };
    
    transactions.push(newTransaction);
    localStorage.setItem(`${this.storagePrefix}transactions`, JSON.stringify(transactions));
    
    // Update envelope spent amount
    await this.recalculateEnvelopeSpent(transaction.envelopeId);
    
    return newTransaction;
  }

  async removeTransaction(bubbleId: string): Promise<boolean> {
    const transactions = await this.getTransactions();
    const transaction = transactions.find(t => t.bubbleId === bubbleId);
    
    if (!transaction) return false;
    
    const filtered = transactions.filter(t => t.bubbleId !== bubbleId);
    localStorage.setItem(`${this.storagePrefix}transactions`, JSON.stringify(filtered));
    
    // Update envelope spent amount
    await this.recalculateEnvelopeSpent(transaction.envelopeId);
    
    return true;
  }

  private async recalculateEnvelopeSpent(envelopeId: string): Promise<void> {
    const transactions = await this.getTransactions();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlySpent = transactions
      .filter(t => 
        t.envelopeId === envelopeId &&
        t.date.getMonth() === currentMonth &&
        t.date.getFullYear() === currentYear
      )
      .reduce((sum, t) => sum + t.amount, 0);
    
    await this.updateEnvelope(envelopeId, { spent: monthlySpent });
  }

  // Pace Analysis
  async getPaceAlerts(): Promise<BudgetPaceAlert[]> {
    const envelopes = await this.getEnvelopes();
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const percentThroughMonth = (dayOfMonth / daysInMonth) * 100;
    
    return envelopes.map(envelope => {
      const percentSpent = envelope.monthlyLimit > 0 
        ? (envelope.spent / envelope.monthlyLimit) * 100 
        : 0;
      
      const isOnPace = percentSpent <= percentThroughMonth + 10; // 10% tolerance
      
      let severity: 'low' | 'medium' | 'high' = 'low';
      let message = `You're ${Math.round(percentSpent)}% through ${envelope.name} at mid-month`;
      
      if (percentSpent > percentThroughMonth + 20) {
        severity = 'high';
        message = `You're spending ${envelope.name} faster than planned`;
      } else if (percentSpent > percentThroughMonth + 10) {
        severity = 'medium';
        message = `${envelope.name} is slightly ahead of pace`;
      } else if (percentSpent < percentThroughMonth - 20) {
        message = `${envelope.name} spending is well under budget`;
      }
      
      return {
        envelopeId: envelope.id,
        envelopeName: envelope.name,
        percentSpent: Math.round(percentSpent),
        percentThroughMonth: Math.round(percentThroughMonth),
        isOnPace,
        message,
        severity
      };
    });
  }

  // Receipt Integration
  async assignReceiptToEnvelope(bubbleId: string, envelopeId: string, receiptData: any): Promise<boolean> {
    try {
      const envelope = (await this.getEnvelopes()).find(e => e.id === envelopeId);
      if (!envelope) return false;
      
      // Remove existing transaction if it exists
      await this.removeTransaction(bubbleId);
      
      // Add new transaction
      await this.addTransaction({
        envelopeId,
        bubbleId,
        amount: receiptData.total || 0,
        merchant: receiptData.merchant || 'Unknown',
        date: receiptData.date ? new Date(receiptData.date) : new Date(),
        description: `Receipt from ${receiptData.merchant || 'Unknown'}`
      });
      
      return true;
    } catch (error) {
      console.error('Error assigning receipt to envelope:', error);
      return false;
    }
  }

  // Utility
  async getMonthlySpending(): Promise<Record<string, number>> {
    const transactions = await this.getTransactions();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const spending: Record<string, number> = {};
    
    transactions
      .filter(t => 
        t.date.getMonth() === currentMonth &&
        t.date.getFullYear() === currentYear
      )
      .forEach(transaction => {
        spending[transaction.envelopeId] = (spending[transaction.envelopeId] || 0) + transaction.amount;
      });
    
    return spending;
  }
}

export const budgetService = BudgetService.getInstance();