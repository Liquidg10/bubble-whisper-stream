/**
 * Context Pattern Service
 * 
 * Specialized service for learning and recognizing context patterns
 * including location, time, environment, and behavioral contexts.
 */

interface ContextSnapshot {
  location?: string;
  coordinates?: { lat: number; lng: number };
  timeOfDay: number;
  dayOfWeek: number;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  environment: 'home' | 'office' | 'cafe' | 'travel' | 'other';
  deviceType: 'desktop' | 'mobile' | 'tablet';
  networkType?: 'wifi' | 'cellular' | 'offline';
  batteryLevel?: number;
  isCharging?: boolean;
  screenSize: { width: number; height: number };
  userAgent: string;
  language: string;
  timezone: string;
  mood?: number; // 1-10 scale
  energy?: number; // 1-10 scale
  noiseLevel?: 'quiet' | 'moderate' | 'loud';
  lighting?: 'dim' | 'moderate' | 'bright';
  temperature?: 'cold' | 'comfortable' | 'warm';
}

interface LocationContext {
  name: string;
  coordinates?: { lat: number; lng: number };
  radius?: number;
  visits: number;
  totalTimeSpent: number;
  commonActivities: string[];
  productivityScore: number;
  timePatterns: Record<number, number>; // hour -> frequency
  environmentalFactors: {
    noiseLevel?: string;
    lighting?: string;
    temperature?: string;
  };
  lastVisit: number;
}

interface TemporalPattern {
  timeSlot: string; // e.g., "monday-morning", "weekday-evening"
  activities: string[];
  averageProductivity: number;
  energyLevels: number[];
  optimalDuration: number;
  commonTasks: string[];
  successRate: number;
  distractionLevel: number;
}

interface EnvironmentalContext {
  environment: string;
  factors: Record<string, any>;
  productivity: number;
  focusQuality: number;
  commonIssues: string[];
  adaptations: string[];
}

class ContextPatternService {
  private locationContexts: Map<string, LocationContext> = new Map();
  private temporalPatterns: Map<string, TemporalPattern> = new Map();
  private environmentalContexts: Map<string, EnvironmentalContext> = new Map();
  private currentContext: ContextSnapshot | null = null;
  private contextHistory: ContextSnapshot[] = [];
  private storageKey = 'contextPatternData';

  constructor() {
    this.loadFromStorage();
    this.startContextTracking();
  }

  /**
   * Get current context with all available data
   */
  async getCurrentContext(): Promise<ContextSnapshot> {
    if (!this.currentContext) {
      await this.updateCurrentContext();
    }
    return this.currentContext!;
  }

  /**
   * Update current context with fresh data
   */
  async updateCurrentContext(): Promise<ContextSnapshot> {
    const context: ContextSnapshot = {
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      season: this.getCurrentSeason(),
      environment: await this.detectEnvironment(),
      deviceType: this.detectDeviceType(),
      screenSize: this.getScreenSize(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Add optional context data
    await this.enrichContextWithSensors(context);
    await this.enrichContextWithLocation(context);
    await this.enrichContextWithNetwork(context);
    await this.enrichContextWithBattery(context);

    this.currentContext = context;
    this.contextHistory.push(context);
    
    // Keep only recent history
    if (this.contextHistory.length > 1000) {
      this.contextHistory = this.contextHistory.slice(-1000);
    }

    this.saveToStorage();
    return context;
  }

  /**
   * Record a session start with context learning
   */
  async recordSessionStart(task: string, duration: number, context: ContextSnapshot) {
    // Learn from location patterns
    if (context.location) {
      await this.learnLocationPattern(context.location, task, context);
    }

    // Learn from temporal patterns
    await this.learnTemporalPattern(task, duration, context);

    // Learn from environmental patterns
    await this.learnEnvironmentalPattern(task, context);

    this.saveToStorage();
  }

  /**
   * Record productivity outcome for context learning
   */
  async recordProductivityOutcome(
    outcome: {
      task: string;
      plannedDuration: number;
      actualDuration: number;
      efficiency: number;
      sideQuests: number;
      completionQuality: number;
      distractionLevel: number;
    },
    context: ContextSnapshot
  ) {
    // Update location productivity
    if (context.location) {
      this.updateLocationProductivity(context.location, outcome.efficiency);
    }

    // Update temporal productivity
    this.updateTemporalProductivity(context, outcome);

    // Update environmental productivity
    this.updateEnvironmentalProductivity(context, outcome);

    this.saveToStorage();
  }

  /**
   * Get location-aware suggestions
   */
  getLocationSuggestions(currentLocation?: string): Array<{
    activity: string;
    confidence: number;
    reasoning: string;
    optimalDuration: number;
  }> {
    if (!currentLocation) return [];

    const locationContext = this.findLocationContext(currentLocation);
    if (!locationContext) return [];

    return locationContext.commonActivities.map(activity => ({
      activity,
      confidence: locationContext.productivityScore,
      reasoning: `${activity} is common at ${currentLocation} (${locationContext.visits} previous sessions)`,
      optimalDuration: this.getLocationOptimalDuration(locationContext, activity)
    }));
  }

  /**
   * Get time-aware suggestions
   */
  getTemporalSuggestions(context: ContextSnapshot): Array<{
    activity: string;
    confidence: number;
    reasoning: string;
    optimalDuration: number;
  }> {
    const timeSlot = this.getTimeSlot(context);
    const pattern = this.temporalPatterns.get(timeSlot);
    
    if (!pattern || pattern.commonTasks.length === 0) {
      return this.getDefaultTemporalSuggestions(context);
    }

    return pattern.commonTasks.map(task => ({
      activity: task,
      confidence: pattern.successRate,
      reasoning: `${task} has ${Math.round(pattern.successRate * 100)}% success rate during ${timeSlot}`,
      optimalDuration: pattern.optimalDuration
    }));
  }

  /**
   * Get environment-aware suggestions
   */
  getEnvironmentalSuggestions(context: ContextSnapshot): Array<{
    suggestion: string;
    type: 'optimization' | 'adaptation' | 'warning';
    confidence: number;
  }> {
    const envContext = this.environmentalContexts.get(context.environment);
    if (!envContext) return [];

    const suggestions = [];

    // Productivity optimizations
    if (envContext.productivity > 0.8) {
      suggestions.push({
        suggestion: `This environment boosts your productivity by ${Math.round((envContext.productivity - 0.5) * 200)}%`,
        type: 'optimization' as const,
        confidence: envContext.productivity
      });
    }

    // Focus quality insights
    if (envContext.focusQuality < 0.6) {
      suggestions.push({
        suggestion: `Consider noise-canceling or changing location - focus quality is typically ${Math.round(envContext.focusQuality * 100)}% here`,
        type: 'warning' as const,
        confidence: 1 - envContext.focusQuality
      });
    }

    // Adaptation suggestions
    envContext.adaptations.forEach(adaptation => {
      suggestions.push({
        suggestion: adaptation,
        type: 'adaptation' as const,
        confidence: 0.8
      });
    });

    return suggestions;
  }

  /**
   * Record quick capture for context learning
   */
  async recordQuickCapture(content: string) {
    const context = await this.getCurrentContext();
    
    // Learn what types of things get captured in different contexts
    await this.learnQuickCapturePattern(content, context);
    
    this.saveToStorage();
  }

  /**
   * Get contextual predictions
   */
  getPredictiveInsights(context: ContextSnapshot): {
    likelyActivities: string[];
    optimalDuration: number;
    productivityForecast: number;
    environmentalRecommendations: string[];
    timeOptimality: number;
  } {
    const timeSlot = this.getTimeSlot(context);
    const temporalPattern = this.temporalPatterns.get(timeSlot);
    const locationContext = context.location ? this.findLocationContext(context.location) : null;
    const environmentalContext = this.environmentalContexts.get(context.environment);

    return {
      likelyActivities: temporalPattern?.commonTasks || [],
      optimalDuration: temporalPattern?.optimalDuration || 25,
      productivityForecast: this.calculateProductivityForecast(context),
      environmentalRecommendations: environmentalContext?.adaptations || [],
      timeOptimality: temporalPattern?.averageProductivity || 0.7
    };
  }

  /**
   * Get recent patterns for AI context
   */
  getRecentPatterns(): {
    locations: string[];
    temporalTrends: string[];
    environmentalFactors: string[];
    behavioralShifts: string[];
  } {
    const recentHistory = this.contextHistory.slice(-50);
    
    return {
      locations: this.extractRecentLocations(recentHistory),
      temporalTrends: this.extractTemporalTrends(recentHistory),
      environmentalFactors: this.extractEnvironmentalFactors(recentHistory),
      behavioralShifts: this.extractBehavioralShifts(recentHistory)
    };
  }

  // Private implementation methods

  private async learnLocationPattern(location: string, task: string, context: ContextSnapshot) {
    let locationContext = this.locationContexts.get(location);
    
    if (!locationContext) {
      locationContext = {
        name: location,
        coordinates: context.coordinates,
        visits: 0,
        totalTimeSpent: 0,
        commonActivities: [],
        productivityScore: 0.7,
        timePatterns: {},
        environmentalFactors: {},
        lastVisit: 0
      };
    }

    locationContext.visits += 1;
    locationContext.commonActivities.push(task);
    locationContext.timePatterns[context.timeOfDay] = (locationContext.timePatterns[context.timeOfDay] || 0) + 1;
    locationContext.lastVisit = Date.now();

    // Keep only most common activities
    const activityFreq = new Map<string, number>();
    locationContext.commonActivities.forEach(activity => {
      activityFreq.set(activity, (activityFreq.get(activity) || 0) + 1);
    });

    locationContext.commonActivities = Array.from(activityFreq.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([activity]) => activity);

    this.locationContexts.set(location, locationContext);
  }

  private async learnTemporalPattern(task: string, duration: number, context: ContextSnapshot) {
    const timeSlot = this.getTimeSlot(context);
    
    let pattern = this.temporalPatterns.get(timeSlot);
    if (!pattern) {
      pattern = {
        timeSlot,
        activities: [],
        averageProductivity: 0.7,
        energyLevels: [],
        optimalDuration: 25,
        commonTasks: [],
        successRate: 0.8,
        distractionLevel: 0.3
      };
    }

    pattern.activities.push(task);
    pattern.commonTasks.push(task);
    if (context.energy) pattern.energyLevels.push(context.energy);

    // Keep most common tasks
    const taskFreq = new Map<string, number>();
    pattern.commonTasks.forEach(task => {
      taskFreq.set(task, (taskFreq.get(task) || 0) + 1);
    });

    pattern.commonTasks = Array.from(taskFreq.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([task]) => task);

    this.temporalPatterns.set(timeSlot, pattern);
  }

  private async learnEnvironmentalPattern(task: string, context: ContextSnapshot) {
    let envContext = this.environmentalContexts.get(context.environment);
    
    if (!envContext) {
      envContext = {
        environment: context.environment,
        factors: {},
        productivity: 0.7,
        focusQuality: 0.8,
        commonIssues: [],
        adaptations: []
      };
    }

    // Learn environmental factors
    if (context.noiseLevel) envContext.factors.noiseLevel = context.noiseLevel;
    if (context.lighting) envContext.factors.lighting = context.lighting;
    if (context.temperature) envContext.factors.temperature = context.temperature;

    this.environmentalContexts.set(context.environment, envContext);
  }

  private async learnQuickCapturePattern(content: string, context: ContextSnapshot) {
    // Categorize quick captures by context for learning
    const category = this.categorizeQuickCapture(content);
    
    // Update temporal patterns with quick capture types
    const timeSlot = this.getTimeSlot(context);
    const pattern = this.temporalPatterns.get(timeSlot);
    if (pattern) {
      pattern.activities.push(`quick_capture_${category}`);
    }
  }

  private categorizeQuickCapture(content: string): string {
    const lower = content.toLowerCase();
    if (lower.includes('todo') || lower.includes('task') || lower.includes('do ')) return 'task';
    if (lower.includes('idea') || lower.includes('thought')) return 'idea';
    if (lower.includes('note') || lower.includes('remember')) return 'note';
    if (lower.includes('grocery') || lower.includes('buy')) return 'shopping';
    return 'general';
  }

  private findLocationContext(location: string): LocationContext | null {
    // Exact match first
    const exact = this.locationContexts.get(location);
    if (exact) return exact;

    // Fuzzy match
    for (const [key, context] of this.locationContexts.entries()) {
      if (location.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(location.toLowerCase())) {
        return context;
      }
    }

    return null;
  }

  private getTimeSlot(context: ContextSnapshot): string {
    const dayType = context.dayOfWeek === 0 || context.dayOfWeek === 6 ? 'weekend' : 'weekday';
    const timeOfDay = this.getTimeOfDayLabel(context.timeOfDay);
    return `${dayType}-${timeOfDay}`;
  }

  private getTimeOfDayLabel(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  private getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  private detectDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private getScreenSize(): { width: number; height: number } {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  private async detectEnvironment(): Promise<'home' | 'office' | 'cafe' | 'travel' | 'other'> {
    // Simple heuristics - could be enhanced with more sophisticated detection
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    
    // Business hours on weekdays suggest office
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour <= 17) {
      return 'office';
    }
    
    // Early morning/evening suggests home
    if (hour <= 8 || hour >= 19) {
      return 'home';
    }
    
    return 'other';
  }

  private async enrichContextWithSensors(context: ContextSnapshot) {
    // Check for device sensors
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        context.batteryLevel = Math.round(battery.level * 100);
        context.isCharging = battery.charging;
      }
    } catch (error) {
      // Sensors not available
    }
  }

  private async enrichContextWithLocation(context: ContextSnapshot) {
    // Check for geolocation if permitted
    try {
      if ('geolocation' in navigator) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 300000 // 5 minutes
          });
        });
        
        context.coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        // Try to get location name from reverse geocoding
        context.location = await this.reverseGeocode(context.coordinates);
      }
    } catch (error) {
      // Geolocation not available or denied
    }
  }

  private async enrichContextWithNetwork(context: ContextSnapshot) {
    try {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        context.networkType = connection.effectiveType?.includes('wifi') ? 'wifi' : 'cellular';
      }
    } catch (error) {
      // Network info not available
    }
  }

  private async enrichContextWithBattery(context: ContextSnapshot) {
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        context.batteryLevel = Math.round(battery.level * 100);
        context.isCharging = battery.charging;
      }
    } catch (error) {
      // Battery API not available
    }
  }

  private async reverseGeocode(coords: { lat: number; lng: number }): Promise<string | undefined> {
    // Simplified reverse geocoding - in production, use a proper service
    try {
      // This is a placeholder - would integrate with a real reverse geocoding service
      return 'Current Location';
    } catch (error) {
      return undefined;
    }
  }

  private updateLocationProductivity(location: string, efficiency: number) {
    const locationContext = this.locationContexts.get(location);
    if (locationContext) {
      locationContext.productivityScore = (locationContext.productivityScore + efficiency) / 2;
    }
  }

  private updateTemporalProductivity(context: ContextSnapshot, outcome: any) {
    const timeSlot = this.getTimeSlot(context);
    const pattern = this.temporalPatterns.get(timeSlot);
    if (pattern) {
      pattern.averageProductivity = (pattern.averageProductivity + outcome.efficiency) / 2;
      pattern.successRate = (pattern.successRate + (outcome.efficiency >= 0.8 ? 1 : 0)) / 2;
      pattern.distractionLevel = (pattern.distractionLevel + (outcome.sideQuests / 10)) / 2;
    }
  }

  private updateEnvironmentalProductivity(context: ContextSnapshot, outcome: any) {
    const envContext = this.environmentalContexts.get(context.environment);
    if (envContext) {
      envContext.productivity = (envContext.productivity + outcome.efficiency) / 2;
      envContext.focusQuality = (envContext.focusQuality + outcome.completionQuality) / 2;
    }
  }

  private getLocationOptimalDuration(locationContext: LocationContext, activity: string): number {
    // Analyze historical durations for this activity at this location
    return 25; // Placeholder
  }

  private getDefaultTemporalSuggestions(context: ContextSnapshot) {
    const hour = context.timeOfDay;
    
    if (hour >= 9 && hour <= 11) {
      return [{ activity: 'Deep work session', confidence: 0.8, reasoning: 'Morning peak focus time', optimalDuration: 45 }];
    } else if (hour >= 14 && hour <= 16) {
      return [{ activity: 'Creative tasks', confidence: 0.7, reasoning: 'Post-lunch creativity boost', optimalDuration: 30 }];
    } else {
      return [{ activity: 'Quick tasks', confidence: 0.6, reasoning: 'Off-peak hours', optimalDuration: 15 }];
    }
  }

  private calculateProductivityForecast(context: ContextSnapshot): number {
    let forecast = 0.7; // Base forecast
    
    // Temporal factors
    const timeSlot = this.getTimeSlot(context);
    const temporalPattern = this.temporalPatterns.get(timeSlot);
    if (temporalPattern) {
      forecast = forecast * 0.4 + temporalPattern.averageProductivity * 0.6;
    }

    // Environmental factors
    const envContext = this.environmentalContexts.get(context.environment);
    if (envContext) {
      forecast = forecast * 0.7 + envContext.productivity * 0.3;
    }

    // Location factors
    if (context.location) {
      const locationContext = this.findLocationContext(context.location);
      if (locationContext) {
        forecast = forecast * 0.8 + locationContext.productivityScore * 0.2;
      }
    }

    return Math.min(1, Math.max(0, forecast));
  }

  private extractRecentLocations(history: ContextSnapshot[]): string[] {
    const locations = history
      .filter(h => h.location)
      .map(h => h.location!)
      .slice(-10);
    
    return [...new Set(locations)];
  }

  private extractTemporalTrends(history: ContextSnapshot[]): string[] {
    const timeSlots = history.map(h => this.getTimeSlot(h));
    const frequency = new Map<string, number>();
    
    timeSlots.forEach(slot => {
      frequency.set(slot, (frequency.get(slot) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([slot]) => slot);
  }

  private extractEnvironmentalFactors(history: ContextSnapshot[]): string[] {
    const factors = [];
    
    const environments = history.map(h => h.environment);
    const mostCommon = [...new Set(environments)][0];
    if (mostCommon) factors.push(`Primarily working in ${mostCommon} environment`);
    
    const devices = history.map(h => h.deviceType);
    const deviceUsage = [...new Set(devices)];
    if (deviceUsage.length > 1) factors.push(`Multi-device usage: ${deviceUsage.join(', ')}`);
    
    return factors;
  }

  private extractBehavioralShifts(history: ContextSnapshot[]): string[] {
    // Analyze changes in patterns over time
    const shifts = [];
    
    const recent = history.slice(-20);
    const older = history.slice(-40, -20);
    
    if (recent.length > 10 && older.length > 10) {
      const recentEnvironments = recent.map(h => h.environment);
      const olderEnvironments = older.map(h => h.environment);
      
      const recentPrimary = this.getMostFrequent(recentEnvironments);
      const olderPrimary = this.getMostFrequent(olderEnvironments);
      
      if (recentPrimary !== olderPrimary) {
        shifts.push(`Environment shift: ${olderPrimary} → ${recentPrimary}`);
      }
    }
    
    return shifts;
  }

  private getMostFrequent<T>(items: T[]): T | null {
    const frequency = new Map<T, number>();
    items.forEach(item => {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    });
    
    const sorted = Array.from(frequency.entries()).sort(([,a], [,b]) => b - a);
    return sorted[0]?.[0] || null;
  }

  private startContextTracking() {
    // Update context periodically
    setInterval(() => {
      this.updateCurrentContext();
    }, 60000); // Every minute

    // Update context on significant events
    window.addEventListener('focus', () => this.updateCurrentContext());
    window.addEventListener('blur', () => this.updateCurrentContext());
    window.addEventListener('resize', () => this.updateCurrentContext());
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Restore maps from stored data
        if (data.locationContexts) {
          this.locationContexts = new Map(data.locationContexts);
        }
        if (data.temporalPatterns) {
          this.temporalPatterns = new Map(data.temporalPatterns);
        }
        if (data.environmentalContexts) {
          this.environmentalContexts = new Map(data.environmentalContexts);
        }
        if (data.contextHistory) {
          this.contextHistory = data.contextHistory;
        }
      }
    } catch (error) {
      console.warn('Failed to load context pattern data:', error);
    }
  }

  private saveToStorage() {
    try {
      const data = {
        locationContexts: Array.from(this.locationContexts.entries()),
        temporalPatterns: Array.from(this.temporalPatterns.entries()),
        environmentalContexts: Array.from(this.environmentalContexts.entries()),
        contextHistory: this.contextHistory.slice(-500), // Keep recent history
        lastSaved: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save context pattern data:', error);
    }
  }
}

export const contextPatternService = new ContextPatternService();
