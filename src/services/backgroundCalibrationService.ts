/**
 * Background Calibration and Analysis Service
 * Applies evidence-gated context-weight calibration and separately produces
 * read-only precision-threshold recommendations without blocking the UI.
 */

import { contextEngineService } from './contextEngineService';
import { unifiedRollbackService } from './unifiedRollbackService';
import {
  decisionTraceService,
  getAcceptanceTelemetryFeature,
  getDecisionUserAction,
  isAcceptanceTelemetryTrace,
  summarizeDecisionOutcomes,
  type DecisionTrace
} from './decisionTraceService';

export type CalibrationEvidenceStatus = 'measured' | 'insufficient-data';

export interface PrecisionThresholdRecommendation {
  feature: string;
  currentScore: number;
  suggestedAdjustment: 'increase_threshold' | 'maintain';
}

export interface ContextCalibrationResult {
  kind: 'context-weight-calibration';
  applied: boolean;
  adjustedWeights: Record<string, number>;
  evidenceStatus: CalibrationEvidenceStatus;
  newSnapshot: number;
}

export interface PrecisionAnalysisResult {
  kind: 'precision-threshold-analysis';
  /** Precision thresholds are immutable in the current implementation. */
  applied: false;
  recommendations: PrecisionThresholdRecommendation[];
  traceId: string;
  evidenceStatus: CalibrationEvidenceStatus;
}

export interface CombinedCalibrationResult {
  kind: 'context-calibration-and-precision-analysis';
  /** True only when context weights were actually updated. */
  applied: boolean;
  context: ContextCalibrationResult;
  precision: PrecisionAnalysisResult;
  evidenceStatus: CalibrationEvidenceStatus;
}

export type CalibrationTaskResult =
  | ContextCalibrationResult
  | PrecisionAnalysisResult
  | CombinedCalibrationResult;

export interface CalibrationTask {
  id: string;
  type: 'context_weights' | 'precision_analysis' | 'combined';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  startTime: number;
  endTime?: number;
  result?: CalibrationTaskResult;
  error?: string;
}

class BackgroundCalibrationService {
  private activeTasks: Map<string, CalibrationTask> = new Map();
  private listeners: Set<(tasks: CalibrationTask[]) => void> = new Set();
  private readonly MIN_SIGNAL_OUTCOMES = 5;
  private readonly CALIBRATION_PRIOR_STRENGTH = 10;

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
   * Start read-only analysis of precision-gate outcomes
   */
  async startPrecisionAnalysis(): Promise<string> {
    const taskId = `precision_${Date.now()}`;
    const task: CalibrationTask = {
      id: taskId,
      type: 'precision_analysis',
      status: 'pending',
      progress: 0,
      startTime: Date.now()
    };

    this.activeTasks.set(taskId, task);
    this.notifyListeners();

    // Start the recommendation analysis
    this.runPrecisionAnalysis(taskId);
    
    return taskId;
  }

  /** @deprecated Precision currently produces recommendations; it does not recalibrate thresholds. */
  async startPrecisionRecalibration(): Promise<string> {
    return this.startPrecisionAnalysis();
  }

  /**
   * Start context calibration plus read-only precision analysis
   */
  async startCombinedCalibrationReview(): Promise<string> {
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

    // Start the combined calibration/analysis process
    this.runCombinedCalibrationReview(taskId);
    
    return taskId;
  }

  /** @deprecated Use startCombinedCalibrationReview for truthful operation naming. */
  async startCombinedRecalibration(): Promise<string> {
    return this.startCombinedCalibrationReview();
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

      const result = await this.performContextCalibration(
        progress => this.updateProgress(taskId, progress)
      );
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.endTime = Date.now();
    }

    this.notifyListeners();
  }

  private async runPrecisionAnalysis(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      this.notifyListeners();

      const result = await this.performPrecisionAnalysis(
        progress => this.updateProgress(taskId, progress)
      );
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.endTime = Date.now();
    }

    this.notifyListeners();
  }

  private async runCombinedCalibrationReview(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      this.notifyListeners();

      const context = await this.performContextCalibration(
        progress => this.updateProgress(taskId, Math.round(progress * 0.5))
      );
      const precision = await this.performPrecisionAnalysis(
        progress => this.updateProgress(taskId, 50 + Math.round(progress * 0.5))
      );
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = {
        kind: 'context-calibration-and-precision-analysis',
        applied: context.applied,
        context,
        precision,
        evidenceStatus: context.evidenceStatus === 'measured' || precision.evidenceStatus === 'measured'
          ? 'measured'
          : 'insufficient-data'
      };
      
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
    return traces.filter(trace =>
      trace.timestamp > cutoffTime && isAcceptanceTelemetryTrace(trace)
    );
  }

  private async performContextCalibration(
    reportProgress: (progress: number) => Promise<void>
  ) {
    await reportProgress(25);
    const recentDecisions = this.getRecentDecisions(30);

    await reportProgress(50);
    const optimalWeights = await this.calculateOptimalWeights(recentDecisions);

    await reportProgress(75);
    await this.applyWeightAdjustments(optimalWeights);

    await reportProgress(100);
    const snapshot = await unifiedRollbackService.createUnifiedSnapshot();

    return {
      kind: 'context-weight-calibration' as const,
      applied: Object.keys(optimalWeights).length > 0,
      adjustedWeights: optimalWeights,
      evidenceStatus: Object.keys(optimalWeights).length > 0
        ? 'measured' as const
        : 'insufficient-data' as const,
      newSnapshot: snapshot.timestamp
    };
  }

  private async performPrecisionAnalysis(
    reportProgress: (progress: number) => Promise<void>
  ) {
    await reportProgress(33);
    const featurePerformance = await this.analyzeFeaturePerformance();
    const hasOutcomeEvidence = Object.keys(featurePerformance).length > 0;

    await reportProgress(66);
    const recommendations = this.calculatePrecisionRecommendations(featurePerformance);

    await reportProgress(100);
    const traceId = decisionTraceService.addTrace({
      feature: 'system',
      signals: [
        {
          type: 'precision_threshold_analysis',
          value: 1.0,
          confidence: 1.0,
          source: 'background_calibration'
        }
      ],
      confidenceThreshold: 0.8,
      finalConfidence: 1.0,
      becauseText: hasOutcomeEvidence
        ? 'Precision threshold analysis generated recommendations from observed outcomes; no thresholds were changed'
        : 'Precision threshold analysis found insufficient outcome evidence; no thresholds were changed',
      undoable: false,
      decision: 'calibrate',
      action: hasOutcomeEvidence
        ? 'Generated precision threshold recommendations'
        : 'Precision threshold analysis found insufficient evidence',
      metadata: {
        analysisKind: 'precision-threshold-recommendations',
        applied: false,
        recommendations,
        featurePerformance,
        evidenceStatus: hasOutcomeEvidence ? 'measured' : 'insufficient-data'
      }
    });

    return {
      kind: 'precision-threshold-analysis' as const,
      applied: false as const,
      recommendations,
      traceId,
      evidenceStatus: hasOutcomeEvidence
        ? 'measured' as const
        : 'insufficient-data' as const
    };
  }

  private async calculateOptimalWeights(decisions: DecisionTrace[]): Promise<Record<string, number>> {
    // Only explicit user outcomes are training evidence. Pending decisions and
    // automatic execution must not silently lower or raise signal weights.
    const resolvedDecisions = decisions.filter(decision => getDecisionUserAction(decision));
    const successfulDecisions = new Set(
      resolvedDecisions.filter(decision => getDecisionUserAction(decision) === 'accept')
    );
    
    // Calculate signal success rates
    const signalPerformance: Record<string, { successes: number; total: number }> = {};
    
    resolvedDecisions.forEach(decision => {
      // One user decision contributes at most one observation per signal type,
      // even if a producer emitted duplicate signal entries on the trace.
      const signalTypes = new Set(decision.signals?.map(signal => signal.type) || []);
      signalTypes.forEach(signalType => {
        if (!signalPerformance[signalType]) {
          signalPerformance[signalType] = { successes: 0, total: 0 };
        }
        signalPerformance[signalType].total++;
        
        if (successfulDecisions.has(decision)) {
          signalPerformance[signalType].successes++;
        }
      });
    });
    
    const currentWeights = await contextEngineService.getSignalWeights();

    // Require repeated evidence, then shrink the observed rate toward the
    // current configured weight. This prevents one interaction from replacing
    // a production signal weight with an extreme value.
    const optimalWeights: Record<string, number> = {};
    for (const [signal, performance] of Object.entries(signalPerformance)) {
      if (performance.total < this.MIN_SIGNAL_OUTCOMES) continue;

      const successRate = performance.successes / performance.total;
      const currentWeight = currentWeights.get(signal) ?? 0.5;
      const evidenceWeight = performance.total /
        (performance.total + this.CALIBRATION_PRIOR_STRENGTH);
      const blendedWeight = currentWeight * (1 - evidenceWeight) + successRate * evidenceWeight;
      optimalWeights[signal] = Math.max(0.1, Math.min(0.9, blendedWeight));
    }
    
    return optimalWeights;
  }

  private async applyWeightAdjustments(newWeights: Record<string, number>) {
    if (Object.keys(newWeights).length === 0) return;
    // Apply weights gradually to avoid sudden changes
    await contextEngineService.updateSignalWeights(new Map(Object.entries(newWeights)));
  }

  private async analyzeFeaturePerformance() {
    const decisions = this.getRecentDecisions(14);
    const featureGroups = decisions.reduce((groups, decision) => {
      const feature = getAcceptanceTelemetryFeature(decision) || 'unknown';
      if (!groups[feature]) groups[feature] = [];
      groups[feature].push(decision);
      return groups;
    }, {} as Record<string, DecisionTrace[]>);

    const performance: Record<string, number> = {};
    for (const [feature, decisions] of Object.entries(featureGroups)) {
      const outcomeSummary = summarizeDecisionOutcomes(decisions);
      if (outcomeSummary.resolvedDecisions < this.MIN_SIGNAL_OUTCOMES) continue;

      // Shrink feature performance toward a neutral 50% prior so the first
      // eligible sample cannot create an extreme threshold recommendation.
      performance[feature] = (
        outcomeSummary.accepted + (0.5 * this.CALIBRATION_PRIOR_STRENGTH)
      ) / (outcomeSummary.resolvedDecisions + this.CALIBRATION_PRIOR_STRENGTH);
    }

    return performance;
  }

  private calculatePrecisionRecommendations(
    performance: Record<string, number>
  ): PrecisionThresholdRecommendation[] {
    // Recommend possible threshold changes for human review. This method does
    // not mutate PRECISION_THRESHOLDS or any persisted gate configuration.
    return Object.entries(performance).map(([feature, score]) => ({
      feature,
      currentScore: score,
      suggestedAdjustment: score < 0.7
        ? 'increase_threshold' as const
        : 'maintain' as const
    }));
  }
}

export const backgroundCalibrationService = new BackgroundCalibrationService();
