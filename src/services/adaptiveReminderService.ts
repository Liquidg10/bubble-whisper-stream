// Adaptive Reminder Service 2.0
// Learns from user behavior and adjusts reminder scheduling intelligently

import { Reminder, Snooze, PatternHint, ReminderExplanation } from '@/types/bubble';
import { storageService } from './storage';
import { explainabilityService } from './explainabilityService';

interface ReminderRule {
  id: string;
  condition: (context: ReminderContext) => boolean;
  action: (reminder: Reminder, context: ReminderContext) => ReminderAdjustment;
  priority: number;
  description: string;
}

interface ReminderContext {
  snoozes: Snooze[];
  patterns: PatternHint[];
  timeOfDay: string;
  dayOfWeek: number;
  quietHours?: { start: string; end: string };
  userPreferences: Record<string, any>;
}

interface ReminderAdjustment {
  newScheduledAt?: number;
  levelCap?: number;
  skipThis?: boolean;
  explanation: ReminderExplanation;
}

class AdaptiveReminderService {
  private db: IDBDatabase | null = null;
  private rules: ReminderRule[] = [];

  constructor() {
    this.initializeRules();
  }

  async initialize() {
    if (!this.db) {
      await storageService.initialize();
      this.db = (storageService as any).db;
    }
  }

  private initializeRules() {
    this.rules = [
      // Rule 1: Multiple "Overwhelmed" snoozes in 48h -> slow down
      {
        id: 'overwhelmed_pattern',
        condition: (context) => {
          const last48h = Date.now() - (48 * 60 * 60 * 1000);
          const overwhelmedSnoozes = context.snoozes.filter(s => 
            s.reason === 'Overwhelmed' && s.at > last48h
          );
          return overwhelmedSnoozes.length >= 2;
        },
        action: (reminder, context) => {
          const newTime = reminder.scheduledAt + (2 * 60 * 60 * 1000); // Delay 2 hours
          return {
            newScheduledAt: newTime,
            levelCap: 2, // Don't go beyond level 2
            explanation: explainabilityService.generateReminderExplanation('slow', context)
          };
        },
        priority: 1,
        description: 'Slow down reminders when user feels overwhelmed'
      },

      // Rule 2: "WithPepper" snoozes -> defer to evening
      {
        id: 'with_pepper_defer',
        condition: (context) => {
          const lastSnooze = context.snoozes[0]; // Most recent
          return lastSnooze?.reason === 'WithPepper';
        },
        action: (reminder, context) => {
          const today = new Date();
          today.setHours(18, 0, 0, 0); // 6 PM today
          const eveningTime = today.getTime();
          
          return {
            newScheduledAt: eveningTime,
            explanation: explainabilityService.generateReminderExplanation('defer', context)
          };
        },
        priority: 2,
        description: 'Defer reminders to evening when with Pepper'
      },

      // Rule 3: Quiet hours -> skip or minimal
      {
        id: 'quiet_hours_respect',
        condition: (context) => {
          if (!context.quietHours) return false;
          return this.isQuietHours(context.quietHours);
        },
        action: (reminder, context) => ({
          levelCap: 1, // Only gentle reminders during quiet hours
          explanation: explainabilityService.generateReminderExplanation('skip', context)
        }),
        priority: 1,
        description: 'Respect quiet hours with minimal intrusion'
      },

      // Rule 4: High "Busy" frequency -> adjust timing
      {
        id: 'busy_pattern_adjust',
        condition: (context) => {
          const last7days = Date.now() - (7 * 24 * 60 * 60 * 1000);
          const busySnoozes = context.snoozes.filter(s => 
            s.reason === 'Busy' && s.at > last7days
          );
          return busySnoozes.length >= 3;
        },
        action: (reminder, context) => {
          // Shift to less busy times
          const hour = new Date(reminder.scheduledAt).getHours();
          let newHour = hour;
          
          // If during typical work hours, shift to evening
          if (hour >= 9 && hour <= 17) {
            newHour = 19; // 7 PM
          }
          
          const newDate = new Date(reminder.scheduledAt);
          newDate.setHours(newHour, 0, 0, 0);
          
          return {
            newScheduledAt: newDate.getTime(),
            explanation: explainabilityService.generateReminderExplanation('slow', context)
          };
        },
        priority: 3,
        description: 'Adjust timing based on busy patterns'
      },

      // Rule 5: Long ack latency in mornings -> shift later
      {
        id: 'morning_latency',
        condition: (context) => {
          const morningPattern = context.patterns.find(p => p.key === 'morning_slow_response');
          return morningPattern ? morningPattern.confidence > 0.6 : false;
        },
        action: (reminder, context) => {
          const hour = new Date(reminder.scheduledAt).getHours();
          if (hour < 10) { // Early morning
            const newDate = new Date(reminder.scheduledAt);
            newDate.setHours(hour + 2, 0, 0, 0); // Delay by 2 hours
            
            return {
              newScheduledAt: newDate.getTime(),
              explanation: explainabilityService.generateReminderExplanation('defer', context)
            };
          }
          
          return {
            explanation: explainabilityService.generateReminderExplanation('defer', context)
          };
        },
        priority: 4,
        description: 'Adjust for slow morning response patterns'
      }
    ];
  }

  // Apply adaptive rules to a reminder
  async applyAdaptiveRules(reminder: Reminder): Promise<ReminderAdjustment | null> {
    await this.initialize();
    
    const context = await this.buildContext(reminder);
    
    // Find applicable rules, sorted by priority
    const applicableRules = this.rules
      .filter(rule => rule.condition(context))
      .sort((a, b) => a.priority - b.priority);

    if (applicableRules.length === 0) {
      return null;
    }

    // Apply the highest priority rule
    const rule = applicableRules[0];
    const adjustment = rule.action(reminder, context);
    
    // Store pattern hints for future learning
    await this.updatePatternHints(rule.id, context);
    
    return adjustment;
  }

  // Get explanation for a reminder adjustment
  getExplanation(reminder: Reminder, patterns: PatternHint[], settings: any): string {
    // Simple explanation for now - could be enhanced
    const recentSnoozes = reminder.snoozes?.slice(0, 2) || [];
    if (recentSnoozes.some(s => s.reason === 'Overwhelmed')) {
      return "Adjusting timing because you've felt overwhelmed recently";
    }
    if (recentSnoozes.some(s => s.reason === 'WithPepper')) {
      return "Moved to evening since you mentioned being with Pepper";
    }
    return "Adjusted based on your recent patterns";
  }

  // Build context for rule evaluation
  private async buildContext(reminder: Reminder): Promise<ReminderContext> {
    const snoozes = reminder.snoozes || [];
    const patterns = await this.getPatternHints();
    const now = new Date();
    
    return {
      snoozes: snoozes.sort((a, b) => b.at - a.at), // Most recent first
      patterns,
      timeOfDay: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      dayOfWeek: now.getDay(),
      quietHours: await this.getQuietHours(),
      userPreferences: await this.getUserPreferences()
    };
  }

  // Update pattern hints based on user behavior
  private async updatePatternHints(ruleId: string, context: ReminderContext) {
    const transaction = this.db!.transaction(['pattern_hints'], 'readwrite');
    const store = transaction.objectStore('pattern_hints');
    
    const hint: PatternHint = {
      id: crypto.randomUUID(),
      key: ruleId,
      value: 'triggered',
      confidence: 0.8,
      lastUpdated: Date.now()
    };
    
    await this.promisifyRequest(store.put(hint));
  }

  // Get stored pattern hints
  private async getPatternHints(): Promise<PatternHint[]> {
    const transaction = this.db!.transaction(['pattern_hints'], 'readonly');
    const store = transaction.objectStore('pattern_hints');
    const result = await this.promisifyRequest(store.getAll());
    return result || [];
  }

  // Get user's quiet hours setting
  private async getQuietHours(): Promise<{ start: string; end: string } | undefined> {
    const settings = await storageService.getSettings();
    return settings.quietHours;
  }

  // Get user preferences
  private async getUserPreferences(): Promise<Record<string, any>> {
    const settings = await storageService.getSettings();
    return {
      reducedMotion: settings.reducedMotion,
      bubbleDensity: settings.bubbleDensity,
      ttsEnabled: settings.ttsEnabled
    };
  }

  // Check if current time is within quiet hours
  private isQuietHours(quietHours: { start: string; end: string }): boolean {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const { start, end } = quietHours;
    
    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }
    
    // Handle same-day quiet hours (e.g., 13:00 to 15:00)
    return currentTime >= start && currentTime <= end;
  }

  // Decay old pattern hints to prevent outdated behavior
  async decayPatternHints() {
    const transaction = this.db!.transaction(['pattern_hints'], 'readwrite');
    const store = transaction.objectStore('pattern_hints');
    const allHints = await this.promisifyRequest(store.getAll());
    
    const now = Date.now();
    const decayThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    for (const hint of allHints) {
      if (now - hint.lastUpdated > decayThreshold) {
        hint.confidence *= 0.9; // Reduce confidence
        
        if (hint.confidence < 0.1) {
          await this.promisifyRequest(store.delete(hint.id));
        } else {
          await this.promisifyRequest(store.put(hint));
        }
      }
    }
  }

  // Generate fatigue score based on recent activity
  calculateFatigueScore(snoozes: Snooze[]): number {
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const recentSnoozes = snoozes.filter(s => s.at > last24h);
    
    // More snoozes = higher fatigue
    return Math.min(1.0, recentSnoozes.length / 5);
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const adaptiveReminderService = new AdaptiveReminderService();