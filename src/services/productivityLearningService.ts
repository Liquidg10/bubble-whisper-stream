/**
 * Enhanced Productivity Learning Service
 * 
 * Advanced learning system that builds a continuous snapshot of the user,
 * learning from patterns across time, location, context, and behavior.
 * Implements persistent memory for adaptive coaching.
 */

import { selfModelV2Service } from './selfModelV2Service';

interface ProductivityCompletion {
  task: string;
  plannedDuration: number;
  actualDuration: number;
  timestamp: number;
  efficiency: number;
  context: ProductivityContext;
  sideQuests: number;
  mood?: string;
  energy?: number;
  distractions?: string[];
}

interface ProductivityContext {
  location?: string;
  coordinates?: { lat: number; lng: number };
  timeOfDay: number;
  dayOfWeek: number;
  seasonality?: 'spring' | 'summer' | 'fall' | 'winter';
  weather?: string;
  taskType?: string;
  environment?: 'home' | 'office' | 'cafe' | 'travel' | 'other';
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  noiseLevel?: 'quiet' | 'moderate' | 'loud';
}

interface ProductivityPattern {
  id: string;
  pattern: string;
  frequency: number;
  contexts: ProductivityContext[];
  successRate: number;
  averageEfficiency: number;
  triggers: string[];
  outcomes: string[];
  confidence: number;
  lastSeen: number;
  adaptations: PatternAdaptation[];
}

interface PatternAdaptation {
  timestamp: number;
  trigger: string;
  adaptation: string;
  success: boolean;
  userFeedback?: string;
}

interface TimePattern {
  hour: number;
  dayOfWeek: number;
  averageProductivity: number;
  taskTypes: string[];
  energyLevels: number[];
  optimalDuration: number;
}

interface LocationPattern {
  name: string;
  coordinates?: { lat: number; lng: number };
  radius?: number;
  commonTasks: string[];
  averageEfficiency: number;
  bestTimeSlots: number[];
  environmentalFactors: Record<string, any>;
}

interface BehavioralPattern {
  trigger: string;
  contexts: ProductivityContext[];
  responses: string[];
  effectiveness: number;
  frequency: number;
  evolution: Array<{
    timestamp: number;
    effectiveness: number;
    adaptation: string;
  }>;
}

class ProductivityLearningService {
  private completions: ProductivityCompletion[] = [];
  private patterns: Map<string, ProductivityPattern> = new Map();
  private timePatterns: Map<string, TimePattern> = new Map();
  private locationPatterns: Map<string, LocationPattern> = new Map();
  private behavioralPatterns: Map<string, BehavioralPattern> = new Map();
  private userSnapshot: UserProductivitySnapshot | null = null;
  private storageKey = 'productivityLearningData';

  constructor() {
    this.loadFromStorage();
    this.initializeUserSnapshot();
  }

  /**
   * Record a task completion with full context for learning
   */
  async recordCompletion(completion: Omit<ProductivityCompletion, 'timestamp' | 'efficiency' | 'context'> & { context?: Partial<ProductivityContext> }) {
    const fullContext = await this.enrichContext(completion.context || {});
    const efficiency = this.calculateEfficiency(completion.plannedDuration, completion.actualDuration);
    
    const fullCompletion: ProductivityCompletion = {
      ...completion,
      timestamp: Date.now(),
      efficiency,
      context: fullContext,
      sideQuests: 0
    };

    this.completions.push(fullCompletion);
    
    // Update all pattern types
    await this.updatePatterns(fullCompletion);
    await this.updateTimePatterns(fullCompletion);
    await this.updateLocationPatterns(fullCompletion);
    await this.updateBehavioralPatterns(fullCompletion);
    await this.updateUserSnapshot(fullCompletion);
    
    // Store in self-model for persistent memory
    await this.recordInSelfModel(fullCompletion);
    
    this.saveToStorage();
    
    // Limit stored completions for performance
    if (this.completions.length > 2000) {
      this.completions = this.completions.slice(-2000);
    }
  }

  /**
   * Get smart suggestions based on comprehensive context analysis
   */
  async getSuggestions(input: string, context?: Partial<ProductivityContext>): Promise<Array<{
    text: string;
    estimatedDuration: number;
    confidence: number;
    reasoning: string;
    patterns?: string[];
    adaptations?: string[];
  }>> {
    const enrichedContext = await this.enrichContext(context || {});
    const keywords = this.extractKeywords(input);
    const suggestions = [];

    // Pattern-based suggestions
    const relevantPatterns = this.findRelevantPatterns(keywords, enrichedContext);
    for (const pattern of relevantPatterns.slice(0, 3)) {
      suggestions.push({
        text: `${pattern.pattern}: ${input}`,
        estimatedDuration: this.estimateOptimalDuration(keywords, enrichedContext),
        confidence: pattern.confidence,
        reasoning: `Based on ${pattern.frequency} similar sessions with ${Math.round(pattern.successRate * 100)}% success rate`,
        patterns: [pattern.pattern],
        adaptations: pattern.adaptations.slice(-2).map(a => a.adaptation)
      });
    }

    // Time-optimized suggestions
    const timeOptimal = this.getTimeOptimizedSuggestion(keywords, enrichedContext);
    if (timeOptimal) {
      suggestions.push(timeOptimal);
    }

    // Location-optimized suggestions
    const locationOptimal = this.getLocationOptimizedSuggestion(keywords, enrichedContext);
    if (locationOptimal) {
      suggestions.push(locationOptimal);
    }

    // Behavioral pattern suggestions
    const behavioralOptimal = this.getBehavioralOptimizedSuggestion(keywords, enrichedContext);
    if (behavioralOptimal) {
      suggestions.push(behavioralOptimal);
    }

    // Context-adaptive suggestions
    const contextAdaptive = await this.getContextAdaptiveSuggestions(input, enrichedContext);
    suggestions.push(...contextAdaptive);

    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Get comprehensive productivity insights with learning evolution
   */
  getProductivityInsights(): {
    bestTimeForFocus: string;
    averageSessionLength: number;
    completionRate: number;
    topTaskCategories: Array<{ category: string; frequency: number }>;
    recommendations: string[];
    patterns: Array<{ pattern: string; strength: number; evolution: string }>;
    adaptations: Array<{ trigger: string; response: string; effectiveness: number }>;
    snapshot: any;
  } {
    if (this.completions.length < 10) {
      return {
        bestTimeForFocus: 'Learning your patterns...',
        averageSessionLength: 25,
        completionRate: 1,
        topTaskCategories: [],
        recommendations: ['Complete more sessions for deeper insights!', 'I\'m learning your unique productivity patterns', 'Every session teaches me more about your flow'],
        patterns: [],
        adaptations: [],
        snapshot: this.userSnapshot
      };
    }

    const insights = this.analyzeProductivityPatterns();
    const patterns = this.getTopPatterns();
    const adaptations = this.getTopAdaptations();
    const recommendations = this.generatePersonalizedRecommendations();

    return {
      bestTimeForFocus: insights.bestTimeForFocus,
      averageSessionLength: insights.averageSessionLength,
      completionRate: insights.completionRate,
      topTaskCategories: insights.topTaskCategories || [],
      recommendations,
      patterns,
      adaptations,
      snapshot: this.userSnapshot
    };
  }

  /**
   * Record learning from session events
   */
  async recordSessionEvent(event: {
    type: 'side_quest' | 'distraction' | 'flow_state' | 'break' | 'energy_change';
    description: string;
    timestamp: number;
    context: Partial<ProductivityContext>;
    impact: 'positive' | 'neutral' | 'negative';
  }) {
    const enrichedContext = await this.enrichContext(event.context);
    
    // Learn from behavioral patterns
    await this.learnFromBehavior(event.type, event.description, enrichedContext, event.impact);
    
    // Update user snapshot
    if (this.userSnapshot) {
      this.userSnapshot.behavioralTendencies[event.type] = 
        (this.userSnapshot.behavioralTendencies[event.type] || 0) + 1;
      this.userSnapshot.lastUpdated = Date.now();
    }
    
    this.saveToStorage();
  }

  /**
   * Adapt coaching style based on effectiveness
   */
  async recordCoachingFeedback(feedback: {
    message: string;
    effectiveness: number; // 1-5 scale
    userResponse?: string;
    context: Partial<ProductivityContext>;
  }) {
    const adaptationKey = this.generateAdaptationKey(feedback.message, feedback.context);
    
    let adaptation = this.behavioralPatterns.get(adaptationKey);
    if (!adaptation) {
      adaptation = {
        trigger: adaptationKey,
        contexts: [],
        responses: [],
        effectiveness: 0,
        frequency: 0,
        evolution: []
      };
    }

    adaptation.effectiveness = (adaptation.effectiveness * adaptation.frequency + feedback.effectiveness) / (adaptation.frequency + 1);
    adaptation.frequency += 1;
    adaptation.evolution.push({
      timestamp: Date.now(),
      effectiveness: feedback.effectiveness,
      adaptation: feedback.userResponse || 'no_response'
    });

    this.behavioralPatterns.set(adaptationKey, adaptation);
    
    // Update self-model with coaching preferences
    await this.updateCoachingPreferences(feedback);
    
    this.saveToStorage();
  }

  /**
   * Get adaptive coaching suggestions based on user's response patterns
   */
  getAdaptiveCoachingStyle(): {
    tone: string;
    directness: number; // 1-5 scale
    encouragementStyle: string;
    redirectionStyle: string;
    celebrationStyle: string;
  } {
    if (!this.userSnapshot) {
      return {
        tone: 'supportive',
        directness: 3,
        encouragementStyle: 'gentle',
        redirectionStyle: 'subtle',
        celebrationStyle: 'enthusiastic'
      };
    }

    return this.userSnapshot.coachingPreferences;
  }

  // Private methods for pattern learning and analysis

  private async enrichContext(partial: Partial<ProductivityContext>): Promise<ProductivityContext> {
    const now = new Date();
    const base: ProductivityContext = {
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      ...partial
    };

    // Add seasonality
    const month = now.getMonth();
    if (month >= 2 && month <= 4) base.seasonality = 'spring';
    else if (month >= 5 && month <= 7) base.seasonality = 'summer';
    else if (month >= 8 && month <= 10) base.seasonality = 'fall';
    else base.seasonality = 'winter';

    // Detect environment patterns
    if (!base.environment) {
      base.environment = this.detectEnvironment(base);
    }

    return base;
  }

  private calculateEfficiency(planned: number, actual: number): number {
    if (actual <= 0) return 0;
    return Math.min(2, planned / actual); // Cap at 2x efficiency
  }

  private async updatePatterns(completion: ProductivityCompletion) {
    const keywords = this.extractKeywords(completion.task);
    const patternKey = this.generatePatternKey(keywords, completion.context);
    
    let pattern = this.patterns.get(patternKey);
    if (!pattern) {
      pattern = {
        id: patternKey,
        pattern: keywords.slice(0, 3).join('_'),
        frequency: 0,
        contexts: [],
        successRate: 0,
        averageEfficiency: 0,
        triggers: [],
        outcomes: [],
        confidence: 0,
        lastSeen: 0,
        adaptations: []
      };
    }

    // Update pattern data
    pattern.frequency += 1;
    pattern.contexts.push(completion.context);
    pattern.averageEfficiency = (pattern.averageEfficiency * (pattern.frequency - 1) + completion.efficiency) / pattern.frequency;
    pattern.successRate = completion.efficiency >= 0.8 ? 
      (pattern.successRate * (pattern.frequency - 1) + 1) / pattern.frequency :
      (pattern.successRate * (pattern.frequency - 1)) / pattern.frequency;
    pattern.lastSeen = completion.timestamp;
    pattern.confidence = Math.min(0.95, pattern.frequency / 20 * pattern.successRate);

    this.patterns.set(patternKey, pattern);
  }

  private async updateTimePatterns(completion: ProductivityCompletion) {
    const timeKey = `${completion.context.timeOfDay}-${completion.context.dayOfWeek}`;
    
    let timePattern = this.timePatterns.get(timeKey);
    if (!timePattern) {
      timePattern = {
        hour: completion.context.timeOfDay,
        dayOfWeek: completion.context.dayOfWeek,
        averageProductivity: 0,
        taskTypes: [],
        energyLevels: [],
        optimalDuration: 25
      };
    }

    timePattern.averageProductivity = (timePattern.averageProductivity + completion.efficiency) / 2;
    timePattern.taskTypes.push(completion.context.taskType || 'general');
    timePattern.energyLevels.push(completion.context.energy || 5);
    
    this.timePatterns.set(timeKey, timePattern);
  }

  private async updateLocationPatterns(completion: ProductivityCompletion) {
    if (!completion.context.location) return;

    let locationPattern = this.locationPatterns.get(completion.context.location);
    if (!locationPattern) {
      locationPattern = {
        name: completion.context.location,
        coordinates: completion.context.coordinates,
        commonTasks: [],
        averageEfficiency: 0,
        bestTimeSlots: [],
        environmentalFactors: {}
      };
    }

    locationPattern.commonTasks.push(completion.task);
    locationPattern.averageEfficiency = (locationPattern.averageEfficiency + completion.efficiency) / 2;
    locationPattern.bestTimeSlots.push(completion.context.timeOfDay);
    
    this.locationPatterns.set(completion.context.location, locationPattern);
  }

  private async updateBehavioralPatterns(completion: ProductivityCompletion) {
    // Analyze behavioral patterns from completion data
    const behaviorKey = this.generateBehaviorKey(completion);
    
    let behavior = this.behavioralPatterns.get(behaviorKey);
    if (!behavior) {
      behavior = {
        trigger: behaviorKey,
        contexts: [],
        responses: [],
        effectiveness: 0,
        frequency: 0,
        evolution: []
      };
    }

    behavior.frequency += 1;
    behavior.contexts.push(completion.context);
    behavior.effectiveness = (behavior.effectiveness + completion.efficiency) / 2;
    behavior.evolution.push({
      timestamp: completion.timestamp,
      effectiveness: completion.efficiency,
      adaptation: 'completion_recorded'
    });

    this.behavioralPatterns.set(behaviorKey, behavior);
  }

  private async updateUserSnapshot(completion: ProductivityCompletion) {
    if (!this.userSnapshot) {
      this.userSnapshot = this.createInitialSnapshot();
    }

    // Update core metrics
    this.userSnapshot.totalSessions += 1;
    this.userSnapshot.totalFocusTime += completion.actualDuration;
    this.userSnapshot.averageEfficiency = (this.userSnapshot.averageEfficiency + completion.efficiency) / 2;
    
    // Update preferences based on successful patterns
    if (completion.efficiency >= 0.8) {
      this.userSnapshot.preferredDurations[completion.plannedDuration] = 
        (this.userSnapshot.preferredDurations[completion.plannedDuration] || 0) + 1;
        
      this.userSnapshot.productiveTimeSlots[completion.context.timeOfDay] = 
        (this.userSnapshot.productiveTimeSlots[completion.context.timeOfDay] || 0) + 1;
    }

    this.userSnapshot.lastUpdated = Date.now();
  }

  private async recordInSelfModel(completion: ProductivityCompletion) {
    try {
      // Add pattern hint to self-model for persistent memory
      await selfModelV2Service.addPatternHint({
        key: `productivity_${completion.context.timeOfDay}_${completion.context.dayOfWeek}`,
        value: JSON.stringify({
          efficiency: completion.efficiency,
          duration: completion.actualDuration,
          taskType: completion.context.taskType
        }),
        confidence: Math.min(0.9, completion.efficiency),
        layer: 'context'
      });
    } catch (error) {
      console.warn('Failed to record in self-model:', error);
    }
  }

  private findRelevantPatterns(keywords: string[], context: ProductivityContext): ProductivityPattern[] {
    return Array.from(this.patterns.values())
      .filter(pattern => {
        const relevanceScore = this.calculatePatternRelevance(keywords, pattern, context);
        return relevanceScore > 0.3;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  private calculatePatternRelevance(keywords: string[], pattern: ProductivityPattern, context: ProductivityContext): number {
    let score = 0;
    
    // Keyword relevance
    const patternKeywords = pattern.pattern.split('_');
    const intersection = keywords.filter(k => patternKeywords.includes(k));
    score += intersection.length / Math.max(keywords.length, patternKeywords.length);
    
    // Context relevance
    const contextMatches = pattern.contexts.filter(ctx => 
      Math.abs(ctx.timeOfDay - context.timeOfDay) <= 2 &&
      ctx.dayOfWeek === context.dayOfWeek
    );
    score += contextMatches.length / pattern.contexts.length * 0.5;
    
    return score;
  }

  private estimateOptimalDuration(keywords: string[], context: ProductivityContext): number {
    const relevantPatterns = this.findRelevantPatterns(keywords, context);
    
    if (relevantPatterns.length === 0) {
      return this.getDefaultDuration(keywords.join(' '));
    }

    const weightedDuration = relevantPatterns.reduce((sum, pattern, index) => {
      const weight = pattern.confidence * (1 / (index + 1)); // Decay weight by relevance rank
      return sum + (this.getPatternOptimalDuration(pattern) * weight);
    }, 0);

    const totalWeight = relevantPatterns.reduce((sum, pattern, index) => {
      return sum + (pattern.confidence * (1 / (index + 1)));
    }, 0);

    return Math.round(weightedDuration / totalWeight);
  }

  private getTimeOptimizedSuggestion(keywords: string[], context: ProductivityContext) {
    const timeKey = `${context.timeOfDay}-${context.dayOfWeek}`;
    const timePattern = this.timePatterns.get(timeKey);
    
    if (!timePattern || timePattern.averageProductivity < 0.6) return null;

    return {
      text: `Optimized for ${this.getTimeLabel(context.timeOfDay)}: ${keywords.join(' ')}`,
      estimatedDuration: timePattern.optimalDuration,
      confidence: timePattern.averageProductivity,
      reasoning: `You're ${Math.round(timePattern.averageProductivity * 100)}% more productive at this time`,
      patterns: ['time_optimized'],
      adaptations: [`${timePattern.optimalDuration}min sessions work best at this hour`]
    };
  }

  private getLocationOptimizedSuggestion(keywords: string[], context: ProductivityContext) {
    if (!context.location) return null;

    const locationPattern = this.locationPatterns.get(context.location);
    if (!locationPattern || locationPattern.averageEfficiency < 0.6) return null;

    const commonTasksMatch = locationPattern.commonTasks.some(task => 
      keywords.some(keyword => task.toLowerCase().includes(keyword.toLowerCase()))
    );

    if (!commonTasksMatch) return null;

    return {
      text: `Location-optimized: ${keywords.join(' ')} at ${context.location}`,
      estimatedDuration: this.getLocationOptimalDuration(locationPattern),
      confidence: locationPattern.averageEfficiency,
      reasoning: `This type of work performs ${Math.round(locationPattern.averageEfficiency * 100)}% better at this location`,
      patterns: ['location_optimized'],
      adaptations: [`${context.location} environment boosts your focus`]
    };
  }

  private getBehavioralOptimizedSuggestion(keywords: string[], context: ProductivityContext) {
    // Find behavioral patterns that match current context
    const relevantBehaviors = Array.from(this.behavioralPatterns.values())
      .filter(behavior => behavior.effectiveness > 0.7)
      .sort((a, b) => b.effectiveness - a.effectiveness);

    if (relevantBehaviors.length === 0) return null;

    const topBehavior = relevantBehaviors[0];
    return {
      text: `Behavior-adapted: ${keywords.join(' ')}`,
      estimatedDuration: this.getBehaviorOptimalDuration(topBehavior),
      confidence: topBehavior.effectiveness,
      reasoning: `Based on your successful response patterns`,
      patterns: ['behavior_optimized'],
      adaptations: topBehavior.evolution.slice(-2).map(e => e.adaptation)
    };
  }

  private async getContextAdaptiveSuggestions(input: string, context: ProductivityContext) {
    const suggestions = [];
    
    // Energy-based adaptation
    if (context.energy) {
      if (context.energy <= 3) {
        suggestions.push({
          text: `Low-energy approach: ${input}`,
          estimatedDuration: 15,
          confidence: 0.8,
          reasoning: 'Shorter sessions work better when energy is low',
          patterns: ['energy_adaptive'],
          adaptations: ['Break tasks into smaller chunks', 'Use gentle accountability']
        });
      } else if (context.energy >= 8) {
        suggestions.push({
          text: `High-energy deep work: ${input}`,
          estimatedDuration: 90,
          confidence: 0.8,
          reasoning: 'Capitalize on high energy with extended focus',
          patterns: ['energy_adaptive'],
          adaptations: ['Leverage peak energy for challenging work', 'Minimize interruptions']
        });
      }
    }

    return suggestions;
  }

  private analyzeProductivityPatterns() {
    const completions = this.completions.slice(-100); // Recent completions
    
    if (completions.length === 0) {
      return {
        bestTimeForFocus: 'Not enough data',
        averageSessionLength: 25,
        completionRate: 1
      };
    }

    // Find best time for focus
    const hourlyProductivity = new Map<number, number>();
    completions.forEach(completion => {
      const hour = completion.context.timeOfDay;
      const current = hourlyProductivity.get(hour) || 0;
      hourlyProductivity.set(hour, current + completion.efficiency);
    });

    const bestHour = Array.from(hourlyProductivity.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    const avgDuration = completions.reduce((sum, c) => sum + c.actualDuration, 0) / completions.length;
    const completionRate = completions.filter(c => c.efficiency >= 0.8).length / completions.length;

    return {
      bestTimeForFocus: bestHour ? this.getTimeLabel(bestHour) : 'Not determined',
      averageSessionLength: Math.round(avgDuration),
      completionRate,
      topTaskCategories: this.getTopTaskCategories(completions)
    };
  }

  private getTopPatterns() {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(pattern => ({
        pattern: pattern.pattern,
        strength: pattern.confidence,
        evolution: this.getPatternEvolution(pattern)
      }));
  }

  private getTopAdaptations() {
    return Array.from(this.behavioralPatterns.values())
      .filter(behavior => behavior.frequency >= 3)
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 5)
      .map(behavior => ({
        trigger: behavior.trigger,
        response: this.getBestResponse(behavior),
        effectiveness: behavior.effectiveness
      }));
  }

  private generatePersonalizedRecommendations(): string[] {
    const recommendations = [];
    
    if (this.userSnapshot) {
      // Duration recommendations
      const preferredDuration = this.getMostPreferredDuration();
      if (preferredDuration) {
        recommendations.push(`Your sweet spot is ${preferredDuration}-minute sessions`);
      }

      // Time recommendations
      const bestTime = this.getBestProductiveTime();
      if (bestTime) {
        recommendations.push(`You're most productive ${bestTime}`);
      }

      // Behavioral recommendations
      const topBehavior = this.getTopBehavioralPattern();
      if (topBehavior) {
        recommendations.push(topBehavior);
      }

      // Adaptive recommendations
      if (this.userSnapshot.totalSessions > 50) {
        recommendations.push('Your patterns are stabilizing - trying new approaches could unlock new productivity levels');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Building your unique productivity profile...',
        'Every session teaches me more about your optimal flow',
        'Patterns are emerging - keep up the great work!'
      );
    }

    return recommendations;
  }

  // Helper methods for snapshot management
  private createInitialSnapshot(): UserProductivitySnapshot {
    return {
      totalSessions: 0,
      totalFocusTime: 0,
      averageEfficiency: 0.8,
      preferredDurations: {},
      productiveTimeSlots: {},
      behavioralTendencies: {},
      coachingPreferences: {
        tone: 'supportive',
        directness: 3,
        encouragementStyle: 'gentle',
        redirectionStyle: 'subtle',
        celebrationStyle: 'enthusiastic'
      },
      adaptationHistory: [],
      lastUpdated: Date.now()
    };
  }

  private async initializeUserSnapshot() {
    if (!this.userSnapshot && this.completions.length > 0) {
      this.userSnapshot = this.createInitialSnapshot();
      
      // Rebuild snapshot from existing completions
      for (const completion of this.completions) {
        await this.updateUserSnapshot(completion);
      }
    }
  }

  // Utility methods
  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'with', 'are', 'this', 'that', 'will', 'can', 'should'].includes(word))
      .slice(0, 5); // Limit to top 5 keywords
  }

  private generatePatternKey(keywords: string[], context: ProductivityContext): string {
    const contextKey = `${context.timeOfDay}-${context.dayOfWeek}-${context.environment || 'unknown'}`;
    return `${keywords.sort().join('_')}_${contextKey}`;
  }

  private generateBehaviorKey(completion: ProductivityCompletion): string {
    return `${completion.context.timeOfDay}_${completion.context.environment}_${completion.sideQuests}`;
  }

  private generateAdaptationKey(message: string, context: Partial<ProductivityContext>): string {
    const messageType = this.classifyCoachingMessage(message);
    return `${messageType}_${context.timeOfDay || 'any'}_${context.environment || 'any'}`;
  }

  private classifyCoachingMessage(message: string): string {
    if (message.toLowerCase().includes('redirect') || message.toLowerCase().includes('focus')) return 'redirect';
    if (message.toLowerCase().includes('encourage') || message.toLowerCase().includes('great')) return 'encourage';
    if (message.toLowerCase().includes('celebrate') || message.toLowerCase().includes('complete')) return 'celebrate';
    return 'general';
  }

  private getDefaultDuration(taskDescription: string): number {
    if (taskDescription.toLowerCase().includes('quick') || taskDescription.length < 20) return 10;
    if (taskDescription.toLowerCase().includes('deep') || taskDescription.length > 100) return 45;
    return 25;
  }

  private getTimeLabel(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private detectEnvironment(context: ProductivityContext): 'home' | 'office' | 'cafe' | 'travel' | 'other' {
    // Simple heuristic - could be enhanced with actual detection
    if (context.noiseLevel === 'quiet') return 'home';
    if (context.noiseLevel === 'moderate') return 'office';
    if (context.noiseLevel === 'loud') return 'cafe';
    return 'other';
  }

  private getPatternOptimalDuration(pattern: ProductivityPattern): number {
    // Analyze pattern contexts to find optimal duration
    const durations = pattern.contexts.map(ctx => 25); // Placeholder - would need actual duration data
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  private getLocationOptimalDuration(locationPattern: LocationPattern): number {
    // Analyze location pattern for optimal duration
    return 30; // Placeholder
  }

  private getBehaviorOptimalDuration(behavior: BehavioralPattern): number {
    // Analyze behavioral pattern for optimal duration
    return 25; // Placeholder
  }

  private getPatternEvolution(pattern: ProductivityPattern): string {
    if (pattern.adaptations.length === 0) return 'Stable pattern';
    const recent = pattern.adaptations.slice(-3);
    const improvements = recent.filter(a => a.success).length;
    return `${improvements}/${recent.length} recent adaptations successful`;
  }

  private getBestResponse(behavior: BehavioralPattern): string {
    const bestAdaptation = behavior.evolution
      .sort((a, b) => b.effectiveness - a.effectiveness)[0];
    return bestAdaptation?.adaptation || 'Learning optimal response';
  }

  private getMostPreferredDuration(): number | null {
    if (!this.userSnapshot) return null;
    
    const durations = Object.entries(this.userSnapshot.preferredDurations);
    if (durations.length === 0) return null;
    
    const preferred = durations.sort(([,a], [,b]) => b - a)[0];
    return parseInt(preferred[0]);
  }

  private getBestProductiveTime(): string | null {
    if (!this.userSnapshot) return null;
    
    const timeSlots = Object.entries(this.userSnapshot.productiveTimeSlots);
    if (timeSlots.length === 0) return null;
    
    const bestSlot = timeSlots.sort(([,a], [,b]) => b - a)[0];
    return this.getTimeLabel(parseInt(bestSlot[0]));
  }

  private getTopBehavioralPattern(): string | null {
    const behaviors = Array.from(this.behavioralPatterns.values())
      .sort((a, b) => b.effectiveness - a.effectiveness);
    
    if (behaviors.length === 0) return null;
    
    const topBehavior = behaviors[0];
    return `Your ${topBehavior.trigger} pattern shows ${Math.round(topBehavior.effectiveness * 100)}% effectiveness`;
  }

  private getTopTaskCategories(completions: ProductivityCompletion[]) {
    const categories = new Map<string, number>();
    
    completions.forEach(completion => {
      const category = completion.context.taskType || 'general';
      categories.set(category, (categories.get(category) || 0) + 1);
    });

    return Array.from(categories.entries())
      .map(([category, frequency]) => ({ category, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
  }

  private async updateCoachingPreferences(feedback: any) {
    // Update coaching style based on user feedback
    if (!this.userSnapshot) return;
    
    if (feedback.effectiveness >= 4) {
      // Reinforce successful coaching style
      // Implementation would adjust tone, directness, etc.
    } else if (feedback.effectiveness <= 2) {
      // Adapt coaching style
      // Implementation would try different approaches
    }
  }

  private async learnFromBehavior(
    type: string, 
    description: string, 
    context: ProductivityContext, 
    impact: 'positive' | 'neutral' | 'negative'
  ) {
    const behaviorKey = `${type}_${context.timeOfDay}_${context.environment}`;
    
    let behavior = this.behavioralPatterns.get(behaviorKey);
    if (!behavior) {
      behavior = {
        trigger: behaviorKey,
        contexts: [],
        responses: [],
        effectiveness: 0,
        frequency: 0,
        evolution: []
      };
    }

    const effectivenessScore = impact === 'positive' ? 1 : impact === 'negative' ? 0 : 0.5;
    behavior.effectiveness = (behavior.effectiveness * behavior.frequency + effectivenessScore) / (behavior.frequency + 1);
    behavior.frequency += 1;
    behavior.contexts.push(context);
    behavior.responses.push(description);
    behavior.evolution.push({
      timestamp: Date.now(),
      effectiveness: effectivenessScore,
      adaptation: description
    });

    this.behavioralPatterns.set(behaviorKey, behavior);
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.completions = data.completions || [];
        this.userSnapshot = data.userSnapshot || null;
        
        // Rebuild patterns from completions
        if (this.completions.length > 0) {
          this.completions.forEach(completion => {
            this.updatePatterns(completion);
            this.updateTimePatterns(completion);
            this.updateLocationPatterns(completion);
            this.updateBehavioralPatterns(completion);
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load productivity learning data:', error);
    }
  }

  private saveToStorage() {
    try {
      const data = {
        completions: this.completions,
        userSnapshot: this.userSnapshot,
        lastSaved: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save productivity learning data:', error);
    }
  }
}

interface UserProductivitySnapshot {
  totalSessions: number;
  totalFocusTime: number;
  averageEfficiency: number;
  preferredDurations: Record<number, number>;
  productiveTimeSlots: Record<number, number>;
  behavioralTendencies: Record<string, number>;
  coachingPreferences: {
    tone: string;
    directness: number;
    encouragementStyle: string;
    redirectionStyle: string;
    celebrationStyle: string;
  };
  adaptationHistory: Array<{
    timestamp: number;
    trigger: string;
    adaptation: string;
    success: boolean;
  }>;
  lastUpdated: number;
}

export const productivityLearningService = new ProductivityLearningService();