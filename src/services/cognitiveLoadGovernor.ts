/**
 * P14 - Cognitive Load Governor
 * Manages nudge budgets and fatigue-aware cooldowns
 */

import type { BudgetResult } from '@/types/cognitiveLoad';
import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';

export interface NudgeRequest {
  id: string;
  domain: string;
  type: string;
  content: string;
  urgency: 'low' | 'medium' | 'high';
  userId: string;
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

  checkBudget(request: NudgeRequest): BudgetResult {
    if (!isFeatureEnabled('loadGovernor')) {
      return { allowed: true, reason: 'feature_disabled' };
    }

    const budgets = this.getBudgets();
    const domainBudget = budgets[request.domain];

    if (!domainBudget || domainBudget.remaining > 0) {
      return { allowed: true, reason: 'budget_available' };
    }

    return { 
      allowed: false, 
      reason: 'budget_exceeded',
      suggestRecap: true
    };
  }

  consumeBudget(request: NudgeRequest, engaged: boolean = true): void {
    if (!isFeatureEnabled('loadGovernor')) return;

    const budgets = this.getBudgets();
    if (budgets[request.domain]) {
      budgets[request.domain].used += 1;
      budgets[request.domain].remaining -= 1;
      this.saveBudgets(budgets);
    }
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