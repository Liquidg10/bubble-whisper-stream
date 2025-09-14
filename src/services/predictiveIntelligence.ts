/**
 * Phase 4B: Predictive Intelligence Enhancement
 * Connects behavioral science with calendar density for proactive suggestions
 */

import { behavioralScienceEngine } from './behavioralScienceEngine';
import { moodBehaviorEngine } from './moodBehaviorEngine';
import { useBubbleStore } from '@/stores/bubbleStore';

interface PredictiveContext {
  currentStress: number;
  energyWindow: number;
  calendarDensity: number;
  historicalPatterns: HabitPattern[];
  upcomingChallenges: Challenge[];
}

interface HabitPattern {
  type: 'daily' | 'weekly' | 'contextual';
  trigger: string;
  action: string;
  confidence: number;
  frequency: number;
  lastOccurrence: number;
  suggestedTime?: number;
}

interface Challenge {
  type: 'stress_spike' | 'energy_drop' | 'calendar_overload' | 'mood_dip';
  predictedTime: number;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  preventionActions: string[];
}

interface AnticipatorySuggestion {
  id: string;
  type: 'proactive_break' | 'energy_boost' | 'stress_prevention' | 'habit_continuation';
  confidence: number;
  timing: 'immediate' | 'within_hour' | 'today' | 'this_week';
  content: string;
  reasoning: string;
  actions: AnticipatedAction[];
}

interface AnticipatedAction {
  type: 'create_task' | 'schedule_break' | 'adjust_calendar' | 'mood_check';
  content: string;
  scheduledFor?: number;
  autoExecute: boolean;
}

class PredictiveIntelligence {
  private habitPatterns: Map<string, HabitPattern> = new Map();
  private lastPrediction: number = 0;
  private predictionCooldown = 15 * 60 * 1000; // 15 minutes

  async analyzeAndPredict(): Promise<AnticipatorySuggestion[]> {
    const now = Date.now();
    if (now - this.lastPrediction < this.predictionCooldown) {
      return []; // Rate limit predictions
    }

    const context = await this.buildPredictiveContext();
    const suggestions: AnticipatorySuggestion[] = [];

    // Stress prevention
    const stressPrevention = this.predictStressPrevention(context);
    if (stressPrevention) suggestions.push(stressPrevention);

    // Energy optimization
    const energyOptimization = this.predictEnergyOptimization(context);
    if (energyOptimization) suggestions.push(energyOptimization);

    // Habit continuation
    const habitSuggestions = this.predictHabitContinuation(context);
    suggestions.push(...habitSuggestions);

    // Mood protection
    const moodProtection = this.predictMoodProtection(context);
    if (moodProtection) suggestions.push(moodProtection);

    this.lastPrediction = now;
    return suggestions.filter(s => s.confidence > 0.6);
  }

  async learnFromBehavior(action: string, context: Record<string, any>): Promise<void> {
    // Learn new habits from user actions
    const habitKey = this.generateHabitKey(action, context);
    const existing = this.habitPatterns.get(habitKey);

    if (existing) {
      existing.frequency++;
      existing.lastOccurrence = Date.now();
      existing.confidence = Math.min(0.95, existing.confidence + 0.05);
    } else {
      this.habitPatterns.set(habitKey, {
        type: this.classifyHabitType(context),
        trigger: this.extractTrigger(context),
        action,
        confidence: 0.1,
        frequency: 1,
        lastOccurrence: Date.now()
      });
    }

    // Cross-domain learning
    this.applyCrossDomainLearning(action, context);
  }

  getAnticipatoryMode(): 'passive' | 'active' | 'proactive' {
    const settings = useBubbleStore.getState().settings;
    if (!settings.intelligenceEnabled) return 'passive';

    const currentStress = behavioralScienceEngine.detectStressLevel();
    const energyWindow = behavioralScienceEngine.getCurrentEnergyWindow();

    if (currentStress > 0.7) return 'active'; // High stress = more suggestions
    if (energyWindow && energyWindow.completionRate > 0.8) return 'proactive'; // High performance = anticipate
    
    return 'passive';
  }

  private async buildPredictiveContext(): Promise<PredictiveContext> {
    const currentStress = behavioralScienceEngine.detectStressLevel();
    const energyWindow = behavioralScienceEngine.getCurrentEnergyWindow();
    const bubbles = useBubbleStore.getState().bubbles;

    // Calculate calendar density for next 4 hours
    const now = Date.now();
    const fourHoursFromNow = now + (4 * 60 * 60 * 1000);
    const upcomingTasks = bubbles.filter(b => 
      b.createdAt >= now && b.createdAt <= fourHoursFromNow
    );
    const calendarDensity = Math.min(1, upcomingTasks.length / 8); // Normalize to 0-1

    return {
      currentStress,
      energyWindow: energyWindow?.energyLevel || 0.5,
      calendarDensity,
      historicalPatterns: Array.from(this.habitPatterns.values()),
      upcomingChallenges: this.predictUpcomingChallenges()
    };
  }

  private predictStressPrevention(context: PredictiveContext): AnticipatorySuggestion | null {
    if (context.currentStress < 0.5 && context.calendarDensity < 0.6) return null;

    const stressIncrease = context.calendarDensity * 0.3 + context.currentStress * 0.7;
    if (stressIncrease < 0.7) return null;

    return {
      id: `stress_prev_${Date.now()}`,
      type: 'stress_prevention',
      confidence: 0.8,
      timing: 'immediate',
      content: 'High stress predicted - consider a proactive break',
      reasoning: `Calendar density (${Math.round(context.calendarDensity * 100)}%) + current stress suggest overwhelm incoming`,
      actions: [
        {
          type: 'schedule_break',
          content: '5-minute breathing break',
          scheduledFor: Date.now() + (15 * 60 * 1000), // 15 minutes from now
          autoExecute: false
        },
        {
          type: 'adjust_calendar',
          content: 'Consider postponing non-urgent tasks',
          autoExecute: false
        }
      ]
    };
  }

  private predictEnergyOptimization(context: PredictiveContext): AnticipatorySuggestion | null {
    if (context.energyWindow > 0.6) return null;

    const energyBoostPattern = context.historicalPatterns.find(p => 
      p.action.includes('break') || p.action.includes('exercise')
    );

    if (!energyBoostPattern) return null;

    return {
      id: `energy_opt_${Date.now()}`,
      type: 'energy_boost',
      confidence: energyBoostPattern.confidence,
      timing: 'within_hour',
      content: 'Energy dip predicted - time for your usual boost',
      reasoning: `Historical pattern shows ${energyBoostPattern.action} helps during low energy`,
      actions: [
        {
          type: 'create_task',
          content: energyBoostPattern.action,
          scheduledFor: Date.now() + (30 * 60 * 1000),
          autoExecute: false
        }
      ]
    };
  }

  private predictHabitContinuation(context: PredictiveContext): AnticipatorySuggestion[] {
    const suggestions: AnticipatorySuggestion[] = [];
    const now = Date.now();

    for (const pattern of context.historicalPatterns) {
      if (pattern.confidence < 0.7) continue;

      const timeSinceLastOccurrence = now - pattern.lastOccurrence;
      const expectedInterval = this.calculateExpectedInterval(pattern);

      if (timeSinceLastOccurrence >= expectedInterval * 0.8) {
        suggestions.push({
          id: `habit_cont_${pattern.trigger}_${now}`,
          type: 'habit_continuation',
          confidence: pattern.confidence,
          timing: 'today',
          content: `Time for your ${pattern.action}`,
          reasoning: `You typically ${pattern.action} every ${this.formatInterval(expectedInterval)}`,
          actions: [
            {
              type: 'create_task',
              content: pattern.action,
              autoExecute: false
            }
          ]
        });
      }
    }

    return suggestions.slice(0, 2); // Max 2 habit suggestions
  }

  private predictMoodProtection(context: PredictiveContext): AnticipatorySuggestion | null {
    const moodChallenges = context.upcomingChallenges.filter(c => c.type === 'mood_dip');
    if (moodChallenges.length === 0) return null;

    const nextChallenge = moodChallenges[0];
    
    return {
      id: `mood_prot_${Date.now()}`,
      type: 'stress_prevention',
      confidence: nextChallenge.confidence,
      timing: 'today',
      content: 'Mood challenge detected - prep some support',
      reasoning: `Historical patterns suggest mood dip around ${new Date(nextChallenge.predictedTime).toLocaleTimeString()}`,
      actions: [
        {
          type: 'mood_check',
          content: 'Quick mood check-in',
          scheduledFor: nextChallenge.predictedTime - (30 * 60 * 1000),
          autoExecute: false
        },
        {
          type: 'create_task',
          content: 'Self-care activity',
          autoExecute: false
        }
      ]
    };
  }

  private predictUpcomingChallenges(): Challenge[] {
    const challenges: Challenge[] = [];
    const now = Date.now();

    // Predict based on calendar density patterns
    const bubbles = useBubbleStore.getState().bubbles;
    const todayTasks = bubbles.filter(b => {
      if (!b.createdAt) return false;
      const taskDate = new Date(b.createdAt);
      const today = new Date();
      return taskDate.toDateString() === today.toDateString();
    });

    if (todayTasks.length > 8) {
      challenges.push({
        type: 'calendar_overload',
        predictedTime: now + (2 * 60 * 60 * 1000), // 2 hours from now
        confidence: 0.8,
        severity: 'high',
        preventionActions: ['Postpone non-urgent tasks', 'Take regular breaks']
      });
    }

    return challenges;
  }

  private applyCrossDomainLearning(action: string, context: Record<string, any>): void {
    // Learn how work habits inform personal tasks and vice versa
    const domain = this.classifyDomain(context);
    const oppositeDomain = domain === 'work' ? 'personal' : 'work';

    // Look for transferable patterns
    const transferableActions = this.findTransferableActions(action, domain);
    
    transferableActions.forEach(transferAction => {
      const crossDomainKey = this.generateHabitKey(transferAction, { ...context, domain: oppositeDomain });
      const existing = this.habitPatterns.get(crossDomainKey);
      
      if (existing) {
        existing.confidence = Math.min(0.9, existing.confidence + 0.02); // Smaller increases for cross-domain
      } else {
        this.habitPatterns.set(crossDomainKey, {
          type: 'contextual',
          trigger: `${oppositeDomain}_context`,
          action: transferAction,
          confidence: 0.2, // Lower initial confidence for cross-domain
          frequency: 1,
          lastOccurrence: Date.now()
        });
      }
    });
  }

  private generateHabitKey(action: string, context: Record<string, any>): string {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    return `${action}_${hour}_${day}_${context.domain || 'general'}`;
  }

  private classifyHabitType(context: Record<string, any>): 'daily' | 'weekly' | 'contextual' {
    if (context.timeOfDay) return 'daily';
    if (context.dayOfWeek) return 'weekly';
    return 'contextual';
  }

  private extractTrigger(context: Record<string, any>): string {
    return context.trigger || `${context.timeOfDay || 'general'}_time`;
  }

  private calculateExpectedInterval(pattern: HabitPattern): number {
    switch (pattern.type) {
      case 'daily': return 24 * 60 * 60 * 1000;
      case 'weekly': return 7 * 24 * 60 * 60 * 1000;
      default: return 3 * 24 * 60 * 60 * 1000; // 3 days for contextual
    }
  }

  private formatInterval(ms: number): string {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (days >= 7) return `${Math.floor(days / 7)} week(s)`;
    if (days >= 1) return `${days} day(s)`;
    return 'few hours';
  }

  private classifyDomain(context: Record<string, any>): string {
    return context.domain || context.category || 'general';
  }

  private findTransferableActions(action: string, domain: string): string[] {
    // Simple transferable action mapping
    const transferMap: Record<string, string[]> = {
      'take a break': ['take a break', 'stretch', 'walk'],
      'review goals': ['check priorities', 'plan ahead'],
      'organize': ['declutter', 'sort tasks'],
      'exercise': ['move body', 'physical activity']
    };

    for (const [key, transfers] of Object.entries(transferMap)) {
      if (action.toLowerCase().includes(key.toLowerCase())) {
        return transfers;
      }
    }

    return [];
  }
}

export const predictiveIntelligence = new PredictiveIntelligence();