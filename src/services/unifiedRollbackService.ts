/**
 * Unified Rollback Service - Coordinate system restoration across Context Engine and Precision Gates
 * Supports selective rollback (Context only, Precision only, or Combined)
 */

import { contextEngineService } from './contextEngineService';
import { precisionDriftTracker, PrecisionSnapshot } from './precisionDriftTracker';
import {
  decisionTraceService,
  isAcceptanceTelemetryTrace,
  summarizeDecisionOutcomes
} from './decisionTraceService';

export interface UnifiedSnapshot {
  timestamp: number;
  context: {
    weights: Record<string, number>;
    acceptanceRate: number | null;
    totalDecisions: number;
    outcomeDecisions: number;
    outcomeCoverage: number;
  };
  precision: PrecisionSnapshot;
  combined: {
    overallHealth: number | null;
    evidenceStatus: 'measured' | 'insufficient-data';
    driftSeverity: 'stable' | 'minor' | 'moderate' | 'high';
    actionRequired: boolean;
  };
}

export interface RollbackOptions {
  restoreContext?: boolean;
  restorePrecision?: boolean;
  reason?: string;
}

class UnifiedRollbackService {
  private readonly STORAGE_KEY = 'unifiedDriftSnapshots';
  private readonly STABLE_STORAGE_KEY = 'lastStableUnifiedSnapshot';
  
  /**
   * Create unified snapshot combining Context Engine and Precision metrics
   */
  async createUnifiedSnapshot(): Promise<UnifiedSnapshot> {
    // Get current context weights
    const weights = await contextEngineService.getSignalWeights();
    const recentDecisions = this.getRecentDecisions(7);
    const outcomeSummary = summarizeDecisionOutcomes(recentDecisions);
    const acceptanceRate = outcomeSummary.acceptanceRate;
    
    // Get precision snapshot
    const precisionSnapshot = await precisionDriftTracker.createSnapshot();
    
    // Calculate combined health metrics
    const contextHealth = acceptanceRate;
    const precisionHealth = precisionSnapshot.accuracy;
    const measuredHealth = [contextHealth, precisionHealth].filter(
      (value): value is number => value !== null
    );
    const overallHealth = measuredHealth.length > 0
      ? measuredHealth.reduce((sum, value) => sum + value, 0) / measuredHealth.length
      : null;
    
    // Determine combined drift severity
    const contextDrift = this.calculateContextDrift(Object.fromEntries(weights));
    const precisionDrift = this.calculatePrecisionDrift(precisionSnapshot);
    const maxDrift = precisionDrift === null
      ? contextDrift
      : Math.max(contextDrift, precisionDrift);
    
    let driftSeverity: UnifiedSnapshot['combined']['driftSeverity'] = 'stable';
    if (maxDrift > 0.25) driftSeverity = 'high';
    else if (maxDrift > 0.15) driftSeverity = 'moderate';
    else if (maxDrift > 0.05) driftSeverity = 'minor';
    
    // A configuration delta is useful context, but without any observed user
    // outcomes it is not evidence that the system is unhealthy. Keep the
    // snapshot visible while leaving rollback non-actionable until health can
    // actually be measured.
    const actionRequired = overallHealth !== null && (
      driftSeverity === 'high' || overallHealth < 0.7
    );
    
    const snapshot: UnifiedSnapshot = {
      timestamp: Date.now(),
      context: {
        weights: Object.fromEntries(weights),
        acceptanceRate,
        totalDecisions: recentDecisions.length,
        outcomeDecisions: outcomeSummary.resolvedDecisions,
        outcomeCoverage: outcomeSummary.outcomeCoverage
      },
      precision: precisionSnapshot,
      combined: {
        overallHealth,
        evidenceStatus: overallHealth === null ? 'insufficient-data' : 'measured',
        driftSeverity,
        actionRequired
      }
    };
    
    return snapshot;
  }

  /**
   * Save unified snapshot to storage
   */
  saveUnifiedSnapshot(snapshot: UnifiedSnapshot, markAsStable = false): void {
    try {
      // Save to regular snapshots
      const snapshots = this.loadUnifiedSnapshots();
      const newSnapshots = [...snapshots, snapshot].slice(-14);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newSnapshots));
      
      // Save as stable if requested
      if (markAsStable) {
        localStorage.setItem(this.STABLE_STORAGE_KEY, JSON.stringify(snapshot));
      }
    } catch (error) {
      console.error('Failed to save unified snapshot:', error);
    }
  }

  /**
   * Load all unified snapshots
   */
  loadUnifiedSnapshots(): UnifiedSnapshot[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load unified snapshots:', error);
      return [];
    }
  }

  /**
   * Get last stable unified snapshot
   */
  getLastStableSnapshot(): UnifiedSnapshot | null {
    try {
      const stored = localStorage.getItem(this.STABLE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load stable snapshot:', error);
      return null;
    }
  }

  /**
   * Restore system to stable configuration
   */
  async restoreToStable(options: RollbackOptions = { restoreContext: true, restorePrecision: true }): Promise<boolean> {
    const stableSnapshot = this.getLastStableSnapshot();
    if (!stableSnapshot) return false;

    try {
      const requestedComponents: Array<'context' | 'precision'> = [];
      const restoredComponents: Array<'context'> = [];
      const skippedComponents: Array<'precision'> = [];

      if (options.restoreContext) requestedComponents.push('context');
      if (options.restorePrecision) requestedComponents.push('precision');

      // Restore context weights if requested
      if (options.restoreContext) {
        await contextEngineService.updateSignalWeights(new Map(Object.entries(stableSnapshot.context.weights)));
        restoredComponents.push('context');
      }

      // Precision restoration is not implemented. Keep the request visible in
      // the audit metadata, but never report it as a successful restoration.
      if (options.restorePrecision) {
        skippedComponents.push('precision');
      }

      if (restoredComponents.length === 0) return false;

      decisionTraceService.addTrace({
        feature: 'system',
        signals: [
          {
            type: 'rollback_context',
            value: 1.0,
            confidence: 1.0,
            source: 'unified_rollback_service'
          }
        ],
        confidenceThreshold: 0.8,
        finalConfidence: 1.0,
        becauseText: skippedComponents.length > 0
          ? 'Context weights restored; precision settings were not restored because precision rollback is unavailable'
          : 'Context weights restored to stable configuration',
        undoable: false,
        decision: 'rollback',
        action: 'Restored context weights to stable configuration',
        metadata: {
          reason: options.reason || 'Manual rollback to stable state',
          restoredSnapshot: stableSnapshot.timestamp,
          originalAccuracy: stableSnapshot.precision.accuracy,
          requestedComponents,
          restoredComponents,
          skippedComponents,
          precisionRestoreAvailable: false
        }
      });

      // Create new snapshot after rollback
      const newSnapshot = await this.createUnifiedSnapshot();
      this.saveUnifiedSnapshot(newSnapshot, true);

      return true;
    } catch (error) {
      console.error('Failed to restore to stable configuration:', error);
      return false;
    }
  }

  /**
   * Calculate combined drift score for dashboard display
   */
  calculateCombinedDrift(current: UnifiedSnapshot, previous: UnifiedSnapshot): number {
    const contextDrift = this.calculateContextDriftBetween(
      previous.context.weights, 
      current.context.weights
    );
    
    const precisionDrift = current.precision.accuracy !== null && previous.precision.accuracy !== null
      ? Math.abs(current.precision.accuracy - previous.precision.accuracy)
      : 0;
    
    return Math.max(contextDrift, precisionDrift);
  }

  /**
   * Private helper methods
   */
  private getRecentDecisions(days: number) {
    try {
      const traces = decisionTraceService.getTraces();
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      return traces.filter(trace =>
        trace.timestamp > cutoffTime && isAcceptanceTelemetryTrace(trace)
      );
    } catch {
      return [];
    }
  }

  private calculateContextDrift(weights: Record<string, number>): number {
    // Drift is a change from the owner-designated stable configuration, not a
    // distance from an invented uniform weight. Until a stable snapshot exists,
    // the current configuration is the only honest baseline.
    const stableSnapshot = this.getLastStableSnapshot();
    if (!stableSnapshot) return 0;
    return this.calculateContextDriftBetween(stableSnapshot.context.weights, weights);
  }

  private calculateContextDriftBetween(oldWeights: Record<string, number>, newWeights: Record<string, number>): number {
    const commonKeys = Object.keys(oldWeights).filter(key => key in newWeights);
    if (commonKeys.length === 0) return 0;

    const totalDrift = commonKeys.reduce((sum, key) => {
      return sum + Math.abs(oldWeights[key] - newWeights[key]);
    }, 0);

    return totalDrift / commonKeys.length;
  }

  private calculatePrecisionDrift(snapshot: PrecisionSnapshot): number | null {
    if (snapshot.accuracy === null) return null;

    const stableAccuracy = this.getLastStableSnapshot()?.precision.accuracy;
    if (stableAccuracy === null || stableAccuracy === undefined) return 0;

    // Only degradation from the owner-designated stable snapshot is drift.
    // Distance from a perfect 100% acceptance rate is health, not drift.
    return Math.max(0, stableAccuracy - snapshot.accuracy);
  }
}

export const unifiedRollbackService = new UnifiedRollbackService();
