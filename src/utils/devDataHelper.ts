/**
 * Development data management helper
 * Provides controlled test data loading for dev pages only
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import { setupCleanBubbles, setupCompleteCleanSlate } from './clearTestBubbles';

export interface DevDataOptions {
  loadCleanBubbles?: boolean;
  completeClearSlate?: boolean;
  preventAutoExecution?: boolean;
}

/**
 * Safely loads test data in development with user confirmation
 */
export async function loadDevData(options: DevDataOptions = {}) {
  const { 
    loadCleanBubbles = false, 
    completeClearSlate = false,
    preventAutoExecution = true 
  } = options;

  // Check if we're in development mode
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
  
  if (!isDev && preventAutoExecution) {
    console.warn('🚫 Dev data loading blocked in production');
    return;
  }

  if (completeClearSlate) {
    await setupCompleteCleanSlate();
    console.log('🧹 Complete clean slate applied');
    return;
  }

  if (loadCleanBubbles) {
    await setupCleanBubbles();
    console.log('📦 Clean test bubbles loaded');
    return;
  }
}

/**
 * Check if auto-execution prevention is active
 */
export function isAutoExecutionPrevented(): boolean {
  return localStorage.getItem('prevent_auto_test_data') === 'true';
}

/**
 * Set auto-execution prevention
 */
export function setAutoExecutionPrevention(prevent: boolean) {
  if (prevent) {
    localStorage.setItem('prevent_auto_test_data', 'true');
  } else {
    localStorage.removeItem('prevent_auto_test_data');
  }
  console.log(`🔒 Auto test data execution ${prevent ? 'disabled' : 'enabled'}`);
}

/**
 * Get current bubble count
 */
export function getCurrentBubbleCount(): number {
  const { bubbles } = useBubbleStore.getState();
  return bubbles.length;
}

/**
 * Reset all onboarding states (for testing)
 */
export function resetOnboardingStates() {
  // Clear CBT onboarding
  localStorage.removeItem('cbt_onboarding_shown');
  localStorage.removeItem('cbt_onboarding_dismissed_at');
  localStorage.removeItem('cbt_onboarding_choice');
  localStorage.removeItem('cbt_onboarding_completed_at');
  
  // Clear progressive onboarding from store
  const { updateSettings } = useBubbleStore.getState();
  updateSettings({
    progressiveOnboarding: {
      isEnabled: true,
      startDate: Date.now(),
      currentDay: 1,
      completedMilestones: [],
      hasSkippedProgression: false
    }
  });
  
  console.log('🔄 All onboarding states reset');
}