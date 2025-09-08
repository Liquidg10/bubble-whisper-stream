/**
 * Feature flags configuration
 * All new features must be behind a feature flag
 */

export const flags = {
  atomicUnified: true,
  bubblesFinishing: true,
  aiVision: true,
  voiceCapture: true,
  realtimeVoice: true,
  joyPage: true,
  emailIngest: true,
  receiptsOCR: true,
  outliner: true,
  focusMode: true,
  prioritizer: true,
  sync: true,
  searchV2: true,
  ambientModes: true,
  budget: true,
  // CBT Assistant Feature Flags
  cbtAssist: false, // Main CBT assistant feature (default OFF)
  cbtSilentObserve: true, // Silent observation for testing (default ON)
  cbtCrisisEnabled: true, // Crisis intervention features (default ON)
  cbtDevRoutes: process.env.NODE_ENV === 'development', // Dev routes (default ON in dev)
  // Auto-Write Feature Flags (Safety Shell)
  autoWriteCalendar: false, // Auto-write to calendar (default OFF)
  autoWriteEmail: false, // Auto-write email drafts (default OFF)
  autoFinanceRead: false, // Read financial data (default OFF)
  autoFinanceInsights: false, // Generate financial insights (default OFF)
  contextEngine: false, // Context-aware suggestions (default OFF)
  autoWriteKillSwitch: false, // Global kill switch for all auto-write features (default OFF)
} as const;

export type FeatureFlag = keyof typeof flags;

/**
 * Check if a feature flag is enabled
 * Supports localStorage overrides for development
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  // Check kill switch for auto-write features
  if (isAutoWriteFeature(flag) && isKillSwitchActive()) {
    return false;
  }
  
  // Check localStorage override first
  const storageKey = `flags.${flag}`;
  const override = localStorage.getItem(storageKey);
  
  if (override !== null) {
    return override === 'true';
  }
  
  // Fall back to default flag value
  return flags[flag];
}

/**
 * Check if a feature is an auto-write feature
 */
export function isAutoWriteFeature(flag: FeatureFlag): boolean {
  return ['autoWriteCalendar', 'autoWriteEmail', 'autoFinanceRead', 'autoFinanceInsights', 'contextEngine'].includes(flag);
}

/**
 * Check if the kill switch is active
 */
export function isKillSwitchActive(): boolean {
  const storageKey = 'flags.autoWriteKillSwitch';
  const override = localStorage.getItem(storageKey);
  return override === 'true' || flags.autoWriteKillSwitch;
}

/**
 * Toggle a feature flag in localStorage
 */
export function toggleFeatureFlag(flag: FeatureFlag, enabled: boolean): void {
  const storageKey = `flags.${flag}`;
  localStorage.setItem(storageKey, enabled.toString());
  
  // Dispatch event to notify components of flag change
  window.dispatchEvent(new CustomEvent('featureFlagChanged', {
    detail: { flag, enabled }
  }));
}

/**
 * Get all currently active flags (including localStorage overrides)
 */
export function getActiveFlags(): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>;
  
  for (const flag of Object.keys(flags) as FeatureFlag[]) {
    result[flag] = isFeatureEnabled(flag);
  }
  
  return result;
}

/**
 * Clear all localStorage flag overrides
 */
export function clearFlagOverrides(): void {
  const flagKeys = Object.keys(localStorage).filter(key => key.startsWith('flags.'));
  flagKeys.forEach(key => localStorage.removeItem(key));
  
  window.dispatchEvent(new CustomEvent('featureFlagsCleared'));
}