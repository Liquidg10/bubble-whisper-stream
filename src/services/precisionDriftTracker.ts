/**
 * Precision Drift Tracker - Monitor Auto-Write precision degradation
 * Tracks entity fill rates, user trust scores, and decision accuracy over time
 */

import {
  decisionTraceService,
  getAcceptanceTelemetryFeature,
  isAcceptanceTelemetryTrace,
  summarizeDecisionOutcomes
} from './decisionTraceService';
import type { DecisionTrace } from './decisionTraceService';

export interface PrecisionSnapshot {
  timestamp: number;
  accuracy: number | null;
  entityFillRate: number;
  userTrustAvg: number;
  featureBreakdown: Record<string, {
    accuracy: number | null;
    decisions: number;
    outcomeDecisions: number;
    outcomeCoverage: number;
    entityFill: number;
  }>;
  totalDecisions: number;
  outcomeDecisions: number;
  outcomeCoverage: number;
  evidenceStatus: 'measured' | 'insufficient-data';
  avgConfidence: number;
}

export interface PrecisionDriftMetrics {
  weekOverWeekAccuracy: number | null;
  entityFillTrend: number;
  trustScoreTrend: number;
  featureDriftSeverity: 'insufficient-data' | 'stable' | 'minor' | 'moderate' | 'high';
  mostDriftingFeature: string | null;
}

/**
 * autoWritePrecisionGate records its scoring components under `metadata.result`
 * (see autoWritePrecisionGate.createDecisionTrace). Earlier revisions of this file
 * read them from the top level of `metadata`, where nothing ever wrote them, so
 * entityFillRate and userTrustAvg reported 0 on every snapshot regardless of the
 * real values. Read the nested location first; fall back to the flat key so traces
 * from any other producer still count.
 */
function readMetric(trace: DecisionTrace, key: 'entityFillRate' | 'userTrustScore'): number | null {
  const nested = trace?.metadata?.result?.[key];
  if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  const flat = trace?.metadata?.[key];
  if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
  return null;
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
        accuracy: null,
        entityFillRate: 0,
        userTrustAvg: 0,
        featureBreakdown: {},
        totalDecisions: 0,
        outcomeDecisions: 0,
        outcomeCoverage: 0,
        evidenceStatus: 'insufficient-data',
        avgConfidence: 0
      };
    }

    // Accuracy is an observed user-acceptance rate. Pending decisions and
    // automatic execution are unmeasured, not failures or implicit accepts.
    const outcomeSummary = summarizeDecisionOutcomes(recentTraces);
    const accuracy = outcomeSummary.acceptanceRate;

    // Calculate average entity fill rate
    const entityFillRates = recentTraces
      .map(trace => readMetric(trace, 'entityFillRate'))
      .filter((rate): rate is number => rate !== null);
    const entityFillRate = entityFillRates.length > 0 ? 
      entityFillRates.reduce((sum, rate) => sum + rate, 0) / entityFillRates.length : 0;

    // Calculate average user trust score
    const userTrustScores = recentTraces
      .map(trace => readMetric(trace, 'userTrustScore'))
      .filter((score): score is number => score !== null);
    const userTrustAvg = userTrustScores.length > 0 ?
      userTrustScores.reduce((sum, score) => sum + score, 0) / userTrustScores.length : 0;

    // Calculate feature breakdown
    const featureBreakdown: PrecisionSnapshot['featureBreakdown'] = {};
    const featureGroups = this.groupTracesByFeature(recentTraces);
    
    for (const [feature, traces] of Object.entries(featureGroups)) {
      const featureOutcomes = summarizeDecisionOutcomes(traces);
      
      const featureEntityFills = traces
        .map(trace => readMetric(trace, 'entityFillRate'))
        .filter((rate): rate is number => rate !== null);
      
      featureBreakdown[feature] = {
        accuracy: featureOutcomes.acceptanceRate,
        decisions: traces.length,
        outcomeDecisions: featureOutcomes.resolvedDecisions,
        outcomeCoverage: featureOutcomes.outcomeCoverage,
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
      outcomeDecisions: outcomeSummary.resolvedDecisions,
      outcomeCoverage: outcomeSummary.outcomeCoverage,
      evidenceStatus: outcomeSummary.resolvedDecisions > 0 ? 'measured' : 'insufficient-data',
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
    const hasComparableAccuracy = current.accuracy !== null && previous.accuracy !== null;
    const weekOverWeekAccuracy = hasComparableAccuracy
      ? current.accuracy! - previous.accuracy!
      : null;
    
    // Calculate entity fill trend
    const entityFillTrend = current.entityFillRate - previous.entityFillRate;
    
    // Calculate trust score trend
    const trustScoreTrend = current.userTrustAvg - previous.userTrustAvg;

    // Find most drifting feature
    let maxDrift = 0;
    let mostDriftingFeature: string | null = null;
    
    for (const feature in current.featureBreakdown) {
      if (
        previous.featureBreakdown[feature] &&
        current.featureBreakdown[feature].accuracy !== null &&
        previous.featureBreakdown[feature].accuracy !== null
      ) {
        const drift = Math.abs(
          current.featureBreakdown[feature].accuracy! -
          previous.featureBreakdown[feature].accuracy!
        );
        if (drift > maxDrift) {
          maxDrift = drift;
          mostDriftingFeature = feature;
        }
      }
    }

    // Determine drift severity
    let featureDriftSeverity: PrecisionDriftMetrics['featureDriftSeverity'] = 'insufficient-data';
    if (weekOverWeekAccuracy !== null) {
      featureDriftSeverity = 'stable';
      // Positive deltas are improvements, not degradation. Only the magnitude
      // of a negative change should advance the drift severity.
      const accuracyDrop = Math.max(0, -weekOverWeekAccuracy);
      if (accuracyDrop > this.DRIFT_THRESHOLDS.high) featureDriftSeverity = 'high';
      else if (accuracyDrop > this.DRIFT_THRESHOLDS.moderate) featureDriftSeverity = 'moderate';
      else if (accuracyDrop > this.DRIFT_THRESHOLDS.minor) featureDriftSeverity = 'minor';
    }

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
    
    return traces.filter(trace => {
      if (trace.timestamp <= cutoffTime) return false;
      if (!isAcceptanceTelemetryTrace(trace)) return false;
      return ['calendar', 'email', 'finance', 'reminder'].includes(
        getAcceptanceTelemetryFeature(trace)
      );
    });
  }

  /**
   * Group traces by feature type
   */
  private groupTracesByFeature(traces: DecisionTrace[]): Record<string, DecisionTrace[]> {
    return traces.reduce<Record<string, DecisionTrace[]>>((groups, trace) => {
      const feature = getAcceptanceTelemetryFeature(trace) || 'unknown';
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
