/**
 * P5 Enhanced - Receipt Processing Service
 * Implements Bible features: line-item OCR, financial categorization, confidence scoring
 */

import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';
import type { Task } from '@/types/task';

export interface ReceiptLineItem {
  name: string;
  price: number;
  quantity?: number;
  category?: string;
  confidence: number;
  metadata?: {
    unitPrice?: number;
    taxApplicable?: boolean;
    discounted?: boolean;
  };
}

export interface ReceiptData {
  id: string;
  imageUrl: string;
  processedAt: number;
  merchant: {
    name: string;
    address?: string;
    phone?: string;
    confidence: number;
  };
  totals: {
    subtotal: number;
    tax: number;
    tip?: number;
    total: number;
    confidence: number;
  };
  lineItems: ReceiptLineItem[];
  paymentMethod?: {
    type: 'cash' | 'card' | 'digital';
    lastFour?: string;
  };
  date: {
    transactionDate: Date;
    confidence: number;
  };
  categories: {
    primary: string;
    secondary?: string;
    confidence: number;
  };
  rawOcrText: string;
  processingDuration: number;
}

export interface FinancialCategories {
  groceries: { keywords: string[]; priority: number };
  restaurants: { keywords: string[]; priority: number };
  gas: { keywords: string[]; priority: number };
  shopping: { keywords: string[]; priority: number };
  healthcare: { keywords: string[]; priority: number };
  utilities: { keywords: string[]; priority: number };
  transport: { keywords: string[]; priority: number };
  entertainment: { keywords: string[]; priority: number };
  business: { keywords: string[]; priority: number };
  miscellaneous: { keywords: string[]; priority: number };
}

class EnhancedReceiptService {
  private readonly CONFIDENCE_THRESHOLDS = {
    high: 0.85,
    medium: 0.65,
    low: 0.45
  };

  private readonly FINANCIAL_CATEGORIES: FinancialCategories = {
    groceries: {
      keywords: ['supermarket', 'grocery', 'food', 'walmart', 'target', 'costco', 'safeway'],
      priority: 1
    },
    restaurants: {
      keywords: ['restaurant', 'cafe', 'bar', 'pizza', 'mcdonalds', 'starbucks', 'dining'],
      priority: 1
    },
    gas: {
      keywords: ['gas', 'fuel', 'shell', 'chevron', 'exxon', 'bp', 'station'],
      priority: 2
    },
    shopping: {
      keywords: ['amazon', 'store', 'retail', 'mall', 'clothing', 'electronics'],
      priority: 2
    },
    healthcare: {
      keywords: ['pharmacy', 'medical', 'doctor', 'hospital', 'cvs', 'walgreens'],
      priority: 1
    },
    utilities: {
      keywords: ['electric', 'water', 'gas bill', 'internet', 'phone', 'utility'],
      priority: 1
    },
    transport: {
      keywords: ['uber', 'lyft', 'taxi', 'bus', 'train', 'parking', 'tolls'],
      priority: 2
    },
    entertainment: {
      keywords: ['movie', 'theater', 'game', 'music', 'subscription', 'netflix'],
      priority: 3
    },
    business: {
      keywords: ['office', 'supplies', 'conference', 'travel', 'hotel', 'meeting'],
      priority: 2
    },
    miscellaneous: {
      keywords: [],
      priority: 4
    }
  };

  async processReceipt(imageFile: File): Promise<ReceiptData> {
    const startTime = Date.now();
    
    if (!isFeatureEnabled('receiptProcessing')) {
      throw new Error('Receipt processing is disabled');
    }

    try {
      // Step 1: Extract raw text using OCR
      const rawOcrText = await this.performOCR(imageFile);
      
      // Step 2: Parse structured data from OCR text
      const structuredData = await this.parseReceiptText(rawOcrText);
      
      // Step 3: Extract line items with confidence scoring
      const lineItems = this.extractLineItems(rawOcrText, structuredData);
      
      // Step 4: Categorize the purchase
      const categories = this.categorizeReceipt(structuredData.merchant, lineItems);
      
      // Step 5: Validate and score confidence
      const validatedData = this.validateAndScore(structuredData, lineItems, categories);

      const receiptData: ReceiptData = {
        id: crypto.randomUUID(),
        imageUrl: URL.createObjectURL(imageFile),
        processedAt: Date.now(),
        merchant: validatedData.merchant,
        totals: validatedData.totals,
        lineItems: validatedData.lineItems,
        paymentMethod: validatedData.paymentMethod,
        date: validatedData.date,
        categories,
        rawOcrText,
        processingDuration: Date.now() - startTime
      };

      logger.info('Receipt processed successfully', {
        receiptId: receiptData.id,
        merchant: receiptData.merchant.name,
        total: receiptData.totals.total,
        itemCount: receiptData.lineItems.length,
        category: receiptData.categories.primary,
        confidence: receiptData.categories.confidence,
        processingTime: receiptData.processingDuration
      });

      return receiptData;

    } catch (error) {
      logger.error('Receipt processing failed', {
        error: error.message,
        fileName: imageFile.name,
        fileSize: imageFile.size
      });
      throw error;
    }
  }

  async integrateWithTask(receiptData: ReceiptData, taskId?: string): Promise<Task | null> {
    if (!taskId) {
      // Create new task for this receipt
      return this.createTaskFromReceipt(receiptData);
    } else {
      // Enhance existing task with receipt data
      return this.enhanceTaskWithReceipt(taskId, receiptData);
    }
  }

  generateBudgetInsights(receipts: ReceiptData[], timeframe: 'week' | 'month'): {
    totalSpending: number;
    categoryBreakdown: Record<string, { amount: number; count: number; avgPerTransaction: number }>;
    trends: {
      category: string;
      change: number;
      direction: 'up' | 'down' | 'stable';
    }[];
    alerts: string[];
  } {
    const totalSpending = receipts.reduce((sum, r) => sum + r.totals.total, 0);
    
    const categoryBreakdown: Record<string, { amount: number; count: number; avgPerTransaction: number }> = {};
    
    receipts.forEach(receipt => {
      const category = receipt.categories.primary;
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { amount: 0, count: 0, avgPerTransaction: 0 };
      }
      categoryBreakdown[category].amount += receipt.totals.total;
      categoryBreakdown[category].count += 1;
    });

    // Calculate averages
    Object.keys(categoryBreakdown).forEach(category => {
      const data = categoryBreakdown[category];
      data.avgPerTransaction = data.amount / data.count;
    });

    const alerts: string[] = [];
    
    // Generate spending alerts
    if (totalSpending > 500 && timeframe === 'week') {
      alerts.push('Weekly spending above $500 threshold');
    }
    
    const grocerySpending = categoryBreakdown.groceries?.amount || 0;
    if (grocerySpending > 200 && timeframe === 'week') {
      alerts.push('Grocery spending higher than usual this week');
    }

    return {
      totalSpending,
      categoryBreakdown,
      trends: [], // Would calculate trends vs previous period
      alerts
    };
  }

  private async performOCR(imageFile: File): Promise<string> {
    // Mock OCR implementation - would use actual OCR service
    // like Google Vision API, AWS Textract, or Tesseract.js
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulated OCR text extraction
        resolve(`
          WHOLE FOODS MARKET
          1234 Main Street
          Anytown, ST 12345
          (555) 123-4567
          
          Date: 03/15/2024
          Time: 14:32
          
          ORGANIC BANANAS        $3.99
          BREAD - WHOLE WHEAT    $4.49
          MILK - ORGANIC 1%      $5.99
          CHICKEN BREAST         $12.99
          SALAD GREENS           $2.99
          
          SUBTOTAL:             $30.45
          TAX:                  $2.74
          TOTAL:                $33.19
          
          PAYMENT: VISA ****1234
          THANK YOU!
        `);
      }, 1000);
    });
  }

  private async parseReceiptText(ocrText: string): Promise<any> {
    const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line);
    
    // Extract merchant info
    const merchant = {
      name: lines[0] || 'Unknown Merchant',
      address: lines.slice(1, 4).join(', '),
      phone: lines.find(line => line.match(/\(\d{3}\)\s?\d{3}-\d{4}/))
    };

    // Extract totals
    const subtotalMatch = ocrText.match(/SUBTOTAL:?\s*\$?(\d+\.?\d*)/i);
    const taxMatch = ocrText.match(/TAX:?\s*\$?(\d+\.?\d*)/i);
    const totalMatch = ocrText.match(/TOTAL:?\s*\$?(\d+\.?\d*)/i);

    const totals = {
      subtotal: subtotalMatch ? parseFloat(subtotalMatch[1]) : 0,
      tax: taxMatch ? parseFloat(taxMatch[1]) : 0,
      total: totalMatch ? parseFloat(totalMatch[1]) : 0
    };

    // Extract date
    const dateMatch = ocrText.match(/Date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const transactionDate = dateMatch ? new Date(dateMatch[1]) : new Date();

    // Extract payment method
    const paymentMatch = ocrText.match(/(VISA|MASTERCARD|AMEX|DISCOVER)\s*\*+(\d{4})/i);
    const paymentMethod = paymentMatch ? {
      type: 'card' as const,
      lastFour: paymentMatch[2]
    } : undefined;

    return {
      merchant,
      totals,
      date: transactionDate,
      paymentMethod
    };
  }

  private extractLineItems(ocrText: string, structuredData: any): ReceiptLineItem[] {
    const lines = ocrText.split('\n').map(line => line.trim());
    const lineItems: ReceiptLineItem[] = [];

    // Look for lines with item name and price pattern
    const itemPattern = /^(.+?)\s+\$?(\d+\.?\d*)$/;
    
    lines.forEach(line => {
      const match = line.match(itemPattern);
      if (match && !this.isHeaderOrFooter(line)) {
        const [, name, priceStr] = match;
        const price = parseFloat(priceStr);
        
        if (price > 0 && price < 1000) { // Reasonable bounds
          lineItems.push({
            name: name.trim(),
            price,
            category: this.categorizeLineItem(name),
            confidence: this.calculateLineItemConfidence(name, price)
          });
        }
      }
    });

    return lineItems;
  }

  private categorizeReceipt(merchant: any, lineItems: ReceiptLineItem[]): {
    primary: string;
    secondary?: string;
    confidence: number;
  } {
    const merchantName = merchant.name.toLowerCase();
    
    // Check merchant name against category keywords
    for (const [category, config] of Object.entries(this.FINANCIAL_CATEGORIES)) {
      for (const keyword of config.keywords) {
        if (merchantName.includes(keyword.toLowerCase())) {
          return {
            primary: category,
            confidence: 0.85
          };
        }
      }
    }

    // Fallback to line item analysis
    const categoryScores: Record<string, number> = {};
    
    lineItems.forEach(item => {
      if (item.category) {
        categoryScores[item.category] = (categoryScores[item.category] || 0) + item.price;
      }
    });

    const primaryCategory = Object.entries(categoryScores)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'miscellaneous';

    return {
      primary: primaryCategory,
      confidence: 0.6
    };
  }

  private categorizeLineItem(itemName: string): string {
    const name = itemName.toLowerCase();
    
    if (name.includes('bread') || name.includes('milk') || name.includes('banana') || 
        name.includes('chicken') || name.includes('beef') || name.includes('vegetable')) {
      return 'groceries';
    }
    
    if (name.includes('gas') || name.includes('fuel')) {
      return 'gas';
    }
    
    return 'miscellaneous';
  }

  private calculateLineItemConfidence(name: string, price: number): number {
    let confidence = 0.5;
    
    // Higher confidence for reasonable prices
    if (price >= 1 && price <= 100) confidence += 0.2;
    
    // Higher confidence for common item names
    if (name.length > 3 && name.length < 50) confidence += 0.2;
    
    // Higher confidence for recognizable patterns
    if (/^[A-Z\s-]+$/.test(name)) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  private isHeaderOrFooter(line: string): boolean {
    const headerFooterPatterns = [
      /thank you/i,
      /receipt/i,
      /date:/i,
      /time:/i,
      /total:/i,
      /subtotal:/i,
      /tax:/i,
      /payment:/i,
      /\(\d{3}\)/,
      /store/i
    ];
    
    return headerFooterPatterns.some(pattern => pattern.test(line));
  }

  private validateAndScore(structuredData: any, lineItems: ReceiptLineItem[], categories: any): any {
    // Validate totals match line items
    const lineItemTotal = lineItems.reduce((sum, item) => sum + item.price, 0);
    const totalDifference = Math.abs(lineItemTotal - structuredData.totals.subtotal);
    const totalConfidence = totalDifference < 2 ? 0.9 : 0.6;

    return {
      merchant: {
        ...structuredData.merchant,
        confidence: 0.8
      },
      totals: {
        ...structuredData.totals,
        confidence: totalConfidence
      },
      lineItems,
      paymentMethod: structuredData.paymentMethod,
      date: {
        transactionDate: structuredData.date,
        confidence: 0.9
      }
    };
  }

  private async createTaskFromReceipt(receiptData: ReceiptData): Promise<Task> {
    const task: Omit<Task, 'id'> = {
      type: 'task',
      title: `Review receipt: ${receiptData.merchant.name} - $${receiptData.totals.total}`,
      description: `Receipt from ${receiptData.merchant.name} for $${receiptData.totals.total}`,
      completed: false,
      priority: 30,
      tags: [
        { id: crypto.randomUUID(), name: 'receipt', emoji: '🧾' },
        { id: crypto.randomUUID(), name: receiptData.categories.primary, emoji: '💰' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

    return { ...task, id: crypto.randomUUID() };
  }

  private async enhanceTaskWithReceipt(taskId: string, receiptData: ReceiptData): Promise<Task | null> {
    // This would fetch and update an existing task
    // For now, return null to indicate not implemented
    return null;
  }
}

export const enhancedReceiptService = new EnhancedReceiptService();