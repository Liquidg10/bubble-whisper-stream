/**
 * Contextual Bandits for Cast-Informed Decision Making
 * Uses multi-armed bandit algorithms to optimize Cast member activation timing
 */

import { isFeatureEnabled } from '@/config/flags';

export interface BanditContext {
  userId: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  energyLevel: 'low' | 'medium' | 'high';
  taskCount: number;
  recentDismissals: number;
  userPersona: 'executive' | 'parent' | 'builder' | 'mixed';
  calendarDensity: number;
}

export interface BanditAction {
  castMember: string;
  nudgeType: 'breath' | 'celebration' | 'implementation-intention' | 'break-suggestion';
  timing: 'immediate' | 'delay-5min' | 'delay-30min' | 'next-break';
  channel: 'toast' | 'chip' | 'sidebar';
}

export interface BanditReward {
  actionId: string;
  outcome: 'accepted' | 'dismissed' | 'ignored' | 'engaged';
  helpfulness?: number; // 1-5 scale
  completionTime?: number;
  userFeedback?: string;
}

interface BanditArm {
  action: BanditAction;
  attempts: number;
  successes: number;
  totalReward: number;
  confidence: number;
  lastUpdated: number;
}

interface ContextualStats {
  context: Partial<BanditContext>;
  arms: BanditArm[];
  totalAttempts: number;
  explorationRate: number;
}

class ContextualBanditsService {
  private contextualStats: Map<string, ContextualStats> = new Map();
  private globalExplorationRate = 0.1; // 10% exploration vs exploitation
  private minAttempts = 5; // Minimum attempts before exploitation
  private confidenceDecay = 0.95; // Daily confidence decay to adapt to changes

  private readonly CAST_MEMBER_ACTIONS: Record<string, BanditAction[]> = {
    'Clinical Psych': [
      { castMember: 'Clinical Psych', nudgeType: 'break-suggestion', timing: 'immediate', channel: 'chip' },
      { castMember: 'Clinical Psych', nudgeType: 'breath', timing: 'immediate', channel: 'toast' }
    ],
    'Neurologist': [
      { castMember: 'Neurologist', nudgeType: 'celebration', timing: 'immediate', channel: 'toast' },
      { castMember: 'Neurologist', nudgeType: 'break-suggestion', timing: 'delay-30min', channel: 'sidebar' }
    ],
    'Buddhist/Breathwork': [
      { castMember: 'Buddhist/Breathwork', nudgeType: 'breath', timing: 'immediate', channel: 'chip' },
      { castMember: 'Buddhist/Breathwork', nudgeType: 'breath', timing: 'delay-5min', channel: 'toast' }
    ],
    'Positive Psych': [
      { castMember: 'Positive Psych', nudgeType: 'implementation-intention', timing: 'immediate', channel: 'sidebar' },
      { castMember: 'Positive Psych', nudgeType: 'celebration', timing: 'immediate', channel: 'toast' }
    ],
    'UX Master': [
      { castMember: 'UX Master', nudgeType: 'break-suggestion', timing: 'next-break', channel: 'sidebar' }
    ]
  };

  selectAction(context: BanditContext, availableCastMembers: string[]): BanditAction | null {
    if (!isFeatureEnabled('cbtAssist')) {
      return this.getHeuristicAction(context, availableCastMembers);
    }

    const contextKey = this.getContextKey(context);
    const stats = this.getOrCreateContextStats(contextKey, context);

    // Filter available actions by active Cast members
    const availableActions = availableCastMembers.flatMap(member => 
      this.CAST_MEMBER_ACTIONS[member] || []
    );

    if (availableActions.length === 0) return null;

    // Upper Confidence Bound (UCB1) selection with contextual adaptation
    const selectedArm = this.selectArmUCB1(stats, availableActions);
    return selectedArm.action;
  }

  recordReward(context: BanditContext, action: BanditAction, reward: BanditReward): void {
    if (!isFeatureEnabled('cbtAssist')) return;

    const contextKey = this.getContextKey(context);
    const stats = this.getOrCreateContextStats(contextKey, context);

    // Find the arm for this action
    const arm = stats.arms.find(a => 
      a.action.castMember === action.castMember &&
      a.action.nudgeType === action.nudgeType &&
      a.action.timing === action.timing &&
      a.action.channel === action.channel
    );

    if (!arm) return;

    // Update arm statistics
    arm.attempts++;
    stats.totalAttempts++;

    // Calculate reward value
    const rewardValue = this.calculateRewardValue(reward);
    arm.totalReward += rewardValue;

    if (reward.outcome === 'accepted' || reward.outcome === 'engaged') {
      arm.successes++;
    }

    // Update confidence with temporal decay
    const daysSinceUpdate = (Date.now() - arm.lastUpdated) / (1000 * 60 * 60 * 24);
    arm.confidence *= Math.pow(this.confidenceDecay, daysSinceUpdate);
    arm.lastUpdated = Date.now();

    // Adapt exploration rate based on performance
    this.adaptExplorationRate(stats);

    // Store updated stats
    this.contextualStats.set(contextKey, stats);
  }

  private getHeuristicAction(context: BanditContext, availableCastMembers: string[]): BanditAction | null {
    // Executive heuristics - fast, time-saving actions
    if (context.userPersona === 'executive') {
      if (availableCastMembers.includes('Neurologist') && context.taskCount > 5) {
        return {
          castMember: 'Neurologist',
          nudgeType: 'break-suggestion',
          timing: 'immediate',
          channel: 'chip'
        };
      }
    }

    // Parent heuristics - gentle, batch-friendly
    if (context.userPersona === 'parent') {
      if (availableCastMembers.includes('Clinical Psych') && context.energyLevel === 'low') {
        return {
          castMember: 'Clinical Psych',
          nudgeType: 'breath',
          timing: 'immediate',
          channel: 'toast'
        };
      }
    }

    // Builder heuristics - momentum-focused
    if (context.userPersona === 'builder') {
      if (availableCastMembers.includes('Positive Psych')) {
        return {
          castMember: 'Positive Psych',
          nudgeType: 'implementation-intention',
          timing: 'immediate',
          channel: 'sidebar'
        };
      }
    }

    // Default fallback
    if (availableCastMembers.includes('Clinical Psych')) {
      return {
        castMember: 'Clinical Psych',
        nudgeType: 'break-suggestion',
        timing: 'delay-5min',
        channel: 'chip'
      };
    }

    return null;
  }

  private getContextKey(context: BanditContext): string {
    // Create contextual key for grouping similar situations
    return `${context.userPersona}_${context.timeOfDay}_${context.energyLevel}_${Math.floor(context.taskCount / 3)}`;
  }

  private getOrCreateContextStats(contextKey: string, context: BanditContext): ContextualStats {
    if (!this.contextualStats.has(contextKey)) {
      const allActions = Object.values(this.CAST_MEMBER_ACTIONS).flat();
      const arms: BanditArm[] = allActions.map(action => ({
        action,
        attempts: 0,
        successes: 0,
        totalReward: 0,
        confidence: 1.0,
        lastUpdated: Date.now()
      }));

      this.contextualStats.set(contextKey, {
        context: { 
          userPersona: context.userPersona,
          timeOfDay: context.timeOfDay,
          energyLevel: context.energyLevel
        },
        arms,
        totalAttempts: 0,
        explorationRate: this.globalExplorationRate
      });
    }

    return this.contextualStats.get(contextKey)!;
  }

  private selectArmUCB1(stats: ContextualStats, availableActions: BanditAction[]): BanditArm {
    // Filter arms to only available actions
    const availableArms = stats.arms.filter(arm =>
      availableActions.some(action =>
        action.castMember === arm.action.castMember &&
        action.nudgeType === arm.action.nudgeType &&
        action.timing === arm.action.timing &&
        action.channel === arm.action.channel
      )
    );

    // Exploration vs exploitation decision
    if (Math.random() < stats.explorationRate || stats.totalAttempts < this.minAttempts) {
      // Exploration: select randomly
      return availableArms[Math.floor(Math.random() * availableArms.length)];
    }

    // Exploitation: select arm with highest UCB1 score
    let bestArm = availableArms[0];
    let bestScore = -Infinity;

    for (const arm of availableArms) {
      const avgReward = arm.attempts > 0 ? arm.totalReward / arm.attempts : 0;
      const confidence = arm.attempts > 0 ? Math.sqrt(2 * Math.log(stats.totalAttempts) / arm.attempts) : Infinity;
      const ucb1Score = avgReward + confidence * arm.confidence;

      if (ucb1Score > bestScore) {
        bestScore = ucb1Score;
        bestArm = arm;
      }
    }

    return bestArm;
  }

  private calculateRewardValue(reward: BanditReward): number {
    let value = 0;

    // Base reward for engagement
    switch (reward.outcome) {
      case 'accepted':
        value += 1.0;
        break;
      case 'engaged':
        value += 0.8;
        break;
      case 'dismissed':
        value -= 0.3;
        break;
      case 'ignored':
        value -= 0.1;
        break;
    }

    // Helpfulness bonus
    if (reward.helpfulness) {
      value += (reward.helpfulness - 3) * 0.2; // Scale 1-5 to -0.4 to +0.4
    }

    // Time bonus (faster completion = better)
    if (reward.completionTime) {
      const timeBonus = Math.max(0, (300 - reward.completionTime) / 300 * 0.3); // 5 min baseline
      value += timeBonus;
    }

    return Math.max(-1, Math.min(2, value)); // Clamp to reasonable range
  }

  private adaptExplorationRate(stats: ContextualStats): void {
    // Decrease exploration as we gain confidence
    const avgSuccessRate = stats.arms.reduce((sum, arm) => {
      return sum + (arm.attempts > 0 ? arm.successes / arm.attempts : 0);
    }, 0) / stats.arms.length;

    // Higher success rate = less exploration needed
    stats.explorationRate = Math.max(0.05, this.globalExplorationRate * (1 - avgSuccessRate));
  }

  getBanditInsights(userId: string): any {
    const insights = [];
    
    for (const [contextKey, stats] of this.contextualStats.entries()) {
      const topArms = stats.arms
        .filter(arm => arm.attempts > 0)
        .sort((a, b) => (b.totalReward / b.attempts) - (a.totalReward / a.attempts))
        .slice(0, 3);

      if (topArms.length > 0) {
        insights.push({
          context: contextKey,
          totalAttempts: stats.totalAttempts,
          explorationRate: stats.explorationRate,
          topPerformers: topArms.map(arm => ({
            action: arm.action,
            successRate: arm.successes / arm.attempts,
            avgReward: arm.totalReward / arm.attempts,
            confidence: arm.confidence
          }))
        });
      }
    }

    return {
      userId,
      totalContexts: this.contextualStats.size,
      insights,
      globalExplorationRate: this.globalExplorationRate
    };
  }

  reset(): void {
    this.contextualStats.clear();
  }
}

export const contextualBandits = new ContextualBanditsService();