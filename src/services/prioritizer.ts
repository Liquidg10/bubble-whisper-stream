import { Bubble } from '@/types/bubble';
import { TimeHorizon } from '@/types/atomic';
import { selfModelV2Service } from './selfModelV2Service';

export interface PriorityScore {
  score: number; // 0-1, higher = more priority
  why: string[]; // Explanations for the score
  suggestedHorizon: TimeHorizon;
  confidence: number; // 0-1, how confident we are in this suggestion
}

export interface PriorityContext {
  timeOfDay: number; // 0-23 hours
  sessionType?: 'focus' | 'planning' | 'review';
  recentCompletions: Bubble[];
  userEnergyLevel?: 'low' | 'medium' | 'high';
  availableTimeSlots?: number[]; // hours available today
}

export interface PriorityWeights {
  urgency: number;
  importance: number;
  effort: number;
  energyMatch: number;
  recency: number;
  userPreference: number;
}

// Learning storage for user corrections
interface PriorityCorrection {
  bubbleId: string;
  originalSuggestion: TimeHorizon;
  userChoice: TimeHorizon;
  context: PriorityContext;
  timestamp: number;
}

class PrioritizerService {
  private corrections: PriorityCorrection[] = [];
  private baseWeights: PriorityWeights = {
    urgency: 0.3,
    importance: 0.25,
    effort: 0.2,
    energyMatch: 0.15,
    recency: 0.05,
    userPreference: 0.05
  };

  constructor() {
    this.loadCorrections();
  }

  /**
   * Score a bubble for priority based on context
   */
  async score(bubble: Bubble, context: PriorityContext): Promise<PriorityScore> {
    const scores = {
      urgency: this.calculateUrgency(bubble, context),
      importance: this.calculateImportance(bubble),
      effort: this.calculateEffort(bubble),
      energyMatch: this.calculateEnergyMatch(bubble, context),
      recency: this.calculateRecency(bubble),
      userPreference: await this.calculateUserPreference(bubble)
    };

    const weights = this.getAdjustedWeights(bubble, context);
    
    const finalScore = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * weights[key as keyof PriorityWeights]);
    }, 0);

    const why = this.generateExplanations(scores, weights, bubble);
    const suggestedHorizon = this.scoreToHorizon(finalScore, context);
    
    return {
      score: finalScore,
      why,
      suggestedHorizon,
      confidence: this.calculateConfidence(scores, weights)
    };
  }

  /**
   * Calculate urgency based on deadlines, reminders, and time sensitivity
   */
  private calculateUrgency(bubble: Bubble, context: PriorityContext): number {
    let urgency = 0.5; // base score

    // Check for reminders
    if (bubble.reminderId) {
      urgency += 0.3;
    }

    // Time-sensitive tasks get higher urgency in the morning
    if (bubble.type === 'Task' && context.timeOfDay < 12) {
      urgency += 0.2;
    }

    // Recent bubbles might be more urgent
    const daysSinceCreated = (Date.now() - bubble.createdAt) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 1) {
      urgency += 0.2;
    }

    // Financial tasks are often time-sensitive
    if (bubble.metadata?.finance) {
      urgency += 0.25;
    }

    return Math.min(urgency, 1);
  }

  /**
   * Calculate importance based on content analysis and type
   */
  private calculateImportance(bubble: Bubble): number {
    let importance = 0.5;

    // Task types generally more important than thoughts
    if (bubble.type === 'Task') {
      importance += 0.2;
    }

    // Financial matters are important
    if (bubble.metadata?.finance) {
      importance += 0.3;
    }

    // Parenting/family tags increase importance
    const hasParentingTags = bubble.tags.some(tag => 
      tag.name.toLowerCase().includes('pepper') || 
      tag.name.toLowerCase().includes('family') ||
      tag.name.toLowerCase().includes('parenting')
    );
    if (hasParentingTags) {
      importance += 0.25;
    }

    // Work-related content
    const hasWorkTags = bubble.tags.some(tag => 
      tag.name.toLowerCase().includes('work') ||
      tag.name.toLowerCase().includes('meeting')
    );
    if (hasWorkTags) {
      importance += 0.2;
    }

    return Math.min(importance, 1);
  }

  /**
   * Calculate effort required (inverse - less effort = higher score)
   */
  private calculateEffort(bubble: Bubble): number {
    let effort = 0.5;

    // Outliner metadata provides effort estimates
    if (bubble.metadata?.outliner?.estimatedMinutes) {
      const minutes = bubble.metadata.outliner.estimatedMinutes;
      if (minutes <= 15) effort = 0.8;      // Quick tasks
      else if (minutes <= 30) effort = 0.6; // Medium tasks
      else if (minutes <= 60) effort = 0.4; // Longer tasks
      else effort = 0.2;                    // Very long tasks
    }

    // Simple content tends to be lower effort
    if (bubble.content && bubble.content.length < 50) {
      effort += 0.2;
    }

    // Thoughts are generally lower effort than tasks
    if (bubble.type === 'Thought') {
      effort += 0.3;
    }

    return Math.min(effort, 1);
  }

  /**
   * Calculate how well this task matches current energy level
   */
  private calculateEnergyMatch(bubble: Bubble, context: PriorityContext): number {
    const userEnergy = context.userEnergyLevel || this.inferEnergyFromTime(context.timeOfDay);
    let match = 0.5;

    // High effort tasks need high energy
    if (bubble.metadata?.outliner?.estimatedMinutes) {
      const minutes = bubble.metadata.outliner.estimatedMinutes;
      if (userEnergy === 'high' && minutes > 45) match += 0.3;
      if (userEnergy === 'medium' && minutes <= 45 && minutes > 15) match += 0.3;
      if (userEnergy === 'low' && minutes <= 15) match += 0.3;
    }

    // Creative tasks (thoughts, memories) work well with varying energy
    if (bubble.type === 'Thought' || bubble.type === 'Memory') {
      match += 0.2;
    }

    return Math.min(match, 1);
  }

  /**
   * Calculate recency factor - more recent items get slight boost
   */
  private calculateRecency(bubble: Bubble): number {
    const daysSince = (Date.now() - bubble.updatedAt) / (1000 * 60 * 60 * 24);
    
    if (daysSince < 1) return 1.0;
    if (daysSince < 3) return 0.8;
    if (daysSince < 7) return 0.6;
    return 0.4;
  }

  /**
   * Calculate user preference based on historical interactions
   */
  private async calculateUserPreference(bubble: Bubble): Promise<number> {
    // Look at similar bubbles the user has prioritized
    const similarCorrections = this.corrections.filter(correction => {
      return (
        bubble.type === this.getBubbleTypeFromCorrection(correction.bubbleId) ||
        this.hasSimilarTags(bubble, correction.bubbleId)
      );
    });

    if (similarCorrections.length === 0) return 0.5;

    // Calculate preference based on user's past choices
    const todayChoices = similarCorrections.filter(c => c.userChoice === TimeHorizon.Today).length;
    const totalChoices = similarCorrections.length;
    
    return todayChoices / totalChoices;
  }

  /**
   * Get adjusted weights based on user learning
   */
  private getAdjustedWeights(bubble: Bubble, context: PriorityContext): PriorityWeights {
    // For now, return base weights - could implement learning adjustments here
    return { ...this.baseWeights };
  }

  /**
   * Generate human-readable explanations
   */
  private generateExplanations(scores: any, weights: PriorityWeights, bubble: Bubble): string[] {
    const explanations: string[] = [];

    if (scores.urgency > 0.7) {
      explanations.push('Time-sensitive or has reminders');
    }
    
    if (scores.importance > 0.7) {
      explanations.push('High importance based on type and tags');
    }
    
    if (scores.effort > 0.7) {
      explanations.push('Quick and manageable task');
    }
    
    if (scores.energyMatch > 0.7) {
      explanations.push('Good match for current energy level');
    }

    if (bubble.metadata?.finance) {
      explanations.push('Financial task requiring attention');
    }

    if (bubble.tags.some(t => t.name.toLowerCase().includes('pepper'))) {
      explanations.push('Family-related priority');
    }

    if (explanations.length === 0) {
      explanations.push('Balanced priority based on multiple factors');
    }

    return explanations;
  }

  /**
   * Convert score to time horizon suggestion
   */
  private scoreToHorizon(score: number, context: PriorityContext): TimeHorizon {
    // Adjust thresholds based on context
    let todayThreshold = 0.7;
    let weekThreshold = 0.4;

    // During focus sessions, be more selective about \"Today\"
    if (context.sessionType === 'focus') {
      todayThreshold = 0.8;
    }

    // During planning, be more generous with \"Today\"
    if (context.sessionType === 'planning') {
      todayThreshold = 0.6;
    }

    if (score >= todayThreshold) return TimeHorizon.Today;
    if (score >= weekThreshold) return TimeHorizon.Week;
    return TimeHorizon.Later;
  }

  /**
   * Calculate confidence in the suggestion
   */
  private calculateConfidence(scores: any, weights: PriorityWeights): number {
    // Higher confidence when scores are more extreme (closer to 0 or 1)
    const scoreValues = Object.values(scores) as number[];
    const scoreVariance = scoreValues.reduce((sum, score) => {
      const deviation = Math.abs(score - 0.5);
      return sum + deviation;
    }, 0) / scoreValues.length;

    return Math.min(0.5 + scoreVariance, 1);
  }

  /**
   * Record user correction for learning
   */
  recordCorrection(bubbleId: string, originalSuggestion: TimeHorizon, userChoice: TimeHorizon, context: PriorityContext) {
    const correction: PriorityCorrection = {
      bubbleId,
      originalSuggestion,
      userChoice,
      context,
      timestamp: Date.now()
    };

    this.corrections.push(correction);
    this.saveCorrections();

    // Keep only recent corrections (last 1000)
    if (this.corrections.length > 1000) {
      this.corrections = this.corrections.slice(-1000);
    }
  }

  /**
   * Generate suggestions for a set of bubbles
   */
  async generateSuggestions(bubbles: Bubble[], context: PriorityContext): Promise<Array<Bubble & { priority: PriorityScore }>> {
    const scoredBubbles = await Promise.all(
      bubbles.map(async (bubble) => ({
        ...bubble,
        priority: await this.score(bubble, context)
      }))
    );

    // Sort by score descending
    return scoredBubbles.sort((a, b) => b.priority.score - a.priority.score);
  }

  // Helper methods
  private inferEnergyFromTime(hour: number): 'low' | 'medium' | 'high' {
    if (hour >= 9 && hour <= 11) return 'high';      // Morning peak
    if (hour >= 14 && hour <= 16) return 'high';     // Afternoon peak
    if (hour >= 6 && hour <= 9) return 'medium';     // Early morning
    if (hour >= 19 && hour <= 22) return 'medium';   // Evening
    return 'low'; // Late night/very early morning
  }

  private getBubbleTypeFromCorrection(bubbleId: string): string {
    // This would need to look up the bubble - simplified for now
    return 'Task';
  }

  private hasSimilarTags(bubble: Bubble, otherBubbleId: string): boolean {
    // This would need to look up the other bubble - simplified for now
    return false;
  }

  private loadCorrections() {
    try {
      const stored = localStorage.getItem('prioritizer_corrections');
      if (stored) {
        this.corrections = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load prioritizer corrections:', error);
      this.corrections = [];
    }
  }

  private saveCorrections() {
    try {
      localStorage.setItem('prioritizer_corrections', JSON.stringify(this.corrections));
    } catch (error) {
      console.warn('Failed to save prioritizer corrections:', error);
    }
  }
}

export const prioritizerService = new PrioritizerService();
