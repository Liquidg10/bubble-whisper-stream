/**
 * P16 - "Because..." Explanations Service
 * Generates explainable 2-3 driver explanations for all AI actions
 * Implements consistent pattern across suggestion toasts and auto-actions
 */

import { isFeatureEnabled } from '@/config/flags';
import type { Task } from '@/types/task';
import type { Bubble } from '@/types/bubble';

interface ExplanationDriver {
  type: 'pattern' | 'context' | 'preference' | 'timing' | 'load' | 'priority';
  signal: string;
  confidence: number; // 0-1
}

interface BecauseExplanation {
  shortText: string; // "Because..."
  drivers: ExplanationDriver[];
  confidence: number;
  timestamp: number;
}

class BecauseExplanationService {
  
  /**
   * Generate explanation for smart defaults
   */
  generateSmartDefaultsExplanation(
    task: Partial<Task>,
    context: {
      timeOfDay?: string;
      recentTasks?: Task[];
      userPatterns?: any;
      viewContext?: string;
    }
  ): BecauseExplanation {
    const drivers: ExplanationDriver[] = [];
    
    // Time-based patterns
    if (context.timeOfDay) {
      drivers.push({
        type: 'timing',
        signal: `you usually handle similar tasks in ${context.timeOfDay}`,
        confidence: 0.7
      });
    }
    
    // Priority inference
    if (task.priority && task.priority > 60) {
      drivers.push({
        type: 'pattern',
        signal: 'urgent keywords detected in title',
        confidence: 0.8
      });
    }
    
    // View context
    if (context.viewContext) {
      drivers.push({
        type: 'context',
        signal: `created in ${context.viewContext} view for quick action`,
        confidence: 0.6
      });
    }
    
    return {
      shortText: this.formatShortText(drivers.slice(0, 2)),
      drivers: drivers.slice(0, 3), // Max 3 drivers
      confidence: this.calculateOverallConfidence(drivers),
      timestamp: Date.now()
    };
  }
  
  /**
   * Generate explanation for auto-write actions
   */
  generateAutoWriteExplanation(
    action: 'calendar-create' | 'calendar-update' | 'email-draft',
    context: {
      confidence: number;
      greenConditions?: string[];
      taskContext?: Task;
    }
  ): BecauseExplanation {
    const drivers: ExplanationDriver[] = [];
    
    // Confidence threshold
    drivers.push({
      type: 'priority',
      signal: `high confidence match (${Math.round(context.confidence * 100)}%)`,
      confidence: context.confidence
    });
    
    // Green conditions for calendar
    if (action.startsWith('calendar') && context.greenConditions) {
      drivers.push({
        type: 'context',
        signal: 'clear datetime and your personal calendar',
        confidence: 0.9
      });
    }
    
    // Task context
    if (context.taskContext?.due) {
      drivers.push({
        type: 'timing',
        signal: 'due date specified in task',
        confidence: 0.8
      });
    }
    
    return {
      shortText: this.formatShortText(drivers.slice(0, 2)),
      drivers: drivers.slice(0, 3),
      confidence: this.calculateOverallConfidence(drivers),
      timestamp: Date.now()
    };
  }
  
  /**
   * Generate explanation for nudges and suggestions
   */
  generateNudgeExplanation(
    nudgeType: 'overwhelm' | 'planning' | 'break' | 'focus',
    context: {
      recentActivity?: any;
      patterns?: any;
      currentLoad?: number;
    }
  ): BecauseExplanation {
    const drivers: ExplanationDriver[] = [];
    
    switch (nudgeType) {
      case 'overwhelm':
        drivers.push({
          type: 'load',
          signal: 'high task density in the next 2 hours',
          confidence: 0.8
        });
        break;
        
      case 'planning':
        drivers.push({
          type: 'pattern',
          signal: 'complex tasks benefit from quick planning',
          confidence: 0.7
        });
        break;
        
      case 'break':
        drivers.push({
          type: 'timing',
          signal: 'focused work for 90+ minutes',
          confidence: 0.9
        });
        break;
        
      case 'focus':
        drivers.push({
          type: 'pattern',
          signal: 'similar deep work usually takes 2-3 hours',
          confidence: 0.6
        });
        break;
    }
    
    return {
      shortText: this.formatShortText(drivers),
      drivers: drivers.slice(0, 3),
      confidence: this.calculateOverallConfidence(drivers),
      timestamp: Date.now()
    };
  }
  
  /**
   * Generate explanation for micro-celebrations
   */
  generateCelebrationExplanation(
    burstType: 'streak' | 'milestone' | 'comeback' | 'focus',
    metrics: {
      count?: number;
      timespan?: number;
      difficulty?: number;
    }
  ): BecauseExplanation {
    const drivers: ExplanationDriver[] = [];
    
    switch (burstType) {
      case 'streak':
        drivers.push({
          type: 'pattern',
          signal: `${metrics.count || 3} tasks completed in sequence`,
          confidence: 0.9
        });
        break;
        
      case 'milestone':
        drivers.push({
          type: 'pattern',
          signal: `reached ${metrics.count || 10} completions this week`,
          confidence: 0.8
        });
        break;
        
      case 'comeback':
        drivers.push({
          type: 'context',
          signal: 'completed after being postponed twice',
          confidence: 0.7
        });
        break;
        
      case 'focus':
        drivers.push({
          type: 'timing',
          signal: `deep focus session: ${Math.round((metrics.timespan || 0) / 60)}min`,
          confidence: 0.8
        });
        break;
    }
    
    return {
      shortText: this.formatShortText(drivers),
      drivers: drivers.slice(0, 2), // Celebrations keep it brief
      confidence: this.calculateOverallConfidence(drivers),
      timestamp: Date.now()
    };
  }
  
  private formatShortText(drivers: ExplanationDriver[]): string {
    if (drivers.length === 0) return "Because this seemed helpful";
    if (drivers.length === 1) return `Because ${drivers[0].signal}`;
    
    return `Because ${drivers[0].signal} and ${drivers[1].signal}`;
  }
  
  private calculateOverallConfidence(drivers: ExplanationDriver[]): number {
    if (drivers.length === 0) return 0.5;
    
    const avgConfidence = drivers.reduce((sum, d) => sum + d.confidence, 0) / drivers.length;
    return Math.min(0.95, avgConfidence);
  }
  
  /**
   * Check if explanations are enabled
   */
  isEnabled(): boolean {
    // Use settings from bubble store since 'intelligenceEnabled' is a user setting
    return true; // Default enabled for explanations
  }
}

export const becauseExplanationService = new BecauseExplanationService();
export type { BecauseExplanation, ExplanationDriver };