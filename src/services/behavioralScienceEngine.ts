/**
 * P1 - Behavioral Science Engine
 * Neuromodulator-aware UI, rhythm learning, and predictable micro-rewards
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import { logger } from '@/utils/logger';

export interface StressIndicator {
  source: 'calendar_density' | 'task_completion' | 'message_sentiment' | 'time_pressure';
  level: number; // 0-1
  timestamp: number;
  context?: Record<string, any>;
}

export interface EnergyWindow {
  hour: number;
  dayOfWeek: number;
  energyLevel: number; // 0-1
  completionRate: number;
  sampleCount: number;
  lastUpdated: number;
}

export interface AttentionState {
  mode: 'default_mode' | 'task_positive' | 'transitional';
  confidence: number;
  indicators: string[];
  suggestedAction?: 'reset' | 'continue' | 'pause';
  lastUpdated: number;
}

export interface NeuromodulatorContext {
  noradrenergineLevel: number; // 0-1 (stress/arousal)
  acetylcholineLevel: number; // 0-1 (attention/focus)
  dopamineContext: 'seeking' | 'reward' | 'baseline';
  recommendedStimuli: 'reduce' | 'maintain' | 'increase';
}

class BehavioralScienceEngine {
  private stressHistory: StressIndicator[] = [];
  private energyWindows: Map<string, EnergyWindow> = new Map();
  private attentionState: AttentionState | null = null;
  private lastRewardTime: number = 0;
  private rewardCooldown: number = 300000; // 5 minutes

  // Stress Detection & Management
  detectStressLevel(): number {
    const recent = this.stressHistory.filter(s => Date.now() - s.timestamp < 3600000); // 1 hour
    if (recent.length === 0) return 0;

    const weightedSum = recent.reduce((sum, indicator) => {
      const age = Date.now() - indicator.timestamp;
      const weight = Math.exp(-age / 1800000); // Exponential decay over 30 minutes
      return sum + (indicator.level * weight);
    }, 0);

    const totalWeight = recent.reduce((sum, indicator) => {
      const age = Date.now() - indicator.timestamp;
      return sum + Math.exp(-age / 1800000);
    }, 0);

    return totalWeight > 0 ? Math.min(1, weightedSum / totalWeight) : 0;
  }

  addStressIndicator(indicator: StressIndicator): void {
    this.stressHistory.push(indicator);
    
    // Keep only last 24 hours
    const cutoff = Date.now() - 86400000;
    this.stressHistory = this.stressHistory.filter(s => s.timestamp > cutoff);
    
    logger.debug('Stress indicator added', { level: indicator.level, source: indicator.source });
  }

  // Rhythm-Aware Timing
  learnEnergyWindow(completedTask: boolean): void {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const key = `${dayOfWeek}-${hour}`;
    
    const existing = this.energyWindows.get(key) || {
      hour,
      dayOfWeek,
      energyLevel: 0.5,
      completionRate: 0.5,
      sampleCount: 0,
      lastUpdated: Date.now()
    };

    // Update completion rate with exponential moving average
    const alpha = Math.min(0.3, 1 / (existing.sampleCount + 1));
    existing.completionRate = existing.completionRate * (1 - alpha) + (completedTask ? 1 : 0) * alpha;
    existing.sampleCount++;
    existing.lastUpdated = Date.now();

    this.energyWindows.set(key, existing);
    logger.debug('Energy window updated', { hour, dayOfWeek, completionRate: existing.completionRate });
  }

  getCurrentEnergyWindow(): EnergyWindow | null {
    const now = new Date();
    const key = `${now.getDay()}-${now.getHours()}`;
    return this.energyWindows.get(key) || null;
  }

  getOptimalWindows(minCompletionRate = 0.7): EnergyWindow[] {
    return Array.from(this.energyWindows.values())
      .filter(w => w.completionRate >= minCompletionRate && w.sampleCount >= 3)
      .sort((a, b) => b.completionRate - a.completionRate);
  }

  // Attention State Monitoring
  updateAttentionState(taskSwitches: number, timeOnTask: number, rumination: boolean): void {
    let mode: AttentionState['mode'] = 'default_mode';
    const indicators: string[] = [];

    if (timeOnTask > 300000 && taskSwitches < 2) { // 5+ minutes focused
      mode = 'task_positive';
      indicators.push('sustained_focus');
    } else if (taskSwitches > 5 || rumination) {
      mode = 'default_mode';
      indicators.push(taskSwitches > 5 ? 'high_switching' : 'rumination_detected');
    } else {
      mode = 'transitional';
      indicators.push('moderate_activity');
    }

    this.attentionState = {
      mode,
      confidence: this.calculateAttentionConfidence(indicators),
      indicators,
      suggestedAction: this.suggestAttentionAction(mode, indicators),
      lastUpdated: Date.now()
    };

    logger.debug('Attention state updated', this.attentionState);
  }

  private calculateAttentionConfidence(indicators: string[]): number {
    // Simple heuristic - more specific indicators = higher confidence
    const specificIndicators = ['sustained_focus', 'rumination_detected'];
    const hasSpecific = indicators.some(i => specificIndicators.includes(i));
    return hasSpecific ? 0.8 : 0.5;
  }

  private suggestAttentionAction(mode: AttentionState['mode'], indicators: string[]): 'reset' | 'continue' | 'pause' {
    if (mode === 'task_positive') return 'continue';
    if (indicators.includes('rumination_detected')) return 'reset';
    if (indicators.includes('high_switching')) return 'pause';
    return 'continue';
  }

  // Neuromodulator Context
  getNeuromodulatorContext(): NeuromodulatorContext {
    const stressLevel = this.detectStressLevel();
    const currentWindow = this.getCurrentEnergyWindow();
    
    // Simplified neuromodulator estimation
    const noradrenergineLevel = Math.min(1, stressLevel + (currentWindow?.completionRate || 0.5) * 0.3);
    const acetylcholineLevel = this.attentionState?.mode === 'task_positive' ? 0.8 : 0.4;
    
    let dopamineContext: NeuromodulatorContext['dopamineContext'] = 'baseline';
    if (Date.now() - this.lastRewardTime < 300000) dopamineContext = 'reward';
    else if (this.attentionState?.mode === 'transitional') dopamineContext = 'seeking';

    let recommendedStimuli: NeuromodulatorContext['recommendedStimuli'] = 'maintain';
    if (noradrenergineLevel > 0.7) recommendedStimuli = 'reduce';
    else if (acetylcholineLevel < 0.3) recommendedStimuli = 'increase';

    return {
      noradrenergineLevel,
      acetylcholineLevel,
      dopamineContext,
      recommendedStimuli
    };
  }

  // Predictable Micro-Rewards
  shouldOfferMicroReward(effortLevel: number = 0.5): boolean {
    const timeSinceLastReward = Date.now() - this.lastRewardTime;
    const cooldownMet = timeSinceLastReward > this.rewardCooldown;
    const effortThreshold = effortLevel > 0.3; // Minimum effort required
    const notOverstressed = this.detectStressLevel() < 0.8;

    return cooldownMet && effortThreshold && notOverstressed;
  }

  deliverMicroReward(type: 'completion' | 'progress' | 'effort'): void {
    this.lastRewardTime = Date.now();
    
    // Adjust cooldown based on type (predictable timing)
    switch (type) {
      case 'completion':
        this.rewardCooldown = 300000; // 5 minutes
        break;
      case 'progress':
        this.rewardCooldown = 600000; // 10 minutes
        break;
      case 'effort':
        this.rewardCooldown = 900000; // 15 minutes
        break;
    }

    logger.debug('Micro-reward delivered', { type, nextRewardIn: this.rewardCooldown });
  }

  // Calm Mode Integration
  shouldEnterCalmMode(): boolean {
    const stressLevel = this.detectStressLevel();
    const context = this.getNeuromodulatorContext();
    
    return stressLevel > 0.8 || context.recommendedStimuli === 'reduce';
  }

  // Export/Analysis
  exportBehavioralData(): any {
    return {
      stressHistory: this.stressHistory.slice(-100), // Last 100 indicators
      energyWindows: Object.fromEntries(this.energyWindows),
      attentionState: this.attentionState,
      rewardTiming: {
        lastRewardTime: this.lastRewardTime,
        cooldown: this.rewardCooldown
      }
    };
  }
}

export const behavioralScienceEngine = new BehavioralScienceEngine();
