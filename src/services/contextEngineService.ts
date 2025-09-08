/**
 * Context Engine Service v1
 * 
 * Unified service that fuses multiple signals into confidence scores (0-1)
 * with transparent, human-readable explanations.
 */

import { contextPatternService } from './contextPatternService';
import { decisionTraceService } from './decisionTraceService';

// Core interfaces
export interface ContextSignal {
  type: 'time_pressure' | 'sender_trust' | 'location_context' | 'historical_behavior' | 
        'content_certainty' | 'meeting_density' | 'ambiguity' | 'quiet_hours' | 'mood_stress';
  value: number; // 0-1 normalized value
  confidence: number; // How sure we are of this signal (0-1)
  weight: number; // How important this signal is (0-1)
  reason: string; // Human readable explanation
  metadata?: any; // Additional context
}

export interface ContextScore {
  score: number; // Final confidence score (0-1)
  signals: ContextSignal[];
  because: string[]; // Array of human-readable reasons
  metadata: {
    signalCount: number;
    totalWeight: number;
    deterministic: boolean;
    timestamp: number;
  };
}

export interface ContextInput {
  content?: string;
  sender?: string;
  recipientCount?: number;
  deadline?: Date;
  location?: string;
  eventType?: 'email' | 'calendar' | 'task' | 'reminder';
  userHistory?: any;
  currentTime?: Date;
}

// Signal weights configuration
const DEFAULT_SIGNAL_WEIGHTS = {
  time_pressure: 0.25,
  sender_trust: 0.20,
  location_context: 0.15,
  historical_behavior: 0.15,
  content_certainty: 0.10,
  meeting_density: 0.05,
  ambiguity: 0.05,
  quiet_hours: 0.03,
  mood_stress: 0.02
};

class ContextEngineService {
  private signalWeights = { ...DEFAULT_SIGNAL_WEIGHTS };
  private storageKey = 'mm-context-engine-config';

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Main entry point: Generate confidence score with explanations
   */
  async generateScore(input: ContextInput): Promise<ContextScore> {
    const currentTime = input.currentTime || new Date();
    const signals: ContextSignal[] = [];

    // Process all signal types
    signals.push(...await this.processTimePressureSignals(input, currentTime));
    signals.push(...await this.processSenderTrustSignals(input));
    signals.push(...await this.processLocationContextSignals(input));
    signals.push(...await this.processHistoricalBehaviorSignals(input));
    signals.push(...await this.processContentCertaintySignals(input));
    signals.push(...await this.processMeetingDensitySignals(input, currentTime));
    signals.push(...await this.processAmbiguitySignals(input));
    signals.push(...await this.processQuietHoursSignals(input, currentTime));
    signals.push(...await this.processMoodStressSignals(input, currentTime));

    // Calculate weighted score
    const score = this.calculateWeightedScore(signals);
    const because = this.generateBecauseExplanations(signals);

    const contextScore: ContextScore = {
      score,
      signals,
      because,
      metadata: {
        signalCount: signals.length,
        totalWeight: signals.reduce((sum, s) => sum + s.weight, 0),
        deterministic: true,
        timestamp: currentTime.getTime()
      }
    };

    // Record decision trace
    decisionTraceService.addTrace({
      feature: input.eventType === 'email' ? 'email' : 'context',
      signals: signals.map(s => ({
        type: s.type,
        value: s.value,
        confidence: s.confidence,
        source: 'context-engine'
      })),
      confidenceThreshold: 0.5,
      finalConfidence: score,
      decision: score >= 0.85 ? 'auto-write' : score >= 0.6 ? 'draft' : 'suggest',
      action: `Context scoring for ${input.eventType}`,
      becauseText: because.join('; '),
      metadata: { input, signals: signals.length },
      undoable: false
    });

    return contextScore;
  }

  /**
   * Time pressure signals (deadlines, urgency)
   */
  private async processTimePressureSignals(input: ContextInput, currentTime: Date): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    if (input.deadline) {
      const timeUntilDeadline = input.deadline.getTime() - currentTime.getTime();
      const hoursUntilDeadline = timeUntilDeadline / (1000 * 60 * 60);
      
      let pressureValue = 0;
      let reason = '';
      
      if (hoursUntilDeadline < 1) {
        pressureValue = 0.95;
        reason = 'Deadline is within 1 hour';
      } else if (hoursUntilDeadline < 4) {
        pressureValue = 0.8;
        reason = 'Deadline is within 4 hours';
      } else if (hoursUntilDeadline < 24) {
        pressureValue = 0.6;
        reason = 'Deadline is today';
      } else if (hoursUntilDeadline < 72) {
        pressureValue = 0.4;
        reason = 'Deadline is within 3 days';
      } else {
        pressureValue = 0.2;
        reason = 'Deadline is more than 3 days away';
      }

      signals.push({
        type: 'time_pressure',
        value: pressureValue,
        confidence: 0.9,
        weight: this.signalWeights.time_pressure,
        reason,
        metadata: { deadline: input.deadline, hoursUntil: hoursUntilDeadline }
      });
    }

    // Check for urgency keywords in content
    if (input.content) {
      const urgencyKeywords = ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'deadline', 'due', 'rush'];
      const urgencyCount = urgencyKeywords.filter(keyword => 
        input.content!.toLowerCase().includes(keyword)
      ).length;

      if (urgencyCount > 0) {
        signals.push({
          type: 'time_pressure',
          value: Math.min(0.8, urgencyCount * 0.3),
          confidence: 0.7,
          weight: this.signalWeights.time_pressure * 0.5,
          reason: `Contains ${urgencyCount} urgency keyword(s)`,
          metadata: { urgencyKeywords: urgencyCount }
        });
      }
    }

    return signals;
  }

  /**
   * Sender trust signals (contact graph, interaction history)
   */
  private async processSenderTrustSignals(input: ContextInput): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    if (input.sender) {
      // This would be enhanced with actual contact interaction data
      const trustLevel = await this.calculateSenderTrust(input.sender);
      
      let reason = '';
      if (trustLevel >= 0.8) {
        reason = 'Frequent trusted contact';
      } else if (trustLevel >= 0.6) {
        reason = 'Regular contact';
      } else if (trustLevel >= 0.4) {
        reason = 'Occasional contact';
      } else {
        reason = 'Infrequent or new contact';
      }

      signals.push({
        type: 'sender_trust',
        value: trustLevel,
        confidence: 0.8,
        weight: this.signalWeights.sender_trust,
        reason,
        metadata: { sender: input.sender, trustLevel }
      });
    }

    return signals;
  }

  /**
   * Location context signals
   */
  private async processLocationContextSignals(input: ContextInput): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];
    
    try {
      const currentContext = await contextPatternService.getCurrentContext();
      const locationSuggestions = await contextPatternService.getLocationSuggestions(currentContext.location);

      if (locationSuggestions.length > 0) {
        const productivity = locationSuggestions[0].confidence || 0.5;
        
        signals.push({
          type: 'location_context',
          value: productivity,
          confidence: 0.7,
          weight: this.signalWeights.location_context,
          reason: `Current location has ${Math.round(productivity * 100)}% productivity score`,
          metadata: { location: currentContext.location, suggestions: locationSuggestions }
        });
      }
    } catch (error) {
      console.warn('Failed to get location context:', error);
    }

    return signals;
  }

  /**
   * Historical behavior signals (user accepts auto-adds?)
   */
  private async processHistoricalBehaviorSignals(input: ContextInput): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    // Analyze recent decision traces for user behavior patterns
    const recentTraces = decisionTraceService.getRecentUndoable(50);
    const autoWriteTraces = recentTraces.filter(t => t.decision === 'auto-write');
    const undoneTraces = recentTraces.filter(t => t.undoId);

    if (autoWriteTraces.length > 0) {
      const acceptanceRate = 1 - (undoneTraces.length / autoWriteTraces.length);
      
      let reason = '';
      if (acceptanceRate >= 0.8) {
        reason = 'User rarely undoes auto-actions';
      } else if (acceptanceRate >= 0.6) {
        reason = 'User sometimes undoes auto-actions';
      } else {
        reason = 'User frequently undoes auto-actions';
      }

      signals.push({
        type: 'historical_behavior',
        value: acceptanceRate,
        confidence: autoWriteTraces.length >= 10 ? 0.8 : 0.5,
        weight: this.signalWeights.historical_behavior,
        reason,
        metadata: { acceptanceRate, sampleSize: autoWriteTraces.length }
      });
    }

    return signals;
  }

  /**
   * Content certainty signals (NLP date/time/place parsing)
   */
  private async processContentCertaintySignals(input: ContextInput): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    if (input.content) {
      const certaintyAnalysis = this.analyzeContentCertainty(input.content);
      
      signals.push({
        type: 'content_certainty',
        value: certaintyAnalysis.score,
        confidence: certaintyAnalysis.confidence,
        weight: this.signalWeights.content_certainty,
        reason: certaintyAnalysis.reason,
        metadata: certaintyAnalysis.details
      });
    }

    return signals;
  }

  /**
   * Meeting density signals
   */
  private async processMeetingDensitySignals(input: ContextInput, currentTime: Date): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    // This would integrate with calendar data to check meeting density
    // For now, using a simplified approach
    const hour = currentTime.getHours();
    const isBusinessHours = hour >= 9 && hour <= 17;
    const isLunchTime = hour >= 12 && hour <= 13;

    let densityScore = 0.5; // Default
    let reason = 'Normal meeting time';

    if (isLunchTime) {
      densityScore = 0.3;
      reason = 'Lunch time - low meeting density';
    } else if (isBusinessHours) {
      densityScore = 0.7;
      reason = 'Business hours - high meeting density';
    } else {
      densityScore = 0.2;
      reason = 'Outside business hours - very low meeting density';
    }

    signals.push({
      type: 'meeting_density',
      value: densityScore,
      confidence: 0.6,
      weight: this.signalWeights.meeting_density,
      reason,
      metadata: { hour, isBusinessHours, isLunchTime }
    });

    return signals;
  }

  /**
   * Ambiguity signals (conflicting times/places)
   */
  private async processAmbiguitySignals(input: ContextInput): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    if (input.content) {
      const ambiguityAnalysis = this.analyzeContentAmbiguity(input.content);
      
      if (ambiguityAnalysis.hasAmbiguity) {
        signals.push({
          type: 'ambiguity',
          value: 1 - ambiguityAnalysis.ambiguityScore, // Invert - higher ambiguity = lower confidence
          confidence: 0.7,
          weight: this.signalWeights.ambiguity,
          reason: ambiguityAnalysis.reason,
          metadata: ambiguityAnalysis.details
        });
      }
    }

    return signals;
  }

  /**
   * Quiet hours signals
   */
  private async processQuietHoursSignals(input: ContextInput, currentTime: Date): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    const hour = currentTime.getHours();
    const isQuietHours = hour < 8 || hour > 22;

    if (isQuietHours) {
      signals.push({
        type: 'quiet_hours',
        value: 0.2, // Low confidence during quiet hours
        confidence: 0.9,
        weight: this.signalWeights.quiet_hours,
        reason: `Current time (${hour}:00) is during quiet hours`,
        metadata: { hour, isQuietHours }
      });
    }

    return signals;
  }

  /**
   * Mood/stress signals
   */
  private async processMoodStressSignals(input: ContextInput, currentTime: Date): Promise<ContextSignal[]> {
    const signals: ContextSignal[] = [];

    try {
      const context = await contextPatternService.getCurrentContext();
      
      if (context.mood && context.energy) {
        const moodEnergyScore = (context.mood + context.energy) / 20; // Normalize to 0-1
        
        let reason = '';
        if (moodEnergyScore >= 0.7) {
          reason = 'High mood and energy levels';
        } else if (moodEnergyScore >= 0.5) {
          reason = 'Moderate mood and energy levels';
        } else {
          reason = 'Low mood or energy levels';
        }

        signals.push({
          type: 'mood_stress',
          value: moodEnergyScore,
          confidence: 0.6,
          weight: this.signalWeights.mood_stress,
          reason,
          metadata: { mood: context.mood, energy: context.energy }
        });
      }
    } catch (error) {
      console.warn('Failed to get mood/stress context:', error);
    }

    return signals;
  }

  /**
   * Calculate weighted score from signals
   */
  private calculateWeightedScore(signals: ContextSignal[]): number {
    if (signals.length === 0) return 0.5; // Default neutral score

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const effectiveWeight = signal.weight * signal.confidence;
      weightedSum += signal.value * effectiveWeight;
      totalWeight += effectiveWeight;
    }

    return totalWeight > 0 ? Math.min(1, Math.max(0, weightedSum / totalWeight)) : 0.5;
  }

  /**
   * Generate human-readable explanations
   */
  private generateBecauseExplanations(signals: ContextSignal[]): string[] {
    return signals
      .filter(signal => signal.confidence > 0.5 && signal.value !== 0.5) // Only significant signals
      .sort((a, b) => (b.weight * b.confidence) - (a.weight * a.confidence)) // Sort by importance
      .slice(0, 5) // Top 5 reasons
      .map(signal => signal.reason);
  }

  /**
   * Analyze content for certainty (dates, times, places)
   */
  private analyzeContentCertainty(content: string): {
    score: number;
    confidence: number;
    reason: string;
    details: any;
  } {
    const dateTimeRegex = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b)/gi;
    const locationRegex = /\b(at|in|on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
    
    const dateTimeMatches = content.match(dateTimeRegex) || [];
    const locationMatches = content.match(locationRegex) || [];
    
    const hasDateTime = dateTimeMatches.length > 0;
    const hasLocation = locationMatches.length > 0;
    
    let score = 0.3; // Base score
    let details = { dateTimeMatches, locationMatches };
    
    if (hasDateTime) score += 0.4;
    if (hasLocation) score += 0.3;
    
    let reason = '';
    if (hasDateTime && hasLocation) {
      reason = 'Contains clear date/time and location';
    } else if (hasDateTime) {
      reason = 'Contains date/time information';
    } else if (hasLocation) {
      reason = 'Contains location information';
    } else {
      reason = 'Limited temporal or location information';
    }
    
    return {
      score: Math.min(1, score),
      confidence: 0.7,
      reason,
      details
    };
  }

  /**
   * Analyze content for ambiguity
   */
  private analyzeContentAmbiguity(content: string): {
    hasAmbiguity: boolean;
    ambiguityScore: number;
    reason: string;
    details: any;
  } {
    const uncertainWords = ['maybe', 'possibly', 'might', 'could', 'perhaps', 'tentative', 'tbd', 'unclear'];
    const conflictWords = ['or', 'either', 'alternatively', 'instead'];
    
    const uncertainMatches = uncertainWords.filter(word => 
      content.toLowerCase().includes(word)
    );
    
    const conflictMatches = conflictWords.filter(word => 
      content.toLowerCase().includes(word)
    );
    
    const hasAmbiguity = uncertainMatches.length > 0 || conflictMatches.length > 0;
    const ambiguityScore = Math.min(1, (uncertainMatches.length * 0.3) + (conflictMatches.length * 0.4));
    
    let reason = '';
    if (uncertainMatches.length > 0 && conflictMatches.length > 0) {
      reason = 'Contains uncertain and conflicting language';
    } else if (uncertainMatches.length > 0) {
      reason = 'Contains uncertain language';
    } else if (conflictMatches.length > 0) {
      reason = 'Contains conflicting options';
    }
    
    return {
      hasAmbiguity,
      ambiguityScore,
      reason,
      details: { uncertainMatches, conflictMatches }
    };
  }

  /**
   * Calculate sender trust (simplified - would use real interaction data)
   */
  private async calculateSenderTrust(sender: string): Promise<number> {
    // This would integrate with email/calendar interaction history
    // For now, using domain-based heuristics
    
    const email = sender.toLowerCase();
    
    // Internal domain or known contacts get higher trust
    if (email.includes('@company.com') || email.includes('noreply')) {
      return 0.8;
    }
    
    // Common domains get medium trust
    if (email.includes('@gmail.com') || email.includes('@outlook.com')) {
      return 0.6;
    }
    
    // Unknown domains get lower trust
    return 0.3;
  }

  /**
   * Update signal weights (for learning/adaptation)
   */
  updateSignalWeights(weights: Partial<typeof DEFAULT_SIGNAL_WEIGHTS>): void {
    this.signalWeights = { ...this.signalWeights, ...weights };
    this.saveConfiguration();
  }

  /**
   * Get current signal weights
   */
  getSignalWeights(): typeof DEFAULT_SIGNAL_WEIGHTS {
    return { ...this.signalWeights };
  }

  /**
   * Reset to default weights
   */
  resetSignalWeights(): void {
    this.signalWeights = { ...DEFAULT_SIGNAL_WEIGHTS };
    this.saveConfiguration();
  }

  private loadConfiguration(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const config = JSON.parse(saved);
        this.signalWeights = { ...DEFAULT_SIGNAL_WEIGHTS, ...config.signalWeights };
      }
    } catch (error) {
      console.warn('Failed to load context engine configuration:', error);
    }
  }

  private saveConfiguration(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        signalWeights: this.signalWeights
      }));
    } catch (error) {
      console.warn('Failed to save context engine configuration:', error);
    }
  }
}

export const contextEngineService = new ContextEngineService();