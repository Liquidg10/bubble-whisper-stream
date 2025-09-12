/**
 * P14 Cognitive Load Governor - Central orchestrator for nudge budgets and cooldowns
 * Prevents over-nudging through budget enforcement and adaptive cooldowns
 */

import { isFeatureEnabled } from '@/config/flags';
import type { NudgeRecap, BlockedNudge, CooldownStatus, BudgetResult, WeeklyMetrics } from '@/types/cognitiveLoad';

export interface CognitiveLoadContext {
  userId: string;
  domain: string;
  nudgeType: string;
  urgency: 'low' | 'medium' | 'high';
  content: string;
  metadata?: Record<string, any>;
}

export interface DomainBudget {
  domain: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  cooldownUntil?: number;
  lastNudge?: number;
  dismissCount: number;
  acceptCount: number;
  weeklyOverNudges: number;
}

class CognitiveLoadGovernor {
  private budgets: Map<string, DomainBudget> = new Map();
  private cooldowns: Map<string, CooldownStatus> = new Map();
  private weeklyMetrics: WeeklyMetrics[] = [];
  
  // Domain budget defaults
  private readonly DEFAULT_BUDGETS: Record<string, number> = {
    'cbt-assist': 2,
    'auto-write': 4,
    'planning': 2,
    'joy-celebration': 6,
    'context-nudge': 3,
    'productivity-coach': 2,
    'glimmer': 4,
    'reminder-adjust': 3,
    'calendar-sync': 2,
    'email-processing': 3
  };

  /**
   * Main budget enforcement check - called by all nudge sources
   */
  async checkNudgeBudget(context: CognitiveLoadContext): Promise<BudgetResult> {
    if (!isFeatureEnabled('loadGovernor')) {
      return { allowed: true, reason: 'feature_disabled' };
    }

    const budget = this.getBudgetForDomain(context.domain);
    const cooldown = this.getCooldownStatus(context.domain);
    
    // Check cooldown first
    if (cooldown && cooldown.until > Date.now()) {
      return {
        allowed: false,
        reason: 'cooldown_active',
        cooldownUntil: cooldown.until,
        suggestRecap: true
      };
    }
    
    // Check budget limit
    if (budget.remaining <= 0) {
      return {
        allowed: false,
        reason: 'budget_exceeded',
        cooldownUntil: this.calculateBudgetCooldown(context.domain),
        suggestRecap: true
      };
    }
    
    // Check if user is overwhelmed (cross-domain check)
    const overwhelmScore = this.calculateOverwhelmScore();
    if (overwhelmScore > 0.8 && context.urgency !== 'high') {
      return {
        allowed: false,
        reason: 'user_overwhelmed',
        cooldownUntil: Date.now() + (30 * 60 * 1000), // 30min cooldown
        suggestRecap: true
      };
    }
    
    return { allowed: true, reason: 'budget_available' };
  }

  /**
   * Record nudge attempt and outcome
   */
  async recordNudgeAttempt(
    context: CognitiveLoadContext,
    outcome: 'shown' | 'blocked' | 'dismissed' | 'accepted'
  ): Promise<void> {
    if (!isFeatureEnabled('loadGovernor')) return;

    const budget = this.getBudgetForDomain(context.domain);
    const now = Date.now();

    switch (outcome) {
      case 'shown':
        budget.used += 1;
        budget.remaining = Math.max(0, budget.remaining - 1);
        budget.lastNudge = now;
        break;
        
      case 'dismissed':
        budget.dismissCount += 1;
        // Apply adaptive cooldown
        await this.applyAdaptiveCooldown(context.domain, 'dismissal');
        break;
        
      case 'accepted':
        budget.acceptCount += 1;
        // Reduce cooldown for positive engagement
        await this.reduceAdaptiveCooldown(context.domain);
        break;
        
      case 'blocked':
        // Track over-nudge incidents
        budget.weeklyOverNudges += 1;
        break;
    }

    this.saveBudgetData();
    this.updateWeeklyMetrics();
  }

  /**
   * Convert blocked nudge to recap
   */
  async convertToRecap(blockedNudge: BlockedNudge): Promise<NudgeRecap> {
    const { nudgeRecapService } = await import('./nudgeRecapService');
    return nudgeRecapService.convertNudgeToRecap(blockedNudge);
  }

  /**
   * Schedule recap delivery
   */
  async scheduleRecapDelivery(recap: NudgeRecap): Promise<void> {
    const { nudgeRecapService } = await import('./nudgeRecapService');
    return nudgeRecapService.scheduleRecapDelivery(recap);
  }

  /**
   * Apply adaptive cooldown based on user behavior
   */
  async applyAdaptiveCooldown(
    domain: string,
    reason: 'budget' | 'dismissal' | 'context' | 'overwhelm'
  ): Promise<void> {
    const { adaptiveCooldownService } = await import('./adaptiveCooldownService');
    const cooldown = await adaptiveCooldownService.calculateCooldown(domain, reason);
    
    this.cooldowns.set(domain, {
      domain,
      reason,
      until: cooldown.until,
      duration: cooldown.duration,
      canOverride: cooldown.canOverride,
      extensionCount: cooldown.extensionCount
    });

    this.saveCooldownData();
  }

  /**
   * Reduce cooldown for positive engagement
   */
  async reduceAdaptiveCooldown(domain: string): Promise<void> {
    const { adaptiveCooldownService } = await import('./adaptiveCooldownService');
    const existingCooldown = this.cooldowns.get(domain);
    
    if (existingCooldown) {
      const reducedCooldown = await adaptiveCooldownService.reduceCooldown(domain, existingCooldown);
      
      if (reducedCooldown) {
        this.cooldowns.set(domain, reducedCooldown);
      } else {
        this.cooldowns.delete(domain);
      }
      
      this.saveCooldownData();
    }
  }

  /**
   * Get current cooldown status for domain
   */
  getCooldownStatus(domain: string): CooldownStatus | null {
    const cooldown = this.cooldowns.get(domain);
    if (!cooldown || cooldown.until <= Date.now()) {
      this.cooldowns.delete(domain);
      return null;
    }
    return cooldown;
  }

  /**
   * Get weekly over-nudge metrics
   */
  async getWeeklyOverNudgeMetrics(): Promise<WeeklyMetrics> {
    const { weeklyMetricsService } = await import('./weeklyMetricsService');
    return weeklyMetricsService.getWeeklyMetrics();
  }

  /**
   * Report nudge fatigue for analytics
   */
  reportNudgeFatigue(userId: string, severity: 'low' | 'medium' | 'high'): void {
    console.log('[Cognitive Load Governor] Nudge fatigue reported:', { userId, severity });
    
    // Store fatigue report for analytics
    const fatigueReports = this.getFatigueReports();
    fatigueReports.push({
      userId,
      severity,
      timestamp: Date.now(),
      domains: Array.from(this.budgets.keys()).filter(domain => 
        this.getBudgetForDomain(domain).remaining === 0
      )
    });
    
    localStorage.setItem('cognitiveLoadFatigueReports', JSON.stringify(fatigueReports));
  }

  /**
   * Get budget for domain (creates if doesn't exist)
   */
  private getBudgetForDomain(domain: string): DomainBudget {
    if (!this.budgets.has(domain)) {
      const defaultLimit = this.DEFAULT_BUDGETS[domain] || 3;
      const budget: DomainBudget = {
        domain,
        dailyLimit: defaultLimit,
        used: 0,
        remaining: defaultLimit,
        dismissCount: 0,
        acceptCount: 0,
        weeklyOverNudges: 0
      };
      this.budgets.set(domain, budget);
    }
    return this.budgets.get(domain)!;
  }

  /**
   * Calculate user overwhelm score (0-1)
   */
  private calculateOverwhelmScore(): number {
    const totalBudgetUsage = Array.from(this.budgets.values())
      .reduce((sum, budget) => sum + (budget.used / budget.dailyLimit), 0);
    
    const activeCooldowns = Array.from(this.cooldowns.values())
      .filter(cooldown => cooldown.until > Date.now()).length;
    
    const avgBudgetUsage = this.budgets.size > 0 ? totalBudgetUsage / this.budgets.size : 0;
    const cooldownFactor = activeCooldowns / this.budgets.size;
    
    return Math.min(1, avgBudgetUsage * 0.7 + cooldownFactor * 0.3);
  }

  /**
   * Calculate budget-based cooldown duration
   */
  private calculateBudgetCooldown(domain: string): number {
    // Budget exceeded = rest of day cooldown
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Load budget data from localStorage
   */
  private loadBudgetData(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadBudgets');
      if (stored) {
        const data = JSON.parse(stored);
        const today = new Date().toDateString();
        
        if (data[today]) {
          Object.entries(data[today]).forEach(([domain, budgetData]: [string, any]) => {
            this.budgets.set(domain, {
              ...this.getBudgetForDomain(domain),
              ...budgetData
            });
          });
        }
      }
    } catch (error) {
      console.error('[Cognitive Load Governor] Failed to load budget data:', error);
    }
  }

  /**
   * Save budget data to localStorage
   */
  private saveBudgetData(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadBudgets') || '{}';
      const data = JSON.parse(stored);
      const today = new Date().toDateString();
      
      data[today] = {};
      this.budgets.forEach((budget, domain) => {
        data[today][domain] = budget;
      });
      
      localStorage.setItem('cognitiveLoadBudgets', JSON.stringify(data));
    } catch (error) {
      console.error('[Cognitive Load Governor] Failed to save budget data:', error);
    }
  }

  /**
   * Load cooldown data from localStorage
   */
  private loadCooldownData(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadCooldowns');
      if (stored) {
        const cooldowns = JSON.parse(stored);
        cooldowns.forEach((cooldown: CooldownStatus) => {
          if (cooldown.until > Date.now()) {
            this.cooldowns.set(cooldown.domain, cooldown);
          }
        });
      }
    } catch (error) {
      console.error('[Cognitive Load Governor] Failed to load cooldown data:', error);
    }
  }

  /**
   * Save cooldown data to localStorage
   */
  private saveCooldownData(): void {
    try {
      const activeCooldowns = Array.from(this.cooldowns.values())
        .filter(cooldown => cooldown.until > Date.now());
      
      localStorage.setItem('cognitiveLoadCooldowns', JSON.stringify(activeCooldowns));
    } catch (error) {
      console.error('[Cognitive Load Governor] Failed to save cooldown data:', error);
    }
  }

  /**
   * Get fatigue reports from localStorage
   */
  private getFatigueReports(): any[] {
    try {
      const stored = localStorage.getItem('cognitiveLoadFatigueReports');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[Cognitive Load Governor] Failed to get fatigue reports:', error);
      return [];
    }
  }

  /**
   * Update weekly metrics
   */
  private updateWeeklyMetrics(): void {
    // Defer to weekly metrics service
    import('./weeklyMetricsService').then(({ weeklyMetricsService }) => {
      weeklyMetricsService.updateMetrics(Array.from(this.budgets.values()));
    });
  }

  /**
   * Initialize governor (load persisted data)
   */
  initialize(): void {
    this.loadBudgetData();
    this.loadCooldownData();
  }

  /**
   * Get all current budgets
   */
  getAllBudgets(): DomainBudget[] {
    return Array.from(this.budgets.values());
  }

  /**
   * Get all active cooldowns
   */
  getAllCooldowns(): CooldownStatus[] {
    return Array.from(this.cooldowns.values())
      .filter(cooldown => cooldown.until > Date.now());
  }

  /**
   * Reset all budgets and cooldowns (for testing)
   */
  reset(): void {
    this.budgets.clear();
    this.cooldowns.clear();
    localStorage.removeItem('cognitiveLoadBudgets');
    localStorage.removeItem('cognitiveLoadCooldowns');
    localStorage.removeItem('cognitiveLoadFatigueReports');
  }
}

export const cognitiveLoadGovernor = new CognitiveLoadGovernor();

// Initialize on module load
cognitiveLoadGovernor.initialize();