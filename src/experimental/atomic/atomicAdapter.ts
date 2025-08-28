/**
 * Enhanced Atomic Adapter - Connects Atomic Renderer to Bubble Store
 * Provides comprehensive integration with AI-powered features
 */

import { getBubbleStoreSettings } from './store';
import { logger } from '@/utils/logger';

// Re-export all atomic operations from their focused modules
export { createMoleculeFromDomain, mergeMolecules, splitMolecule } from './molecules';
export { suggestOptimalPosition } from './positioning';

// Use canonical helpers for domain and horizon management
export { classifyDomain as classifyBubbleDomain } from '@/lib/classifyDomain';
export { getHorizon, setHorizon, ringIndexToHorizon, horizonToRingIndex } from '@/lib/horizon';

export function getAccessibilitySettings() {
  const settings = getBubbleStoreSettings();
  return {
    reducedMotion: settings.reducedMotion || false,
    highContrast: settings.highContrast || false,
    bubbleDensity: settings.bubbleDensity || 'medium'
  };
}

export function notifyElectronMoved(electronId: string, fromShell: number, toShell: number) {
  // This could trigger analytics, notifications, or adaptive learning
  logger.atomic(`Electron moved`, {
    electronId,
    fromShell,
    toShell,
    shellNames: ['Today', 'Week', 'Later']
  });

  // Future: Update user behavior patterns for AI recommendations
}

export function hasStoreIntegration(): boolean {
  try {
    getBubbleStoreSettings();
    return true;
  } catch (error) {
    logger.error('Store integration check failed', error);
    return false;
  }
}
