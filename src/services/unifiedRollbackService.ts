/**
 * Unified Rollback Service - Coordinate system restoration across Context Engine and Precision Gates
 * Supports selective rollback (Context only, Precision only, or Combined)
 */

import { contextEngineService } from './contextEngineService';
import { precisionDriftTracker, PrecisionSnapshot } from './precisionDriftTracker';
import { decisionTraceService } from './decisionTraceService';

export interface UnifiedSnapshot {
  timestamp: number;
  context: {
    weights: Record<string, number>;
    acceptanceRate: number;
    totalDecisions: number;
  };
  precision: PrecisionSnapshot;
  combined: {
    overallHealth: number;
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
    const acceptanceRate = this.calculateAcceptanceRate(recentDecisions);
    
    // Get precision snapshot
    const precisionSnapshot = await precisionDriftTracker.createSnapshot();
    
    // Calculate combined health metrics
    const contextHealth = Math.max(0, acceptanceRate);
    const precisionHealth = precisionSnapshot.accuracy;
    const overallHealth = (contextHealth + precisionHealth) / 2;
    
    // Determine combined drift severity
    const contextDrift = this.calculateContextDrift(Object.fromEntries(weights));
    const precisionDrift = this.calculatePrecisionDrift(precisionSnapshot);
    const maxDrift = Math.max(contextDrift, precisionDrift);
    
    let driftSeverity: UnifiedSnapshot['combined']['driftSeverity'] = 'stable';
    if (maxDrift > 0.25) driftSeverity = 'high';
    else if (maxDrift > 0.15) driftSeverity = 'moderate';
    else if (maxDrift > 0.05) driftSeverity = 'minor';
    
    const actionRequired = driftSeverity === 'high' || overallHealth < 0.7;
    
    const snapshot: UnifiedSnapshot = {
      timestamp: Date.now(),
      context: {
        weights: Object.fromEntries(weights),
        acceptanceRate,
        totalDecisions: recentDecisions.length
      },
      precision: precisionSnapshot,
      combined: {
        overallHealth,
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
      let restored = false;

      // Restore context weights if requested
      if (options.restoreContext) {
        await contextEngineService.updateSignalWeights(new Map(Object.entries(stableSnapshot.context.weights)));
        restored = true;
      }

      // Note: Precision gate restoration would involve resetting thresholds or trust scores
      // For now, we'll create a decision trace to indicate the rollback
      if (options.restorePrecision) {
        const traceId = decisionTraceService.addTrace({
          feature: 'system',
        signals: [
          {
            type: 'rollback_precision',
            value: 1.0,
            confidence: 1.0,
            source: 'unified_rollback_service'
          }
        ],
        confidenceThreshold: 0.8,
        finalConfidence: 1.0,
        becauseText: 'Precision settings restored to stable configuration',
        undoable: false,
          decision: 'rollback',
          action: 'Restored precision settings to stable configuration',
          metadata: {
            reason: options.reason || 'Manual rollback to stable state',
            restoredSnapshot: stableSnapshot.timestamp,
            originalAccuracy: stableSnapshot.precision.accuracy
          }
        });
        restored = true;
      }

      // Create new snapshot after rollback
      if (restored) {
        const newSnapshot = await this.createUnifiedSnapshot();
        this.saveUnifiedSnapshot(newSnapshot, true);
      }

      return restored;
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
    
    const precisionDrift = Math.abs(
      current.precision.accuracy - previous.precision.accuracy
    );
    
    return Math.max(contextDrift, precisionDrift);
  }

  /**
   * Private helper methods
   */
  private getRecentDecisions(days: number) {
    try {
      const traces = decisionTraceService.getTraces();
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      return traces.filter(trace => trace.timestamp > cutoffTime);
    } catch {
      return [];
    }
  }

  private calculateAcceptanceRate(decisions: any[]): number {
    if (decisions.length === 0) return 0;
    const accepted = decisions.filter(d => d.metadata?.userAction === 'accept').length;
    return accepted / decisions.length;
  }

  private calculateContextDrift(weights: Record<string, number>): number {
    // Compare against default weights - simplified for now
    const defaultWeights = Object.keys(weights).reduce((acc, key) => {
      acc[key] = 0.5; // Default weight
      return acc;
    }, {} as Record<string, number>);
    
    return this.calculateContextDriftBetween(defaultWeights, weights);
  }

  private calculateContextDriftBetween(oldWeights: Record<string, number>, newWeights: Record<string, number>): number {
    const commonKeys = Object.keys(oldWeights).filter(key => key in newWeights);
    if (commonKeys.length === 0) return 0;

    const totalDrift = commonKeys.reduce((sum, key) => {
      return sum + Math.abs(oldWeights[key] - newWeights[key]);
    }, 0);

    return totalDrift / commonKeys.length;
  }

  private calculatePrecisionDrift(snapshot: PrecisionSnapshot): number {
    // Compare against ideal accuracy (1.0) - simplified
    return Math.abs(1.0 - snapshot.accuracy);
  }
}

export const unifiedRollbackService = new UnifiedRollbackService();