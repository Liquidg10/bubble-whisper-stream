/**
 * P14 Adaptive Cooldown Service - Dynamic cooldown extensions based on user behavior
 * Extends cooldowns when users repeatedly dismiss, reduces on re-engagement
 */

import type { CooldownStatus, AdaptiveCooldownRule } from '@/types/cognitiveLoad';

interface CooldownCalculationResult {
  until: number;
  duration: number;
  canOverride: boolean;
  extensionCount: number;
  baseMinutes: number;
}

class AdaptiveCooldownService {
  private cooldownHistory: Map<string, number[]> = new Map();
  private extensionCounts: Map<string, number> = new Map();
  
  // Default cooldown rules for different triggers
  private readonly COOLDOWN_RULES: Record<string, AdaptiveCooldownRule> = {
    dismissal: {
      trigger: 'dismissal',
      baseMinutes: 15,
      extensionFactor: 1.5,
      maxMinutes: 4 * 60, // 4 hours max
      recoveryFactor: 0.8,
      contextChecks: ['meeting_in_progress', 'focus_mode_active']
    },
    budget_exceeded: {
      trigger: 'budget_exceeded',
      baseMinutes: 60,
      extensionFactor: 1.2,
      maxMinutes: 24 * 60, // Rest of day
      recoveryFactor: 0.9
    },
    context_stress: {
      trigger: 'context_stress',
      baseMinutes: 30,
      extensionFactor: 1.3,
      maxMinutes: 2 * 60, // 2 hours max
      recoveryFactor: 0.7,
      contextChecks: ['calendar_density', 'email_backlog']
    },
    overwhelm: {
      trigger: 'overwhelm',
      baseMinutes: 45,
      extensionFactor: 1.4,
      maxMinutes: 3 * 60, // 3 hours max
      recoveryFactor: 0.6,
      contextChecks: ['multiple_domains_active', 'rapid_dismissals']
    }
  };

  /**
   * Calculate adaptive cooldown duration based on user behavior
   */
  async calculateCooldown(
    domain: string,
    reason: 'budget' | 'dismissal' | 'context' | 'overwhelm'
  ): Promise<CooldownCalculationResult> {
    const ruleKey = reason === 'budget' ? 'budget_exceeded' : 
                   reason === 'context' ? 'context_stress' : reason;
    
    const rule = this.COOLDOWN_RULES[ruleKey];
    if (!rule) {
      throw new Error(`No cooldown rule found for: ${reason}`);
    }

    // Get current extension count for this domain
    const currentExtensions = this.extensionCounts.get(domain) || 0;
    
    // Calculate base cooldown with extensions
    let cooldownMinutes = rule.baseMinutes;
    for (let i = 0; i < currentExtensions; i++) {
      cooldownMinutes *= rule.extensionFactor;
    }
    
    // Cap at maximum
    cooldownMinutes = Math.min(cooldownMinutes, rule.maxMinutes);
    
    // Apply context adjustments
    const contextMultiplier = await this.getContextMultiplier(rule, domain);
    cooldownMinutes *= contextMultiplier;
    
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const until = Date.now() + cooldownMs;
    
    // Update extension count
    this.extensionCounts.set(domain, currentExtensions + 1);
    
    // Record cooldown in history
    this.recordCooldownHistory(domain, cooldownMs);
    
    // Determine if override is allowed
    const canOverride = this.canAllowOverride(domain, currentExtensions, rule);
    
    const result: CooldownCalculationResult = {
      until,
      duration: cooldownMs,
      canOverride,
      extensionCount: currentExtensions + 1,
      baseMinutes: rule.baseMinutes
    };

    console.log('[Adaptive Cooldown] Calculated cooldown:', {
      domain,
      reason,
      baseMinutes: rule.baseMinutes,
      extensionCount: currentExtensions + 1,
      finalMinutes: cooldownMinutes,
      canOverride,
      contextMultiplier
    });

    return result;
  }

  /**
   * Reduce cooldown for positive engagement
   */
  async reduceCooldown(
    domain: string,
    existingCooldown: CooldownStatus
  ): Promise<CooldownStatus | null> {
    const rule = this.COOLDOWN_RULES[existingCooldown.reason] || this.COOLDOWN_RULES.dismissal;
    const remainingMs = existingCooldown.until - Date.now();
    
    if (remainingMs <= 0) {
      // Cooldown already expired
      this.resetExtensionCount(domain);
      return null;
    }
    
    // Reduce remaining time by recovery factor
    const reducedMs = remainingMs * rule.recoveryFactor;
    const newUntil = Date.now() + reducedMs;
    
    // Reduce extension count (with minimum of 0)
    const currentExtensions = this.extensionCounts.get(domain) || 0;
    const newExtensions = Math.max(0, currentExtensions - 1);
    this.extensionCounts.set(domain, newExtensions);
    
    console.log('[Adaptive Cooldown] Reduced cooldown:', {
      domain,
      originalMs: remainingMs,
      reducedMs,
      recoveryFactor: rule.recoveryFactor,
      extensionCountReduced: currentExtensions + ' → ' + newExtensions
    });
    
    return {
      ...existingCooldown,
      until: newUntil,
      duration: reducedMs,
      extensionCount: newExtensions
    };
  }

  /**
   * Get context multiplier based on current user situation
   */
  private async getContextMultiplier(rule: AdaptiveCooldownRule, domain: string): Promise<number> {
    if (!rule.contextChecks || rule.contextChecks.length === 0) {
      return 1.0;
    }
    
    let multiplier = 1.0;
    
    for (const contextCheck of rule.contextChecks) {
      const contextValue = await this.checkContext(contextCheck, domain);
      multiplier *= contextValue;
    }
    
    // Cap multiplier between 0.5 and 2.0
    return Math.max(0.5, Math.min(2.0, multiplier));
  }

  /**
   * Check specific context condition
   */
  private async checkContext(contextCheck: string, domain: string): Promise<number> {
    switch (contextCheck) {
      case 'meeting_in_progress':
        return this.isMeetingInProgress() ? 1.5 : 1.0;
        
      case 'focus_mode_active':
        return this.isFocusModeActive() ? 2.0 : 1.0;
        
      case 'calendar_density':
        const density = await this.getCalendarDensity();
        return 1.0 + (density * 0.5); // Up to 50% increase for high density
        
      case 'email_backlog':
        const backlog = await this.getEmailBacklog();
        return 1.0 + (backlog * 0.3); // Up to 30% increase for high backlog
        
      case 'multiple_domains_active':
        return this.getActiveDomainCount() > 3 ? 1.3 : 1.0;
        
      case 'rapid_dismissals':
        return this.hasRapidDismissals(domain) ? 1.4 : 1.0;
        
      default:
        return 1.0;
    }
  }

  /**
   * Check if user is currently in a meeting
   */
  private isMeetingInProgress(): boolean {
    // Simple heuristic: check time of day and day of week
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Higher probability during business hours on weekdays
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17;
  }

  /**
   * Check if focus mode is active
   */
  private isFocusModeActive(): boolean {
    // Check localStorage for focus mode state
    return localStorage.getItem('focusMode') === 'true';
  }

  /**
   * Get calendar density score (0-1)
   */
  private async getCalendarDensity(): Promise<number> {
    // Simplified: check if it's a typical busy time
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 11) return 0.8; // Morning meetings
    if (hour >= 14 && hour <= 16) return 0.7; // Afternoon meetings
    return 0.2; // Generally less busy
  }

  /**
   * Get email backlog pressure (0-1)
   */
  private async getEmailBacklog(): Promise<number> {
    // Simplified: higher pressure during work hours
    const hour = new Date().getHours();
    if (hour >= 8 && hour <= 18) return 0.6;
    return 0.2;
  }

  /**
   * Get number of active domains
   */
  private getActiveDomainCount(): number {
    // Check how many domains have recent activity
    try {
      const stored = localStorage.getItem('cognitiveLoadBudgets');
      if (!stored) return 1;
      
      const data = JSON.parse(stored);
      const today = new Date().toDateString();
      const todayData = data[today] || {};
      
      return Object.keys(todayData).length;
    } catch {
      return 1;
    }
  }

  /**
   * Check if domain has rapid dismissals
   */
  private hasRapidDismissals(domain: string): boolean {
    const history = this.cooldownHistory.get(domain) || [];
    const recentHistory = history.filter(time => Date.now() - time < 60 * 60 * 1000); // Last hour
    return recentHistory.length >= 3;
  }

  /**
   * Determine if override is allowed
   */
  private canAllowOverride(domain: string, extensionCount: number, rule: AdaptiveCooldownRule): boolean {
    // No override if too many extensions
    if (extensionCount >= 3) return false;
    
    // No override for overwhelm situations
    if (rule.trigger === 'overwhelm') return false;
    
    // Allow override for budget issues during low-activity periods
    if (rule.trigger === 'budget_exceeded') {
      const hour = new Date().getHours();
      return hour < 9 || hour > 18; // Outside business hours
    }
    
    return true;
  }

  /**
   * Record cooldown in history for pattern analysis
   */
  private recordCooldownHistory(domain: string, cooldownMs: number): void {
    const history = this.cooldownHistory.get(domain) || [];
    history.push(Date.now());
    
    // Keep only last 10 cooldowns
    const recentHistory = history.slice(-10);
    this.cooldownHistory.set(domain, recentHistory);
    
    // Persist to localStorage
    this.saveCooldownHistory();
  }

  /**
   * Reset extension count for domain (on positive engagement)
   */
  private resetExtensionCount(domain: string): void {
    this.extensionCounts.delete(domain);
    this.saveExtensionCounts();
  }

  /**
   * Get cooldown statistics for domain
   */
  getCooldownStats(domain: string): {
    extensionCount: number;
    recentCooldowns: number;
    avgCooldownDuration: number;
    lastCooldown?: number;
  } {
    const extensionCount = this.extensionCounts.get(domain) || 0;
    const history = this.cooldownHistory.get(domain) || [];
    const recentHistory = history.filter(time => Date.now() - time < 24 * 60 * 60 * 1000); // Last 24h
    
    const avgDuration = recentHistory.length > 0 
      ? recentHistory.reduce((sum, time, idx, arr) => {
          if (idx === 0) return 0;
          return sum + (time - arr[idx - 1]);
        }, 0) / Math.max(1, recentHistory.length - 1)
      : 0;
    
    return {
      extensionCount,
      recentCooldowns: recentHistory.length,
      avgCooldownDuration: avgDuration,
      lastCooldown: history[history.length - 1]
    };
  }

  /**
   * Save extension counts to localStorage
   */
  private saveExtensionCounts(): void {
    try {
      const data = Object.fromEntries(this.extensionCounts);
      localStorage.setItem('cognitiveLoadExtensionCounts', JSON.stringify(data));
    } catch (error) {
      console.error('[Adaptive Cooldown] Failed to save extension counts:', error);
    }
  }

  /**
   * Load extension counts from localStorage
   */
  private loadExtensionCounts(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadExtensionCounts');
      if (stored) {
        const data = JSON.parse(stored);
        this.extensionCounts = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[Adaptive Cooldown] Failed to load extension counts:', error);
    }
  }

  /**
   * Save cooldown history to localStorage
   */
  private saveCooldownHistory(): void {
    try {
      const data = Object.fromEntries(this.cooldownHistory);
      localStorage.setItem('cognitiveLoadCooldownHistory', JSON.stringify(data));
    } catch (error) {
      console.error('[Adaptive Cooldown] Failed to save cooldown history:', error);
    }
  }

  /**
   * Load cooldown history from localStorage
   */
  private loadCooldownHistory(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadCooldownHistory');
      if (stored) {
        const data = JSON.parse(stored);
        this.cooldownHistory = new Map(Object.entries(data).map(([k, v]) => [k, v as number[]]));
      }
    } catch (error) {
      console.error('[Adaptive Cooldown] Failed to load cooldown history:', error);
    }
  }

  /**
   * Initialize service
   */
  initialize(): void {
    this.loadExtensionCounts();
    this.loadCooldownHistory();
  }

  /**
   * Reset all cooldown data (for testing)
   */
  reset(): void {
    this.cooldownHistory.clear();
    this.extensionCounts.clear();
    localStorage.removeItem('cognitiveLoadExtensionCounts');
    localStorage.removeItem('cognitiveLoadCooldownHistory');
  }
}

export const adaptiveCooldownService = new AdaptiveCooldownService();

// Initialize on module load
adaptiveCooldownService.initialize();
