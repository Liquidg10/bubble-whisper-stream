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
} as const;

export type FeatureFlag = keyof typeof flags;

/**
 * Check if a feature flag is enabled
 * Supports localStorage overrides for development
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
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