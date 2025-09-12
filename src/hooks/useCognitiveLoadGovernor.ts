/**
 * P14 React Hook for Cognitive Load Governor
 * Provides React components with access to budget enforcement and metrics
 */

import { useEffect, useState, useCallback } from 'react';
import { cognitiveLoadGovernor, type CognitiveLoadContext } from '@/services/cognitiveLoadGovernor';
import type { DomainBudget, CooldownStatus, WeeklyMetrics, BudgetResult } from '@/types/cognitiveLoad';
import { isFeatureEnabled } from '@/config/flags';

export interface UseCognitiveLoadGovernorOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface CognitiveLoadState {
  budgets: DomainBudget[];
  cooldowns: CooldownStatus[];
  weeklyMetrics: WeeklyMetrics;
  loading: boolean;
  error: string | null;
}

export function useCognitiveLoadGovernor(options: UseCognitiveLoadGovernorOptions = {}) {
  const { autoRefresh = true, refreshInterval = 60000 } = options; // Default 1 minute
  
  const [state, setState] = useState<CognitiveLoadState>({
    budgets: [],
    cooldowns: [],
    weeklyMetrics: {
      weekStart: new Date().toISOString(),
      totalNudges: 0,
      overNudgeIncidents: 0,
      domainsOverBudget: [],
      avgAcceptanceRate: 0,
      avgDismissalRate: 0,
      fatigueReports: 0,
      cooldownExtensions: 0,
      recapConversions: 0
    },
    loading: false,
    error: null
  });

  /**
   * Refresh data from cognitive load governor
   */
  const refreshData = useCallback(async () => {
    if (!isFeatureEnabled('loadGovernor')) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const budgets = cognitiveLoadGovernor.getAllBudgets();
      const cooldowns = cognitiveLoadGovernor.getAllCooldowns();
      const weeklyMetrics = await cognitiveLoadGovernor.getWeeklyOverNudgeMetrics();
      
      setState({
        budgets,
        cooldowns,
        weeklyMetrics,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('[useCognitiveLoadGovernor] Failed to refresh data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, []);

  /**
   * Check if nudge is allowed
   */
  const checkNudgeAllowed = useCallback(async (context: CognitiveLoadContext): Promise<BudgetResult> => {
    if (!isFeatureEnabled('loadGovernor')) {
      return { allowed: true, reason: 'feature_disabled' };
    }
    
    return cognitiveLoadGovernor.checkNudgeBudget(context);
  }, []);

  /**
   * Record nudge attempt
   */
  const recordNudge = useCallback(async (
    context: CognitiveLoadContext,
    outcome: 'shown' | 'blocked' | 'dismissed' | 'accepted'
  ) => {
    if (!isFeatureEnabled('loadGovernor')) return;
    
    await cognitiveLoadGovernor.recordNudgeAttempt(context, outcome);
    // Refresh data after recording
    refreshData();
  }, [refreshData]);

  /**
   * Report user fatigue
   */
  const reportFatigue = useCallback((
    userId: string,
    severity: 'low' | 'medium' | 'high'
  ) => {
    if (!isFeatureEnabled('loadGovernor')) return;
    
    cognitiveLoadGovernor.reportNudgeFatigue(userId, severity);
    refreshData();
  }, [refreshData]);

  /**
   * Reset all data (for testing)
   */
  const reset = useCallback(() => {
    if (!isFeatureEnabled('loadGovernor')) return;
    
    cognitiveLoadGovernor.reset();
    refreshData();
  }, [refreshData]);

  /**
   * Get budget for specific domain
   */
  const getBudgetForDomain = useCallback((domain: string): DomainBudget | null => {
    return state.budgets.find(budget => budget.domain === domain) || null;
  }, [state.budgets]);

  /**
   * Get cooldown for specific domain
   */
  const getCooldownForDomain = useCallback((domain: string): CooldownStatus | null => {
    return state.cooldowns.find(cooldown => cooldown.domain === domain) || null;
  }, [state.cooldowns]);

  /**
   * Check if domain is currently on cooldown
   */
  const isDomainOnCooldown = useCallback((domain: string): boolean => {
    const cooldown = getCooldownForDomain(domain);
    return cooldown ? cooldown.until > Date.now() : false;
  }, [getCooldownForDomain]);

  /**
   * Check if domain has exceeded budget
   */
  const isDomainOverBudget = useCallback((domain: string): boolean => {
    const budget = getBudgetForDomain(domain);
    return budget ? budget.remaining <= 0 : false;
  }, [getBudgetForDomain]);

  /**
   * Get overall system health score (0-100)
   */
  const getSystemHealthScore = useCallback((): number => {
    if (state.budgets.length === 0) return 100;
    
    const overBudgetDomains = state.budgets.filter(b => b.remaining <= 0).length;
    const activeCooldowns = state.cooldowns.length;
    const totalDomains = state.budgets.length;
    
    const budgetHealth = ((totalDomains - overBudgetDomains) / totalDomains) * 100;
    const cooldownPenalty = Math.min(activeCooldowns * 10, 30); // Max 30 point penalty
    const acceptanceBonus = state.weeklyMetrics.avgAcceptanceRate * 20; // Max 20 point bonus
    
    return Math.max(0, Math.min(100, budgetHealth - cooldownPenalty + acceptanceBonus));
  }, [state]);

  /**
   * Get weekly improvement percentage
   */
  const getWeeklyImprovement = useCallback((): number => {
    // This would compare with previous week's data
    // For now, return a simplified calculation
    const currentOverNudges = state.weeklyMetrics.overNudgeIncidents;
    const baselineOverNudges = 10; // Assume baseline of 10 over-nudges per week
    
    if (baselineOverNudges <= 0) return 0;
    return Math.round(((baselineOverNudges - currentOverNudges) / baselineOverNudges) * 100);
  }, [state.weeklyMetrics]);

  // Auto-refresh data
  useEffect(() => {
    refreshData();
    
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(refreshData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshData, autoRefresh, refreshInterval]);

  // Listen for feature flag changes
  useEffect(() => {
    const handleFlagChange = () => {
      refreshData();
    };
    
    window.addEventListener('featureFlagChanged', handleFlagChange);
    return () => window.removeEventListener('featureFlagChanged', handleFlagChange);
  }, [refreshData]);

  return {
    // State
    ...state,
    
    // Actions
    refreshData,
    checkNudgeAllowed,
    recordNudge,
    reportFatigue,
    reset,
    
    // Getters
    getBudgetForDomain,
    getCooldownForDomain,
    isDomainOnCooldown,
    isDomainOverBudget,
    getSystemHealthScore,
    getWeeklyImprovement,
    
    // Feature flag
    isEnabled: isFeatureEnabled('loadGovernor')
  };
}

/**
 * Lightweight hook for quick budget checks
 */
export function useNudgeBudgetCheck() {
  const checkBudget = useCallback(async (
    domain: string,
    nudgeType: string,
    urgency: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<BudgetResult> => {
    if (!isFeatureEnabled('loadGovernor')) {
      return { allowed: true, reason: 'feature_disabled' };
    }
    
    const context: CognitiveLoadContext = {
      userId: 'current-user', // Would get from auth context
      domain,
      nudgeType,
      urgency,
      content: ''
    };
    
    return cognitiveLoadGovernor.checkNudgeBudget(context);
  }, []);
  
  return {
    checkBudget,
    isEnabled: isFeatureEnabled('loadGovernor')
  };
}

/**
 * Hook for nudge components to integrate with governor
 */
export function useNudgeGovernor(domain: string, nudgeType: string) {
  const [canShow, setCanShow] = useState<boolean>(true);
  const [budgetResult, setBudgetResult] = useState<BudgetResult | null>(null);
  
  const checkAndRecord = useCallback(async (
    urgency: 'low' | 'medium' | 'high' = 'medium',
    content: string = ''
  ) => {
    if (!isFeatureEnabled('loadGovernor')) {
      setCanShow(true);
      return true;
    }
    
    const context: CognitiveLoadContext = {
      userId: 'current-user',
      domain,
      nudgeType,
      urgency,
      content
    };
    
    const result = await cognitiveLoadGovernor.checkNudgeBudget(context);
    setBudgetResult(result);
    setCanShow(result.allowed);
    
    if (result.allowed) {
      // Record as shown
      await cognitiveLoadGovernor.recordNudgeAttempt(context, 'shown');
    } else {
      // Record as blocked
      await cognitiveLoadGovernor.recordNudgeAttempt(context, 'blocked');
    }
    
    return result.allowed;
  }, [domain, nudgeType]);
  
  const recordOutcome = useCallback(async (outcome: 'dismissed' | 'accepted') => {
    if (!isFeatureEnabled('loadGovernor')) return;
    
    const context: CognitiveLoadContext = {
      userId: 'current-user',
      domain,
      nudgeType,
      urgency: 'medium',
      content: ''
    };
    
    await cognitiveLoadGovernor.recordNudgeAttempt(context, outcome);
  }, [domain, nudgeType]);
  
  return {
    canShow,
    budgetResult,
    checkAndRecord,
    recordOutcome,
    isEnabled: isFeatureEnabled('loadGovernor')
  };
}