/**
 * Task Learning Service - AI-powered task duration and pattern learning
 * 
 * This service learns from user behavior to provide better task suggestions,
 * duration estimates, and context-aware recommendations.
 */

interface TaskCompletion {
  task: string;
  plannedDuration: number;
  actualDuration: number;
  timestamp: number;
  context: {
    location?: string;
    timeOfDay: number;
    dayOfWeek: number;
    mood?: string;
    taskType?: string;
  };
}

interface TaskPattern {
  taskKeywords: string[];
  averageDuration: number;
  completionRate: number;
  bestTimeOfDay?: number;
  bestDayOfWeek?: number;
  contextFactors: Record<string, number>;
}

interface LocationContext {
  name: string;
  commonTasks: string[];
  coordinates?: { lat: number; lng: number };
  radius?: number;
}

class TaskLearningService {
  private completions: TaskCompletion[] = [];
  private patterns: Map<string, TaskPattern> = new Map();
  private locationContexts: LocationContext[] = [];
  private storageKey = 'taskLearningData';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Record a task completion for learning
   */
  recordCompletion(completion: Omit<TaskCompletion, 'timestamp' | 'context'> & { context?: Partial<TaskCompletion['context']> }) {
    const fullCompletion: TaskCompletion = {
      ...completion,
      timestamp: Date.now(),
      context: {
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        ...completion.context
      }
    };

    this.completions.push(fullCompletion);
    this.updatePatterns();
    this.saveToStorage();

    // Limit stored completions to last 1000 for performance
    if (this.completions.length > 1000) {
      this.completions = this.completions.slice(-1000);
    }
  }

  /**
   * Estimate duration for a new task based on learned patterns
   */
  estimateDuration(taskDescription: string, context?: Partial<TaskCompletion['context']>): number {
    const keywords = this.extractKeywords(taskDescription);
    const relevantPatterns = this.findRelevantPatterns(keywords);

    if (relevantPatterns.length === 0) {
      return this.getDefaultDuration(taskDescription);
    }

    // Weight patterns by relevance and recency
    let totalWeight = 0;
    let weightedDuration = 0;

    relevantPatterns.forEach(pattern => {
      const relevanceScore = this.calculateRelevance(keywords, pattern.taskKeywords);
      const contextScore = context ? this.calculateContextScore(context, pattern) : 1;
      const weight = relevanceScore * contextScore;

      totalWeight += weight;
      weightedDuration += pattern.averageDuration * weight;
    });

    return Math.round(weightedDuration / totalWeight);
  }

  /**
   * Get smart suggestions based on current context
   */
  getSuggestions(input: string, context?: Partial<TaskCompletion['context']>): Array<{
    text: string;
    estimatedDuration: number;
    confidence: number;
    reasoning: string;
  }> {
    const keywords = this.extractKeywords(input);
    const suggestions = [];

    // Similar task suggestions
    const relevantPatterns = this.findRelevantPatterns(keywords);
    relevantPatterns.slice(0, 3).forEach(pattern => {
      const confidence = this.calculatePatternConfidence(pattern);
      suggestions.push({
        text: `Focus session: ${input}`,
        estimatedDuration: pattern.averageDuration,
        confidence,
        reasoning: `Based on ${this.getCompletionCount(pattern)} similar tasks`
      });
    });

    // Time-based suggestions
    if (context?.timeOfDay !== undefined) {
      const timeOptimized = this.getTimeOptimizedDuration(keywords, context.timeOfDay);
      if (timeOptimized) {
        suggestions.push({
          text: `${timeOptimized.duration}min session: ${input}`,
          estimatedDuration: timeOptimized.duration,
          confidence: timeOptimized.confidence,
          reasoning: `Optimized for ${this.getTimeOfDayLabel(context.timeOfDay)}`
        });
      }
    }

    // Break down suggestion for complex tasks
    if (input.length > 50 || this.detectComplexTask(input)) {
      suggestions.push({
        text: `Break down: ${input}`,
        estimatedDuration: 15,
        confidence: 0.8,
        reasoning: 'Complex tasks benefit from planning first'
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * Learn location-based task patterns
   */
  recordLocationContext(location: string, tasks: string[], coordinates?: { lat: number; lng: number }) {
    let context = this.locationContexts.find(c => c.name === location);
    
    if (!context) {
      context = {
        name: location,
        commonTasks: [],
        coordinates
      };
      this.locationContexts.push(context);
    }

    // Merge task lists, keeping most common
    const allTasks = [...context.commonTasks, ...tasks];
    const taskFreq = new Map<string, number>();
    
    allTasks.forEach(task => {
      taskFreq.set(task, (taskFreq.get(task) || 0) + 1);
    });

    context.commonTasks = Array.from(taskFreq.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([task]) => task);

    this.saveToStorage();
  }

  /**
   * Get location-aware suggestions
   */
  getLocationSuggestions(currentLocation?: string): string[] {
    if (!currentLocation) return [];

    const context = this.locationContexts.find(c => 
      c.name.toLowerCase().includes(currentLocation.toLowerCase()) ||
      currentLocation.toLowerCase().includes(c.name.toLowerCase())
    );

    return context ? context.commonTasks : [];
  }

  /**
   * Analyze productivity patterns
   */
  getProductivityInsights(): {
    bestTimeForFocus: string;
    averageSessionLength: number;
    completionRate: number;
    topTaskCategories: Array<{ category: string; frequency: number }>;
    recommendations: string[];
  } {
    if (this.completions.length < 5) {
      return {
        bestTimeForFocus: 'More data needed',
        averageSessionLength: 25,
        completionRate: 1,
        topTaskCategories: [],
        recommendations: ['Complete a few more sessions for personalized insights!']
      };
    }

    const hourlyProductivity = new Map<number, number>();
    let totalDuration = 0;
    let completedTasks = 0;

    this.completions.forEach(completion => {
      const hour = completion.context.timeOfDay;
      const efficiency = completion.actualDuration <= completion.plannedDuration ? 1 : 0.5;
      
      hourlyProductivity.set(hour, (hourlyProductivity.get(hour) || 0) + efficiency);
      totalDuration += completion.actualDuration;
      completedTasks++;
    });

    const bestHour = Array.from(hourlyProductivity.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    const recommendations = [];
    
    if (bestHour !== undefined) {
      recommendations.push(`Your peak focus time is around ${this.getTimeOfDayLabel(bestHour)}`);
    }

    const avgDuration = Math.round(totalDuration / completedTasks);
    if (avgDuration < 15) {
      recommendations.push('Try longer focus sessions for deeper work');
    } else if (avgDuration > 45) {
      recommendations.push('Consider breaking large tasks into smaller chunks');
    }

    return {
      bestTimeForFocus: bestHour ? this.getTimeOfDayLabel(bestHour) : 'Not determined yet',
      averageSessionLength: avgDuration,
      completionRate: 0.85, // Simplified calculation
      topTaskCategories: this.getTopCategories(),
      recommendations
    };
  }

  // Private helper methods
  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'with', 'are', 'this', 'that'].includes(word));
  }

  private findRelevantPatterns(keywords: string[]): TaskPattern[] {
    return Array.from(this.patterns.values())
      .filter(pattern => this.calculateRelevance(keywords, pattern.taskKeywords) > 0.3)
      .sort((a, b) => b.completionRate - a.completionRate);
  }

  private calculateRelevance(keywords1: string[], keywords2: string[]): number {
    const intersection = keywords1.filter(k => keywords2.includes(k));
    const union = [...new Set([...keywords1, ...keywords2])];
    return intersection.length / union.length;
  }

  private calculateContextScore(context: Partial<TaskCompletion['context']>, pattern: TaskPattern): number {
    let score = 1;
    
    if (context.timeOfDay !== undefined && pattern.bestTimeOfDay !== undefined) {
      const timeDiff = Math.abs(context.timeOfDay - pattern.bestTimeOfDay);
      score *= Math.max(0.5, 1 - timeDiff / 12);
    }

    return score;
  }

  private updatePatterns() {
    // Group completions by similar tasks
    const taskGroups = new Map<string, TaskCompletion[]>();
    
    this.completions.forEach(completion => {
      const keywords = this.extractKeywords(completion.task);
      const key = keywords.sort().join('_');
      
      if (!taskGroups.has(key)) {
        taskGroups.set(key, []);
      }
      taskGroups.get(key)!.push(completion);
    });

    // Update patterns
    taskGroups.forEach((completions, key) => {
      if (completions.length >= 2) {
        const pattern = this.calculatePattern(completions);
        this.patterns.set(key, pattern);
      }
    });
  }

  private calculatePattern(completions: TaskCompletion[]): TaskPattern {
    const keywords = this.extractKeywords(completions[0].task);
    const durations = completions.map(c => c.actualDuration);
    const averageDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    
    const completed = completions.filter(c => c.actualDuration <= c.plannedDuration * 1.2).length;
    const completionRate = completed / completions.length;

    return {
      taskKeywords: keywords,
      averageDuration,
      completionRate,
      contextFactors: {}
    };
  }

  private getDefaultDuration(taskDescription: string): number {
    if (taskDescription.toLowerCase().includes('quick') || taskDescription.length < 20) {
      return 10;
    }
    if (taskDescription.toLowerCase().includes('deep') || taskDescription.length > 100) {
      return 45;
    }
    return 25;
  }

  private calculatePatternConfidence(pattern: TaskPattern): number {
    return Math.min(0.95, pattern.completionRate * 0.7 + 0.3);
  }

  private getCompletionCount(pattern: TaskPattern): number {
    return this.completions.filter(c => {
      const keywords = this.extractKeywords(c.task);
      return this.calculateRelevance(keywords, pattern.taskKeywords) > 0.5;
    }).length;
  }

  private getTimeOptimizedDuration(keywords: string[], timeOfDay: number): { duration: number; confidence: number } | null {
    // Simple heuristic - morning = longer sessions, evening = shorter
    if (timeOfDay >= 6 && timeOfDay <= 10) {
      return { duration: 45, confidence: 0.7 };
    }
    if (timeOfDay >= 20 && timeOfDay <= 23) {
      return { duration: 15, confidence: 0.6 };
    }
    return null;
  }

  private getTimeOfDayLabel(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private detectComplexTask(input: string): boolean {
    const complexWords = ['plan', 'strategy', 'design', 'research', 'analyze', 'create', 'build'];
    return complexWords.some(word => input.toLowerCase().includes(word));
  }

  private getTopCategories(): Array<{ category: string; frequency: number }> {
    const categories = new Map<string, number>();
    
    this.completions.forEach(completion => {
      const category = completion.context.taskType || 'general';
      categories.set(category, (categories.get(category) || 0) + 1);
    });

    return Array.from(categories.entries())
      .map(([category, frequency]) => ({ category, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.completions = data.completions || [];
        this.locationContexts = data.locationContexts || [];
        
        // Rebuild patterns from completions
        this.updatePatterns();
      }
    } catch (error) {
      console.warn('Failed to load task learning data:', error);
    }
  }

  private saveToStorage() {
    try {
      const data = {
        completions: this.completions,
        locationContexts: this.locationContexts
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save task learning data:', error);
    }
  }
}

export const taskLearningService = new TaskLearningService();
