import type { EmailMetadata, IntentClassification } from './gmailIntentClassifier';

export interface FinancialEmailClassification {
  isFinancial: boolean;
  confidence: number;
  financialType: 'bill' | 'receipt' | 'payment_notification' | 'bank_statement' | 'investment' | 'insurance' | 'tax' | 'other';
  amount?: number;
  merchant?: string;
  dueDate?: Date;
  category?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export class FinancialEmailClassifier {
  private financialKeywords = {
    bill: ['bill', 'invoice', 'payment due', 'amount due', 'overdue', 'final notice'],
    receipt: ['receipt', 'purchase', 'order confirmation', 'thank you for your order', 'payment confirmation'],
    payment_notification: ['payment processed', 'auto-pay', 'payment failed', 'payment declined', 'insufficient funds'],
    bank_statement: ['statement', 'account summary', 'balance', 'transaction history', 'monthly statement'],
    investment: ['portfolio', 'dividend', 'investment', 'stock', 'mutual fund', 'retirement'],
    insurance: ['premium', 'policy', 'claim', 'coverage', 'deductible'],
    tax: ['tax', 'irs', 'w-2', '1099', 'tax return', 'refund'],
  };

  private merchantPatterns = [
    /from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /([A-Z][A-Z\s]+)\s+bill/i,
    /invoice\s+from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];

  private amountPatterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*USD/,
    /amount[:\s]+\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
  ];

  private dueDatePatterns = [
    /due\s+(?:date\s+)?(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /payment\s+due\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /due\s+by\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
  ];

  classifyFinancialEmail(email: EmailMetadata, intentClassification?: IntentClassification): FinancialEmailClassification {
    const content = `${email.subject} ${email.snippet || ''}`.toLowerCase();
    
    let isFinancial = false;
    let financialType: FinancialEmailClassification['financialType'] = 'other';
    let confidence = 0;
    let maxTypeConfidence = 0;

    // Check each financial type
    for (const [type, keywords] of Object.entries(this.financialKeywords)) {
      const typeConfidence = this.calculateTypeConfidence(content, keywords);
      if (typeConfidence > maxTypeConfidence) {
        maxTypeConfidence = typeConfidence;
        financialType = type as FinancialEmailClassification['financialType'];
      }
    }

    // Base financial detection
    if (maxTypeConfidence > 0.3) {
      isFinancial = true;
      confidence = maxTypeConfidence;
    }

    // Boost confidence if email intent classification indicates financial activity
    if (intentClassification) {
      const financialIntents = ['bill_payment', 'expense_tracking', 'financial_planning'];
      if (financialIntents.includes(intentClassification.intent)) {
        isFinancial = true;
        confidence = Math.max(confidence, intentClassification.confidence);
      }
    }

    // Extract financial metadata
    const amount = this.extractAmount(content);
    const merchant = this.extractMerchant(email.subject);
    const dueDate = this.extractDueDate(content);
    const category = this.inferCategory(financialType, merchant);
    const urgency = this.calculateUrgency(financialType, dueDate, content);

    return {
      isFinancial,
      confidence,
      financialType,
      amount,
      merchant,
      dueDate,
      category,
      urgency,
    };
  }

  private calculateTypeConfidence(content: string, keywords: string[]): number {
    let matches = 0;
    let totalScore = 0;

    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        matches++;
        // Weight longer, more specific keywords higher
        totalScore += keyword.length / 10;
      }
    }

    return Math.min(1, (matches / keywords.length) * 0.7 + totalScore * 0.3);
  }

  private extractAmount(content: string): number | undefined {
    for (const pattern of this.amountPatterns) {
      const match = content.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (amount > 0) return amount;
      }
    }
    return undefined;
  }

  private extractMerchant(subject: string): string | undefined {
    for (const pattern of this.merchantPatterns) {
      const match = subject.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractDueDate(content: string): Date | undefined {
    for (const pattern of this.dueDatePatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          return new Date(match[1]);
        } catch {
          continue;
        }
      }
    }
    return undefined;
  }

  private inferCategory(type: string, merchant?: string): string | undefined {
    const categoryMap: Record<string, string> = {
      bill: 'Bills & Utilities',
      receipt: 'Shopping',
      payment_notification: 'Transfers',
      bank_statement: 'Banking',
      investment: 'Investment',
      insurance: 'Insurance',
      tax: 'Taxes',
    };

    if (merchant) {
      // Add merchant-specific category logic here
      const lowerMerchant = merchant.toLowerCase();
      if (lowerMerchant.includes('electric') || lowerMerchant.includes('gas') || lowerMerchant.includes('water')) {
        return 'Utilities';
      }
      if (lowerMerchant.includes('netflix') || lowerMerchant.includes('spotify') || lowerMerchant.includes('subscription')) {
        return 'Subscriptions';
      }
    }

    return categoryMap[type];
  }

  private calculateUrgency(type: string, dueDate?: Date, content?: string): 'low' | 'medium' | 'high' | 'critical' {
    if (content && (content.includes('overdue') || content.includes('final notice') || content.includes('payment failed'))) {
      return 'critical';
    }

    if (dueDate) {
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue < 0) return 'critical';
      if (daysUntilDue <= 3) return 'high';
      if (daysUntilDue <= 7) return 'medium';
    }

    if (type === 'bill' || type === 'payment_notification') {
      return 'medium';
    }

    return 'low';
  }
}

export const financialEmailClassifier = new FinancialEmailClassifier();