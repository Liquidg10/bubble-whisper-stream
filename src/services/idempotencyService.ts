/**
 * Idempotency Service - Prevent duplicate event writes
 * Generate idempotency keys and detect double-submits
 */

import { supabase } from '@/integrations/supabase/client';
import { devLog } from '@/devtools/devLog';

export interface IdempotencyKey {
  id: string;
  key: string;
  operation: 'calendar_event' | 'email_draft' | 'finance_transaction';
  operationId: string;
  userId?: string;
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, any>;
}

export interface IdempotencyViolation {
  key: string;
  operation: string;
  firstAttempt: number;
  duplicateAttempt: number;
  operationId: string;
  metadata?: Record<string, any>;
}

export interface IdempotencyReport {
  timestamp: number;
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  violations: IdempotencyViolation[];
  operationStats: Record<string, number>;
}

class IdempotencyService {
  private keys: Map<string, IdempotencyKey> = new Map();
  private violations: IdempotencyViolation[] = [];
  private readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate idempotency key for calendar event creation
   */
  generateCalendarEventKey(eventData: {
    title: string;
    startTime: string;
    calendarId: string;
    userId?: string;
  }): string {
    const keyContent = `calendar:${eventData.calendarId}:${eventData.title}:${eventData.startTime}:${eventData.userId || 'anonymous'}`;
    const key = this.hashKey(keyContent);
    
    this.storeKey(key, 'calendar_event', keyContent, eventData.userId, eventData);
    return key;
  }

  /**
   * Generate idempotency key for email draft creation
   */
  generateEmailDraftKey(draftData: {
    to: string;
    subject: string;
    threadId?: string;
    userId?: string;
  }): string {
    const keyContent = `email:${draftData.to}:${draftData.subject}:${draftData.threadId || 'new'}:${draftData.userId || 'anonymous'}`;
    const key = this.hashKey(keyContent);
    
    this.storeKey(key, 'email_draft', keyContent, draftData.userId, draftData);
    return key;
  }

  /**
   * Check if operation is idempotent (already performed)
   */
  checkIdempotency(key: string, operationId: string): { isIdempotent: boolean; violation?: IdempotencyViolation } {
    const existingKey = this.keys.get(key);
    
    if (!existingKey) {
      return { isIdempotent: false };
    }

    // Check if key has expired
    if (Date.now() > existingKey.expiresAt) {
      this.keys.delete(key);
      return { isIdempotent: false };
    }

    // If it's the same operation ID, it's a retry (allowed)
    if (existingKey.operationId === operationId) {
      devLog('idempotency', `Retry detected for key ${key}`);
      return { isIdempotent: false };
    }

    // Different operation ID = violation
    const violation: IdempotencyViolation = {
      key,
      operation: existingKey.operation,
      firstAttempt: existingKey.createdAt,
      duplicateAttempt: Date.now(),
      operationId,
      metadata: existingKey.metadata,
    };

    this.violations.push(violation);
    
    devLog('idempotency', `Duplicate operation detected: ${key}`);
    console.warn('🚨 Idempotency Violation:', violation);
    
    return { 
      isIdempotent: true, 
      violation 
    };
  }

  /**
   * Test double-submit prevention
   */
  async testDoubleSubmitPrevention(): Promise<{
    passed: boolean;
    violations: IdempotencyViolation[];
    testResults: Array<{ test: string; passed: boolean; reason?: string }>;
  }> {
    const testResults = [];
    const initialViolations = this.violations.length;

    // Test 1: Same calendar event twice
    const calendarKey1 = this.generateCalendarEventKey({
      title: 'Test Meeting',
      startTime: '2024-01-15T10:00:00Z',
      calendarId: 'primary',
      userId: 'test-user',
    });
    
    const result1 = this.checkIdempotency(calendarKey1, 'op-1');
    const result2 = this.checkIdempotency(calendarKey1, 'op-2'); // Different operation ID
    
    testResults.push({
      test: 'Calendar event double-submit',
      passed: !result1.isIdempotent && result2.isIdempotent,
      reason: result2.isIdempotent ? 'Duplicate correctly detected' : 'Duplicate not detected',
    });

    // Test 2: Same email draft twice
    const emailKey1 = this.generateEmailDraftKey({
      to: 'test@example.com',
      subject: 'Test Email',
      userId: 'test-user',
    });
    
    const result3 = this.checkIdempotency(emailKey1, 'email-op-1');
    const result4 = this.checkIdempotency(emailKey1, 'email-op-2');
    
    testResults.push({
      test: 'Email draft double-submit',
      passed: !result3.isIdempotent && result4.isIdempotent,
      reason: result4.isIdempotent ? 'Duplicate correctly detected' : 'Duplicate not detected',
    });

    // Test 3: Retry with same operation ID (should be allowed)
    const retryResult = this.checkIdempotency(calendarKey1, 'op-1'); // Same operation ID
    
    testResults.push({
      test: 'Retry with same operation ID',
      passed: !retryResult.isIdempotent,
      reason: retryResult.isIdempotent ? 'Retry incorrectly blocked' : 'Retry correctly allowed',
    });

    const newViolations = this.violations.slice(initialViolations);
    
    return {
      passed: testResults.every(t => t.passed),
      violations: newViolations,
      testResults,
    };
  }

  /**
   * Get idempotency report
   */
  getReport(): IdempotencyReport {
    const now = Date.now();
    const activeKeys = Array.from(this.keys.values()).filter(k => k.expiresAt > now);
    const expiredKeys = Array.from(this.keys.values()).filter(k => k.expiresAt <= now);
    
    // Count operations by type
    const operationStats: Record<string, number> = {};
    activeKeys.forEach(key => {
      operationStats[key.operation] = (operationStats[key.operation] || 0) + 1;
    });

    return {
      timestamp: now,
      totalKeys: this.keys.size,
      activeKeys: activeKeys.length,
      expiredKeys: expiredKeys.length,
      violations: [...this.violations],
      operationStats,
    };
  }

  /**
   * Clean up expired keys
   */
  cleanupExpiredKeys(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.keys.entries()) {
      if (value.expiresAt <= now) {
        this.keys.delete(key);
        cleaned++;
      }
    }
    
    devLog('idempotency', `Cleaned up ${cleaned} expired keys`);
    return cleaned;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.keys.clear();
    this.violations = [];
  }

  /**
   * Export idempotency data
   */
  exportData(): string {
    const report = this.getReport();
    return JSON.stringify({
      report,
      allKeys: Array.from(this.keys.values()),
    }, null, 2);
  }

  private storeKey(
    key: string, 
    operation: IdempotencyKey['operation'], 
    operationId: string, 
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const idempotencyKey: IdempotencyKey = {
      id: crypto.randomUUID(),
      key,
      operation,
      operationId,
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.DEFAULT_TTL_MS,
      metadata,
    };

    this.keys.set(key, idempotencyKey);
    devLog('idempotency', `Stored key for ${operation}: ${key}`);
  }

  private hashKey(content: string): string {
    // Simple hash for demo - in production use crypto.subtle.digest
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `idem_${Math.abs(hash).toString(36)}`;
  }
}

export const idempotencyService = new IdempotencyService();