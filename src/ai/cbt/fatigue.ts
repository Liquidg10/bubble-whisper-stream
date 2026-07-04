/**
 * CBT Fatigue Management - Rate limiting and cooldown enforcement
 */

import type { CBTPolicyContext, FatigueRule, DistortionType } from './types';

// Item 6 (2026-07-03): named constant for the daily intervention cap (was a magic number
// duplicated across this file and policy.ts). Down from 3 to 2 per Mark's call.
export const MAX_DAILY_INTERVENTIONS = 2;

// PROMPT 3 Fatigue Rules - Max 2/day, 30min topic cooldown, 24h decline snooze
const DEFAULT_FATIGUE_RULES: FatigueRule[] = [
  {
    name: 'daily_limit_prompt3',
    condition: (context) => context.userSettings.assistLevel !== 'off' && context.fatigueState.dailyCount >= MAX_DAILY_INTERVENTIONS, // PROMPT 3: Max 2/day (assist 'off' is exempt — rules don't apply when assistance is disabled)
    cooldownMinutes: 24 * 60 // Rest of day
  },
  {
    name: 'topic_cooldown_prompt3',
    condition: (context) => hasTopicCooldown(context),
    cooldownMinutes: 30 // PROMPT 3: 30min cooldown per topic
  },
  {
    name: 'topic_decline_snooze',
    condition: (context) => hasTopicDeclineSnooze(context),
    cooldownMinutes: 24 * 60 // PROMPT 3: 24h auto-snooze on decline
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
    
    // PROMPT 3: 30min topic cooldown
    const topicCooldowns = { ...fatigueState.topicCooldowns };
    targetDistortions.forEach(distortion => {
      topicCooldowns[distortion] = now + (30 * 60 * 1000); // 30min cooldown
    });
    
    return {
      ...fatigueState,
      globalInterventions: fatigueState.globalInterventions + 1,
      lastIntervention: now,
      dailyCount,
      topicCooldowns,
      topicDeclines: fatigueState.topicDeclines || {}
    };
  }

  /**
   * Record user decline for topic-specific auto-snooze and learning
   */
  recordTopicDecline(
    fatigueState: CBTPolicyContext['fatigueState'],
    targetDistortions: DistortionType[]
  ): CBTPolicyContext['fatigueState'] {
    const now = Date.now();
    const topicDeclines = { ...fatigueState.topicDeclines };
    
    // PROMPT 3: 24h auto-snooze on decline
    targetDistortions.forEach(distortion => {
      topicDeclines[distortion] = now + (24 * 60 * 60 * 1000); // 24h snooze
    });
    
    // PROMPT 8: Record decline for learning service
    this.recordDeclineForLearning(targetDistortions);
    
    return {
      ...fatigueState,
      topicDeclines
    };
  }

  /**
   * PROMPT 8: Record helpful feedback for learning
   */
  recordHelpfulFeedback(targetDistortions: DistortionType[]): void {
    try {
      // Import learning service dynamically to avoid circular deps
      import('@/services/cbtLearningService').then(({ cbtLearningService }) => {
        cbtLearningService.recordHelpfulFeedback(targetDistortions);
      });
    } catch (error) {
      console.warn('[CBT Fatigue] Failed to record helpful feedback:', error);
    }
  }

  /**
   * PROMPT 8: Record decline feedback for learning
   */
  private recordDeclineForLearning(targetDistortions: DistortionType[]): void {
    try {
      // Import learning service dynamically to avoid circular deps
      import('@/services/cbtLearningService').then(({ cbtLearningService }) => {
        const { adjustedThresholds, newThresholds } = cbtLearningService.recordDeclineFeedback(targetDistortions);
        
        // Record feedback event for dev panel
        import('@/services/cbtFeedbackService').then(({ cbtFeedbackService }) => {
          adjustedThresholds.forEach(distortionType => {
            const oldThreshold = (newThresholds[distortionType] || 0.85) - 0.05;
            cbtFeedbackService.recordFeedback(
              'decline',
              [distortionType],
              'decline',
              {
                distortionType,
                oldThreshold,
                newThreshold: newThresholds[distortionType]!
              }
            );
          });
        });
      });
    } catch (error) {
      console.warn('[CBT Fatigue] Failed to record decline for learning:', error);
    }
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
      dailyCount: 0,
      topicDeclines: {} as Partial<Record<DistortionType, number>>
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
  // PROMPT 3: Simplified - no hourly limits, just daily
  return 99; // Effectively unlimited hourly
}

function getDailyLimit(context: CBTPolicyContext): number {
  // PROMPT 3: Max MAX_DAILY_INTERVENTIONS/day regardless of assist level
  return context.userSettings.assistLevel === 'off' ? 0 : MAX_DAILY_INTERVENTIONS;
}

function getMinInterventionGap(context: CBTPolicyContext): number {
  // PROMPT 3: No global intervention gap, just topic-specific
  return 0;
}

function hasTopicCooldown(context: CBTPolicyContext): boolean {
  const now = Date.now();
  return Object.values(context.fatigueState.topicCooldowns).some(cooldownTime => 
    now < cooldownTime
  );
}

function hasTopicDeclineSnooze(context: CBTPolicyContext): boolean {
  const now = Date.now();
  const declines = context.fatigueState.topicDeclines || {};
  return Object.values(declines).some(snoozeTime => 
    now < snoozeTime
  );
}

export const fatigueService = new CBTFatigueService();

// Export class for testing
export { CBTFatigueService };

// Export helper functions for testing
export { getHourlyLimit, getDailyLimit, getMinInterventionGap, hasTopicCooldown, hasTopicDeclineSnooze };