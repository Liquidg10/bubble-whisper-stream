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
  private readonly COOLDOWN_KEY = 'cognitive_load_cooldowns';
  private readonly FATIGUE_KEY = 'nudge_fatigue_reports';
  
  private readonly DEFAULT_BUDGETS: Record<string, number> = {
    planning: 2,
    calendar: 3,
    email: 4,
    cbt: 2,
    general: 3
  };

  private readonly COOLDOWN_RULES = {
    dismissal: { baseMinutes: 60, extensionFactor: 1.5, maxMinutes: 480 },
    budget_exceeded: { baseMinutes: 30, extensionFactor: 1.2, maxMinutes: 240 },
    overwhelm: { baseMinutes: 120, extensionFactor: 2.0, maxMinutes: 720 }
  };

  checkBudget(context: CognitiveLoadContext): BudgetResult {
    return this.checkNudgeBudget(context);
  }

  checkNudgeBudget(context: CognitiveLoadContext): BudgetResult {
    if (!isFeatureEnabled('loadGovernor')) {
      return { allowed: true, reason: 'feature_disabled' };
    }

    // Check for active cooldowns first
    const cooldownResult = this.checkCooldowns(context);
    if (!cooldownResult.allowed) {
      return cooldownResult;
    }

    // Check for user overwhelm signals
    if (this.isUserOverwhelmed(context)) {
      this.applyCooldown(context.domain, 'overwhelm');
      return { 
        allowed: false, 
        reason: 'user_overwhelmed',
        cooldownUntil: Date.now() + (this.COOLDOWN_RULES.overwhelm.baseMinutes * 60 * 1000)
      };
    }

    const budgets = this.initializeBudgets();
    const domainBudget = budgets[context.domain];

    if (!domainBudget || domainBudget.remaining <= 0) {
      this.applyCooldown(context.domain, 'budget_exceeded');
      return { 
        allowed: false, 
        reason: 'budget_exceeded',
        suggestRecap: true,
        cooldownUntil: Date.now() + (this.COOLDOWN_RULES.budget_exceeded.baseMinutes * 60 * 1000)
      };
    }

    return { allowed: true, reason: 'budget_available' };
  }

  consumeBudget(context: CognitiveLoadContext, engaged: boolean = true): void {
    this.recordNudgeAttempt(context, engaged ? 'accepted' : 'dismissed');
  }

  async recordNudgeAttempt(context: CognitiveLoadContext, outcome: 'shown' | 'blocked' | 'dismissed' | 'accepted'): Promise<void> {
    if (!isFeatureEnabled('loadGovernor')) return;

    const budgets = this.initializeBudgets();
    const domainBudget = budgets[context.domain];
    
    if (domainBudget) {
      if (outcome === 'shown') {
        domainBudget.used += 1;
        domainBudget.remaining = Math.max(0, domainBudget.remaining - 1);
        domainBudget.lastNudge = Date.now();
      }
      
      if (outcome === 'dismissed') {
        domainBudget.dismissCount += 1;
        // Apply cooldown for dismissals (fatigue signal)
        this.applyCooldown(context.domain, 'dismissal');
      } else if (outcome === 'accepted') {
        domainBudget.acceptCount += 1;
      }

      this.saveBudgets(budgets);
    }

    // Log for analytics
    logger.info('Nudge attempt recorded', {
      domain: context.domain,
      type: context.nudgeType,
      outcome,
      urgency: context.urgency,
      timestamp: Date.now()
    });
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
    const cooldowns = this.getCooldowns();
    const now = Date.now();
    
    return Object.entries(cooldowns)
      .filter(([_, cooldown]) => cooldown.until > now)
      .map(([domain, cooldown]) => ({
        domain,
        reason: cooldown.reason,
        until: cooldown.until,
        duration: cooldown.until - now,
        canOverride: cooldown.reason !== 'overwhelm',
        extensionCount: cooldown.extensionCount || 0,
        baseMinutes: this.COOLDOWN_RULES[cooldown.reason as keyof typeof this.COOLDOWN_RULES]?.baseMinutes,
        extensionFactor: this.COOLDOWN_RULES[cooldown.reason as keyof typeof this.COOLDOWN_RULES]?.extensionFactor
      }));
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

  private initializeBudgets(): Record<string, DomainBudget> {
    const stored = this.getBudgets();
    const budgets: Record<string, DomainBudget> = {};
    
    // Initialize all domains with defaults
    Object.entries(this.DEFAULT_BUDGETS).forEach(([domain, limit]) => {
      budgets[domain] = {
        domain,
        dailyLimit: limit,
        used: stored[domain]?.used || 0,
        remaining: stored[domain]?.remaining ?? limit,
        cooldownUntil: stored[domain]?.cooldownUntil,
        lastNudge: stored[domain]?.lastNudge,
        dismissCount: stored[domain]?.dismissCount || 0,
        acceptCount: stored[domain]?.acceptCount || 0,
        weeklyOverNudges: stored[domain]?.weeklyOverNudges || 0
      };
    });
    
    return budgets;
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

  private checkCooldowns(context: CognitiveLoadContext): BudgetResult {
    const cooldowns = this.getCooldowns();
    const domainCooldown = cooldowns[context.domain];
    
    if (domainCooldown && domainCooldown.until > Date.now()) {
      return {
        allowed: false,
        reason: 'cooldown_active',
        cooldownUntil: domainCooldown.until
      };
    }
    
    return { allowed: true, reason: 'budget_available' };
  }

  private isUserOverwhelmed(context: CognitiveLoadContext): boolean {
    const budgets = this.getBudgets();
    const now = Date.now();
    const last30Min = now - (30 * 60 * 1000);
    
    // Check for rapid dismissals across domains
    const recentDismissals = Object.values(budgets).reduce((total: number, budget: any) => {
      const recentDismisses = budget.dismissCount || 0;
      return total + (budget.lastNudge > last30Min ? recentDismisses : 0);
    }, 0);
    
    // Overwhelm threshold: 3+ dismissals in 30 minutes
    return recentDismissals >= 3;
  }

  private applyCooldown(domain: string, reason: keyof typeof this.COOLDOWN_RULES): void {
    const cooldowns = this.getCooldowns();
    const rule = this.COOLDOWN_RULES[reason];
    
    const existingCooldown = cooldowns[domain];
    const extensionCount = existingCooldown?.extensionCount || 0;
    const baseMinutes = rule.baseMinutes * Math.pow(rule.extensionFactor, extensionCount);
    const finalMinutes = Math.min(baseMinutes, rule.maxMinutes);
    
    cooldowns[domain] = {
      until: Date.now() + (finalMinutes * 60 * 1000),
      reason,
      extensionCount: extensionCount + 1
    };
    
    this.saveCooldowns(cooldowns);
  }

  private getCooldowns(): Record<string, any> {
    try {
      const stored = localStorage.getItem(this.COOLDOWN_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private saveCooldowns(cooldowns: Record<string, any>): void {
    localStorage.setItem(this.COOLDOWN_KEY, JSON.stringify(cooldowns));
  }
}

export const cognitiveLoadGovernor = new CognitiveLoadGovernor();