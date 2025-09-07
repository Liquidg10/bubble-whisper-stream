/**
 * PROMPT 10: CBT Metrics Collection Service
 * Tracks precision proxy, acceptance/decline rates, crisis hits, prompts/day
 * Privacy-safe: local storage only, no sensitive content
 */

import { cbtFeedbackService } from './cbtFeedbackService';
import { cbtPerformanceTracker } from './cbtPerformanceTracker';
import type { DistortionType } from '@/ai/cbt/types';

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  promptsShown: number;
  acceptanceRate: number;
  declineRate: number;
  crisisHits: number;
  avgLatencyMs: number;
  precisionScore?: number;
  manualLabels?: {
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
  };
}

export interface MetricsEvent {
  timestamp: number;
  type: 'prompt_shown' | 'accepted' | 'declined' | 'crisis_detected' | 'manual_label';
  data?: {
    distortionTypes?: DistortionType[];
    latencyMs?: number;
    crisisLevel?: 'low' | 'medium' | 'high' | 'emergency';
    manualLabel?: 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative';
    messageLength?: number;
  };
}

export interface CBTMetricsSummary {
  totalPrompts: number;
  overallAcceptanceRate: number;
  overallDeclineRate: number;
  totalCrisisHits: number;
  avgLatency: number;
  precisionScore: number;
  dailyMetrics: DailyMetrics[];
  lastUpdated: number;
}

class CBTMetricsService {
  private readonly STORAGE_KEY = 'cbt_metrics_data';
  private readonly EVENTS_KEY = 'cbt_metrics_events';
  private readonly MAX_EVENTS = 1000;
  private readonly RETENTION_DAYS = 90;

  /**
   * Record a prompt being shown to user
   */
  recordPromptShown(distortionTypes: DistortionType[], latencyMs: number, messageLength: number): void {
    this.recordEvent({
      timestamp: Date.now(),
      type: 'prompt_shown',
      data: {
        distortionTypes,
        latencyMs,
        messageLength
      }
    });

    this.updateDailyMetrics('promptsShown', 1);
  }

  /**
   * Record user accepting a suggestion
   */
  recordAcceptance(distortionTypes: DistortionType[]): void {
    this.recordEvent({
      timestamp: Date.now(),
      type: 'accepted',
      data: { distortionTypes }
    });

    this.updateDailyMetrics('accepted', 1);
  }

  /**
   * Record user declining a suggestion
   */
  recordDecline(distortionTypes: DistortionType[]): void {
    this.recordEvent({
      timestamp: Date.now(),
      type: 'declined',
      data: { distortionTypes }
    });

    this.updateDailyMetrics('declined', 1);
  }

  /**
   * Record crisis detection
   */
  recordCrisisHit(level: 'low' | 'medium' | 'high' | 'emergency' = 'medium'): void {
    this.recordEvent({
      timestamp: Date.now(),
      type: 'crisis_detected',
      data: { crisisLevel: level }
    });

    this.updateDailyMetrics('crisisHits', 1);
  }

  /**
   * Record manual labeling for precision proxy
   */
  recordManualLabel(
    label: 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative',
    distortionTypes: DistortionType[]
  ): void {
    this.recordEvent({
      timestamp: Date.now(),
      type: 'manual_label',
      data: {
        manualLabel: label,
        distortionTypes
      }
    });

    this.updateManualLabels(label);
  }

  /**
   * Get comprehensive metrics summary
   */
  getMetricsSummary(): CBTMetricsSummary {
    const dailyMetrics = this.getDailyMetrics();
    const feedbackMetrics = cbtFeedbackService.getFeedbackMetrics();
    const performanceStats = cbtPerformanceTracker.getStats();

    const totalPrompts = dailyMetrics.reduce((sum, day) => sum + day.promptsShown, 0);
    const totalAccepted = feedbackMetrics.helpfulCount;
    const totalDeclined = feedbackMetrics.declineCount;
    const totalCrisis = dailyMetrics.reduce((sum, day) => sum + day.crisisHits, 0);

    // Calculate precision from manual labels if available
    const manualLabels = this.getAggregatedManualLabels();
    const precisionScore = manualLabels.truePositives + manualLabels.falsePositives > 0
      ? manualLabels.truePositives / (manualLabels.truePositives + manualLabels.falsePositives)
      : 0;

    return {
      totalPrompts,
      overallAcceptanceRate: totalPrompts > 0 ? totalAccepted / totalPrompts : 0,
      overallDeclineRate: totalPrompts > 0 ? totalDeclined / totalPrompts : 0,
      totalCrisisHits: totalCrisis,
      avgLatency: performanceStats.avgTotalTime,
      precisionScore,
      dailyMetrics,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get metrics for specific date range
   */
  getMetricsForDateRange(startDate: string, endDate: string): DailyMetrics[] {
    const dailyMetrics = this.getDailyMetrics();
    return dailyMetrics.filter(day => day.date >= startDate && day.date <= endDate);
  }

  /**
   * Export metrics as CSV-ready data
   */
  exportMetricsCSV(): string {
    const summary = this.getMetricsSummary();
    const headers = [
      'date',
      'prompts_shown',
      'acceptance_rate',
      'decline_rate',
      'crisis_hits',
      'avg_latency_ms',
      'precision_score'
    ].join(',');

    const rows = summary.dailyMetrics.map(day => [
      day.date,
      day.promptsShown,
      day.acceptanceRate.toFixed(3),
      day.declineRate.toFixed(3),
      day.crisisHits,
      day.avgLatencyMs.toFixed(2),
      (day.precisionScore || 0).toFixed(3)
    ].join(','));

    return [headers, ...rows].join('\n');
  }

  /**
   * Clear all metrics data (for testing)
   */
  clearMetrics(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.EVENTS_KEY);
    } catch (error) {
      console.warn('[CBT Metrics] Failed to clear metrics:', error);
    }
  }

  // Private methods

  private recordEvent(event: MetricsEvent): void {
    try {
      const events = this.getEvents();
      events.push(event);

      // Trim to max events
      if (events.length > this.MAX_EVENTS) {
        events.splice(0, events.length - this.MAX_EVENTS);
      }

      // Remove old events
      const cutoff = Date.now() - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const filteredEvents = events.filter(e => e.timestamp > cutoff);

      localStorage.setItem(this.EVENTS_KEY, JSON.stringify(filteredEvents));
    } catch (error) {
      console.warn('[CBT Metrics] Failed to record event:', error);
    }
  }

  private getEvents(): MetricsEvent[] {
    try {
      const stored = localStorage.getItem(this.EVENTS_KEY);
      if (stored) {
        const events = JSON.parse(stored);
        return Array.isArray(events) ? events : [];
      }
    } catch (error) {
      console.warn('[CBT Metrics] Failed to load events:', error);
    }
    return [];
  }

  private updateDailyMetrics(type: string, increment: number): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyMetrics = this.getDailyMetrics();
      
      let todayMetrics = dailyMetrics.find(day => day.date === today);
      if (!todayMetrics) {
        todayMetrics = {
          date: today,
          promptsShown: 0,
          acceptanceRate: 0,
          declineRate: 0,
          crisisHits: 0,
          avgLatencyMs: 0
        };
        dailyMetrics.push(todayMetrics);
      }

      // Update the specific metric
      switch (type) {
        case 'promptsShown':
          todayMetrics.promptsShown += increment;
          break;
        case 'accepted':
          // Will be calculated from totals
          break;
        case 'declined':
          // Will be calculated from totals
          break;
        case 'crisisHits':
          todayMetrics.crisisHits += increment;
          break;
      }

      // Recalculate rates
      const todayEvents = this.getEvents().filter(e => {
        const eventDate = new Date(e.timestamp).toISOString().split('T')[0];
        return eventDate === today;
      });

      const todayAccepted = todayEvents.filter(e => e.type === 'accepted').length;
      const todayDeclined = todayEvents.filter(e => e.type === 'declined').length;
      const todayLatencies = todayEvents
        .filter(e => e.type === 'prompt_shown' && e.data?.latencyMs)
        .map(e => e.data!.latencyMs!);

      todayMetrics.acceptanceRate = todayMetrics.promptsShown > 0 
        ? todayAccepted / todayMetrics.promptsShown 
        : 0;
      todayMetrics.declineRate = todayMetrics.promptsShown > 0 
        ? todayDeclined / todayMetrics.promptsShown 
        : 0;
      todayMetrics.avgLatencyMs = todayLatencies.length > 0
        ? todayLatencies.reduce((sum, lat) => sum + lat, 0) / todayLatencies.length
        : 0;

      this.saveDailyMetrics(dailyMetrics);
    } catch (error) {
      console.warn('[CBT Metrics] Failed to update daily metrics:', error);
    }
  }

  private updateManualLabels(label: string): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyMetrics = this.getDailyMetrics();
      
      let todayMetrics = dailyMetrics.find(day => day.date === today);
      if (!todayMetrics) {
        todayMetrics = {
          date: today,
          promptsShown: 0,
          acceptanceRate: 0,
          declineRate: 0,
          crisisHits: 0,
          avgLatencyMs: 0,
          manualLabels: { truePositives: 0, falsePositives: 0, trueNegatives: 0, falseNegatives: 0 }
        };
        dailyMetrics.push(todayMetrics);
      }

      if (!todayMetrics.manualLabels) {
        todayMetrics.manualLabels = { truePositives: 0, falsePositives: 0, trueNegatives: 0, falseNegatives: 0 };
      }

      switch (label) {
        case 'true_positive':
          todayMetrics.manualLabels.truePositives++;
          break;
        case 'false_positive':
          todayMetrics.manualLabels.falsePositives++;
          break;
        case 'true_negative':
          todayMetrics.manualLabels.trueNegatives++;
          break;
        case 'false_negative':
          todayMetrics.manualLabels.falseNegatives++;
          break;
      }

      // Update precision score
      const { truePositives, falsePositives } = todayMetrics.manualLabels;
      todayMetrics.precisionScore = truePositives + falsePositives > 0
        ? truePositives / (truePositives + falsePositives)
        : 0;

      this.saveDailyMetrics(dailyMetrics);
    } catch (error) {
      console.warn('[CBT Metrics] Failed to update manual labels:', error);
    }
  }

  private getDailyMetrics(): DailyMetrics[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const metrics = JSON.parse(stored);
        return Array.isArray(metrics) ? metrics : [];
      }
    } catch (error) {
      console.warn('[CBT Metrics] Failed to load daily metrics:', error);
    }
    return [];
  }

  private saveDailyMetrics(metrics: DailyMetrics[]): void {
    try {
      // Keep only recent data
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);
      const cutoffString = cutoffDate.toISOString().split('T')[0];
      
      const recentMetrics = metrics.filter(day => day.date >= cutoffString);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentMetrics));
    } catch (error) {
      console.warn('[CBT Metrics] Failed to save daily metrics:', error);
    }
  }

  private getAggregatedManualLabels() {
    const dailyMetrics = this.getDailyMetrics();
    return dailyMetrics.reduce((acc, day) => {
      if (day.manualLabels) {
        acc.truePositives += day.manualLabels.truePositives;
        acc.falsePositives += day.manualLabels.falsePositives;
        acc.trueNegatives += day.manualLabels.trueNegatives;
        acc.falseNegatives += day.manualLabels.falseNegatives;
      }
      return acc;
    }, { truePositives: 0, falsePositives: 0, trueNegatives: 0, falseNegatives: 0 });
  }
}

export const cbtMetricsService = new CBTMetricsService();
