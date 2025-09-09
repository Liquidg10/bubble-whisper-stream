/**
 * Auto-Write Precision Gate - Unified Decision Service
 * 
 * Single entry point for all auto-write decisions across Calendar, Gmail, Finance, etc.
 * Implements the complete scoring system with entity fill rate, user trust, history tracking.
 */

import { contextEngineService, ContextInput } from './contextEngineService';
import { decisionTraceService, DecisionSignal } from './decisionTraceService';
import { supabase } from '@/integrations/supabase/client';

// Core precision gate interfaces
export interface PrecisionGateInput {
  // Content and intent
  content?: string;
  intentConfidence?: number; // 0-1 from NLP/voice
  
  // Entity extraction results
  entities?: {
    dateTime?: {
      value?: string;
      confidence: number;
      parsed?: Date;
    };
    location?: {
      value?: string;
      confidence: number;
    };
    recipients?: {
      emails: string[];
      confidence: number;
    };
  };
  
  // Feature context
  feature: 'calendar' | 'email' | 'finance' | 'reminder';
  
  // User trust factors
  userTrust?: {
    recipientAllowlisted?: boolean;
    calendarWhitelisted?: boolean;
    contactTrustScore?: number; // 0-1
  };
  
  // User preferences
  userPreferences?: {
    autoWriteEnabled?: boolean;
    featureEnabled?: boolean; // Feature-specific toggle
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  
  // Additional context
  currentTime?: Date;
  metadata?: any;
}

export interface PrecisionGateResult {
  score: number; // 0-1 final confidence score
  decision: 'suggest' | 'draft' | 'auto-write';
  reasons: string[];
  entityFillRate: number;
  policyGatesApplied: string[];
  userTrustScore: number;
  historyInfluence: number;
  canAutoWrite: boolean; // Domain feature enabled check
  traceId: string;
}

// Scoring weights for different components
const SCORING_WEIGHTS = {
  intentConfidence: 0.30,
  entityFillRate: 0.25,
  userTrust: 0.20,
  historyPattern: 0.15,
  contextualFactors: 0.10
};

// Precision gate thresholds
const PRECISION_THRESHOLDS = {
  SUGGEST_MAX: 0.60,
  DRAFT_MIN: 0.60,
  DRAFT_MAX: 0.85,
  AUTO_WRITE_MIN: 0.85
};

class AutoWritePrecisionGateService {
  /**
   * Main precision gate evaluation
   */
  async evaluateDecision(input: PrecisionGateInput): Promise<PrecisionGateResult> {
    const currentTime = input.currentTime || new Date();
    
    // 1. Calculate entity fill rate
    const entityFillRate = this.calculateEntityFillRate(input.entities, input.feature);
    
    // 2. Calculate user trust score
    const userTrustScore = await this.calculateUserTrustScore(input);
    
    // 3. Get history influence
    const historyInfluence = await this.calculateHistoryInfluence(input.feature);
    
    // 4. Get contextual score
    const contextScore = await this.getContextualScore(input, currentTime);
    
    // 5. Apply policy gates
    const policyResult = await this.applyPolicyGates(input, currentTime);
    
    // 6. Calculate final weighted score
    const rawScore = this.calculateWeightedScore({
      intentConfidence: input.intentConfidence || 0.5,
      entityFillRate,
      userTrustScore,
      historyInfluence,
      contextualScore: contextScore
    });
    
    // 7. Apply policy adjustments
    const adjustedScore = Math.max(0, rawScore - policyResult.penalty);
    
    // 8. Determine final decision
    const decision = this.determineDecision(adjustedScore, input);
    
    // 9. Generate reasons
    const reasons = this.generateReasons({
      intentConfidence: input.intentConfidence || 0.5,
      entityFillRate,
      userTrustScore,
      historyInfluence,
      contextualScore: contextScore,
      policyGates: policyResult.appliedGates,
      decision
    });
    
    // 10. Create decision trace
    const traceId = this.createDecisionTrace(input, {
      score: adjustedScore,
      decision,
      entityFillRate,
      userTrustScore,
      historyInfluence,
      policyGates: policyResult.appliedGates
    });
    
    return {
      score: adjustedScore,
      decision,
      reasons,
      entityFillRate,
      policyGatesApplied: policyResult.appliedGates,
      userTrustScore,
      historyInfluence,
      canAutoWrite: this.checkFeatureEnabled(input),
      traceId
    };
  }
  
  /**
   * Calculate entity fill rate based on feature requirements
   */
  private calculateEntityFillRate(entities: PrecisionGateInput['entities'], feature: string): number {
    if (!entities) return 0;
    
    const requirements = this.getEntityRequirements(feature);
    let totalWeight = 0;
    let filledWeight = 0;
    
    // Date/Time (critical for calendar, important for email)
    if (requirements.dateTime > 0) {
      totalWeight += requirements.dateTime;
      if (entities.dateTime?.confidence) {
        filledWeight += requirements.dateTime * entities.dateTime.confidence;
      }
    }
    
    // Location (important for calendar)
    if (requirements.location > 0) {
      totalWeight += requirements.location;
      if (entities.location?.confidence) {
        filledWeight += requirements.location * entities.location.confidence;
      }
    }
    
    // Recipients (critical for email)
    if (requirements.recipients > 0) {
      totalWeight += requirements.recipients;
      if (entities.recipients?.confidence) {
        filledWeight += requirements.recipients * entities.recipients.confidence;
      }
    }
    
    return totalWeight > 0 ? filledWeight / totalWeight : 0.5;
  }
  
  /**
   * Get entity requirements by feature
   */
  private getEntityRequirements(feature: string): { dateTime: number; location: number; recipients: number } {
    switch (feature) {
      case 'calendar':
        return { dateTime: 0.8, location: 0.2, recipients: 0.1 };
      case 'email':
        return { dateTime: 0.2, location: 0.1, recipients: 0.7 };
      case 'reminder':
        return { dateTime: 0.6, location: 0.2, recipients: 0.1 };
      case 'finance':
        return { dateTime: 0.3, location: 0.2, recipients: 0.1 };
      default:
        return { dateTime: 0.4, location: 0.2, recipients: 0.4 };
    }
  }
  
  /**
   * Calculate user trust score
   */
  private async calculateUserTrustScore(input: PrecisionGateInput): Promise<number> {
    let trustScore = 0.5; // Base neutral trust
    
    const userTrust = input.userTrust;
    if (!userTrust) return trustScore;
    
    // Recipient allowlist boost
    if (userTrust.recipientAllowlisted) {
      trustScore += 0.3;
    }
    
    // Calendar whitelist boost
    if (userTrust.calendarWhitelisted) {
      trustScore += 0.2;
    }
    
    // Contact trust score
    if (userTrust.contactTrustScore !== undefined) {
      trustScore = (trustScore + userTrust.contactTrustScore) / 2;
    }
    
    // Get dynamic trust from interaction history
    try {
      const dynamicTrust = await this.getDynamicTrustScore(input);
      trustScore = (trustScore + dynamicTrust) / 2;
    } catch (error) {
      console.warn('Failed to get dynamic trust score:', error);
    }
    
    return Math.min(1, Math.max(0, trustScore));
  }
  
  /**
   * Get dynamic trust from interaction patterns
   */
  private async getDynamicTrustScore(input: PrecisionGateInput): Promise<number> {
    try {
      // Check recent confirmations and undos for this feature
      const traces = decisionTraceService.getTraces({
        feature: input.feature,
        limit: 20
      });
      
      if (traces.length === 0) return 0.5;
      
      const autoWriteTraces = traces.filter(t => t.decision === 'auto-write');
      const undoneTraces = traces.filter(t => t.undoId);
      
      if (autoWriteTraces.length === 0) return 0.5;
      
      const successRate = 1 - (undoneTraces.length / autoWriteTraces.length);
      return Math.max(0.1, Math.min(1, successRate));
    } catch (error) {
      console.warn('Error calculating dynamic trust:', error);
      return 0.5;
    }
  }
  
  /**
   * Calculate history influence on decision
   */
  private async calculateHistoryInfluence(feature: string): Promise<number> {
    try {
      const recentTraces = decisionTraceService.getTraces({
        feature,
        limit: 10,
        startDate: Date.now() - (7 * 24 * 60 * 60 * 1000) // Last 7 days
      });
      
      if (recentTraces.length === 0) return 0.5;
      
      // Calculate success pattern
      const confirmationRate = this.calculateConfirmationSuccessRate(recentTraces);
      
      // Recent activity boost
      const recentActivityBoost = recentTraces.length >= 5 ? 0.1 : 0;
      
      return Math.min(1, confirmationRate + recentActivityBoost);
    } catch (error) {
      console.warn('Error calculating history influence:', error);
      return 0.5;
    }
  }
  
  /**
   * Calculate confirmation success rate from traces
   */
  private calculateConfirmationSuccessRate(traces: any[]): number {
    const decisionsWithOutcomes = traces.filter(t => 
      t.decision === 'draft' || t.decision === 'auto-write'
    );
    
    if (decisionsWithOutcomes.length === 0) return 0.5;
    
    const successfulActions = decisionsWithOutcomes.filter(t => !t.undoId);
    return successfulActions.length / decisionsWithOutcomes.length;
  }
  
  /**
   * Get contextual score from context engine
   */
  private async getContextualScore(input: PrecisionGateInput, currentTime: Date): Promise<number> {
    try {
      const contextInput: ContextInput = {
        content: input.content,
        eventType: input.feature as any,
        currentTime,
        recipientCount: input.entities?.recipients?.emails.length || 0
      };
      
      const contextScore = await contextEngineService.generateScore(contextInput);
      return contextScore.score;
    } catch (error) {
      console.warn('Error getting contextual score:', error);
      return 0.5;
    }
  }
  
  /**
   * Apply policy gates (quiet hours, fatigue, exclusions)
   */
  private async applyPolicyGates(input: PrecisionGateInput, currentTime: Date): Promise<{
    penalty: number;
    appliedGates: string[];
  }> {
    let penalty = 0;
    const appliedGates: string[] = [];
    
    // Quiet hours check
    if (this.isQuietHours(currentTime, input.userPreferences)) {
      penalty += 0.3;
      appliedGates.push('quiet-hours');
    }
    
    // Feature-specific fatigue check
    const fatigueResult = await this.checkFeatureFatigue(input.feature);
    if (fatigueResult.fatigued) {
      penalty += fatigueResult.penalty;
      appliedGates.push('feature-fatigue');
    }
    
    // Daily limits check
    const dailyLimitResult = await this.checkDailyLimits(input.feature);
    if (dailyLimitResult.exceeded) {
      penalty += 0.5; // Heavy penalty for exceeded limits
      appliedGates.push('daily-limit-exceeded');
    }
    
    return { penalty, appliedGates };
  }
  
  /**
   * Check if current time is in quiet hours
   */
  private isQuietHours(currentTime: Date, userPreferences?: PrecisionGateInput['userPreferences']): boolean {
    const hour = currentTime.getHours();
    
    if (!userPreferences?.quietHoursStart || !userPreferences?.quietHoursEnd) {
      // Default: 10 PM to 8 AM
      return hour >= 22 || hour <= 8;
    }
    
    try {
      const startHour = parseInt(userPreferences.quietHoursStart.split(':')[0]);
      const endHour = parseInt(userPreferences.quietHoursEnd.split(':')[0]);
      
      if (startHour <= endHour) {
        return hour >= startHour && hour <= endHour;
      } else {
        return hour >= startHour || hour <= endHour;
      }
    } catch (error) {
      return hour >= 22 || hour <= 8;
    }
  }
  
  /**
   * Check feature-specific fatigue
   */
  private async checkFeatureFatigue(feature: string): Promise<{ fatigued: boolean; penalty: number }> {
    const recentTraces = decisionTraceService.getTraces({
      feature,
      startDate: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
      limit: 50
    });
    
    const autoWriteCount = recentTraces.filter(t => t.decision === 'auto-write').length;
    
    // Feature-specific limits
    const limits = {
      calendar: 15,
      email: 20,
      finance: 5,
      reminder: 25
    };
    
    const limit = limits[feature as keyof typeof limits] || 10;
    
    if (autoWriteCount >= limit) {
      return { fatigued: true, penalty: 0.4 };
    } else if (autoWriteCount >= limit * 0.8) {
      return { fatigued: true, penalty: 0.2 };
    }
    
    return { fatigued: false, penalty: 0 };
  }
  
  /**
   * Check daily auto-write limits
   */
  private async checkDailyLimits(feature: string): Promise<{ exceeded: boolean }> {
    try {
      // Check sync_logs for today's auto-write count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('service_type', feature)
        .eq('operation', 'auto-write')
        .gte('created_at', today.toISOString())
        .eq('status', 'completed');
      
      if (error) {
        console.warn('Error checking daily limits:', error);
        return { exceeded: false };
      }
      
      const count = data?.length || 0;
      const dailyLimits = { calendar: 10, email: 15, finance: 3, reminder: 20 };
      const limit = dailyLimits[feature as keyof typeof dailyLimits] || 8;
      
      return { exceeded: count >= limit };
    } catch (error) {
      console.warn('Error checking daily limits:', error);
      return { exceeded: false };
    }
  }
  
  /**
   * Calculate final weighted score
   */
  private calculateWeightedScore(components: {
    intentConfidence: number;
    entityFillRate: number;
    userTrustScore: number;
    historyInfluence: number;
    contextualScore: number;
  }): number {
    return (
      components.intentConfidence * SCORING_WEIGHTS.intentConfidence +
      components.entityFillRate * SCORING_WEIGHTS.entityFillRate +
      components.userTrustScore * SCORING_WEIGHTS.userTrust +
      components.historyInfluence * SCORING_WEIGHTS.historyPattern +
      components.contextualScore * SCORING_WEIGHTS.contextualFactors
    );
  }
  
  /**
   * Determine final decision based on score and user preferences
   */
  private determineDecision(score: number, input: PrecisionGateInput): 'suggest' | 'draft' | 'auto-write' {
    // Check feature enabled status first
    if (!this.checkFeatureEnabled(input)) {
      return score >= PRECISION_THRESHOLDS.DRAFT_MIN ? 'draft' : 'suggest';
    }
    
    // Apply thresholds
    if (score >= PRECISION_THRESHOLDS.AUTO_WRITE_MIN) {
      return 'auto-write';
    } else if (score >= PRECISION_THRESHOLDS.DRAFT_MIN) {
      return 'draft';
    } else {
      return 'suggest';
    }
  }
  
  /**
   * Check if auto-write is enabled for this feature
   */
  private checkFeatureEnabled(input: PrecisionGateInput): boolean {
    return (
      input.userPreferences?.autoWriteEnabled !== false &&
      input.userPreferences?.featureEnabled !== false
    );
  }
  
  /**
   * Generate human-readable reasons
   */
  private generateReasons(components: {
    intentConfidence: number;
    entityFillRate: number;
    userTrustScore: number;
    historyInfluence: number;
    contextualScore: number;
    policyGates: string[];
    decision: string;
  }): string[] {
    const reasons: string[] = [];
    
    // Main decision reason
    if (components.decision === 'auto-write') {
      reasons.push(`High confidence (${Math.round(components.intentConfidence * 100)}%) enables auto-write`);
    } else if (components.decision === 'draft') {
      reasons.push(`Medium confidence (${Math.round(components.intentConfidence * 100)}%) requires confirmation`);
    } else {
      reasons.push(`Low confidence (${Math.round(components.intentConfidence * 100)}%) suggests manual review`);
    }
    
    // Entity completeness
    if (components.entityFillRate >= 0.8) {
      reasons.push('All key information provided');
    } else if (components.entityFillRate >= 0.6) {
      reasons.push('Most key information provided');
    } else {
      reasons.push('Missing some key information');
    }
    
    // Trust factors
    if (components.userTrustScore >= 0.8) {
      reasons.push('High trust recipient/context');
    } else if (components.userTrustScore <= 0.3) {
      reasons.push('New or low-trust context');
    }
    
    // History patterns
    if (components.historyInfluence >= 0.8) {
      reasons.push('Strong positive history');
    } else if (components.historyInfluence <= 0.3) {
      reasons.push('Limited or negative history');
    }
    
    // Policy constraints
    if (components.policyGates.length > 0) {
      const gates = components.policyGates.join(', ');
      reasons.push(`Adjusted for ${gates}`);
    }
    
    return reasons.slice(0, 4); // Keep top 4 reasons
  }
  
  /**
   * Create decision trace for audit and learning
   */
  private createDecisionTrace(input: PrecisionGateInput, result: {
    score: number;
    decision: string;
    entityFillRate: number;
    userTrustScore: number;
    historyInfluence: number;
    policyGates: string[];
  }): string {
    const signals: DecisionSignal[] = [
      {
        type: 'intent',
        value: input.intentConfidence || 0.5,
        confidence: 0.9,
        source: 'precision-gate'
      },
      {
        type: 'entities',
        value: result.entityFillRate,
        confidence: 0.8,
        source: 'precision-gate'
      },
      {
        type: 'trust',
        value: result.userTrustScore,
        confidence: 0.7,
        source: 'precision-gate'
      },
      {
        type: 'history',
        value: result.historyInfluence,
        confidence: 0.6,
        source: 'precision-gate'
      }
    ];
    
    return decisionTraceService.addTrace({
      feature: input.feature === 'reminder' ? 'context' : input.feature,
      signals,
      confidenceThreshold: PRECISION_THRESHOLDS.DRAFT_MIN,
      finalConfidence: result.score,
      decision: result.decision as any,
      action: `Auto-write precision gate for ${input.feature}`,
      becauseText: `Score ${Math.round(result.score * 100)}% from intent, entities, trust, and history`,
      metadata: {
        input: {
          feature: input.feature,
          entityCount: Object.keys(input.entities || {}).length,
          hasUserTrust: !!input.userTrust
        },
        result,
        thresholds: PRECISION_THRESHOLDS
      },
      undoable: result.decision === 'auto-write'
    });
  }
}

export const autoWritePrecisionGate = new AutoWritePrecisionGateService();
export { PRECISION_THRESHOLDS, SCORING_WEIGHTS };