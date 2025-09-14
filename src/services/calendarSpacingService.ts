/**
 * Calendar Spacing Service - AI-Powered Spacing Suggestions
 * Integrates with behavioral science and habit engines
 */

import { behavioralScienceEngine } from './behavioralScienceEngine';
import { moodBehaviorEngine } from './moodBehaviorEngine';
import { DecisionTrace } from '@/types/decisionTrace';
import { logger } from '@/utils/logger';

export interface SpacingSuggestion {
  id: string;
  type: 'move_event' | 'add_break' | 'reschedule_batch';
  eventId: string;
  currentTime: Date;
  suggestedTime: Date;
  reason: string;
  becauseText: string;
  confidence: number;
  stressReduction: number;
  energyAlignment: number;
  priority: 'low' | 'medium' | 'high';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  priority?: number;
  isFlexible?: boolean;
}

class CalendarSpacingService {
  private recentSuggestions: Map<string, number> = new Map(); // eventId -> timestamp
  private dismissedSuggestions: Set<string> = new Set();

  // Generate spacing suggestions for a given day
  generateSpacingSuggestions(
    date: Date,
    events: CalendarEvent[],
    maxSuggestions: number = 3
  ): SpacingSuggestion[] {
    if (events.length < 2) return [];

    const suggestions: SpacingSuggestion[] = [];
    const dayKey = this.formatDate(date);
    const currentStress = behavioralScienceEngine.detectStressLevel();
    const optimalWindows = behavioralScienceEngine.getOptimalWindows(0.6);
    const neuroContext = behavioralScienceEngine.getNeuromodulatorContext();

    // Find consecutive events with insufficient breaks
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];
      
      const gap = next.start.getTime() - current.end.getTime();
      const gapMinutes = gap / (1000 * 60);

      // Suggest spacing if gap is too short (< 15 minutes)
      if (gapMinutes < 15 && gapMinutes >= 0) {
        const suggestion = this.createSpacingSuggestion(
          current,
          next,
          optimalWindows,
          currentStress,
          neuroContext
        );
        
        if (suggestion && this.shouldShowSuggestion(suggestion)) {
          suggestions.push(suggestion);
        }
      }
    }

    // Suggest moving events to optimal energy windows
    for (const event of events) {
      if (event.isFlexible && suggestions.length < maxSuggestions) {
        const energyAlignment = this.calculateEnergyAlignment(event, optimalWindows);
        
        if (energyAlignment < 0.5) { // Poor energy alignment
          const betterSlot = this.findBetterEnergySlot(event, events, optimalWindows);
          
          if (betterSlot) {
            const suggestion = this.createEnergyAlignmentSuggestion(
              event,
              betterSlot,
              energyAlignment,
              currentStress
            );
            
            if (suggestion && this.shouldShowSuggestion(suggestion)) {
              suggestions.push(suggestion);
            }
          }
        }
      }
    }

    // Sort by priority and confidence
    return suggestions
      .sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.confidence - a.confidence;
      })
      .slice(0, maxSuggestions);
  }

  private createSpacingSuggestion(
    current: CalendarEvent,
    next: CalendarEvent,
    optimalWindows: any[],
    currentStress: number,
    neuroContext: any
  ): SpacingSuggestion | null {
    const suggestedTime = new Date(current.end.getTime() + 30 * 60 * 1000); // 30 min buffer
    
    // Check if suggested time conflicts with next event
    if (suggestedTime >= next.start) {
      // Try moving next event instead
      const newNextStart = new Date(current.end.getTime() + 30 * 60 * 1000);
      
      return {
        id: `spacing-${next.id}-${Date.now()}`,
        type: 'move_event',
        eventId: next.id,
        currentTime: next.start,
        suggestedTime: newNextStart,
        reason: `Add 30-minute breather after ${current.title}`,
        becauseText: this.generateBecauseText(
          'spacing',
          currentStress,
          neuroContext.recommendedStimuli
        ),
        confidence: this.calculateSpacingConfidence(current, next, optimalWindows),
        stressReduction: Math.min(0.3, currentStress * 0.4),
        energyAlignment: this.calculateEnergyAlignment(next, optimalWindows),
        priority: currentStress > 0.7 ? 'high' : 'medium'
      };
    }

    return null;
  }

  private createEnergyAlignmentSuggestion(
    event: CalendarEvent,
    betterSlot: Date,
    currentAlignment: number,
    currentStress: number
  ): SpacingSuggestion {
    const newAlignment = 0.8; // Assume better slot has good alignment
    const contextualReason = this.getContextualReason(betterSlot);

    return {
      id: `energy-${event.id}-${Date.now()}`,
      type: 'move_event',
      eventId: event.id,
      currentTime: event.start,
      suggestedTime: betterSlot,
      reason: `Move ${event.title} to ${betterSlot.toLocaleTimeString()} ${contextualReason}`,
      becauseText: this.generateBecauseText('energy_alignment', currentStress, 'increase'),
      confidence: 0.7 + (newAlignment - currentAlignment) * 0.3,
      stressReduction: Math.max(0, currentStress * 0.2),
      energyAlignment: newAlignment,
      priority: newAlignment > 0.8 ? 'high' : 'medium'
    };
  }

  private getContextualReason(time: Date): string {
    const hour = time.getHours();
    
    if (hour >= 9 && hour <= 11) return "for peak morning energy";
    if (hour >= 14 && hour <= 16) return "for post-lunch focus";
    if (hour >= 16 && hour <= 17) return "for end-of-day momentum";
    return "for better energy alignment";
  }

  private generateBecauseText(
    type: 'spacing' | 'energy_alignment',
    stressLevel: number,
    stimuliRecommendation: string
  ): string {
    const stressContext = stressLevel > 0.7 ? "high stress detected" : "optimizing flow";
    
    switch (type) {
      case 'spacing':
        return `Because ${stressContext} and back-to-back meetings reduce focus by 40%`;
      case 'energy_alignment':
        return `Because your energy patterns show ${stimuliRecommendation === 'increase' ? 'higher' : 'lower'} performance at this time`;
      default:
        return `Because calendar optimization reduces daily stress`;
    }
  }

  private calculateSpacingConfidence(
    current: CalendarEvent,
    next: CalendarEvent,
    optimalWindows: any[]
  ): number {
    let confidence = 0.6; // Base confidence
    
    // Higher confidence if both events are flexible
    if (current.isFlexible && next.isFlexible) confidence += 0.2;
    
    // Higher confidence if moving to optimal energy window
    const nextHour = next.start.getHours();
    const hasOptimalWindow = optimalWindows.some(w => w.hour === nextHour);
    if (hasOptimalWindow) confidence += 0.1;
    
    return Math.min(0.9, confidence);
  }

  private calculateEnergyAlignment(event: CalendarEvent, optimalWindows: any[]): number {
    const eventHour = event.start.getHours();
    const matchingWindow = optimalWindows.find(w => w.hour === eventHour);
    
    return matchingWindow ? matchingWindow.completionRate : 0.3;
  }

  private findBetterEnergySlot(
    event: CalendarEvent,
    allEvents: CalendarEvent[],
    optimalWindows: any[]
  ): Date | null {
    const duration = event.end.getTime() - event.start.getTime();
    const eventDate = new Date(event.start);
    
    // Find best available optimal window
    for (const window of optimalWindows.slice(0, 3)) { // Top 3 windows
      const proposedStart = new Date(eventDate);
      proposedStart.setHours(window.hour, 0, 0, 0);
      
      const proposedEnd = new Date(proposedStart.getTime() + duration);
      
      // Check for conflicts
      const hasConflict = allEvents.some(otherEvent => 
        otherEvent.id !== event.id &&
        ((proposedStart >= otherEvent.start && proposedStart < otherEvent.end) ||
         (proposedEnd > otherEvent.start && proposedEnd <= otherEvent.end))
      );
      
      if (!hasConflict) {
        return proposedStart;
      }
    }
    
    return null;
  }

  private shouldShowSuggestion(suggestion: SpacingSuggestion): boolean {
    // Don't show if recently suggested
    const lastSuggested = this.recentSuggestions.get(suggestion.eventId);
    if (lastSuggested && Date.now() - lastSuggested < 3600000) return false; // 1 hour cooldown
    
    // Don't show if dismissed
    if (this.dismissedSuggestions.has(suggestion.id)) return false;
    
    // Must meet minimum confidence
    return suggestion.confidence >= 0.6;
  }

  // Accept a suggestion
  acceptSuggestion(suggestionId: string): DecisionTrace {
    this.recentSuggestions.set(suggestionId, Date.now());
    
    const trace: DecisionTrace = {
      id: `accept-spacing-${suggestionId}`,
      input: { suggestionId, action: 'accept' },
      rules: ['spacing_optimization', 'energy_alignment'],
      output: { accepted: true },
      confidence: 0.9,
      timestamp: Date.now(),
      becauseText: "Spacing suggestion accepted to optimize calendar flow",
      revertHook: () => this.revertSuggestion(suggestionId)
    };

    logger.debug('Spacing suggestion accepted', { suggestionId, trace });
    return trace;
  }

  // Dismiss a suggestion
  dismissSuggestion(suggestionId: string): void {
    this.dismissedSuggestions.add(suggestionId);
    logger.debug('Spacing suggestion dismissed', { suggestionId });
  }

  private revertSuggestion(suggestionId: string): void {
    this.recentSuggestions.delete(suggestionId);
    this.dismissedSuggestions.delete(suggestionId);
    logger.debug('Spacing suggestion reverted', { suggestionId });
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Export for analytics
  exportSpacingData(): any {
    return {
      recentSuggestions: Object.fromEntries(this.recentSuggestions),
      dismissedSuggestions: Array.from(this.dismissedSuggestions),
      timestamp: Date.now()
    };
  }
}

export const calendarSpacingService = new CalendarSpacingService();