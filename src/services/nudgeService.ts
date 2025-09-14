/**
 * Nudge Service - Intelligent nudge delivery with crisis safety integration
 */

import { cognitiveLoadGovernor } from './cognitiveLoadGovernor';
import { crisisDetectionService } from './crisisDetectionService';
import { isFeatureEnabled } from '@/config/flags';
import { polishCopy } from '@/utils/copyPolish';

export interface NudgeContext {
  userId: string;
  domain: string;
  nudgeType: string;
  urgency: 'low' | 'medium' | 'high';
  content: string;
  triggers?: string[];
}

export interface NudgeResponse {
  allowed: boolean;
  reason?: string;
  suggestedDelay?: number;
  becauseText?: string;
}

class NudgeService {
  private static instance: NudgeService;
  
  static getInstance(): NudgeService {
    if (!NudgeService.instance) {
      NudgeService.instance = new NudgeService();
    }
    return NudgeService.instance;
  }

  /**
   * Check if a nudge should be delivered, considering crisis state and cognitive load
   */
  async shouldDeliverNudge(context: NudgeContext): Promise<NudgeResponse> {
    try {
      // Check if nudging is enabled
      if (!isFeatureEnabled('cbtAssist')) {
        return {
          allowed: false,
          reason: 'CBT assistance disabled'
        };
      }

      // Crisis safety check - highest priority
      const crisisState = crisisDetectionService.getCurrentState();
      if (crisisState.isActive || crisisDetectionService.shouldSuppressNudges()) {
        return {
          allowed: false,
          reason: 'Crisis mode active - nudges suppressed for safety',
          becauseText: 'We\'ve paused suggestions to give you space. Support resources are available if needed.'
        };
      }

      // Cognitive load check
      const budgetResult = cognitiveLoadGovernor.checkBudget(context);
      if (!budgetResult.allowed) {
        return {
          allowed: false,
          reason: budgetResult.reason,
          suggestedDelay: budgetResult.suggestedDelay,
          becauseText: budgetResult.becauseText
        };
      }

      // Context-specific validations
      if (this.isQuietHours()) {
        return {
          allowed: false,
          reason: 'Quiet hours active',
          suggestedDelay: this.getNextActiveHour(),
          becauseText: 'Waiting for your active hours to respect your schedule.'
        };
      }

      // All checks passed
      return {
        allowed: true,
        becauseText: this.generateBecauseText(context, budgetResult)
      };

    } catch (error) {
      console.error('Error in nudge delivery check:', error);
      return {
        allowed: false,
        reason: 'Safety check failed'
      };
    }
  }

  /**
   * Deliver a nudge and record the interaction
   */
  async deliverNudge(context: NudgeContext): Promise<boolean> {
    const response = await this.shouldDeliverNudge(context);
    
    if (!response.allowed) {
      return false;
    }

    try {
      // Polish the nudge content
      const polishedContent = polishCopy(context.content, 'general');

      // Record the nudge attempt
      cognitiveLoadGovernor.consumeBudget(context, true);

      // Here you would implement the actual nudge delivery
      // (toast, notification, etc.)
      console.log('Nudge delivered:', {
        content: polishedContent,
        because: response.becauseText
      });

      return true;

    } catch (error) {
      console.error('Error delivering nudge:', error);
      
      // Record as failed attempt
      cognitiveLoadGovernor.consumeBudget(context, false);
      return false;
    }
  }

  /**
   * Record nudge dismissal for learning
   */
  recordNudgeDismissal(context: NudgeContext, reason?: string): void {
    try {
      cognitiveLoadGovernor.consumeBudget(context, false);
      
      // If multiple rapid dismissals, report fatigue
      const recentDismissals = this.getRecentDismissals(context.userId);
      if (recentDismissals >= 3) {
        cognitiveLoadGovernor.reportNudgeFatigue(context.userId, 'medium');
      }

    } catch (error) {
      console.error('Error recording nudge dismissal:', error);
    }
  }

  private generateBecauseText(context: NudgeContext, budgetResult: any): string {
    const reasons = [];
    
    if (context.triggers?.length) {
      reasons.push(`Based on ${context.triggers.join(', ')}`);
    }
    
    if (budgetResult.remainingBudget) {
      reasons.push(`Good timing (${budgetResult.remainingBudget} suggestions remaining today)`);
    }
    
    return reasons.length > 0 
      ? `Because: ${reasons.join(', ')}.`
      : 'Because: This seems like a good time for a gentle suggestion.';
  }

  private isQuietHours(): boolean {
    const hour = new Date().getHours();
    return hour < 7 || hour > 22; // 10 PM to 7 AM
  }

  private getNextActiveHour(): number {
    const now = new Date();
    const hour = now.getHours();
    
    if (hour < 7) {
      // Before 7 AM - wait until 7 AM
      const nextActive = new Date(now);
      nextActive.setHours(7, 0, 0, 0);
      return nextActive.getTime() - now.getTime();
    } else {
      // After 10 PM - wait until 7 AM next day
      const nextActive = new Date(now);
      nextActive.setDate(nextActive.getDate() + 1);
      nextActive.setHours(7, 0, 0, 0);
      return nextActive.getTime() - now.getTime();
    }
  }

  private getRecentDismissals(userId: string): number {
    try {
      const dismissals = localStorage.getItem(`nudge_dismissals_${userId}`);
      if (!dismissals) return 0;
      
      const data = JSON.parse(dismissals);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      return data.filter((timestamp: number) => timestamp > oneHourAgo).length;
    } catch {
      return 0;
    }
  }
}

export const nudgeService = NudgeService.getInstance();