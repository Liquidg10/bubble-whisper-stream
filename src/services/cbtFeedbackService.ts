/**
 * PROMPT 8: CBT Feedback Tracking Service - Dev panel metrics and feedback history
 */

import type { DistortionType } from '@/ai/cbt/types';

export interface FeedbackEvent {
  id: string;
  timestamp: number;
  traceId: string;
  distortionTypes: DistortionType[];
  feedbackType: 'helpful' | 'decline';
  thresholdAdjustment?: {
    distortionType: DistortionType;
    oldThreshold: number;
    newThreshold: number;
  };
}

export interface FeedbackMetrics {
  totalFeedback: number;
  helpfulCount: number;
  declineCount: number;
  successRate: number;
  recentFeedback: FeedbackEvent[];
  perDistortionMetrics: Partial<Record<DistortionType, {
    helpful: number;
    declined: number;
    successRate: number;
    currentThreshold: number;
    defaultThreshold: number;
    adjustmentCount: number;
  }>>;
}

class CBTFeedbackService {
  private readonly STORAGE_KEY = 'cbt_feedback_history';
  private readonly MAX_HISTORY_ITEMS = 100;

  /**
   * Record feedback event for dev panel tracking
   */
  recordFeedback(
    traceId: string,
    distortionTypes: DistortionType[],
    feedbackType: 'helpful' | 'decline',
    thresholdAdjustment?: {
      distortionType: DistortionType;
      oldThreshold: number;
      newThreshold: number;
    }
  ): void {
    const event: FeedbackEvent = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      traceId,
      distortionTypes,
      feedbackType,
      thresholdAdjustment
    };

    this.saveFeedbackEvent(event);
  }

  /**
   * Get feedback metrics for dev panel
   */
  getFeedbackMetrics(): FeedbackMetrics {
    const history = this.getFeedbackHistory();
    const totalFeedback = history.length;
    const helpfulCount = history.filter(e => e.feedbackType === 'helpful').length;
    const declineCount = history.filter(e => e.feedbackType === 'decline').length;
    const successRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;

    // Calculate per-distortion metrics
    const perDistortionMetrics: FeedbackMetrics['perDistortionMetrics'] = {};
    
    // Get all unique distortion types from history
    const allDistortionTypes = new Set<DistortionType>();
    history.forEach(event => {
      event.distortionTypes.forEach(type => allDistortionTypes.add(type));
    });

    allDistortionTypes.forEach(distortionType => {
      const relevantEvents = history.filter(event => 
        event.distortionTypes.includes(distortionType)
      );
      
      const helpful = relevantEvents.filter(e => e.feedbackType === 'helpful').length;
      const declined = relevantEvents.filter(e => e.feedbackType === 'decline').length;
      const total = helpful + declined;
      
      // Count threshold adjustments for this distortion
      const adjustmentCount = history.filter(event => 
        event.thresholdAdjustment?.distortionType === distortionType
      ).length;

      // Get current and default thresholds (imported dynamically to avoid circular deps)
      const currentThreshold = this.getCurrentThreshold(distortionType);
      const defaultThreshold = 0.85;

      perDistortionMetrics[distortionType] = {
        helpful,
        declined,
        successRate: total > 0 ? helpful / total : 0,
        currentThreshold,
        defaultThreshold,
        adjustmentCount
      };
    });

    return {
      totalFeedback,
      helpfulCount,
      declineCount,
      successRate,
      recentFeedback: history.slice(-10), // Last 10 events
      perDistortionMetrics
    };
  }

  /**
   * Get feedback history from storage
   */
  private getFeedbackHistory(): FeedbackEvent[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const history = JSON.parse(stored);
        return Array.isArray(history) ? history : [];
      }
    } catch (error) {
      console.warn('[CBT Feedback] Failed to load history:', error);
    }
    return [];
  }

  /**
   * Save feedback event to storage
   */
  private saveFeedbackEvent(event: FeedbackEvent): void {
    try {
      const history = this.getFeedbackHistory();
      history.push(event);
      
      // Trim history to max size
      if (history.length > this.MAX_HISTORY_ITEMS) {
        history.splice(0, history.length - this.MAX_HISTORY_ITEMS);
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.warn('[CBT Feedback] Failed to save event:', error);
    }
  }

  /**
   * Get current threshold for distortion type
   */
  private getCurrentThreshold(distortionType: DistortionType): number {
    try {
      // Import learning service dynamically to avoid circular deps
      const learningPrefs = localStorage.getItem('cbt_learning_preferences');
      if (learningPrefs) {
        const prefs = JSON.parse(learningPrefs);
        return prefs.distortionThresholds?.[distortionType] || 0.85;
      }
    } catch (error) {
      console.warn('[CBT Feedback] Failed to get current threshold:', error);
    }
    return 0.85;
  }

  /**
   * Clear feedback history (for testing)
   */
  clearHistory(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('[CBT Feedback] Failed to clear history:', error);
    }
  }

  /**
   * Get recent threshold adjustments for dev panel
   */
  getRecentAdjustments(): Array<{
    timestamp: number;
    distortionType: DistortionType;
    oldThreshold: number;
    newThreshold: number;
    reason: string;
  }> {
    const history = this.getFeedbackHistory();
    return history
      .filter(event => event.thresholdAdjustment)
      .map(event => ({
        timestamp: event.timestamp,
        distortionType: event.thresholdAdjustment!.distortionType,
        oldThreshold: event.thresholdAdjustment!.oldThreshold,
        newThreshold: event.thresholdAdjustment!.newThreshold,
        reason: `After 3 declines for ${event.thresholdAdjustment!.distortionType}`
      }))
      .slice(-5); // Last 5 adjustments
  }
}

export const cbtFeedbackService = new CBTFeedbackService();

// Export for testing
export { CBTFeedbackService };