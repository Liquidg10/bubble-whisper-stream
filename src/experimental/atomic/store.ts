/**
 * Centralized bubble store access for atomic operations
 * 
 * This helper centralizes access to the bubble store throughout the atomic adapter,
 * reducing boilerplate and making it easier to mock or replace the store in tests.
 */

import { useBubbleStore } from '@/stores/bubbleStore';

/**
 * Gets the current bubble store state
 * 
 * This function wraps useBubbleStore.getState() to provide a single point
 * of access to the store throughout the atomic system.
 */
export function getBubbleStoreState() {
  return useBubbleStore.getState();
}

/**
 * Helper to get just the bubbles array
 */
export function getBubbles() {
  return getBubbleStoreState().bubbles;
}

/**
 * Helper to get store actions
 */
export function getBubbleStoreActions() {
  const state = getBubbleStoreState();
  return {
    addBubble: state.addBubble,
    updateBubble: state.updateBubble,
    deleteBubble: state.deleteBubble,
    mergeBubbles: state.mergeBubbles
  };
}

/**
 * Helper to get store settings
 */
export function getBubbleStoreSettings() {
  return getBubbleStoreState().settings;
}