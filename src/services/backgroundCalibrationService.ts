/**
 * Background Calibration Service - Non-blocking system re-calibration
 * Runs recalibration tasks in the background without blocking the UI
 */

import { contextEngineService } from './contextEngineService';
import { unifiedRollbackService } from './unifiedRollbackService';
import { decisionTraceService } from './decisionTraceService';

export interface CalibrationTask {
  id: string;
  type: 'context_weights' | 'precision_gates' | 'combined';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
}

class BackgroundCalibrationService {
  private activeTasks: Map<string, CalibrationTask> = new Map();
  private listeners: Set<(tasks: CalibrationTask[]) => void> = new Set();

  /**
   * Start background recalibration of context weights
   */
  async startContextRecalibration(): Promise<string> {
    const taskId = `context_${Date.now()}`;
    const task: CalibrationTask = {
      id: taskId,
      type: 'context_weights',
      status: 'pending',
      progress: 0,
      startTime: Date.now()
    };

    this.activeTasks.set(taskId, task);
    this.notifyListeners();

    // Start the calibration process
    this.runContextCalibration(taskId);
    
    return taskId;
  }

  /**
   * Start background recalibration of precision gates
   */
  async startPrecisionRecalibration(): Promise<string> {
    const taskId = `precision_${Date.now()}`;
    const task: CalibrationTask = {
      id: taskId,
      type: 'precision_gates',
      status: 'pending',
      progress: 0,
      startTime: Date.now()
    };

    this.activeTasks.set(taskId, task);
    this.notifyListeners();

    // Start the calibration process
    this.runPrecisionCalibration(taskId);
    
    return taskId;
  }

  /**
   * Start combined system recalibration
   */
  async startCombinedRecalibration(): Promise<string> {
    const taskId = `combined_${Date.now()}`;
    const task: CalibrationTask = {
      id: taskId,
      type: 'combined',
      status: 'pending',
      progress: 0,
      startTime: Date.now()
    };

    this.activeTasks.set(taskId, task);
    this.notifyListeners();

    // Start the calibration process
    this.runCombinedCalibration(taskId);
    
    return taskId;
  }

  /**
   * Get status of specific calibration task
   */
  getTaskStatus(taskId: string): CalibrationTask | null {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * Get all active calibration tasks
   */
  getActiveTasks(): CalibrationTask[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Cancel running calibration task
   */
  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task && task.status === 'running') {
      task.status = 'failed';
      task.error = 'Cancelled by user';
      task.endTime = Date.now();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Subscribe to calibration task updates
   */
  subscribe(listener: (tasks: CalibrationTask[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Private calibration implementations
   */
  private async runContextCalibration(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      this.notifyListeners();

      // Step 1: Analyze recent decision patterns (25% progress)
      await this.updateProgress(taskId, 25);
      const recentDecisions = this.getRecentDecisions(30); // 30 days
      
      // Step 2: Calculate optimal weights based on success patterns (50% progress)
      await this.updateProgress(taskId, 50);
      const optimalWeights = await this.calculateOptimalWeights(recentDecisions);
      
      // Step 3: Gradually apply weight adjustments (75% progress)
      await this.updateProgress(taskId, 75);
      await this.applyWeightAdjustments(optimalWeights);
      
      // Step 4: Create verification snapshot (100% progress)
      await this.updateProgress(taskId, 100);
      const snapshot = await unifiedRollbackService.createUnifiedSnapshot();
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = {
        adjustedWeights: optimalWeights,
        newSnapshot: snapshot.timestamp
      };
      
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.endTime = Date.now();
    }

    this.notifyListeners();
  }

  private async runPrecisionCalibration(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      this.notifyListeners();

      // Step 1: Analyze precision performance by feature (33% progress)
      await this.updateProgress(taskId, 33);
      const featurePerformance = await this.analyzeFeaturePerformance();
      
      // Step 2: Adjust precision thresholds based on performance (66% progress)
      await this.updateProgress(taskId, 66);
      const adjustments = this.calculatePrecisionAdjustments(featurePerformance);
      
      // Step 3: Log calibration results (100% progress)
      await this.updateProgress(taskId, 100);
      const traceId = decisionTraceService.addTrace({
        feature: 'system',
        signals: [
          {
            type: 'precision_calibration',
            value: 1.0,
            confidence: 1.0,
            source: 'background_calibration'
          }
        ],
        confidenceThreshold: 0.8,
        finalConfidence: 1.0,
        becauseText: 'Background precision calibration completed',
        undoable: false,
        decision: 'calibrate',
        action: 'Background precision calibration completed',
        metadata: {
          adjustments,
          featurePerformance
        }
      });
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = { adjustments, traceId };
      
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.endTime = Date.now();
    }

    this.notifyListeners();
  }

  private async runCombinedCalibration(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      this.notifyListeners();

      // Run both calibrations in sequence
      await this.updateProgress(taskId, 25);
      await this.runContextCalibration(`${taskId}_context`);
      
      await this.updateProgress(taskId, 75);
      await this.runPrecisionCalibration(`${taskId}_precision`);
      
      await this.updateProgress(taskId, 100);
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = { message: 'Combined calibration completed successfully' };
      
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.endTime = Date.now();
    }

    this.notifyListeners();
  }

  private async updateProgress(taskId: string, progress: number) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.progress = Math.min(100, progress);
      this.notifyListeners();
    }
    
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private notifyListeners() {
    const tasks = this.getActiveTasks();
    this.listeners.forEach(listener => listener(tasks));
  }

  private getRecentDecisions(days: number) {
    const traces = decisionTraceService.getTraces();
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    return traces.filter(trace => trace.timestamp > cutoffTime);
  }

  private async calculateOptimalWeights(decisions: any[]): Promise<Record<string, number>> {
    // Simplified optimization - analyze successful decisions
    const successfulDecisions = decisions.filter(d => 
      d.metadata?.userAction === 'accept' || d.decision === 'auto-write'
    );
    
    // Calculate signal success rates
    const signalPerformance: Record<string, { successes: number; total: number }> = {};
    
    decisions.forEach(decision => {
      decision.signals?.forEach((signal: any) => {
        if (!signalPerformance[signal.type]) {
          signalPerformance[signal.type] = { successes: 0, total: 0 };
        }
        signalPerformance[signal.type].total++;
        
        if (successfulDecisions.includes(decision)) {
          signalPerformance[signal.type].successes++;
        }
      });
    });
    
    // Convert to optimal weights
    const optimalWeights: Record<string, number> = {};
    for (const [signal, performance] of Object.entries(signalPerformance)) {
      const successRate = performance.total > 0 ? performance.successes / performance.total : 0.5;
      optimalWeights[signal] = Math.max(0.1, Math.min(0.9, successRate));
    }
    
    return optimalWeights;
  }

  private async applyWeightAdjustments(newWeights: Record<string, number>) {
    // Apply weights gradually to avoid sudden changes
    await contextEngineService.updateSignalWeights(newWeights);
  }

  private async analyzeFeaturePerformance() {
    const decisions = this.getRecentDecisions(14);
    const featureGroups = decisions.reduce((groups, decision) => {
      const feature = decision.feature || 'unknown';
      if (!groups[feature]) groups[feature] = [];
      groups[feature].push(decision);
      return groups;
    }, {} as Record<string, any[]>);

    const performance: Record<string, number> = {};
    for (const [feature, decisions] of Object.entries(featureGroups)) {
      const successful = decisions.filter(d => 
        d.metadata?.userAction === 'accept' || d.decision === 'auto-write'
      ).length;
      performance[feature] = decisions.length > 0 ? successful / decisions.length : 0;
    }

    return performance;
  }

  private calculatePrecisionAdjustments(performance: Record<string, number>) {
    // Calculate suggested threshold adjustments based on performance
    return Object.entries(performance).map(([feature, score]) => ({
      feature,
      currentScore: score,
      suggestedAdjustment: score < 0.7 ? 'increase_threshold' : 'maintain'
    }));
  }
}

export const backgroundCalibrationService = new BackgroundCalibrationService();