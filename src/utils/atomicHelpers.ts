/**
 * Reusable utility functions for the Atomic View system
 */

import { TimeHorizon, TIME_HORIZON_EMOJIS, DOMAIN_CONFIGS, type DomainConfig } from '@/types/atomic';

/**
 * Generates a unique identifier for bubbles and tags
 */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Gets the emoji for a specific time horizon
 */
export function getTimeHorizonEmoji(horizon: TimeHorizon | string): string {
  if (Object.values(TimeHorizon).includes(horizon as TimeHorizon)) {
    return TIME_HORIZON_EMOJIS[horizon as TimeHorizon];
  }
  return '⏰'; // fallback emoji
}

/**
 * Gets the domain configuration for a given domain
 */
export function getDomainConfig(domain: string): DomainConfig {
  return DOMAIN_CONFIGS[domain] || DOMAIN_CONFIGS.Default;
}

/**
 * Validates if a string is a valid time horizon
 */
export function isValidTimeHorizon(value: string): value is TimeHorizon {
  return Object.values(TimeHorizon).includes(value as TimeHorizon);
}

/**
 * Converts a ring index to a time horizon
 */
export function ringIndexToTimeHorizon(ringIndex: number): TimeHorizon {
  const horizons = [TimeHorizon.Today, TimeHorizon.Week, TimeHorizon.Later];
  return horizons[ringIndex] || TimeHorizon.Today;
}

/**
 * Converts a time horizon to a ring index
 */
export function timeHorizonToRingIndex(horizon: TimeHorizon): number {
  const horizons = [TimeHorizon.Today, TimeHorizon.Week, TimeHorizon.Later];
  return horizons.indexOf(horizon);
}