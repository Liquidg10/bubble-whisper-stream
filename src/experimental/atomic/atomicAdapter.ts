/**
 * Enhanced Atomic Adapter - Connects Atomic Renderer to Bubble Store
 * Provides comprehensive integration with AI-powered features
 */

import { useBubbleStore } from '@/stores/bubbleStore';

export { updateTimeHorizon } from './timeHorizons';
export { createMoleculeFromDomain, mergeMolecules, splitMolecule } from './molecules';
export { classifyBubbleDomain } from './domainClassification';
export { suggestOptimalPosition } from './positioning';

export function getAccessibilitySettings() {
  const { settings } = useBubbleStore.getState();
  return {
    reducedMotion: settings.reducedMotion || false,
    highContrast: settings.highContrast || false,
    bubbleDensity: settings.bubbleDensity || 'medium'
  };
}

export function notifyElectronMoved(electronId: string, fromShell: number, toShell: number) {
  // This could trigger analytics, notifications, or adaptive learning
  console.log(`Electron ${electronId} moved from shell ${fromShell} to shell ${toShell}`);

  // Future: Update user behavior patterns for AI recommendations
}

export function hasStoreIntegration(): boolean {
  try {
    useBubbleStore.getState();
    return true;
  } catch {
    return false;
  }
}
