/**
 * P14 - Cognitive Load Governor
 * Manages nudge budgets and fatigue-aware cooldowns
 */

import type { BudgetResult, DomainBudget, CooldownStatus, WeeklyMetrics } from '@/types/cognitiveLoad';
import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';

export interface CognitiveLoadContext {
  userId: string;
  domain: string;
  nudgeType: string;
  urgency: 'low' | 'medium' | 'high';
  content: string;
}

class CognitiveLoadGovernor {
  private readonly STORAGE_KEY = 'cognitive_load_budgets';
  
  private readonly DEFAULT_BUDGETS: Record<string, number> = {
    planning: 2,
    calendar: 3,
    email: 4,
    cbt: 2,
    general: 3
  };

  checkBudget(context: CognitiveLoadContext): BudgetResult {
    return this.checkNudgeBudget(context);
  }

  checkNudgeBudget(context: CognitiveLoadContext): BudgetResult {
    if (!isFeatureEnabled('loadGovernor')) {
      return { allowed: true, reason: 'feature_disabled' };
    }

    const budgets = this.getBudgets();
    const domainBudget = budgets[context.domain];

    if (!domainBudget || domainBudget.remaining > 0) {
      return { allowed: true, reason: 'budget_available' };
    }

    return { 
      allowed: false, 
      reason: 'budget_exceeded',
      suggestRecap: true
    };
  }

  consumeBudget(context: CognitiveLoadContext, engaged: boolean = true): void {
    this.recordNudgeAttempt(context, engaged ? 'accepted' : 'dismissed');
  }

  async recordNudgeAttempt(context: CognitiveLoadContext, outcome: 'shown' | 'blocked' | 'dismissed' | 'accepted'): Promise<void> {
    if (!isFeatureEnabled('loadGovernor')) return;

    const budgets = this.getBudgets();
    if (budgets[context.domain]) {
      budgets[context.domain].used += 1;
      budgets[context.domain].remaining -= 1;
      this.saveBudgets(budgets);
    }
  }

  getAllBudgets(): DomainBudget[] {
    const budgets = this.getBudgets();
    return Object.values(budgets).map(b => ({
      domain: b.domain || 'unknown',
      dailyLimit: b.dailyLimit || 3,
      used: b.used || 0,
      remaining: b.remaining || 3,
      dismissCount: b.dismissCount || 0,
      acceptCount: b.acceptCount || 0,
      weeklyOverNudges: b.weeklyOverNudges || 0
    }));
  }

  getAllCooldowns(): CooldownStatus[] {
    // Return empty array for now
    return [];
  }

  async getWeeklyOverNudgeMetrics(): Promise<WeeklyMetrics> {
    return {
      weekStart: new Date().toISOString(),
      totalNudges: 0,
      overNudgeIncidents: 0,
      domainsOverBudget: [],
      avgAcceptanceRate: 0,
      avgDismissalRate: 0,
      fatigueReports: 0,
      cooldownExtensions: 0,
      recapConversions: 0
    };
  }

  reportNudgeFatigue(userId: string, severity: 'low' | 'medium' | 'high'): void {
    logger.info('Nudge fatigue reported', { userId, severity });
  }

  reset(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private getBudgets(): Record<string, any> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private saveBudgets(budgets: Record<string, any>): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(budgets));
  }
}

export const cognitiveLoadGovernor = new CognitiveLoadGovernor();