/**
 * Phase 2: Advanced Habit Engine
 * Enhanced behavioral learning with habit-based predictive task creation
 */

import { Bubble } from '@/types/bubble';
import { behavioralScienceEngine } from './behavioralScienceEngine';
import { seasonalPatternService } from './seasonalPatternService';

export interface HabitPattern {
  id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'situational';
  triggers: string[];
  actions: string[];
  confidence: number;
  strength: number; // 0-1, how established the habit is
  lastReinforced: number;
  predictedNext: number;
  completionRate: number;
  contextFactors: {
    timeOfDay?: string;
    location?: string;
    mood?: string;
    energy?: string;
    precedingTasks?: string[];
  };
  reinforcementSchedule: {
    type: 'fixed' | 'variable' | 'ratio' | 'interval';
    parameter: number;
    lastReward: number;
  };
}

export interface HabitPrediction {
  id: string;
  bubbleContent: string;
  confidence: number;
  reasoning: string[];
  suggestedTime: number;
  habitPatterns: HabitPattern[];
  contextSupport: number; // How well current context supports this habit
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDuration: number;
  energyRequired: 'low' | 'medium' | 'high';
}

export interface ProductivityRhythm {
  id: string;
  name: string;
  type: 'focus' | 'break' | 'transition' | 'creative' | 'administrative';
  timeWindows: Array<{
    start: number; // hour of day
    end: number;
    strength: number; // 0-1
    daysOfWeek: number[]; // 0-6
  }>;
  taskTypes: string[];
  averagePerformance: number;
  consistencyScore: number;
  recommendations: string[];
}

class AdvancedHabitEngine {
  private habits: Map<string, HabitPattern> = new Map();
  private rhythms: Map<string, ProductivityRhythm> = new Map();
  private predictionHistory: Map<string, boolean[]> = new Map(); // Track prediction accuracy
  private contextMemory: Array<{ timestamp: number; context: any; actions: string[] }> = [];

  constructor() {
    this.loadStoredData();
    this.initializeDefaultRhythms();
  }

  /**
   * Learn habits from user's bubble history and behavior patterns
   */
  async learnHabitsFromHistory(bubbles: Bubble[]): Promise<void> {
    console.log('🧠 Learning advanced habit patterns...');
    
    // Group bubbles by sequences and patterns
    const sequences = this.extractTaskSequences(bubbles);
    const timePatterns = this.extractTimeBasedPatterns(bubbles);
    const contextPatterns = this.extractContextualPatterns(bubbles);
    
    // Create habit patterns from sequences
    sequences.forEach(sequence => {
      const habit = this.createHabitFromSequence(sequence);
      if (habit) {
        this.habits.set(habit.id, habit);
      }
    });
    
    // Update productivity rhythms
    this.updateProductivityRhythms(timePatterns);
    
    // Learn contextual triggers
    // this.learnContextualTriggers(contextPatterns);
    
    this.saveData();
    console.log(`🧠 Learned ${this.habits.size} habit patterns and ${this.rhythms.size} productivity rhythms`);
  }

  /**
   * Generate predictive task suggestions based on current context
   */
  async generateHabitBasedPredictions(currentContext: any): Promise<HabitPrediction[]> {
    const now = Date.now();
    const timeContext = seasonalPatternService.getCurrentTimeContext();
    const predictions: HabitPrediction[] = [];

    // Check each habit for prediction opportunities
    for (const habit of this.habits.values()) {
      const prediction = this.evaluateHabitPrediction(habit, currentContext, timeContext, now);
      if (prediction && prediction.confidence > 0.3) {
        predictions.push(prediction);
      }
    }

    // Add rhythm-based predictions
    const rhythmPredictions = this.generateRhythmBasedPredictions(timeContext, currentContext);
    predictions.push(...rhythmPredictions);

    // Sort by confidence and priority
    return predictions
      .sort((a, b) => {
        const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.confidence - a.confidence;
      })
      .slice(0, 10); // Limit to top 10 predictions
  }

  /**
   * Reinforce a habit when user follows through on prediction
   */
  reinforceHabit(habitId: string, successful: boolean): void {
    const habit = this.habits.get(habitId);
    if (!habit) return;

    const now = Date.now();
    
    // Update completion rate
    const history = this.predictionHistory.get(habitId) || [];
    history.push(successful);
    if (history.length > 20) history.shift(); // Keep last 20 attempts
    this.predictionHistory.set(habitId, history);
    
    habit.completionRate = history.filter(Boolean).length / history.length;
    
    if (successful) {
      // Strengthen the habit
      habit.strength = Math.min(1, habit.strength + 0.05);
      habit.confidence = Math.min(1, habit.confidence + 0.02);
      habit.lastReinforced = now;
      
      // Update predicted next occurrence
      habit.predictedNext = this.calculateNextPrediction(habit, now);
      
      console.log(`🧠 Habit reinforced: ${habit.name} (strength: ${habit.strength.toFixed(2)})`);
    } else {
      // Slightly weaken the habit
      habit.strength = Math.max(0.1, habit.strength - 0.02);
      habit.confidence = Math.max(0.1, habit.confidence - 0.01);
    }
    
    this.habits.set(habitId, habit);
    this.saveData();
  }

  /**
   * Get current productivity rhythm recommendations
   */
  getCurrentRhythmRecommendations(): {
    currentRhythm: ProductivityRhythm | null;
    recommendations: string[];
    optimalTaskTypes: string[];
    energyLevel: 'low' | 'medium' | 'high';
  } {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Find active rhythm
    const activeRhythm = Array.from(this.rhythms.values())
      .find(rhythm => 
        rhythm.timeWindows.some(window => 
          hour >= window.start && 
          hour <= window.end && 
          window.daysOfWeek.includes(dayOfWeek)
        )
      );

    if (!activeRhythm) {
      return {
        currentRhythm: null,
        recommendations: ['No specific rhythm detected for this time'],
        optimalTaskTypes: ['general tasks'],
        energyLevel: 'medium'
      };
    }

    const energyLevel = this.inferEnergyLevel(activeRhythm.type, hour);
    
    return {
      currentRhythm: activeRhythm,
      recommendations: activeRhythm.recommendations,
      optimalTaskTypes: activeRhythm.taskTypes,
      energyLevel
    };
  }

  /**
   * Analyze habit formation progress
   */
  analyzeHabitFormation(habitId: string): {
    stage: 'initiation' | 'learning' | 'stability' | 'instability';
    daysActive: number;
    consistency: number;
    strengthTrend: 'increasing' | 'decreasing' | 'stable';
    recommendations: string[];
  } {
    const habit = this.habits.get(habitId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    const history = this.predictionHistory.get(habitId) || [];
    const daysActive = Math.floor((Date.now() - (habit.lastReinforced || Date.now())) / (24 * 60 * 60 * 1000));
    
    // Calculate consistency (recent performance vs historical)
    const recentHistory = history.slice(-7); // Last 7 attempts
    const overallRate = habit.completionRate;
    const recentRate = recentHistory.length > 0 ? recentHistory.filter(Boolean).length / recentHistory.length : 0;
    
    const consistency = recentRate / Math.max(overallRate, 0.1);

    // Determine stage
    let stage: 'initiation' | 'learning' | 'stability' | 'instability';
    if (habit.strength < 0.3) stage = 'initiation';
    else if (habit.strength < 0.7) stage = 'learning';
    else if (consistency > 0.8) stage = 'stability';
    else stage = 'instability';

    // Determine trend
    const recentStrengthPoints = history.slice(-5).map((success, i) => success ? 1 : 0);
    const firstHalf = recentStrengthPoints.slice(0, 2).reduce((a, b) => a + b, 0);
    const secondHalf = recentStrengthPoints.slice(-2).reduce((a, b) => a + b, 0);
    const trend = recentStrengthPoints.length > 2 ? 
      (secondHalf > firstHalf ? 'increasing' : 'decreasing') : 'stable';

    const recommendations = this.generateHabitRecommendations(stage, consistency, trend);

    return {
      stage,
      daysActive,
      consistency,
      strengthTrend: trend,
      recommendations
    };
  }

  /**
   * Cross-session learning persistence
   */
  async persistLearning(): Promise<void> {
    // Save habit data with versioning
    const learningData = {
      version: '1.0',
      timestamp: Date.now(),
      habits: Array.from(this.habits.entries()),
      rhythms: Array.from(this.rhythms.entries()),
      predictionHistory: Array.from(this.predictionHistory.entries()),
      contextMemory: this.contextMemory.slice(-100) // Keep last 100 context memories
    };

    try {
      localStorage.setItem('advancedHabitLearning', JSON.stringify(learningData));
      console.log('🧠 Advanced habit learning data persisted');
    } catch (error) {
      console.error('Failed to persist habit learning:', error);
    }
  }

  // Private implementation methods
  private extractTaskSequences(bubbles: Bubble[]): Array<{ tasks: string[]; frequency: number; timeGaps: number[] }> {
    const sequences: Map<string, { count: number; timeGaps: number[] }> = new Map();
    
    // Sort bubbles by creation time
    const sortedBubbles = [...bubbles].sort((a, b) => a.createdAt - b.createdAt);
    
    // Look for sequences of 2-4 tasks within reasonable time windows
    for (let i = 0; i < sortedBubbles.length - 1; i++) {
      for (let seqLength = 2; seqLength <= Math.min(4, sortedBubbles.length - i); seqLength++) {
        const sequence = sortedBubbles.slice(i, i + seqLength);
        const timeSpan = sequence[sequence.length - 1].createdAt - sequence[0].createdAt;
        
        // Only consider sequences within 24 hours
        if (timeSpan <= 24 * 60 * 60 * 1000) {
          const taskNames = sequence.map(b => this.normalizeTaskName(b.content));
          const sequenceKey = taskNames.join(' → ');
          
          const existing = sequences.get(sequenceKey) || { count: 0, timeGaps: [] };
          existing.count += 1;
          
          // Calculate time gaps between tasks
          for (let j = 1; j < sequence.length; j++) {
            const gap = sequence[j].createdAt - sequence[j-1].createdAt;
            existing.timeGaps.push(gap);
          }
          
          sequences.set(sequenceKey, existing);
        }
      }
    }
    
    // Filter for frequently occurring sequences
    return Array.from(sequences.entries())
      .filter(([_, data]) => data.count >= 3)
      .map(([sequence, data]) => ({
        tasks: sequence.split(' → '),
        frequency: data.count,
        timeGaps: data.timeGaps
      }));
  }

  private extractTimeBasedPatterns(bubbles: Bubble[]): Map<string, Array<{ hour: number; dayOfWeek: number; performance: number }>> {
    const patterns = new Map<string, Array<{ hour: number; dayOfWeek: number; performance: number }>>();
    
    bubbles.forEach(bubble => {
      const date = new Date(bubble.createdAt);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const taskType = this.categorizeTask(bubble.content);
      
      if (!patterns.has(taskType)) {
        patterns.set(taskType, []);
      }
      
      // Simple performance metric based on completion and time to complete
      const performance = bubble.completed ? 1 : 0.5;
      
      patterns.get(taskType)!.push({ hour, dayOfWeek, performance });
    });
    
    return patterns;
  }

  private extractContextualPatterns(bubbles: Bubble[]): Array<{ context: any; actions: string[] }> {
    const patterns: Array<{ context: any; actions: string[] }> = [];
    
    // Group bubbles by time windows (e.g., 1-hour windows)
    const windowSize = 60 * 60 * 1000; // 1 hour
    const windows = new Map<number, Bubble[]>();
    
    bubbles.forEach(bubble => {
      const windowKey = Math.floor(bubble.createdAt / windowSize);
      if (!windows.has(windowKey)) {
        windows.set(windowKey, []);
      }
      windows.get(windowKey)!.push(bubble);
    });
    
    // Extract patterns from windows with multiple tasks
    windows.forEach((windowBubbles, windowKey) => {
      if (windowBubbles.length >= 2) {
        const context = {
          timeOfDay: this.getTimeOfDay(new Date(windowKey * windowSize).getHours()),
          dayOfWeek: new Date(windowKey * windowSize).getDay(),
          taskCount: windowBubbles.length
        };
        
        const actions = windowBubbles.map(b => this.normalizeTaskName(b.content));
        patterns.push({ context, actions });
      }
    });
    
    return patterns;
  }

  private createHabitFromSequence(sequence: { tasks: string[]; frequency: number; timeGaps: number[] }): HabitPattern | null {
    if (sequence.frequency < 3 || sequence.tasks.length < 2) return null;
    
    const avgTimeGap = sequence.timeGaps.reduce((sum, gap) => sum + gap, 0) / sequence.timeGaps.length;
    const consistency = 1 - (Math.sqrt(sequence.timeGaps.reduce((sum, gap) => sum + Math.pow(gap - avgTimeGap, 2), 0) / sequence.timeGaps.length) / avgTimeGap);
    
    return {
      id: crypto.randomUUID(),
      name: `${sequence.tasks[0]} → ${sequence.tasks[sequence.tasks.length - 1]}`,
      description: `Habit sequence: ${sequence.tasks.join(' → ')}`,
      frequency: this.inferFrequency(avgTimeGap),
      triggers: [sequence.tasks[0]],
      actions: sequence.tasks.slice(1),
      confidence: Math.min(sequence.frequency / 10, 1) * consistency,
      strength: Math.min(sequence.frequency / 15, 1),
      lastReinforced: Date.now(),
      predictedNext: Date.now() + avgTimeGap,
      completionRate: 0.8, // Default high rate for learned sequences
      contextFactors: {},
      reinforcementSchedule: {
        type: 'interval',
        parameter: avgTimeGap,
        lastReward: Date.now()
      }
    };
  }

  private updateProductivityRhythms(patterns: Map<string, Array<{ hour: number; dayOfWeek: number; performance: number }>>): void {
    patterns.forEach((data, taskType) => {
      // Group by hour and calculate average performance
      const hourlyPerformance = new Map<number, number[]>();
      
      data.forEach(point => {
        if (!hourlyPerformance.has(point.hour)) {
          hourlyPerformance.set(point.hour, []);
        }
        hourlyPerformance.get(point.hour)!.push(point.performance);
      });
      
      // Find high-performance time windows
      const timeWindows: ProductivityRhythm['timeWindows'] = [];
      
      hourlyPerformance.forEach((performances, hour) => {
        const avgPerformance = performances.reduce((sum, p) => sum + p, 0) / performances.length;
        
        if (avgPerformance > 0.7 && performances.length >= 3) {
          timeWindows.push({
            start: hour,
            end: hour + 1,
            strength: avgPerformance,
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6] // All days for now, could be more specific
          });
        }
      });
      
      if (timeWindows.length > 0) {
        const rhythm: ProductivityRhythm = {
          id: crypto.randomUUID(),
          name: `${taskType} Optimal Times`,
          type: this.inferRhythmType(taskType),
          timeWindows,
          taskTypes: [taskType],
          averagePerformance: data.reduce((sum, p) => sum + p.performance, 0) / data.length,
          consistencyScore: this.calculateConsistency(data),
          recommendations: this.generateRhythmRecommendations(taskType, timeWindows)
        };
        
        this.rhythms.set(rhythm.id, rhythm);
      }
    });
  }

  private evaluateHabitPrediction(habit: HabitPattern, currentContext: any, timeContext: any, now: number): HabitPrediction | null {
    // Check if it's time for this habit based on frequency and last occurrence
    const timeSinceLastReinforcement = now - habit.lastReinforced;
    const expectedInterval = this.getExpectedInterval(habit.frequency);
    
    if (timeSinceLastReinforcement < expectedInterval * 0.8) {
      return null; // Too soon
    }
    
    // Calculate confidence based on multiple factors
    let confidence = habit.confidence * habit.strength;
    
    // Context support
    const contextSupport = this.calculateContextSupport(habit, currentContext, timeContext);
    confidence *= contextSupport;
    
    // Adjust for time since last reinforcement
    const timeMultiplier = Math.min(timeSinceLastReinforcement / expectedInterval, 2);
    confidence *= timeMultiplier;
    
    if (confidence < 0.3) return null;
    
    // Generate prediction
    return {
      id: crypto.randomUUID(),
      bubbleContent: this.generateHabitContent(habit),
      confidence,
      reasoning: this.generateHabitReasoning(habit, contextSupport, timeMultiplier),
      suggestedTime: now,
      habitPatterns: [habit],
      contextSupport,
      priority: this.calculateHabitPriority(confidence, habit.strength),
      estimatedDuration: this.estimateHabitDuration(habit),
      energyRequired: this.estimateHabitEnergy(habit)
    };
  }

  private generateRhythmBasedPredictions(timeContext: any, currentContext: any): HabitPrediction[] {
    const now = Date.now();
    const predictions: HabitPrediction[] = [];
    
    const rhythmRecommendations = this.getCurrentRhythmRecommendations();
    
    if (rhythmRecommendations.currentRhythm) {
      const rhythm = rhythmRecommendations.currentRhythm;
      
      rhythmRecommendations.optimalTaskTypes.forEach(taskType => {
        predictions.push({
          id: crypto.randomUUID(),
          bubbleContent: `Work on ${taskType} tasks`,
          confidence: rhythm.consistencyScore * 0.8,
          reasoning: [`This is your optimal time for ${taskType}`, `Based on your productivity rhythm: ${rhythm.name}`],
          suggestedTime: now,
          habitPatterns: [],
          contextSupport: rhythm.averagePerformance,
          priority: rhythm.averagePerformance > 0.8 ? 'high' : 'medium',
          estimatedDuration: 30 * 60 * 1000, // 30 minutes default
          energyRequired: rhythmRecommendations.energyLevel
        });
      });
    }
    
    return predictions;
  }

  // Helper methods
  private normalizeTaskName(content: string): string {
    return content.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().substring(0, 30);
  }

  private categorizeTask(content: string): string {
    const categories = {
      'meeting': ['meeting', 'call', 'discussion'],
      'coding': ['code', 'program', 'debug', 'develop'],
      'writing': ['write', 'draft', 'document', 'blog'],
      'planning': ['plan', 'schedule', 'organize'],
      'learning': ['learn', 'study', 'read', 'research'],
      'admin': ['email', 'admin', 'paperwork', 'file']
    };
    
    const contentLower = content.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }

  private getTimeOfDay(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  private inferFrequency(avgTimeGap: number): 'daily' | 'weekly' | 'monthly' | 'situational' {
    const days = avgTimeGap / (24 * 60 * 60 * 1000);
    
    if (days <= 1.5) return 'daily';
    if (days <= 10) return 'weekly';
    if (days <= 35) return 'monthly';
    return 'situational';
  }

  private inferRhythmType(taskType: string): ProductivityRhythm['type'] {
    const typeMap: Record<string, ProductivityRhythm['type']> = {
      'coding': 'focus',
      'writing': 'creative',
      'admin': 'administrative',
      'meeting': 'transition',
      'learning': 'focus'
    };
    
    return typeMap[taskType] || 'focus';
  }

  private calculateConsistency(data: Array<{ hour: number; dayOfWeek: number; performance: number }>): number {
    if (data.length < 2) return 0;
    
    const avgPerformance = data.reduce((sum, p) => sum + p.performance, 0) / data.length;
    const variance = data.reduce((sum, p) => sum + Math.pow(p.performance - avgPerformance, 2), 0) / data.length;
    
    return 1 / (1 + variance);
  }

  private generateRhythmRecommendations(taskType: string, timeWindows: ProductivityRhythm['timeWindows']): string[] {
    const bestWindow = timeWindows.reduce((best, window) => 
      window.strength > best.strength ? window : best
    );
    
    return [
      `Your peak ${taskType} time is around ${bestWindow.start}:00`,
      `Schedule important ${taskType} tasks during high-performance windows`,
      `Consistency in timing will strengthen this rhythm`
    ];
  }

  private getExpectedInterval(frequency: HabitPattern['frequency']): number {
    const intervals = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      situational: 3 * 24 * 60 * 60 * 1000
    };
    
    return intervals[frequency];
  }

  private calculateContextSupport(habit: HabitPattern, currentContext: any, timeContext: any): number {
    let support = 1.0;
    
    // Time of day support
    if (habit.contextFactors.timeOfDay && timeContext.timeOfDay !== habit.contextFactors.timeOfDay) {
      support *= 0.7;
    }
    
    // Energy level support
    if (habit.contextFactors.energy && currentContext.energyLevel !== habit.contextFactors.energy) {
      support *= 0.8;
    }
    
    return support;
  }

  private generateHabitContent(habit: HabitPattern): string {
    if (habit.actions.length > 0) {
      return habit.actions[0];
    }
    return `Continue with ${habit.name}`;
  }

  private generateHabitReasoning(habit: HabitPattern, contextSupport: number, timeMultiplier: number): string[] {
    const reasons = [`Based on your habit: ${habit.name}`];
    
    if (habit.completionRate > 0.8) {
      reasons.push(`You complete this ${Math.round(habit.completionRate * 100)}% of the time`);
    }
    
    if (contextSupport > 0.8) {
      reasons.push('Current context is ideal for this habit');
    }
    
    if (timeMultiplier > 1.2) {
      reasons.push('It\'s been a while since you last did this');
    }
    
    return reasons;
  }

  private calculateHabitPriority(confidence: number, strength: number): 'low' | 'medium' | 'high' | 'urgent' {
    const score = confidence * strength;
    
    if (score > 0.8) return 'urgent';
    if (score > 0.6) return 'high';
    if (score > 0.4) return 'medium';
    return 'low';
  }

  private estimateHabitDuration(habit: HabitPattern): number {
    // Default duration based on habit type and complexity
    const baseDuration = 15 * 60 * 1000; // 15 minutes
    const complexity = habit.actions.length;
    
    return baseDuration * Math.max(1, complexity);
  }

  private estimateHabitEnergy(habit: HabitPattern): 'low' | 'medium' | 'high' {
    const energyMap = {
      'focus': 'high',
      'creative': 'high',
      'administrative': 'low',
      'transition': 'medium'
    };
    
    // Simple heuristic based on habit name
    const habitLower = habit.name.toLowerCase();
    
    if (habitLower.includes('focus') || habitLower.includes('create')) return 'high';
    if (habitLower.includes('organize') || habitLower.includes('admin')) return 'low';
    
    return 'medium';
  }

  private inferEnergyLevel(rhythmType: ProductivityRhythm['type'], hour: number): 'low' | 'medium' | 'high' {
    // Peak energy hours are typically 9-11 AM and 2-4 PM
    const isPeakHour = (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16);
    
    if (rhythmType === 'focus' && isPeakHour) return 'high';
    if (rhythmType === 'creative' && (hour >= 9 && hour <= 12)) return 'high';
    if (rhythmType === 'administrative') return 'low';
    
    return 'medium';
  }

  private generateHabitRecommendations(stage: string, consistency: number, trend: string): string[] {
    const recommendations = [];
    
    switch (stage) {
      case 'initiation':
        recommendations.push('Start small and be consistent');
        recommendations.push('Focus on daily repetition rather than perfection');
        break;
      case 'learning':
        recommendations.push('Stay consistent to strengthen the habit');
        recommendations.push('Track your progress to stay motivated');
        break;
      case 'stability':
        recommendations.push('Great job! This habit is well established');
        recommendations.push('Consider building on this habit with related behaviors');
        break;
      case 'instability':
        recommendations.push('Review what changed to cause inconsistency');
        recommendations.push('Simplify the habit to rebuild momentum');
        break;
    }
    
    if (consistency < 0.7) {
      recommendations.push('Try reducing the habit complexity');
    }
    
    if (trend === 'decreasing') {
      recommendations.push('Consider what obstacles are interfering');
    }
    
    return recommendations;
  }

  private calculateNextPrediction(habit: HabitPattern, lastOccurrence: number): number {
    const interval = this.getExpectedInterval(habit.frequency);
    return lastOccurrence + interval;
  }

  private initializeDefaultRhythms(): void {
    // Add some default productivity rhythms
    const defaultRhythms: ProductivityRhythm[] = [
      {
        id: 'morning-focus',
        name: 'Morning Focus Period',
        type: 'focus',
        timeWindows: [{
          start: 9,
          end: 11,
          strength: 0.8,
          daysOfWeek: [1, 2, 3, 4, 5]
        }],
        taskTypes: ['coding', 'writing', 'analysis'],
        averagePerformance: 0.8,
        consistencyScore: 0.7,
        recommendations: ['Schedule demanding tasks during morning focus time']
      },
      {
        id: 'afternoon-admin',
        name: 'Afternoon Administrative Period',
        type: 'administrative',
        timeWindows: [{
          start: 14,
          end: 16,
          strength: 0.6,
          daysOfWeek: [1, 2, 3, 4, 5]
        }],
        taskTypes: ['admin', 'email', 'organizing'],
        averagePerformance: 0.6,
        consistencyScore: 0.8,
        recommendations: ['Handle routine tasks and admin work in the afternoon']
      }
    ];
    
    defaultRhythms.forEach(rhythm => {
      this.rhythms.set(rhythm.id, rhythm);
    });
  }

  private loadStoredData(): void {
    try {
      const stored = localStorage.getItem('advancedHabitLearning');
      if (stored) {
        const data = JSON.parse(stored);
        
        if (data.habits) {
          data.habits.forEach(([id, habit]: [string, HabitPattern]) => {
            this.habits.set(id, habit);
          });
        }
        
        if (data.rhythms) {
          data.rhythms.forEach(([id, rhythm]: [string, ProductivityRhythm]) => {
            this.rhythms.set(id, rhythm);
          });
        }
        
        if (data.predictionHistory) {
          data.predictionHistory.forEach(([id, history]: [string, boolean[]]) => {
            this.predictionHistory.set(id, history);
          });
        }
        
        if (data.contextMemory) {
          this.contextMemory = data.contextMemory;
        }
      }
    } catch (error) {
      console.error('Failed to load habit learning data:', error);
    }
  }

  private saveData(): void {
    this.persistLearning(); // Use the public method
  }
}

export const advancedHabitEngine = new AdvancedHabitEngine();