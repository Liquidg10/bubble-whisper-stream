/**
 * Atomic Adapter - Connects Atomic Renderer to Bubble Store
 * Provides lightweight integration while maintaining fallback behavior
 */

import { useBubbleStore } from '@/stores/bubbleStore';

export function updateTimeHorizon(moleculeId: string, fromRing: number, toRing: number) {
  // Hook into your store if you have a notion of time horizon (today/week/later)
  // For now, this is a placeholder - the renderer maintains its own state
  console.log(`Time horizon update: ${moleculeId} from ring ${fromRing} to ring ${toRing}`);
  
  // Future integration point:
  // const { updateBubble } = useBubbleStore.getState();
  // Update bubble with new time horizon metadata
}

export function createMoleculeFromDomain(domain: string) {
  // Map domain presets to your project's/molecule's data model
  console.log(`Creating molecule from domain: ${domain}`);
  
  // Future integration point:
  // const { addBubble } = useBubbleStore.getState();
  // Create a new bubble/molecule with domain-specific properties
}

export function mergeMolecules(aId: string, bId: string) {
  // Map fusion → store-level merge if supported
  console.log(`Merging molecules: ${aId} + ${bId}`);
  
  // Future integration point:
  // const { mergeBubbles } = useBubbleStore.getState();
  // Find corresponding bubbles and merge them at store level
}

export function splitMolecule(id: string) {
  // Map fission → store-level split if supported
  console.log(`Splitting molecule: ${id}`);
  
  // Future integration point:
  // const { addBubble, deleteBubble } = useBubbleStore.getState();
  // Split a bubble into multiple bubbles
}

export function getAccessibilitySettings() {
  // Get accessibility settings from the store
  const { settings } = useBubbleStore.getState();
  return {
    reducedMotion: settings.reducedMotion || false,
    highContrast: settings.highContrast || false,
    bubbleDensity: settings.bubbleDensity || 'medium'
  };
}

export function notifyElectronMoved(electronId: string, fromShell: number, toShell: number) {
  // Notify the store about electron (bubble) movement between time horizons
  console.log(`Electron ${electronId} moved from shell ${fromShell} to shell ${toShell}`);
  
  // This could trigger store updates, analytics, or other side effects
}

// Export convenience function to check if store integration is available
export function hasStoreIntegration(): boolean {
  try {
    useBubbleStore.getState();
    return true;
  } catch {
    return false;
  }
}