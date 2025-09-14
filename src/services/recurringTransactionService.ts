import { supabase } from '@/integrations/supabase/client';

export interface RecurringTransaction {
  id: string;
  merchant_name: string;
  normalized_merchant: string;
  amount_average: number;
  amount_variance: number;
  frequency_days: number;
  confidence_score: number;
  occurrence_count: number;
  last_transaction_date: string;
  next_expected_date: string;
  category: any;
  is_active: boolean;
}

export interface RecurringInsight {
  id: string;
  type: 'upcoming_bill' | 'overdue_payment' | 'subscription_renewal' | 'salary_expected';
  merchant: string;
  amount: number;
  daysAway: number;
  confidence: number;
  reason: string;
}

class RecurringTransactionService {
  
  /**
   * Normalize merchant names for better pattern detection
   */
  private normalizeMerchant(merchantName: string): string {
    if (!merchantName) return 'Unknown';
    
    return merchantName
      // Remove common suffixes
      .replace(/\b(LLC|INC|CORP|LTD|CO|COMPANY)\b/gi, '')
      // Remove location indicators
      .replace(/\s*#\d+.*$/i, '') // Remove store numbers like "#1234"
      .replace(/\s*-\s*[A-Z]{2,}.*$/i, '') // Remove location codes
      // Clean up extra spaces and normalize
      .trim()
      .replace(/\s+/g, ' ')
      // Handle specific common cases
      .replace(/^AMAZON WEB SERVICES/i, 'AWS')
      .replace(/^SPOTIFY PREMIUM/i, 'Spotify')
      .replace(/^STARBUCKS/i, 'Starbucks')
      .replace(/^NETFLIX/i, 'Netflix')
      .replace(/^APPLE/i, 'Apple')
      .replace(/^GOOGLE/i, 'Google');
  }

  /**
   * Detect recurring transaction patterns from Plaid transaction data
   */
  async detectRecurringPatterns(userId: string): Promise<void> {
    try {
      // Get transactions from the last 6 months for pattern analysis
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: transactions, error } = await supabase
        .from('plaid_transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', sixMonthsAgo.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;

      // Group transactions by normalized merchant
      const merchantGroups = this.groupTransactionsByMerchant(transactions || []);
      
      // Analyze each group for recurring patterns
      for (const [normalizedMerchant, merchantTransactions] of Object.entries(merchantGroups)) {
        const pattern = this.analyzeRecurringPattern(merchantTransactions);
        
        if (pattern && pattern.occurrence_count >= 3 && pattern.confidence_score >= 0.6) {
          await this.upsertRecurringTransaction(userId, pattern);
        }
      }

    } catch (error) {
      console.error('Failed to detect recurring patterns:', error);
      throw error;
    }
  }

  /**
   * Group transactions by normalized merchant name
   */
  private groupTransactionsByMerchant(transactions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    transactions.forEach(transaction => {
      const merchantName = transaction.merchant_name || transaction.name;
      const normalizedMerchant = this.normalizeMerchant(merchantName);
      
      if (!groups[normalizedMerchant]) {
        groups[normalizedMerchant] = [];
      }
      groups[normalizedMerchant].push(transaction);
    });

    return groups;
  }

  /**
   * Analyze a group of transactions for recurring patterns
   */
  private analyzeRecurringPattern(transactions: any[]): Partial<RecurringTransaction> | null {
    if (transactions.length < 3) return null;

    // Sort by date
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const amounts = transactions.map(t => Math.abs(t.amount));
    const dates = transactions.map(t => new Date(t.date));
    
    // Calculate average amount and variance
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length;
    const varianceRatio = Math.sqrt(variance) / avgAmount;

    // Calculate frequency (days between transactions)
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = Math.floor((dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }

    if (intervals.length === 0) return null;

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const intervalVariance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const intervalConsistency = 1 - (Math.sqrt(intervalVariance) / avgInterval);

    // Calculate confidence score
    let confidence = 0;
    
    // Amount consistency (higher score for lower variance)
    confidence += Math.max(0, 1 - varianceRatio) * 0.4;
    
    // Frequency consistency
    confidence += Math.max(0, intervalConsistency) * 0.4;
    
    // Number of occurrences (more = higher confidence)
    confidence += Math.min(1, transactions.length / 12) * 0.2; // Max at 12 occurrences

    // Predict next occurrence
    const lastDate = dates[dates.length - 1];
    const nextExpectedDate = new Date(lastDate.getTime() + (avgInterval * 24 * 60 * 60 * 1000));

    // Use original merchant name from most recent transaction
    const latestTransaction = transactions[transactions.length - 1];
    const merchantName = latestTransaction.merchant_name || latestTransaction.name;
    
    return {
      merchant_name: merchantName,
      normalized_merchant: this.normalizeMerchant(merchantName),
      amount_average: avgAmount,
      amount_variance: variance,
      frequency_days: Math.round(avgInterval),
      confidence_score: confidence,
      occurrence_count: transactions.length,
      last_transaction_date: lastDate.toISOString().split('T')[0],
      next_expected_date: nextExpectedDate.toISOString().split('T')[0],
      category: latestTransaction.category || [],
      is_active: true
    };
  }

  /**
   * Save or update recurring transaction pattern
   */
  private async upsertRecurringTransaction(userId: string, pattern: Partial<RecurringTransaction>): Promise<void> {
    try {
      const upsertData = {
        user_id: userId,
        merchant_name: pattern.merchant_name!,
        normalized_merchant: pattern.normalized_merchant!,
        amount_average: pattern.amount_average!,
        amount_variance: pattern.amount_variance || 0,
        frequency_days: pattern.frequency_days!,
        confidence_score: pattern.confidence_score || 0,
        occurrence_count: pattern.occurrence_count || 0,
        last_transaction_date: pattern.last_transaction_date,
        next_expected_date: pattern.next_expected_date,
        category: pattern.category || [],
        is_active: pattern.is_active !== false
      };

      const { error } = await supabase
        .from('recurring_transactions')
        .upsert(upsertData);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to upsert recurring transaction:', error);
      throw error;
    }
  }

  /**
   * Get all recurring transactions for a user
   */
  async getRecurringTransactions(userId: string): Promise<RecurringTransaction[]> {
    try {
      // Check if user is authenticated before making the query
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || userId === 'user-id') {
        return [];
      }

      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('confidence_score', { ascending: false });

      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        category: Array.isArray(item.category) ? item.category : []
      })) as RecurringTransaction[];
    } catch (error) {
      console.error('Failed to get recurring transactions:', error);
      throw error;
    }
  }

  /**
   * Generate insights about upcoming recurring transactions
   */
  async getUpcomingRecurringInsights(userId: string): Promise<RecurringInsight[]> {
    try {
      // Check if user is authenticated before proceeding
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || userId === 'user-id') {
        return [];
      }

      const recurringTransactions = await this.getRecurringTransactions(user.id);
      const insights: RecurringInsight[] = [];
      const today = new Date();

      recurringTransactions.forEach(recurring => {
        const nextDate = new Date(recurring.next_expected_date);
        const daysAway = Math.floor((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Only include upcoming items within next 30 days
        if (daysAway >= -3 && daysAway <= 30) {
          let type: RecurringInsight['type'] = 'upcoming_bill';
          let reason = '';

          if (daysAway < 0) {
            type = 'overdue_payment';
            reason = `${recurring.normalized_merchant} payment is ${Math.abs(daysAway)} days overdue`;
          } else if (daysAway <= 3) {
            reason = `${recurring.normalized_merchant} payment due in ${daysAway} days`;
          } else if (daysAway <= 7) {
            reason = `${recurring.normalized_merchant} payment due next week`;
          } else {
            reason = `${recurring.normalized_merchant} payment due in ${daysAway} days`;
          }

          // Check if it's likely a salary/income
          if (recurring.category.includes('Payroll') || recurring.category.includes('Deposit')) {
            type = 'salary_expected';
            reason = `Expected ${recurring.normalized_merchant} deposit in ${daysAway} days`;
          }

          insights.push({
            id: recurring.id,
            type,
            merchant: recurring.normalized_merchant,
            amount: recurring.amount_average,
            daysAway,
            confidence: recurring.confidence_score,
            reason
          });
        }
      });

      return insights.sort((a, b) => a.daysAway - b.daysAway);
    } catch (error) {
      console.error('Failed to get recurring insights:', error);
      throw error;
    }
  }

  /**
   * Update recurring transaction confidence based on user feedback
   */
  async updateConfidence(recurringId: string, isCorrect: boolean): Promise<void> {
    try {
      const { data: current, error: fetchError } = await supabase
        .from('recurring_transactions')
        .select('confidence_score')
        .eq('id', recurringId)
        .single();

      if (fetchError) throw fetchError;

      // Adjust confidence based on feedback
      const adjustment = isCorrect ? 0.1 : -0.2;
      const newConfidence = Math.max(0, Math.min(1, current.confidence_score + adjustment));

      const { error } = await supabase
        .from('recurring_transactions')
        .update({ confidence_score: newConfidence })
        .eq('id', recurringId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update confidence:', error);
      throw error;
    }
  }
}

export const recurringTransactionService = new RecurringTransactionService();