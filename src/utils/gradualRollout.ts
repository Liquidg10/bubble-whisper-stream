/**
 * Gradual Feature Rollout Utilities
 * Enables safe production deployment with percentage-based feature activation
 */

import { isFeatureEnabled } from '@/config/flags';

interface RolloutConfig {
  feature: string;
  percentage: number; // 0-100
  userIdHash?: string;
  cohorts?: string[];
  killSwitch?: boolean;
}

const rolloutConfigs: Record<string, RolloutConfig> = {
  calendarAI: {
    feature: 'calendarAIIntegration',
    percentage: 25, // Start with 25% rollout
    cohorts: ['beta-testers', 'power-users']
  },
  masonryView: {
    feature: 'pinboardView',
    percentage: 50, // 50% rollout for masonry
    cohorts: ['beta-testers']
  },
  performanceMonitoring: {
    feature: 'performanceMonitoring',
    percentage: 100, // Full rollout for monitoring
    cohorts: []
  }
};

/**
 * Check if user should see a feature based on gradual rollout
 */
export function shouldShowFeature(featureName: string, userId?: string): boolean {
  if (!isFeatureEnabled('gradualRolloutEnabled')) {
    return isFeatureEnabled(featureName as any);
  }
  
  const config = rolloutConfigs[featureName];
  if (!config) {
    return isFeatureEnabled(featureName as any);
  }
  
  // Check kill switch
  if (config.killSwitch) {
    return false;
  }
  
  // Check feature flag override
  if (!isFeatureEnabled(config.feature as any)) {
    return false;
  }
  
  // Check localStorage override for testing
  const override = localStorage.getItem(`rollout.${featureName}`);
  if (override !== null) {
    return override === 'true';
  }
  
  // Determine user cohort
  const userHash = userId || getUserIdHash();
  const hashValue = simpleHash(userHash) % 100;
  
  return hashValue < config.percentage;
}

/**
 * Get user ID hash for consistent rollout decisions
 */
function getUserIdHash(): string {
  let userHash = localStorage.getItem('user-rollout-hash');
  if (!userHash) {
    userHash = crypto.randomUUID();
    localStorage.setItem('user-rollout-hash', userHash);
  }
  return userHash;
}

/**
 * Simple hash function for percentage calculation
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Override rollout for testing
 */
export function setRolloutOverride(featureName: string, enabled: boolean): void {
  localStorage.setItem(`rollout.${featureName}`, enabled.toString());
}

/**
 * Clear all rollout overrides
 */
export function clearRolloutOverrides(): void {
  const keys = Object.keys(localStorage).filter(key => key.startsWith('rollout.'));
  keys.forEach(key => localStorage.removeItem(key));
}

/**
 * Get current rollout status for debugging
 */
export function getRolloutStatus(): Record<string, { enabled: boolean; percentage: number; userHash: string; killSwitch?: boolean }> {
  const userHash = getUserIdHash();
  const status: Record<string, any> = {};
  
  Object.entries(rolloutConfigs).forEach(([featureName, config]) => {
    status[featureName] = {
      enabled: shouldShowFeature(featureName),
      percentage: config.percentage,
      userHash: userHash.substring(0, 8),
      killSwitch: config.killSwitch || false
    };
  });
  
  return status;
}