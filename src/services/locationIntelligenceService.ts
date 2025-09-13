/**
 * Advanced Location Intelligence Service
 * ML-powered location pattern analysis and predictive notifications
 */

import { locationService, LocationContext, PlaceResult } from './locationService';
import { conversationService } from './conversationService';

export interface LocationPattern {
  id: string;
  placeId?: string;
  placeName: string;
  coordinates: { lat: number; lng: number };
  visitFrequency: number;
  averageStayDuration: number;
  preferredTimeOfDay: string[];
  weeklyPattern: { day: string; frequency: number }[];
  associatedActivities: string[];
  lastVisit: string;
  confidence: number;
}

export interface LocationPrediction {
  location: LocationPattern;
  probability: number;
  suggestedTime: string;
  reasoning: string;
  actionSuggestions: string[];
}

export interface LocationReminder {
  id: string;
  title: string;
  description: string;
  targetLocation: { lat: number; lng: number; name: string };
  triggerRadius: number;
  isActive: boolean;
  createdAt: string;
  triggeredCount: number;
  lastTriggered?: string;
}

class LocationIntelligenceService {
  private locationHistory: LocationContext[] = [];
  private patterns: LocationPattern[] = [];
  private reminders: LocationReminder[] = [];
  private isTracking = false;

  constructor() {
    this.loadStoredData();
    // Don't auto-start tracking - wait for explicit enablement
  }

  private loadStoredData() {
    try {
      const stored = localStorage.getItem('locationIntelligence');
      if (stored) {
        const data = JSON.parse(stored);
        this.locationHistory = data.locationHistory || [];
        this.patterns = data.patterns || [];
        this.reminders = data.reminders || [];
      }
    } catch (error) {
      console.warn('Failed to load location intelligence data:', error);
    }
  }

  private saveData() {
    try {
      const data = {
        locationHistory: this.locationHistory.slice(-1000), // Keep last 1000 entries
        patterns: this.patterns,
        reminders: this.reminders
      };
      localStorage.setItem('locationIntelligence', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save location intelligence data:', error);
    }
  }

  private initializeTracking() {
    if (this.isTracking) return;

    locationService.on('locationUpdate', (context) => {
      this.recordLocationVisit(context);
    });

    locationService.on('placeDetected', (place) => {
      this.analyzeLocationPattern(place);
    });

    this.isTracking = true;
  }

  public startTracking() {
    if (!this.isTracking) {
      this.initializeTracking();
      locationService.startLocationTracking();
    }
  }

  public stopTracking() {
    if (this.isTracking) {
      locationService.stopLocationTracking();
      this.isTracking = false;
    }
  }

  public async clearData() {
    this.locationHistory = [];
    this.patterns = [];
    this.reminders = [];
    this.saveData();
  }

  private recordLocationVisit(context: LocationContext) {
    // Add to history with deduplication
    const lastLocation = this.locationHistory[this.locationHistory.length - 1];
    
    if (!lastLocation || 
        this.calculateDistance(lastLocation.coordinates, context.coordinates) > 50 ||
        context.timestamp - lastLocation.timestamp > 300000) { // 5 minutes
      
      this.locationHistory.push(context);
      this.saveData();
    }
  }

  private calculateDistance(pos1: { lat: number; lng: number }, pos2: { lat: number; lng: number }): number {
    const R = 6371e3;
    const φ1 = (pos1.lat * Math.PI) / 180;
    const φ2 = (pos2.lat * Math.PI) / 180;
    const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private async analyzeLocationPattern(place: PlaceResult) {
    const existingPattern = this.patterns.find(p => p.placeId === place.place_id);
    
    if (existingPattern) {
      // Update existing pattern
      existingPattern.visitFrequency += 1;
      existingPattern.lastVisit = new Date().toISOString();
      this.updatePatternMetrics(existingPattern);
    } else {
      // Create new pattern
      const newPattern: LocationPattern = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        placeId: place.place_id,
        placeName: place.name,
        coordinates: place.geometry.location,
        visitFrequency: 1,
        averageStayDuration: 0,
        preferredTimeOfDay: [this.getCurrentTimeSlot()],
        weeklyPattern: this.initializeWeeklyPattern(),
        associatedActivities: await this.detectActivitiesForPlace(place),
        lastVisit: new Date().toISOString(),
        confidence: 0.1
      };
      
      this.patterns.push(newPattern);
    }

    this.saveData();
  }

  private updatePatternMetrics(pattern: LocationPattern) {
    const currentTime = this.getCurrentTimeSlot();
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Update time preferences
    if (!pattern.preferredTimeOfDay.includes(currentTime)) {
      pattern.preferredTimeOfDay.push(currentTime);
    }

    // Update weekly pattern
    const dayPattern = pattern.weeklyPattern.find(w => w.day === currentDay);
    if (dayPattern) {
      dayPattern.frequency += 1;
    }

    // Update confidence based on frequency
    pattern.confidence = Math.min(pattern.visitFrequency / 10, 1.0);
  }

  private getCurrentTimeSlot(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'early-morning';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'night';
  }

  private initializeWeeklyPattern() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days.map(day => ({ day, frequency: 0 }));
  }

  private async detectActivitiesForPlace(place: PlaceResult): Promise<string[]> {
    const activities: string[] = [];

    // Analyze place types
    if (place.types.includes('grocery_or_supermarket')) {
      activities.push('grocery-shopping');
    }
    if (place.types.includes('gym')) {
      activities.push('exercise');
    }
    if (place.types.includes('restaurant')) {
      activities.push('dining');
    }
    if (place.types.includes('gas_station')) {
      activities.push('refueling');
    }
    if (place.types.includes('bank')) {
      activities.push('banking');
    }

    return activities;
  }

  async generateLocationPredictions(): Promise<LocationPrediction[]> {
    const predictions: LocationPrediction[] = [];
    const currentTime = this.getCurrentTimeSlot();
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    for (const pattern of this.patterns) {
      if (pattern.confidence < 0.3 || pattern.visitFrequency < 3) continue;

      // Calculate probability based on time and day patterns
      const timeMatch = pattern.preferredTimeOfDay.includes(currentTime);
      const dayPattern = pattern.weeklyPattern.find(w => w.day === currentDay);
      const dayMatch = dayPattern && dayPattern.frequency > 0;

      let probability = pattern.confidence * 0.4;
      if (timeMatch) probability += 0.3;
      if (dayMatch) probability += 0.3;

      if (probability > 0.5) {
        const prediction: LocationPrediction = {
          location: pattern,
          probability,
          suggestedTime: this.calculateOptimalTime(pattern),
          reasoning: this.generateReasoning(pattern, timeMatch, dayMatch),
          actionSuggestions: this.generateActionSuggestions(pattern)
        };
        
        predictions.push(prediction);
      }
    }

    return predictions.sort((a, b) => b.probability - a.probability).slice(0, 5);
  }

  private calculateOptimalTime(pattern: LocationPattern): string {
    const mostFrequentTime = pattern.preferredTimeOfDay.reduce((a, b) => 
      pattern.preferredTimeOfDay.filter(t => t === a).length >= 
      pattern.preferredTimeOfDay.filter(t => t === b).length ? a : b
    );
    
    const timeMap = {
      'early-morning': '6:00 AM',
      'morning': '10:00 AM',
      'afternoon': '2:00 PM', 
      'evening': '6:00 PM',
      'night': '9:00 PM'
    };
    
    return timeMap[mostFrequentTime] || '12:00 PM';
  }

  private generateReasoning(pattern: LocationPattern, timeMatch: boolean, dayMatch: boolean): string {
    const reasons = [];
    
    reasons.push(`You've visited ${pattern.placeName} ${pattern.visitFrequency} times`);
    
    if (timeMatch) {
      reasons.push(`usually at this time of day`);
    }
    
    if (dayMatch) {
      reasons.push(`often on ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}s`);
    }

    return reasons.join(', ') + '.';
  }

  private generateActionSuggestions(pattern: LocationPattern): string[] {
    const suggestions: string[] = [];

    if (pattern.associatedActivities.includes('grocery-shopping')) {
      suggestions.push('Check your grocery list');
      suggestions.push('Review weekly meal plans');
    }
    
    if (pattern.associatedActivities.includes('exercise')) {
      suggestions.push('Prepare workout gear');
      suggestions.push('Set fitness goals for today');
    }
    
    if (pattern.associatedActivities.includes('dining')) {
      suggestions.push('Check restaurant hours');
      suggestions.push('Consider making a reservation');
    }

    if (suggestions.length === 0) {
      suggestions.push('Plan your visit');
      suggestions.push('Check traffic conditions');
    }

    return suggestions;
  }

  async createLocationReminder(
    title: string,
    description: string,
    targetLocation: { lat: number; lng: number; name: string },
    triggerRadius: number = 100
  ): Promise<LocationReminder> {
    const reminder: LocationReminder = {
      id: `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description,
      targetLocation,
      triggerRadius,
      isActive: true,
      createdAt: new Date().toISOString(),
      triggeredCount: 0
    };

    this.reminders.push(reminder);
    this.saveData();
    return reminder;
  }

  checkLocationReminders(currentLocation: { lat: number; lng: number }): LocationReminder[] {
    const triggeredReminders: LocationReminder[] = [];

    for (const reminder of this.reminders) {
      if (!reminder.isActive) continue;

      const distance = this.calculateDistance(currentLocation, reminder.targetLocation);
      
      if (distance <= reminder.triggerRadius) {
        // Check if not triggered too recently (within 1 hour)
        const lastTriggered = reminder.lastTriggered ? new Date(reminder.lastTriggered) : null;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        if (!lastTriggered || lastTriggered < oneHourAgo) {
          reminder.lastTriggered = new Date().toISOString();
          reminder.triggeredCount += 1;
          triggeredReminders.push(reminder);
        }
      }
    }

    if (triggeredReminders.length > 0) {
      this.saveData();
    }

    return triggeredReminders;
  }

  getLocationPatterns(): LocationPattern[] {
    return this.patterns.sort((a, b) => b.confidence - a.confidence);
  }

  getLocationReminders(): LocationReminder[] {
    return this.reminders.filter(r => r.isActive);
  }

  async getLocationBasedToolSuggestions(): Promise<string[]> {
    const currentLocation = locationService.getLocationContext();
    if (!currentLocation?.place) return [];

    const suggestions: string[] = [];
    const placeTypes = currentLocation.place.types;

    if (placeTypes.includes('grocery_or_supermarket') || locationService.isAtStore()) {
      suggestions.push('Open grocery helper');
      suggestions.push('Check shopping lists');
    }

    if (locationService.isAtHome()) {
      suggestions.push('Review clean house tasks');
      suggestions.push('Start focus timer');
      suggestions.push('Check reminders');
    }

    if (locationService.isAtWork()) {
      suggestions.push('Start pomodoro timer');
      suggestions.push('Review daily goals');
      suggestions.push('Check calendar');
    }

    if (placeTypes.includes('bank') || placeTypes.includes('atm')) {
      suggestions.push('Review budget');
      suggestions.push('Check account balances');
    }

    return suggestions;
  }
}

export const locationIntelligenceService = new LocationIntelligenceService();