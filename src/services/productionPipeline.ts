/**
 * Production Deployment Pipeline - P20 Phase 3
 * Manages feature flag graduation and canary rollouts
 */

import { telemetryService } from './telemetryService';
import { taskCanaryService } from './taskCanaryService';
import { isFeatureEnabled, toggleFeatureFlag, type FeatureFlag } from '@/config/flags';

interface DeploymentStage {
  name: string;
  percentage: number;
  duration: number; // hours
  flags: Partial<Record<FeatureFlag, boolean>>;
  gates: string[];
  rollbackThreshold: number;
}

interface DeploymentPlan {
  name: string;
  stages: DeploymentStage[];
  currentStage: number;
  startedAt: number;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'failed' | 'rolled_back';
}

class ProductionPipelineService {
  private readonly deploymentPlans: Record<string, DeploymentPlan> = {};
  private readonly monitoringInterval: number = 5 * 60 * 1000; // 5 minutes
  private monitoringTimer?: NodeJS.Timeout;

  constructor() {
    this.loadPersistedState();
    this.startMonitoring();
  }

  /**
   * Create and start a new deployment plan
   */
  createDeploymentPlan(planName: string): DeploymentPlan {
    const plan: DeploymentPlan = {
      name: planName,
      currentStage: -1,
      startedAt: 0,
      status: 'planning',
      stages: this.getDefaultStages()
    };

    this.deploymentPlans[planName] = plan;
    this.persistState();
    
    telemetryService.track('deployment_plan_created', { planName });
    
    return plan;
  }

  /**
   * Start deployment execution
   */
  async startDeployment(planName: string): Promise<boolean> {
    const plan = this.deploymentPlans[planName];
    if (!plan) {
      throw new Error(`Deployment plan '${planName}' not found`);
    }

    if (plan.status !== 'planning') {
      throw new Error(`Cannot start deployment - plan is in '${plan.status}' state`);
    }

    // Validate P20 gates before starting
    const gateResults = await this.runP20Gates();
    if (!gateResults.passed) {
      telemetryService.track('deployment_blocked', { 
        planName, 
        reason: 'P20 gates failed',
        failures: gateResults.failures 
      });
      return false;
    }

    plan.status = 'active';
    plan.startedAt = Date.now();
    plan.currentStage = 0;
    
    await this.executeStage(planName, 0);
    this.persistState();
    
    telemetryService.track('deployment_started', { planName });
    
    return true;
  }

  /**
   * Execute a specific deployment stage
   */
  private async executeStage(planName: string, stageIndex: number): Promise<void> {
    const plan = this.deploymentPlans[planName];
    const stage = plan.stages[stageIndex];
    
    if (!stage) {
      plan.status = 'completed';
      telemetryService.track('deployment_completed', { planName });
      return;
    }

    console.log(`[Pipeline] Executing stage: ${stage.name} (${stage.percentage}%)`);
    
    // Apply feature flags for this stage
    Object.entries(stage.flags).forEach(([flag, enabled]) => {
      toggleFeatureFlag(flag as FeatureFlag, enabled);
    });

    // Update canary configuration
    if (stage.name.includes('Canary')) {
      taskCanaryService.setCanaryEnabled(true);
      // Would configure user cohorts here in production
    }

    telemetryService.track('deployment_stage_started', {
      planName,
      stageName: stage.name,
      stageIndex,
      percentage: stage.percentage
    });

    // Stage will auto-advance after duration or manual approval
    setTimeout(() => {
      this.checkStageCompletion(planName, stageIndex);
    }, stage.duration * 60 * 60 * 1000); // Convert hours to ms
  }

  /**
   * Check if current stage should advance or rollback
   */
  private async checkStageCompletion(planName: string, stageIndex: number): Promise<void> {
    const plan = this.deploymentPlans[planName];
    if (plan.status !== 'active') return;

    const stage = plan.stages[stageIndex];
    const rollbackCheck = telemetryService.shouldTriggerRollback();
    
    if (rollbackCheck.shouldRollback) {
      await this.rollbackDeployment(planName, rollbackCheck.reason!);
      return;
    }

    const readinessScore = telemetryService.getProductionReadinessScore();
    
    if (readinessScore >= stage.rollbackThreshold) {
      // Advance to next stage
      plan.currentStage++;
      if (plan.currentStage < plan.stages.length) {
        await this.executeStage(planName, plan.currentStage);
      } else {
        plan.status = 'completed';
        telemetryService.track('deployment_completed', { planName });
      }
    } else {
      // Pause deployment for manual review
      plan.status = 'paused';
      telemetryService.track('deployment_paused', {
        planName,
        stageName: stage.name,
        readinessScore,
        threshold: stage.rollbackThreshold
      });
    }
    
    this.persistState();
  }

  /**
   * Manually advance to next stage
   */
  async advanceStage(planName: string): Promise<boolean> {
    const plan = this.deploymentPlans[planName];
    if (!plan || plan.status !== 'paused') {
      return false;
    }

    plan.status = 'active';
    plan.currentStage++;
    
    if (plan.currentStage < plan.stages.length) {
      await this.executeStage(planName, plan.currentStage);
    } else {
      plan.status = 'completed';
    }
    
    this.persistState();
    return true;
  }

  /**
   * Rollback deployment to previous safe state
   */
  async rollbackDeployment(planName: string, reason: string): Promise<void> {
    const plan = this.deploymentPlans[planName];
    if (!plan) return;

    plan.status = 'rolled_back';
    
    // Disable all experimental flags
    const experimentalFlags: FeatureFlag[] = [
      'taskAdapter', 'viewSdk', 'kanbanView', 'matrixView', 
      'planningMode', 'autoWriteCalendar', 'crdtPilot'
    ];
    
    experimentalFlags.forEach(flag => {
      toggleFeatureFlag(flag, false);
    });

    // Disable canary rollout
    taskCanaryService.setCanaryEnabled(false);
    
    telemetryService.track('deployment_rolled_back', {
      planName,
      reason,
      stageName: plan.stages[plan.currentStage]?.name
    });
    
    this.persistState();
    
    console.error(`[Pipeline] Deployment rolled back: ${reason}`);
  }

  /**
   * Get current deployment status
   */
  getDeploymentStatus(planName: string): DeploymentPlan | null {
    return this.deploymentPlans[planName] || null;
  }

  /**
   * Get all deployment plans
   */
  getAllDeployments(): Record<string, DeploymentPlan> {
    return { ...this.deploymentPlans };
  }

  /**
   * Run P20 validation gates
   */
  private async runP20Gates(): Promise<{ passed: boolean; failures: string[] }> {
    // In production, this would run actual tests
    // For now, return mock validation based on current flags
    
    const criticalFlags: FeatureFlag[] = ['taskAdapter', 'viewSdk', 'listView'];
    const failures: string[] = [];
    
    criticalFlags.forEach(flag => {
      if (!isFeatureEnabled(flag)) {
        failures.push(`Critical flag disabled: ${flag}`);
      }
    });

    // Check telemetry health
    const readinessScore = telemetryService.getProductionReadinessScore();
    if (readinessScore < 0.7) {
      failures.push(`Production readiness score too low: ${(readinessScore * 100).toFixed(1)}%`);
    }

    return {
      passed: failures.length === 0,
      failures
    };
  }

  /**
   * Get default deployment stages
   */
  private getDefaultStages(): DeploymentStage[] {
    return [
      {
        name: 'Internal Testing',
        percentage: 0,
        duration: 2, // 2 hours
        flags: {
          taskAdapter: true,
          viewSdk: true
        },
        gates: ['build', 'accessibility', 'performance'],
        rollbackThreshold: 0.9
      },
      {
        name: '5% Canary',
        percentage: 5,
        duration: 24, // 24 hours
        flags: {
          taskAdapter: true,
          viewSdk: true,
          listView: true
        },
        gates: ['task-roundtrip', 'watch-health', 'crdt-conflicts'],
        rollbackThreshold: 0.8
      },
      {
        name: '25% Rollout',
        percentage: 25,
        duration: 48, // 48 hours
        flags: {
          taskAdapter: true,
          viewSdk: true,
          listView: true,
          kanbanView: true,
          matrixView: true
        },
        gates: ['oauth-incremental', 'cbt-compliance', 'privacy-controls'],
        rollbackThreshold: 0.75
      },
      {
        name: 'Full Production',
        percentage: 100,
        duration: 0, // Permanent
        flags: {
          taskAdapter: true,
          viewSdk: true,
          listView: true,
          kanbanView: true,
          matrixView: true,
          planningMode: true,
          autoWriteCalendar: true
        },
        gates: ['performance-budgets', 'assistant-cohesion'],
        rollbackThreshold: 0.7
      }
    ];
  }

  /**
   * Start continuous monitoring
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.monitoringInterval);
  }

  /**
   * Perform regular health checks
   */
  private performHealthCheck(): void {
    Object.entries(this.deploymentPlans).forEach(([planName, plan]) => {
      if (plan.status === 'active') {
        const rollbackCheck = telemetryService.shouldTriggerRollback();
        if (rollbackCheck.shouldRollback) {
          this.rollbackDeployment(planName, rollbackCheck.reason!);
        }
      }
    });
  }

  /**
   * Load persisted deployment state
   */
  private loadPersistedState(): void {
    try {
      const saved = localStorage.getItem('deployment_plans');
      if (saved) {
        const plans = JSON.parse(saved);
        Object.assign(this.deploymentPlans, plans);
      }
    } catch (error) {
      console.warn('[Pipeline] Failed to load persisted state:', error);
    }
  }

  /**
   * Persist deployment state
   */
  private persistState(): void {
    try {
      localStorage.setItem('deployment_plans', JSON.stringify(this.deploymentPlans));
    } catch (error) {
      console.warn('[Pipeline] Failed to persist state:', error);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
  }
}

export const productionPipelineService = new ProductionPipelineService();