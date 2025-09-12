/**
 * P19: Task System Canary Rollout Service
 * Manages 5% → 25% → 100% cohort rollout for Task system
 * Tracks stability metrics and rollback triggers
 */

import type { FeatureFlag } from '@/config/flags';
import { metricsService } from './metricsService';

export interface TaskCanaryConfig {
  enabled: boolean;
  currentPhase: 'off' | 'phase1_5pct' | 'phase2_25pct' | 'phase3_100pct';
  userCohorts: {
    phase1: string[]; // 5%
    phase2: string[]; // 25% 
    phase3: string[]; // 100%
  };
  stabilityThresholds: {
    minSuccessRate: number; // 0.95 = 95%
    maxErrorRate: number; // 0.05 = 5%
    rollbackTrigger: number; // 0.80 = 80%
  };
  phaseStartDates: Record<string, number>;
  description: string;
  lastStabilityCheck: number;
}

export interface TaskCanaryStatus {
  isInCanary: boolean;
  canaryEnabled: boolean;
  userPhase: 'none' | 'phase1' | 'phase2' | 'phase3';
  stabilityScore: number;
  flagOverrides: Partial<Record<FeatureFlag, boolean>>;
  source: 'canary' | 'feature_flag' | 'default';
}

export interface TaskStabilityMetrics {
  attempted: number;
  completed: number;
  errors: number;
  successRate: number;
  stabilityScore: number;
  timeWindow: number;
  lastUpdated: number;
}

class TaskCanaryService {
  private readonly STORAGE_KEY = 'task_canary_config';
  private readonly METRICS_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  private defaultConfig: TaskCanaryConfig = {
    enabled: false,
    currentPhase: 'off',
    userCohorts: {
      phase1: [],
      phase2: [],
      phase3: []
    },
    stabilityThresholds: {
      minSuccessRate: 0.95,
      maxErrorRate: 0.05,
      rollbackTrigger: 0.80
    },
    phaseStartDates: {},
    description: 'Task System Canary Rollout - P19',
    lastStabilityCheck: 0
  };

  /**
   * Check if user is in canary cohort and which phase
   */
  getUserCanaryStatus(userId?: string): TaskCanaryStatus {
    if (!userId) {
      return {
        isInCanary: false,
        canaryEnabled: false,
        userPhase: 'none',
        stabilityScore: 1.0,
        flagOverrides: {},
        source: 'default'
      };
    }

    const config = this.getCanaryConfig();
    if (!config.enabled) {
      return {
        isInCanary: false,
        canaryEnabled: false,
        userPhase: 'none',
        stabilityScore: 1.0,
        flagOverrides: {},
        source: 'feature_flag'
      };
    }

    // Determine user phase
    let userPhase: 'none' | 'phase1' | 'phase2' | 'phase3' = 'none';
    let flagOverrides: Partial<Record<FeatureFlag, boolean>> = {};

    if (config.userCohorts.phase3.includes(userId)) {
      userPhase = 'phase3';
      flagOverrides = { taskAdapter: true };
    } else if (config.userCohorts.phase2.includes(userId)) {
      userPhase = 'phase2';
      flagOverrides = { taskAdapter: true };
    } else if (config.userCohorts.phase1.includes(userId)) {
      userPhase = 'phase1';
      flagOverrides = { taskAdapter: true };
    }

    const stabilityScore = this.calculateStabilityScore();

    return {
      isInCanary: userPhase !== 'none',
      canaryEnabled: config.enabled,
      userPhase,
      stabilityScore,
      flagOverrides: userPhase !== 'none' ? flagOverrides : {},
      source: userPhase !== 'none' ? 'canary' : 'feature_flag'
    };
  }

  /**
   * Advance to next canary phase
   */
  advancePhase(): boolean {
    const config = this.getCanaryConfig();
    const stabilityScore = this.calculateStabilityScore();

    // Check stability before advancing
    if (stabilityScore < config.stabilityThresholds.minSuccessRate) {
      console.warn(`[Task Canary] Cannot advance: stability score ${stabilityScore} below threshold ${config.stabilityThresholds.minSuccessRate}`);
      return false;
    }

    let newPhase: TaskCanaryConfig['currentPhase'] = config.currentPhase;

    switch (config.currentPhase) {
      case 'off':
        newPhase = 'phase1_5pct';
        this.populatePhase1Cohort();
        break;
      case 'phase1_5pct':
        newPhase = 'phase2_25pct';
        this.populatePhase2Cohort();
        break;
      case 'phase2_25pct':
        newPhase = 'phase3_100pct';
        this.populatePhase3Cohort();
        break;
      case 'phase3_100pct':
        console.log('[Task Canary] Already at 100% rollout');
        return false;
    }

    const updatedConfig = {
      ...config,
      currentPhase: newPhase,
      phaseStartDates: {
        ...config.phaseStartDates,
        [newPhase]: Date.now()
      }
    };

    this.updateCanaryConfig(updatedConfig);
    console.log(`[Task Canary] Advanced to ${newPhase}`);
    return true;
  }

  /**
   * Rollback to previous phase due to stability issues
   */
  rollback(reason: string): void {
    const config = this.getCanaryConfig();
    let newPhase: TaskCanaryConfig['currentPhase'] = config.currentPhase;

    switch (config.currentPhase) {
      case 'phase3_100pct':
        newPhase = 'phase2_25pct';
        break;
      case 'phase2_25pct':
        newPhase = 'phase1_5pct';
        break;
      case 'phase1_5pct':
        newPhase = 'off';
        break;
      case 'off':
        console.log('[Task Canary] Already rolled back to off');
        return;
    }

    const updatedConfig = {
      ...config,
      currentPhase: newPhase
    };

    this.updateCanaryConfig(updatedConfig);
    console.warn(`[Task Canary] Rolled back to ${newPhase} due to: ${reason}`);

    // Track rollback metrics
    metricsService.emit('task_system_stability', 0, {
      action: 'rollback',
      reason,
      fromPhase: config.currentPhase,
      toPhase: newPhase,
      timestamp: Date.now()
    });
  }

  /**
   * Calculate current stability score
   */
  calculateStabilityScore(): number {
    const metrics = this.getStabilityMetrics();
    if (metrics.attempted === 0) return 1.0; // No data = stable

    return metrics.successRate;
  }

  /**
   * Get stability metrics for current time window
   */
  getStabilityMetrics(): TaskStabilityMetrics {
    const timeWindow = this.METRICS_WINDOW;
    const allMetrics = metricsService.getMetrics(timeWindow);
    
    const attempted = allMetrics.filter(m => m.type === 'task_attempted').length;
    const completed = allMetrics.filter(m => m.type === 'task_completed').length;
    const errors = allMetrics.filter(m => 
      m.type === 'task_attempted' && 
      !allMetrics.some(c => c.type === 'task_completed' && c.metadata?.taskId === m.metadata?.taskId)
    ).length;

    const successRate = attempted > 0 ? completed / attempted : 1.0;
    const stabilityScore = Math.max(0, successRate - (errors / Math.max(attempted, 1)));

    return {
      attempted,
      completed,
      errors,
      successRate,
      stabilityScore,
      timeWindow,
      lastUpdated: Date.now()
    };
  }

  /**
   * Check stability and auto-rollback if needed
   */
  checkStabilityAndRollback(): boolean {
    const config = this.getCanaryConfig();
    const stabilityScore = this.calculateStabilityScore();

    if (stabilityScore < config.stabilityThresholds.rollbackTrigger) {
      this.rollback(`Stability score ${stabilityScore} below rollback trigger ${config.stabilityThresholds.rollbackTrigger}`);
      return true;
    }

    // Update last check time
    this.updateCanaryConfig({
      ...config,
      lastStabilityCheck: Date.now()
    });

    return false;
  }

  /**
   * Get canary statistics
   */
  getCanaryStats(): {
    enabled: boolean;
    currentPhase: string;
    totalUsers: number;
    phaseUsers: Record<string, number>;
    stabilityMetrics: TaskStabilityMetrics;
    phaseStartDates: Record<string, string>;
  } {
    const config = this.getCanaryConfig();
    const stabilityMetrics = this.getStabilityMetrics();

    return {
      enabled: config.enabled,
      currentPhase: config.currentPhase,
      totalUsers: Object.values(config.userCohorts).flat().length,
      phaseUsers: {
        phase1: config.userCohorts.phase1.length,
        phase2: config.userCohorts.phase2.length,
        phase3: config.userCohorts.phase3.length
      },
      stabilityMetrics,
      phaseStartDates: Object.entries(config.phaseStartDates).reduce((acc, [phase, timestamp]) => {
        acc[phase] = new Date(timestamp).toISOString();
        return acc;
      }, {} as Record<string, string>)
    };
  }

  /**
   * Enable/disable canary program
   */
  setCanaryEnabled(enabled: boolean): void {
    const config = this.getCanaryConfig();
    this.updateCanaryConfig({
      ...config,
      enabled,
      currentPhase: enabled ? config.currentPhase : 'off'
    });
    console.log(`[Task Canary] ${enabled ? 'Enabled' : 'Disabled'} canary program`);
  }

  /**
   * Manually add user to specific phase (dev override)
   */
  addUserToPhase(userId: string, phase: 'phase1' | 'phase2' | 'phase3'): void {
    const config = this.getCanaryConfig();
    
    // Remove from other phases first
    Object.keys(config.userCohorts).forEach(p => {
      const index = config.userCohorts[p as keyof typeof config.userCohorts].indexOf(userId);
      if (index > -1) {
        config.userCohorts[p as keyof typeof config.userCohorts].splice(index, 1);
      }
    });

    // Add to specified phase
    if (!config.userCohorts[phase].includes(userId)) {
      config.userCohorts[phase].push(userId);
    }

    this.updateCanaryConfig(config);
    console.log(`[Task Canary] Added user ${userId} to ${phase}`);
  }

  // Private methods

  private getCanaryConfig(): TaskCanaryConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        return { ...this.defaultConfig, ...config };
      }
    } catch (error) {
      console.warn('[Task Canary] Failed to load config:', error);
    }
    
    return { ...this.defaultConfig };
  }

  private updateCanaryConfig(config: Partial<TaskCanaryConfig>): void {
    const current = this.getCanaryConfig();
    const updated = { ...current, ...config };
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.warn('[Task Canary] Failed to update config:', error);
    }
  }

  private populatePhase1Cohort(): void {
    // In real implementation, this would select 5% of users
    // For demo, we'll add a sample user
    const config = this.getCanaryConfig();
    config.userCohorts.phase1 = ['demo_user_5pct'];
    this.updateCanaryConfig(config);
  }

  private populatePhase2Cohort(): void {
    // Add phase1 users + additional 20% for total 25%
    const config = this.getCanaryConfig();
    config.userCohorts.phase2 = [
      ...config.userCohorts.phase1,
      'demo_user_25pct_1',
      'demo_user_25pct_2',
      'demo_user_25pct_3'
    ];
    this.updateCanaryConfig(config);
  }

  private populatePhase3Cohort(): void {
    // Add all users for 100% rollout
    const config = this.getCanaryConfig();
    config.userCohorts.phase3 = [
      ...config.userCohorts.phase2,
      'all_users' // Special marker for 100%
    ];
    this.updateCanaryConfig(config);
  }
}

export const taskCanaryService = new TaskCanaryService();