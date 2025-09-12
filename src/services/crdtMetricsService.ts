/**
 * CRDT Metrics Service - Recording and reporting conflict metrics
 * P17 Implementation: Measure merge reliability and performance
 */

import type { ConflictMetric, MergeReliabilityReport } from '@/services/crdtTaskService';

interface SyncOperation {
  id: string;
  timestamp: number;
  operation: 'taskstore_to_crdt' | 'crdt_to_taskstore' | 'device_sync';
  itemCount: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

interface PerformanceMetric {
  id: string;
  timestamp: number;
  operation: string;
  durationMs: number;
  memoryUsedMB?: number;
  taskCount: number;
}

interface RealtimeStats {
  activeConflicts: number;
  resolvedToday: number;
  reliabilityScore: number;
  lastSyncAt: number;
  totalOperations: number;
}

class CRDTMetricsService {
  private conflictMetrics: ConflictMetric[] = [];
  private syncOperations: SyncOperation[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private conflictCallbacks: ((metric: ConflictMetric) => void)[] = [];
  private storageKey = 'crdt-metrics';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Record a conflict metric
   */
  recordConflict(metric: ConflictMetric): void {
    this.conflictMetrics.push(metric);
    
    // Notify callbacks
    this.conflictCallbacks.forEach(callback => {
      try {
        callback(metric);
      } catch (error) {
        console.error('Error in conflict callback:', error);
      }
    });
    
    // Keep only last 1000 metrics
    if (this.conflictMetrics.length > 1000) {
      this.conflictMetrics = this.conflictMetrics.slice(-1000);
    }
    
    this.saveToStorage();
  }

  /**
   * Record a sync operation
   */
  recordSyncOperation(
    operation: SyncOperation['operation'],
    itemCount: number,
    durationMs: number,
    success: boolean = true,
    errorMessage?: string
  ): void {
    const syncOp: SyncOperation = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      operation,
      itemCount,
      durationMs,
      success,
      errorMessage
    };
    
    this.syncOperations.push(syncOp);
    
    // Keep only last 500 operations
    if (this.syncOperations.length > 500) {
      this.syncOperations = this.syncOperations.slice(-500);
    }
    
    this.saveToStorage();
  }

  /**
   * Record a performance metric
   */
  recordPerformance(
    operation: string,
    durationMs: number,
    taskCount: number,
    memoryUsedMB?: number
  ): void {
    const perfMetric: PerformanceMetric = {
      id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      operation,
      durationMs,
      memoryUsedMB,
      taskCount
    };
    
    this.performanceMetrics.push(perfMetric);
    
    // Keep only last 200 metrics
    if (this.performanceMetrics.length > 200) {
      this.performanceMetrics = this.performanceMetrics.slice(-200);
    }
    
    this.saveToStorage();
  }

  /**
   * Generate merge reliability report
   */
  generateReliabilityReport(timeWindowMs?: number): MergeReliabilityReport {
    const now = Date.now();
    const cutoff = timeWindowMs ? now - timeWindowMs : 0;
    
    const metrics = this.conflictMetrics.filter(m => m.timestamp >= cutoff);
    const autoResolved = metrics.filter(m => m.resolutionMethod === 'automerge').length;
    const dataLossEvents = metrics.filter(m => m.dataLossOccurred).length;
    const avgResolutionTime = metrics.length > 0 
      ? metrics.reduce((sum, m) => sum + m.resolutionTimeMs, 0) / metrics.length 
      : 0;
    
    const conflictsByType = metrics.reduce((acc, m) => {
      acc[m.conflictType] = (acc[m.conflictType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalConflicts: metrics.length,
      autoResolvedConflicts: autoResolved,
      dataLossEvents,
      averageResolutionTime: avgResolutionTime,
      conflictsByType,
      reliabilityScore: metrics.length > 0 ? autoResolved / metrics.length : 1
    };
  }

  /**
   * Export all metrics for analysis
   */
  exportMetricsForAnalysis(): {
    conflicts: ConflictMetric[];
    syncOperations: SyncOperation[];
    performance: PerformanceMetric[];
    report: MergeReliabilityReport;
  } {
    return {
      conflicts: [...this.conflictMetrics],
      syncOperations: [...this.syncOperations],
      performance: [...this.performanceMetrics],
      report: this.generateReliabilityReport()
    };
  }

  /**
   * Subscribe to conflict events
   */
  onConflictDetected(callback: (metric: ConflictMetric) => void): () => void {
    this.conflictCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.conflictCallbacks.indexOf(callback);
      if (index >= 0) {
        this.conflictCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get real-time statistics
   */
  getRealtimeStats(): RealtimeStats {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    const recentConflicts = this.conflictMetrics.filter(m => m.timestamp >= oneDayAgo);
    const activeConflicts = recentConflicts.filter(m => 
      m.resolutionMethod === 'manual' || m.dataLossOccurred
    ).length;
    
    const resolvedToday = recentConflicts.filter(m => 
      m.resolutionMethod === 'automerge' && !m.dataLossOccurred
    ).length;
    
    const reliabilityScore = recentConflicts.length > 0 
      ? resolvedToday / recentConflicts.length 
      : 1;
    
    const lastSync = this.syncOperations.length > 0 
      ? Math.max(...this.syncOperations.map(op => op.timestamp))
      : 0;
    
    return {
      activeConflicts,
      resolvedToday,
      reliabilityScore,
      lastSyncAt: lastSync,
      totalOperations: this.syncOperations.length
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const recent = this.performanceMetrics.filter(m => 
      m.timestamp > Date.now() - (60 * 60 * 1000) // Last hour
    );
    
    if (recent.length === 0) {
      return {
        averageDuration: 0,
        maxDuration: 0,
        averageMemory: 0,
        operationCount: 0
      };
    }
    
    return {
      averageDuration: recent.reduce((sum, m) => sum + m.durationMs, 0) / recent.length,
      maxDuration: Math.max(...recent.map(m => m.durationMs)),
      averageMemory: recent.filter(m => m.memoryUsedMB).length > 0 
        ? recent.filter(m => m.memoryUsedMB).reduce((sum, m) => sum + (m.memoryUsedMB || 0), 0) / recent.filter(m => m.memoryUsedMB).length
        : 0,
      operationCount: recent.length
    };
  }

  /**
   * Get sync operation statistics
   */
  getSyncStats() {
    const recentSyncs = this.syncOperations.filter(op => 
      op.timestamp > Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
    );
    
    if (recentSyncs.length === 0) {
      return {
        totalOperations: 0,
        successRate: 0,
        averageDuration: 0,
        totalItemsSynced: 0
      };
    }
    
    const successful = recentSyncs.filter(op => op.success).length;
    
    return {
      totalOperations: recentSyncs.length,
      successRate: successful / recentSyncs.length,
      averageDuration: recentSyncs.reduce((sum, op) => sum + op.durationMs, 0) / recentSyncs.length,
      totalItemsSynced: recentSyncs.reduce((sum, op) => sum + op.itemCount, 0)
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.conflictMetrics = [];
    this.syncOperations = [];
    this.performanceMetrics = [];
    this.saveToStorage();
  }

  /**
   * Save metrics to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        conflicts: this.conflictMetrics,
        syncOperations: this.syncOperations,
        performance: this.performanceMetrics,
        timestamp: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save CRDT metrics to storage:', error);
    }
  }

  /**
   * Load metrics from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.conflictMetrics = data.conflicts || [];
        this.syncOperations = data.syncOperations || [];
        this.performanceMetrics = data.performance || [];
      }
    } catch (error) {
      console.error('Failed to load CRDT metrics from storage:', error);
    }
  }
}

// Singleton instance
export const crdtMetricsService = new CRDTMetricsService();
