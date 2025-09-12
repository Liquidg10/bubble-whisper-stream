/**
 * Precision Drift Tracker - Monitor Auto-Write precision degradation
 * Tracks entity fill rates, user trust scores, and decision accuracy over time
 */

import { autoWritePrecisionGate, PrecisionGateInput, PrecisionGateResult } from './autoWritePrecisionGate';
import { decisionTraceService } from './decisionTraceService';

export interface PrecisionSnapshot {
  timestamp: number;
  accuracy: number;
  entityFillRate: number;
  userTrustAvg: number;
  featureBreakdown: Record<string, {
    accuracy: number;
    decisions: number;
    entityFill: number;
  }>;
  totalDecisions: number;
  avgConfidence: number;
}

export interface PrecisionDriftMetrics {
  weekOverWeekAccuracy: number;
  entityFillTrend: number;
  trustScoreTrend: number;
  featureDriftSeverity: 'stable' | 'minor' | 'moderate' | 'high';
  mostDriftingFeature: string;
}

class PrecisionDriftTrackerService {
  private readonly STORAGE_KEY = 'precisionDriftSnapshots';
  private readonly MAX_SNAPSHOTS = 14; // 14 days
  
  private readonly DRIFT_THRESHOLDS = {
    minor: 0.05,    // 5% accuracy drop
    moderate: 0.15, // 15% accuracy drop
    high: 0.25      // 25% accuracy drop
  };

  /**
   * Create precision snapshot from recent decision traces
   */
  async createSnapshot(): Promise<PrecisionSnapshot> {
    const recentTraces = this.getRecentDecisionTraces(7); // Last 7 days
    
    const timestamp = Date.now();
    const totalDecisions = recentTraces.length;
    
    if (totalDecisions === 0) {
      return {
        timestamp,
        accuracy: 0,
        entityFillRate: 0,
        userTrustAvg: 0,
        featureBreakdown: {},
        totalDecisions: 0,
        avgConfidence: 0
      };
    }

    // Calculate overall accuracy (accepted vs suggested/drafted)
    const acceptedDecisions = recentTraces.filter(trace => 
      trace.metadata?.userAction === 'accept' || 
      trace.decision === 'auto-write'
    ).length;
    const accuracy = acceptedDecisions / totalDecisions;

    // Calculate average entity fill rate
    const entityFillRates = recentTraces
      .map(trace => trace.metadata?.entityFillRate || 0)
      .filter(rate => rate > 0);
    const entityFillRate = entityFillRates.length > 0 ? 
      entityFillRates.reduce((sum, rate) => sum + rate, 0) / entityFillRates.length : 0;

    // Calculate average user trust score
    const userTrustScores = recentTraces
      .map(trace => trace.metadata?.userTrustScore || 0)
      .filter(score => score > 0);
    const userTrustAvg = userTrustScores.length > 0 ?
      userTrustScores.reduce((sum, score) => sum + score, 0) / userTrustScores.length : 0;

    // Calculate feature breakdown
    const featureBreakdown: Record<string, any> = {};
    const featureGroups = this.groupTracesByFeature(recentTraces);
    
    for (const [feature, traces] of Object.entries(featureGroups)) {
      const featureAccepted = traces.filter(trace => 
        trace.metadata?.userAction === 'accept' || 
        trace.decision === 'auto-write'
      ).length;
      
      const featureEntityFills = traces
        .map(trace => trace.metadata?.entityFillRate || 0)
        .filter(rate => rate > 0);
      
      featureBreakdown[feature] = {
        accuracy: traces.length > 0 ? featureAccepted / traces.length : 0,
        decisions: traces.length,
        entityFill: featureEntityFills.length > 0 ? 
          featureEntityFills.reduce((sum, rate) => sum + rate, 0) / featureEntityFills.length : 0
      };
    }

    // Calculate average confidence
    const confidenceScores = recentTraces.map(trace => trace.finalConfidence || 0);
    const avgConfidence = confidenceScores.length > 0 ?
      confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length : 0;

    return {
      timestamp,
      accuracy,
      entityFillRate,
      userTrustAvg,
      featureBreakdown,
      totalDecisions,
      avgConfidence
    };
  }

  /**
   * Save precision snapshot to storage
   */
  saveSnapshot(snapshot: PrecisionSnapshot): void {
    try {
      const snapshots = this.loadSnapshots();
      const newSnapshots = [...snapshots, snapshot].slice(-this.MAX_SNAPSHOTS);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newSnapshots));
    } catch (error) {
      console.error('Failed to save precision snapshot:', error);
    }
  }

  /**
   * Load all precision snapshots
   */
  loadSnapshots(): PrecisionSnapshot[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load precision snapshots:', error);
      return [];
    }
  }

  /**
   * Calculate precision drift metrics
   */
  calculateDriftMetrics(snapshots: PrecisionSnapshot[]): PrecisionDriftMetrics | null {
    if (snapshots.length < 2) return null;

    const current = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];

    // Calculate accuracy trend
    const weekOverWeekAccuracy = current.accuracy - previous.accuracy;
    
    // Calculate entity fill trend
    const entityFillTrend = current.entityFillRate - previous.entityFillRate;
    
    // Calculate trust score trend
    const trustScoreTrend = current.userTrustAvg - previous.userTrustAvg;

    // Find most drifting feature
    let maxDrift = 0;
    let mostDriftingFeature = 'none';
    
    for (const feature in current.featureBreakdown) {
      if (previous.featureBreakdown[feature]) {
        const drift = Math.abs(
          current.featureBreakdown[feature].accuracy - 
          previous.featureBreakdown[feature].accuracy
        );
        if (drift > maxDrift) {
          maxDrift = drift;
          mostDriftingFeature = feature;
        }
      }
    }

    // Determine drift severity
    let featureDriftSeverity: PrecisionDriftMetrics['featureDriftSeverity'] = 'stable';
    const accuracyDrop = Math.abs(weekOverWeekAccuracy);
    
    if (accuracyDrop > this.DRIFT_THRESHOLDS.high) featureDriftSeverity = 'high';
    else if (accuracyDrop > this.DRIFT_THRESHOLDS.moderate) featureDriftSeverity = 'moderate';
    else if (accuracyDrop > this.DRIFT_THRESHOLDS.minor) featureDriftSeverity = 'minor';

    return {
      weekOverWeekAccuracy,
      entityFillTrend,
      trustScoreTrend,
      featureDriftSeverity,
      mostDriftingFeature
    };
  }

  /**
   * Get recent decision traces for precision analysis
   */
  private getRecentDecisionTraces(days: number) {
    const traces = decisionTraceService.getTraces();
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return traces.filter(trace => 
      trace.timestamp > cutoffTime &&
      ['calendar', 'email', 'finance', 'reminder'].includes(trace.feature)
    );
  }

  /**
   * Group traces by feature type
   */
  private groupTracesByFeature(traces: any[]): Record<string, any[]> {
    return traces.reduce((groups, trace) => {
      const feature = trace.feature || 'unknown';
      if (!groups[feature]) groups[feature] = [];
      groups[feature].push(trace);
      return groups;
    }, {});
  }

  /**
   * Clear all stored precision snapshots
   */
  clearSnapshots(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

export const precisionDriftTracker = new PrecisionDriftTrackerService();