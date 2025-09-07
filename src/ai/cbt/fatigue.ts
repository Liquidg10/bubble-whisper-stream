/**
 * CBT Fatigue Management - Rate limiting and cooldown enforcement
 */

import type { CBTPolicyContext, FatigueRule, DistortionType } from './types';

// Default fatigue rules
const DEFAULT_FATIGUE_RULES: FatigueRule[] = [
  {
    name: 'global_hourly_limit',
    condition: (context) => context.fatigueState.globalInterventions >= getHourlyLimit(context),
    cooldownMinutes: 60
  },
  {
    name: 'daily_limit',
    condition: (context) => context.fatigueState.dailyCount >= getDailyLimit(context),
    cooldownMinutes: 24 * 60 // Rest of day
  },
  {
    name: 'recent_intervention',
    condition: (context) => {
      const minGapMs = getMinInterventionGap(context);
      return (Date.now() - context.fatigueState.lastIntervention) < minGapMs;
    },
    cooldownMinutes: 30
  },
  {
    name: 'topic_specific_cooldown',
    condition: (context) => hasTopicCooldown(context),
    cooldownMinutes: 120,
    topicSpecific: undefined // Will be determined dynamically
  }
];

class CBTFatigueService {
  private rules: FatigueRule[] = DEFAULT_FATIGUE_RULES;
  
  /**
   * Check if intervention is allowed based on fatigue rules
   */
  canIntervene(context: CBTPolicyContext): {
    allowed: boolean;
    blockedBy?: string[];
    cooldownMinutes?: number;
    fatigueScore: number;
  } {
    const blockedBy: string[] = [];
    let maxCooldown = 0;
    
    for (const rule of this.rules) {
      if (rule.condition(context)) {
        blockedBy.push(rule.name);
        maxCooldown = Math.max(maxCooldown, rule.cooldownMinutes);
      }
    }
    
    const fatigueScore = this.calculateFatigueScore(context);
    
    return {
      allowed: blockedBy.length === 0,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      cooldownMinutes: maxCooldown > 0 ? maxCooldown : undefined,
      fatigueScore
    };
  }
  
  /**
   * Update fatigue state after an intervention
   */
  recordIntervention(
    fatigueState: CBTPolicyContext['fatigueState'],
    targetDistortions: DistortionType[]
  ): CBTPolicyContext['fatigueState'] {
    const now = Date.now();
    const today = new Date().toDateString();
    const lastInterventionDate = new Date(fatigueState.lastIntervention).toDateString();
    
    // Reset daily count if it's a new day
    const dailyCount = today === lastInterventionDate ? fatigueState.dailyCount + 1 : 1;
    
    // Update topic cooldowns
    const topicCooldowns = { ...fatigueState.topicCooldowns };
    targetDistortions.forEach(distortion => {
      topicCooldowns[distortion] = now + (2 * 60 * 60 * 1000); // 2 hour cooldown
    });
    
    return {
      ...fatigueState,
      globalInterventions: fatigueState.globalInterventions + 1,
      lastIntervention: now,
      dailyCount,
      topicCooldowns
    };
  }
  
  /**
   * Get next available intervention time
   */
  getNextAvailableTime(context: CBTPolicyContext): number {
    const check = this.canIntervene(context);
    if (check.allowed) return Date.now();
    
    return Date.now() + ((check.cooldownMinutes || 60) * 60 * 1000);
  }
  
  /**
   * Calculate fatigue score (0-1, higher = more fatigued)
   */
  private calculateFatigueScore(context: CBTPolicyContext): number {
    const { fatigueState, userSettings } = context;
    
    // Daily intervention ratio
    const maxDaily = getDailyLimit(context);
    const dailyRatio = Math.min(fatigueState.dailyCount / maxDaily, 1);
    
    // Time since last intervention (inverse fatigue)
    const hoursSinceLastIntervention = (Date.now() - fatigueState.lastIntervention) / (1000 * 60 * 60);
    const timeRecovery = Math.min(hoursSinceLastIntervention / 4, 1); // Fully recover after 4 hours
    
    // Conversation intensity
    const conversationFatigue = context.conversationContext
      ? Math.min(context.conversationContext.messageCount / 20, 1)
      : 0;
    
    // Combine factors
    const baseFatigue = (dailyRatio * 0.5) + (conversationFatigue * 0.3) + ((1 - timeRecovery) * 0.2);
    
    return Math.max(0, Math.min(1, baseFatigue));
  }
  
  /**
   * Reset fatigue state (for testing or user request)
   */
  resetFatigue(): CBTPolicyContext['fatigueState'] {
    return {
      globalInterventions: 0,
      topicCooldowns: {} as Partial<Record<DistortionType, number>>,
      lastIntervention: 0,
      dailyCount: 0
    };
  }
  
  /**
   * Add custom fatigue rule
   */
  addRule(rule: FatigueRule): void {
    this.rules.push(rule);
  }
  
  /**
   * Remove fatigue rule by name
   */
  removeRule(name: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => rule.name !== name);
    return this.rules.length < initialLength;
  }
  
  /**
   * Get current fatigue rules
   */
  getRules(): FatigueRule[] {
    return [...this.rules];
  }
}

// Helper functions
function getHourlyLimit(context: CBTPolicyContext): number {
  switch (context.userSettings.assistLevel) {
    case 'subtle': return 1;
    case 'standard': return 3;
    default: return 0;
  }
}

function getDailyLimit(context: CBTPolicyContext): number {
  switch (context.userSettings.assistLevel) {
    case 'subtle': return 3;
    case 'standard': return 8;
    default: return 0;
  }
}

function getMinInterventionGap(context: CBTPolicyContext): number {
  const baseGapMinutes = context.userSettings.assistLevel === 'subtle' ? 60 : 30;
  return baseGapMinutes * 60 * 1000; // Convert to milliseconds
}

function hasTopicCooldown(context: CBTPolicyContext): boolean {
  const now = Date.now();
  return Object.values(context.fatigueState.topicCooldowns).some(cooldownTime => 
    now < cooldownTime
  );
}

export const fatigueService = new CBTFatigueService();

// Export class for testing
export { CBTFatigueService };

// Export helper functions for testing
export { getHourlyLimit, getDailyLimit, getMinInterventionGap, hasTopicCooldown };