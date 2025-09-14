/**
 * Phase 2: Seasonal Pattern Service
 * Time-based intelligence and seasonal/temporal task suggestions
 */

import { Bubble } from '@/types/bubble';
import { userContextService } from './userContextService';

export interface SeasonalPattern {
  id: string;
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'holiday';
  pattern: string;
  confidence: number;
  frequency: number;
  lastOccurrence: number;
  nextPredicted: number;
  context: {
    timeOfDay?: string;
    dayOfWeek?: string;
    month?: string;
    season?: string;
    holiday?: string;
  };
  suggestions: string[];
}

export interface TimeContext {
  hour: number;
  dayOfWeek: number;
  month: number;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  energyLevel: 'high' | 'medium' | 'low';
}

export interface SeasonalSuggestion {
  id: string;
  title: string;
  content: string;
  confidence: number;
  reasoning: string[];
  timeContext: TimeContext;
  patterns: SeasonalPattern[];
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

class SeasonalPatternService {
  private patterns: Map<string, SeasonalPattern> = new Map();
  private holidays: Map<string, string> = new Map();
  private userHistory: Map<string, number[]> = new Map(); // Pattern ID -> timestamps

  constructor() {
    this.initializeHolidays();
    this.loadStoredPatterns();
  }

  /**
   * Learn patterns from user's bubble creation history
   */
  async learnFromBubbleHistory(bubbles: Bubble[]): Promise<void> {
    console.log('🕐 Learning seasonal patterns from bubble history...');
    
    // Group bubbles by time patterns
    const dailyPatterns = this.extractDailyPatterns(bubbles);
    const weeklyPatterns = this.extractWeeklyPatterns(bubbles);
    const monthlyPatterns = this.extractMonthlyPatterns(bubbles);
    const seasonalPatterns = this.extractSeasonalPatterns(bubbles);
    
    // Store learned patterns
    [...dailyPatterns, ...weeklyPatterns, ...monthlyPatterns, ...seasonalPatterns]
      .forEach(pattern => {
        this.patterns.set(pattern.id, pattern);
      });
    
    this.savePatterns();
    console.log(`🕐 Learned ${this.patterns.size} seasonal patterns`);
  }

  /**
   * Get current time context
   */
  getCurrentTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const month = now.getMonth();
    
    return {
      hour,
      dayOfWeek,
      month,
      season: this.getSeason(month),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isHoliday: this.isHoliday(now),
      holidayName: this.getHolidayName(now),
      timeOfDay: this.getTimeOfDay(hour),
      energyLevel: this.getEnergyLevel(hour, dayOfWeek)
    };
  }

  /**
   * Generate seasonal suggestions based on current context
   */
  async generateSeasonalSuggestions(limit: number = 5): Promise<SeasonalSuggestion[]> {
    const timeContext = this.getCurrentTimeContext();
    const userContext = await userContextService.getUserContext();
    const suggestions: SeasonalSuggestion[] = [];

    // Find relevant patterns for current time context
    const relevantPatterns = Array.from(this.patterns.values())
      .filter(pattern => this.isPatternRelevant(pattern, timeContext))
      .sort((a, b) => b.confidence - a.confidence);

    // Generate suggestions from patterns
    for (const pattern of relevantPatterns.slice(0, limit)) {
      const suggestion = this.createSuggestionFromPattern(pattern, timeContext);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    // Add context-specific suggestions
    suggestions.push(...this.generateContextSpecificSuggestions(timeContext, userContext));

    // Sort by priority and confidence
    return suggestions
      .sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.confidence - a.confidence;
      })
      .slice(0, limit);
  }

  /**
   * Track a new pattern occurrence
   */
  trackPatternOccurrence(patternId: string, timestamp: number = Date.now()): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Update pattern statistics
    pattern.frequency += 1;
    pattern.lastOccurrence = timestamp;
    pattern.nextPredicted = this.predictNextOccurrence(pattern, timestamp);
    
    // Update user history
    const history = this.userHistory.get(patternId) || [];
    history.push(timestamp);
    
    // Keep only recent history (last 50 occurrences)
    if (history.length > 50) history.shift();
    this.userHistory.set(patternId, history);

    // Recalculate confidence based on consistency
    pattern.confidence = this.calculatePatternConfidence(pattern, history);
    
    this.patterns.set(patternId, pattern);
    this.savePatterns();
  }

  /**
   * Get optimal time suggestions for a specific task type
   */
  getOptimalTimeForTask(taskType: string): { time: string; confidence: number; reasoning: string } {
    const relevantPatterns = Array.from(this.patterns.values())
      .filter(pattern => pattern.pattern.toLowerCase().includes(taskType.toLowerCase()))
      .sort((a, b) => b.confidence - a.confidence);

    if (relevantPatterns.length === 0) {
      return {
        time: 'morning',
        confidence: 0.3,
        reasoning: 'Morning is generally a good time for focused work'
      };
    }

    const bestPattern = relevantPatterns[0];
    const timeOfDay = bestPattern.context.timeOfDay || 'morning';
    
    return {
      time: timeOfDay,
      confidence: bestPattern.confidence,
      reasoning: `Based on your pattern: ${bestPattern.pattern}`
    };
  }

  /**
   * Get seasonal activity recommendations
   */
  getSeasonalRecommendations(season?: 'spring' | 'summer' | 'fall' | 'winter'): string[] {
    const currentSeason = season || this.getCurrentTimeContext().season;
    
    const seasonalActivities = {
      spring: [
        'spring cleaning tasks',
        'garden planning',
        'outdoor activity planning',
        'declutter and organize',
        'fresh start goals'
      ],
      summer: [
        'vacation planning',
        'outdoor projects',
        'summer reading list',
        'outdoor exercise routines',
        'social gathering planning'
      ],
      fall: [
        'preparation for winter',
        'cozy home projects',
        'reflection and planning',
        'autumn cleaning',
        'goal review and adjustment'
      ],
      winter: [
        'indoor hobby projects',
        'year-end review',
        'holiday planning',
        'learning new skills',
        'home organization'
      ]
    };

    return seasonalActivities[currentSeason];
  }

  /**
   * Check if now is an optimal time for a specific task
   */
  isOptimalTimeForTask(taskType: string): { isOptimal: boolean; score: number; reasoning: string } {
    const timeContext = this.getCurrentTimeContext();
    const optimal = this.getOptimalTimeForTask(taskType);
    
    const isCurrentTimeOptimal = optimal.time === timeContext.timeOfDay;
    const energyMatch = this.getTaskEnergyRequirement(taskType) <= timeContext.energyLevel;
    
    let score = 0;
    if (isCurrentTimeOptimal) score += 0.4;
    if (energyMatch) score += 0.3;
    if (!timeContext.isWeekend && taskType.includes('work')) score += 0.2;
    if (timeContext.isWeekend && taskType.includes('personal')) score += 0.2;
    
    return {
      isOptimal: score > 0.5,
      score,
      reasoning: this.generateOptimalTimeReasoning(isCurrentTimeOptimal, energyMatch, timeContext)
    };
  }

  // Private methods
  private extractDailyPatterns(bubbles: Bubble[]): SeasonalPattern[] {
    const hourlyFrequency = new Map<number, number>();
    
    bubbles.forEach(bubble => {
      const hour = new Date(bubble.createdAt).getHours();
      hourlyFrequency.set(hour, (hourlyFrequency.get(hour) || 0) + 1);
    });

    const patterns: SeasonalPattern[] = [];
    hourlyFrequency.forEach((frequency, hour) => {
      if (frequency >= 3) { // Pattern needs at least 3 occurrences
        patterns.push({
          id: `daily-${hour}`,
          type: 'daily',
          pattern: `Tasks created at ${hour}:00`,
          confidence: Math.min(frequency / 10, 1),
          frequency,
          lastOccurrence: Date.now(),
          nextPredicted: this.getNextHourOccurrence(hour),
          context: { timeOfDay: this.getTimeOfDay(hour) },
          suggestions: this.getHourlyTaskSuggestions(hour)
        });
      }
    });

    return patterns;
  }

  private extractWeeklyPatterns(bubbles: Bubble[]): SeasonalPattern[] {
    const weeklyFrequency = new Map<number, number>();
    
    bubbles.forEach(bubble => {
      const dayOfWeek = new Date(bubble.createdAt).getDay();
      weeklyFrequency.set(dayOfWeek, (weeklyFrequency.get(dayOfWeek) || 0) + 1);
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const patterns: SeasonalPattern[] = [];
    
    weeklyFrequency.forEach((frequency, dayOfWeek) => {
      if (frequency >= 2) {
        patterns.push({
          id: `weekly-${dayOfWeek}`,
          type: 'weekly',
          pattern: `${dayNames[dayOfWeek]} tasks`,
          confidence: Math.min(frequency / 8, 1),
          frequency,
          lastOccurrence: Date.now(),
          nextPredicted: this.getNextWeekOccurrence(dayOfWeek),
          context: { dayOfWeek: dayNames[dayOfWeek] },
          suggestions: this.getWeeklyTaskSuggestions(dayOfWeek)
        });
      }
    });

    return patterns;
  }

  private extractMonthlyPatterns(bubbles: Bubble[]): SeasonalPattern[] {
    const monthlyFrequency = new Map<number, number>();
    
    bubbles.forEach(bubble => {
      const month = new Date(bubble.createdAt).getMonth();
      monthlyFrequency.set(month, (monthlyFrequency.get(month) || 0) + 1);
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const patterns: SeasonalPattern[] = [];
    monthlyFrequency.forEach((frequency, month) => {
      if (frequency >= 2) {
        patterns.push({
          id: `monthly-${month}`,
          type: 'monthly',
          pattern: `${monthNames[month]} activities`,
          confidence: Math.min(frequency / 5, 1),
          frequency,
          lastOccurrence: Date.now(),
          nextPredicted: this.getNextMonthOccurrence(month),
          context: { month: monthNames[month] },
          suggestions: this.getMonthlyTaskSuggestions(month)
        });
      }
    });

    return patterns;
  }

  private extractSeasonalPatterns(bubbles: Bubble[]): SeasonalPattern[] {
    const seasonalContent = new Map<string, string[]>();
    
    bubbles.forEach(bubble => {
      const month = new Date(bubble.createdAt).getMonth();
      const season = this.getSeason(month);
      
      if (!seasonalContent.has(season)) {
        seasonalContent.set(season, []);
      }
      seasonalContent.get(season)!.push(bubble.content);
    });

    const patterns: SeasonalPattern[] = [];
    seasonalContent.forEach((contents, season) => {
      if (contents.length >= 3) {
        const commonWords = this.extractCommonWords(contents);
        patterns.push({
          id: `seasonal-${season}`,
          type: 'yearly',
          pattern: `${season} tasks: ${commonWords.join(', ')}`,
          confidence: Math.min(contents.length / 15, 1),
          frequency: contents.length,
          lastOccurrence: Date.now(),
          nextPredicted: this.getNextSeasonOccurrence(season),
          context: { season },
          suggestions: this.getSeasonalRecommendations(season as any)
        });
      }
    });

    return patterns;
  }

  private getSeason(month: number): 'spring' | 'summer' | 'fall' | 'winter' {
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  private getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  private getEnergyLevel(hour: number, dayOfWeek: number): 'high' | 'medium' | 'low' {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (hour >= 9 && hour <= 11) return 'high'; // Peak morning hours
    if (hour >= 14 && hour <= 16 && !isWeekend) return 'high'; // Peak afternoon hours
    if (hour >= 6 && hour <= 8) return 'medium'; // Early morning
    if (hour >= 12 && hour <= 13) return 'medium'; // Lunch time
    if (hour >= 17 && hour <= 19) return 'medium'; // Early evening
    return 'low';
  }

  private isPatternRelevant(pattern: SeasonalPattern, timeContext: TimeContext): boolean {
    switch (pattern.type) {
      case 'daily':
        return pattern.context.timeOfDay === timeContext.timeOfDay;
      case 'weekly':
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return pattern.context.dayOfWeek === dayNames[timeContext.dayOfWeek];
      case 'monthly':
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return pattern.context.month === monthNames[timeContext.month];
      case 'yearly':
        return pattern.context.season === timeContext.season;
      default:
        return false;
    }
  }

  private createSuggestionFromPattern(pattern: SeasonalPattern, timeContext: TimeContext): SeasonalSuggestion | null {
    if (pattern.suggestions.length === 0) return null;

    const suggestion = pattern.suggestions[Math.floor(Math.random() * pattern.suggestions.length)];
    
    return {
      id: crypto.randomUUID(),
      title: `${pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1)} Suggestion`,
      content: suggestion,
      confidence: pattern.confidence,
      reasoning: [`Based on your ${pattern.pattern}`],
      timeContext,
      patterns: [pattern],
      priority: pattern.confidence > 0.7 ? 'high' : pattern.confidence > 0.4 ? 'medium' : 'low',
      tags: [pattern.type, timeContext.timeOfDay]
    };
  }

  private generateContextSpecificSuggestions(timeContext: TimeContext, userContext: any): SeasonalSuggestion[] {
    const suggestions: SeasonalSuggestion[] = [];

    // Time-based suggestions
    if (timeContext.timeOfDay === 'morning' && timeContext.energyLevel === 'high') {
      suggestions.push({
        id: crypto.randomUUID(),
        title: 'Morning Energy Peak',
        content: 'Tackle your most challenging task while your energy is high',
        confidence: 0.8,
        reasoning: ['Morning hours are typically associated with peak cognitive performance'],
        timeContext,
        patterns: [],
        priority: 'high',
        tags: ['morning', 'energy', 'focus']
      });
    }

    // Seasonal suggestions
    const seasonalActivities = this.getSeasonalRecommendations(timeContext.season);
    if (seasonalActivities.length > 0) {
      const activity = seasonalActivities[Math.floor(Math.random() * seasonalActivities.length)];
      suggestions.push({
        id: crypto.randomUUID(),
        title: `${timeContext.season.charAt(0).toUpperCase() + timeContext.season.slice(1)} Activity`,
        content: `Consider working on: ${activity}`,
        confidence: 0.6,
        reasoning: [`${timeContext.season} is a great time for this type of activity`],
        timeContext,
        patterns: [],
        priority: 'medium',
        tags: [timeContext.season, 'seasonal']
      });
    }

    return suggestions;
  }

  // Additional helper methods would continue here...
  private initializeHolidays(): void {
    // Initialize major holidays (simplified)
    this.holidays.set('01-01', 'New Year\'s Day');
    this.holidays.set('07-04', 'Independence Day');
    this.holidays.set('12-25', 'Christmas Day');
    // Add more holidays as needed
  }

  private loadStoredPatterns(): void {
    try {
      const stored = localStorage.getItem('seasonalPatterns');
      if (stored) {
        const patterns = JSON.parse(stored);
        patterns.forEach((pattern: SeasonalPattern) => {
          this.patterns.set(pattern.id, pattern);
        });
      }
    } catch (error) {
      console.error('Failed to load seasonal patterns:', error);
    }
  }

  private savePatterns(): void {
    try {
      const patterns = Array.from(this.patterns.values());
      localStorage.setItem('seasonalPatterns', JSON.stringify(patterns));
    } catch (error) {
      console.error('Failed to save seasonal patterns:', error);
    }
  }

  private isHoliday(date: Date): boolean {
    const key = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return this.holidays.has(key);
  }

  private getHolidayName(date: Date): string | undefined {
    const key = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return this.holidays.get(key);
  }

  private predictNextOccurrence(pattern: SeasonalPattern, lastOccurrence: number): number {
    const intervals = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      yearly: 365 * 24 * 60 * 60 * 1000
    };
    
    return lastOccurrence + intervals[pattern.type];
  }

  private calculatePatternConfidence(pattern: SeasonalPattern, history: number[]): number {
    if (history.length < 2) return 0.3;
    
    // Calculate consistency based on time intervals
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i] - history[i - 1]);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const consistency = 1 / (1 + variance / (avgInterval * avgInterval));
    
    return Math.min(consistency * (history.length / 10), 1);
  }

  private getNextHourOccurrence(hour: number): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    
    return next.getTime();
  }

  private getNextWeekOccurrence(dayOfWeek: number): number {
    const now = new Date();
    const next = new Date(now);
    const daysToAdd = (dayOfWeek - now.getDay() + 7) % 7;
    next.setDate(now.getDate() + daysToAdd);
    
    return next.getTime();
  }

  private getNextMonthOccurrence(month: number): number {
    const now = new Date();
    const next = new Date(now.getFullYear(), month, 1);
    
    if (next <= now) {
      next.setFullYear(next.getFullYear() + 1);
    }
    
    return next.getTime();
  }

  private getNextSeasonOccurrence(season: string): number {
    const seasonStartMonths = { spring: 2, summer: 5, fall: 8, winter: 11 };
    const month = seasonStartMonths[season as keyof typeof seasonStartMonths];
    return this.getNextMonthOccurrence(month);
  }

  private extractCommonWords(contents: string[]): string[] {
    const wordCount = new Map<string, number>();
    
    contents.forEach(content => {
      const words = content.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      words.forEach(word => {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      });
    });
    
    return Array.from(wordCount.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private getHourlyTaskSuggestions(hour: number): string[] {
    const suggestions = {
      6: ['morning routine', 'exercise', 'meditation'],
      9: ['important meetings', 'focused work', 'planning'],
      12: ['lunch break', 'quick tasks', 'social connections'],
      15: ['creative work', 'brainstorming', 'collaboration'],
      18: ['wrap up work', 'personal tasks', 'family time'],
      21: ['reflection', 'reading', 'relaxation']
    };
    
    return suggestions[hour as keyof typeof suggestions] || ['general tasks'];
  }

  private getWeeklyTaskSuggestions(dayOfWeek: number): string[] {
    const suggestions = [
      ['rest', 'family time', 'hobbies'], // Sunday
      ['week planning', 'meetings', 'fresh starts'], // Monday
      ['focused work', 'important projects'], // Tuesday
      ['collaboration', 'mid-week check-ins'], // Wednesday
      ['creative work', 'brainstorming'], // Thursday
      ['wrap up projects', 'social activities'], // Friday
      ['personal projects', 'errands', 'fun activities'] // Saturday
    ];
    
    return suggestions[dayOfWeek] || ['general tasks'];
  }

  private getMonthlyTaskSuggestions(month: number): string[] {
    const suggestions = [
      ['new year planning', 'goal setting'], // January
      ['relationship focus', 'indoor projects'], // February
      ['spring preparation', 'fresh starts'], // March
      ['growth activities', 'outdoor planning'], // April
      ['energy projects', 'celebration planning'], // May
      ['summer preparation', 'outdoor activities'], // June
      ['vacation planning', 'outdoor projects'], // July
      ['summer activities', 'relaxation'], // August
      ['back to school', 'new routines'], // September
      ['autumn preparation', 'reflection'], // October
      ['gratitude practices', 'preparation'], // November
      ['holiday planning', 'year-end review'] // December
    ];
    
    return suggestions[month] || ['seasonal activities'];
  }

  private getTaskEnergyRequirement(taskType: string): 'high' | 'medium' | 'low' {
    const highEnergyTasks = ['important', 'complex', 'creative', 'planning', 'learning'];
    const lowEnergyTasks = ['routine', 'simple', 'organize', 'email', 'administrative'];
    
    const taskLower = taskType.toLowerCase();
    
    if (highEnergyTasks.some(keyword => taskLower.includes(keyword))) return 'high';
    if (lowEnergyTasks.some(keyword => taskLower.includes(keyword))) return 'low';
    return 'medium';
  }

  private generateOptimalTimeReasoning(isCurrentTimeOptimal: boolean, energyMatch: boolean, timeContext: TimeContext): string {
    const reasons = [];
    
    if (isCurrentTimeOptimal) reasons.push('This is your usual time for this type of task');
    if (energyMatch) reasons.push('Your energy level matches the task requirements');
    if (timeContext.isWeekend) reasons.push('Weekend time is good for personal tasks');
    if (!timeContext.isWeekend) reasons.push('Weekday time is good for work tasks');
    
    return reasons.join('. ') || 'This is a reasonable time for this task';
  }
}

export const seasonalPatternService = new SeasonalPatternService();
