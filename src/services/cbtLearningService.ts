/**
 * PROMPT 8: CBT Learning Service - Per-user threshold adjustments based on feedback
 * Local-only preference map with conservative learning bounds
 */

import type { DistortionType } from '@/ai/cbt/types';

export interface UserLearningPreferences {
  distortionThresholds: Partial<Record<DistortionType, number>>;
  declineCounts: Partial<Record<DistortionType, number>>;
  lastAdjustments: Partial<Record<DistortionType, number>>; // timestamps
  maxAdjustmentsPerType: number; // default: 3
  helpfulCounts: Partial<Record<DistortionType, number>>; // for dev metrics
}

class CBTLearningService {
  private readonly STORAGE_KEY = 'cbt_learning_preferences';
  private readonly DEFAULT_THRESHOLD = 0.85;
  private readonly MIN_THRESHOLD = 0.75;
  private readonly MAX_THRESHOLD = 0.95;
  private readonly THRESHOLD_ADJUSTMENT = 0.05;
  private readonly COOLING_PERIOD_DAYS = 7;
  private readonly MAX_ADJUSTMENTS_PER_TYPE = 3;
  private readonly DECLINES_FOR_ADJUSTMENT = 3;

  /**
   * Get current learning preferences for user
   */
  getUserPreferences(): UserLearningPreferences {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          maxAdjustmentsPerType: this.MAX_ADJUSTMENTS_PER_TYPE,
          ...parsed
        };
      }
    } catch (error) {
      console.warn('[CBT Learning] Failed to load preferences:', error);
    }

    return this.getDefaultPreferences();
  }

  /**
   * Save learning preferences to local storage
   */
  private saveUserPreferences(preferences: UserLearningPreferences): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn('[CBT Learning] Failed to save preferences:', error);
    }
  }

  /**
   * Get threshold for specific distortion type (user-adjusted or default)
   */
  getThresholdForDistortion(distortionType: DistortionType): number {
    const preferences = this.getUserPreferences();
    return preferences.distortionThresholds[distortionType] || this.DEFAULT_THRESHOLD;
  }

  /**
   * Record helpful feedback for distortion
   */
  recordHelpfulFeedback(distortionTypes: DistortionType[]): void {
    const preferences = this.getUserPreferences();
    
    distortionTypes.forEach(distortionType => {
      preferences.helpfulCounts[distortionType] = 
        (preferences.helpfulCounts[distortionType] || 0) + 1;
    });

    this.saveUserPreferences(preferences);
  }

  /**
   * Record decline feedback and check for threshold adjustment
   */
  recordDeclineFeedback(distortionTypes: DistortionType[]): {
    adjustedThresholds: DistortionType[];
    newThresholds: Partial<Record<DistortionType, number>>;
  } {
    const preferences = this.getUserPreferences();
    const adjustedThresholds: DistortionType[] = [];
    const newThresholds: Partial<Record<DistortionType, number>> = {};

    distortionTypes.forEach(distortionType => {
      // Increment decline count
      const currentDeclines = (preferences.declineCounts[distortionType] || 0) + 1;
      preferences.declineCounts[distortionType] = currentDeclines;

      // Check if we should adjust threshold
      if (this.shouldAdjustThreshold(distortionType, currentDeclines, preferences)) {
        const newThreshold = this.calculateNewThreshold(distortionType, preferences);
        if (newThreshold !== null) {
          preferences.distortionThresholds[distortionType] = newThreshold;
          preferences.lastAdjustments[distortionType] = Date.now();
          preferences.declineCounts[distortionType] = 0; // Reset decline counter
          
          adjustedThresholds.push(distortionType);
          newThresholds[distortionType] = newThreshold;
        }
      }
    });

    this.saveUserPreferences(preferences);

    if (adjustedThresholds.length > 0) {
      console.log('[CBT Learning] Adjusted thresholds:', newThresholds);
    }

    return { adjustedThresholds, newThresholds };
  }

  /**
   * Check if threshold should be adjusted for a distortion type
   */
  private shouldAdjustThreshold(
    distortionType: DistortionType,
    declineCount: number,
    preferences: UserLearningPreferences
  ): boolean {
    // Need enough declines
    if (declineCount < this.DECLINES_FOR_ADJUSTMENT) return false;

    // Check if we've already made max adjustments
    const currentThreshold = preferences.distortionThresholds[distortionType];
    const adjustmentCount = this.getAdjustmentCount(distortionType, preferences);
    if (adjustmentCount >= this.MAX_ADJUSTMENTS_PER_TYPE) return false;

    // Check cooling period
    const lastAdjustment = preferences.lastAdjustments[distortionType];
    if (lastAdjustment) {
      const daysSinceAdjustment = (Date.now() - lastAdjustment) / (1000 * 60 * 60 * 24);
      if (daysSinceAdjustment < this.COOLING_PERIOD_DAYS) return false;
    }

    // Don't adjust if already at maximum
    if (currentThreshold && currentThreshold >= this.MAX_THRESHOLD) return false;

    return true;
  }

  /**
   * Calculate new threshold after adjustment
   */
  private calculateNewThreshold(
    distortionType: DistortionType,
    preferences: UserLearningPreferences
  ): number | null {
    const currentThreshold = preferences.distortionThresholds[distortionType] || this.DEFAULT_THRESHOLD;
    const newThreshold = Math.min(
      this.MAX_THRESHOLD,
      currentThreshold + this.THRESHOLD_ADJUSTMENT
    );

    // Don't adjust if no meaningful change
    if (Math.abs(newThreshold - currentThreshold) < 0.01) return null;

    return newThreshold;
  }

  /**
   * Get number of adjustments made for a distortion type
   */
  private getAdjustmentCount(distortionType: DistortionType, preferences: UserLearningPreferences): number {
    const currentThreshold = preferences.distortionThresholds[distortionType];
    if (!currentThreshold) return 0;

    return Math.round((currentThreshold - this.DEFAULT_THRESHOLD) / this.THRESHOLD_ADJUSTMENT);
  }

  /**
   * Get default learning preferences
   */
  private getDefaultPreferences(): UserLearningPreferences {
    return {
      distortionThresholds: {},
      declineCounts: {},
      lastAdjustments: {},
      maxAdjustmentsPerType: this.MAX_ADJUSTMENTS_PER_TYPE,
      helpfulCounts: {}
    };
  }

  /**
   * Reset learning preferences (for testing or user request)
   */
  resetPreferences(): void {
    this.saveUserPreferences(this.getDefaultPreferences());
  }

  /**
   * Get learning stats for dev panel
   */
  getLearningStats(): {
    thresholds: Partial<Record<DistortionType, number>>;
    declineCounts: Partial<Record<DistortionType, number>>;
    helpfulCounts: Partial<Record<DistortionType, number>>;
    adjustmentCounts: Partial<Record<DistortionType, number>>;
    successRates: Partial<Record<DistortionType, number>>;
  } {
    const preferences = this.getUserPreferences();
    const adjustmentCounts: Partial<Record<DistortionType, number>> = {};
    const successRates: Partial<Record<DistortionType, number>> = {};

    // Calculate adjustment counts and success rates
    Object.keys(preferences.distortionThresholds).forEach(distortionType => {
      const type = distortionType as DistortionType;
      adjustmentCounts[type] = this.getAdjustmentCount(type, preferences);
      
      const helpful = preferences.helpfulCounts[type] || 0;
      const declines = preferences.declineCounts[type] || 0;
      const total = helpful + declines;
      successRates[type] = total > 0 ? helpful / total : 0;
    });

    return {
      thresholds: preferences.distortionThresholds,
      declineCounts: preferences.declineCounts,
      helpfulCounts: preferences.helpfulCounts,
      adjustmentCounts,
      successRates
    };
  }
}

export const cbtLearningService = new CBTLearningService();

// Export for testing
export { CBTLearningService };