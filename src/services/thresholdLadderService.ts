import { ContextScore } from './contextEngineService';
import { decisionTraceService } from './decisionTraceService';

// Threshold levels for the ladder system
export const THRESHOLD_LEVELS = {
  HIGH: 0.85,   // Auto-Write allowed (if user enabled)
  MEDIUM: 0.6,  // Draft + Ask (user confirm)
  LOW: 0.0      // Suggestion only
};

export type ThresholdDecision = 'auto-write' | 'draft' | 'draft-ask' | 'suggest';

export interface ThresholdResult {
  decision: ThresholdDecision;
  score: number;
  baseThreshold: string;
  appliedOverrides: string[];
  reason: string;
  confidence: number;
}

export interface PolicyContext {
  isInMeeting?: boolean;
  meetingDensity?: number;
  isFirstTimeRecipient?: boolean;
  isQuietHours?: boolean;
  locationProductivity?: number;
  userAutoWriteEnabled?: boolean;
  recipientDomain?: string;
  feature?: string;
  // Task-specific context
  taskPriority?: number;
  taskAge?: number;
  hasAttendees?: boolean;
  greenConditionsValid?: boolean;
  greenConditionsConfidence?: number;
}

class ThresholdLadderService {
  /**
   * Apply threshold ladder logic with dynamic overrides
   */
  applyThresholds(
    contextScore: ContextScore,
    policyContext: PolicyContext = {}
  ): ThresholdResult {
    const baseScore = contextScore.score;
    let adjustedScore = baseScore;
    const appliedOverrides: string[] = [];
    
    // Apply dynamic policy overrides
    adjustedScore = this.applyMeetingOverride(adjustedScore, policyContext, appliedOverrides);
    adjustedScore = this.applyQuietHoursOverride(adjustedScore, policyContext, appliedOverrides);
    adjustedScore = this.applyLocationOverride(adjustedScore, policyContext, appliedOverrides);
    
    // Determine base decision
    let decision = this.getBaseDecision(adjustedScore, policyContext);
    
    // Apply forced overrides
    decision = this.applyFirstTimeRecipientOverride(decision, policyContext, appliedOverrides, baseScore);
    decision = this.applyUserPreferenceOverride(decision, baseScore, policyContext, appliedOverrides);
    
    const baseThreshold = this.getThresholdLevel(adjustedScore);
    const reason = this.generateReason(decision, adjustedScore, appliedOverrides, contextScore);
    
    const result: ThresholdResult = {
      decision,
      score: adjustedScore,
      baseThreshold,
      appliedOverrides,
      reason,
      confidence: this.calculateConfidence(adjustedScore, appliedOverrides.length)
    };

    // Log decision trace
    this.logDecisionTrace(result, contextScore, policyContext);
    
    return result;
  }

  private applyMeetingOverride(
    score: number,
    context: PolicyContext,
    overrides: string[]
  ): number {
    if (context.isInMeeting || (context.meetingDensity && context.meetingDensity > 0.7)) {
      overrides.push('meeting-context');
      return Math.max(0, score - 0.15); // Reduce score during meetings
    }
    return score;
  }

  private applyQuietHoursOverride(
    score: number,
    context: PolicyContext,
    overrides: string[]
  ): number {
    if (context.isQuietHours) {
      overrides.push('quiet-hours');
      return Math.max(0, score - 0.25); // Significant reduction during quiet hours
    }
    return score;
  }

  private applyLocationOverride(
    score: number,
    context: PolicyContext,
    overrides: string[]
  ): number {
    if (context.locationProductivity && context.locationProductivity < 0.3) {
      overrides.push('low-productivity-location');
      return Math.max(0, score - 0.1);
    }
    return score;
  }

  /**
   * Validate task-specific green conditions for auto-write
   */
  validateTaskGreenConditions(context: PolicyContext): boolean {
    // Green conditions for task-based calendar auto-write:
    // 1. No external attendees
    // 2. Valid green conditions from adapter
    // 3. Self-owned calendar (implied by greenConditionsValid)
    
    if (context.feature === 'task-calendar') {
      return Boolean(
        context.greenConditionsValid &&
        context.greenConditionsConfidence && context.greenConditionsConfidence >= 0.7
      );
    }
    
    return true; // Non-task features use existing validation
  }

  private getBaseDecision(score: number, context: PolicyContext): ThresholdDecision {
    // Apply task-specific green conditions check
    if (context.feature === 'task-calendar' && !this.validateTaskGreenConditions(context)) {
      return 'suggest'; // Force to suggest if green conditions fail
    }
    
    if (score >= THRESHOLD_LEVELS.HIGH && context.userAutoWriteEnabled) {
      return 'auto-write';
    } else if (score >= THRESHOLD_LEVELS.MEDIUM) {
      return 'draft';
    } else {
      return 'suggest';
    }
  }

  private applyFirstTimeRecipientOverride(
    decision: ThresholdDecision,
    context: PolicyContext,
    overrides: string[],
    baseScore: number
  ): ThresholdDecision {
    if (!context.isFirstTimeRecipient) {
      return decision;
    }

    // 4th tier: 'draft-ask'. First-time recipients are a fixed safety class -- they
    // should never get a silent auto-write, and if the raw signal was strong enough to
    // have qualified for auto-write in the first place, they shouldn't quietly fall all
    // the way down to 'suggest' either just because another override (meeting/quiet-
    // hours/location) ran first and dragged the adjusted score down first. Keying off
    // baseScore (not the already-adjusted decision) means this safety net can't be
    // bypassed by those other overrides running earlier in the chain.
    const wasAutoWriteEligible =
      baseScore >= THRESHOLD_LEVELS.HIGH && Boolean(context.userAutoWriteEnabled);

    if (wasAutoWriteEligible && decision !== 'draft-ask') {
      overrides.push('first-time-recipient');
      return 'draft-ask'; // Force explicit confirmation for new recipients
    }

    if (decision === 'draft') {
      // Already at draft-level confidence -- first-time recipients still get the
      // stronger draft-ask variant so nothing about a new contact is ever
      // half-automated. This isn't overriding a higher decision, so it isn't
      // recorded as a policy override.
      return 'draft-ask';
    }

    return decision;
  }

  /**
   * Item 8 (2026-07-03): checks eligibility off the raw base score instead of the
   * already-computed `decision`. getBaseDecision only ever returns 'auto-write' when
   * userAutoWriteEnabled is already true, so the old `decision === 'auto-write' &&
   * !userAutoWriteEnabled` guard could never both be true at once — the final decision
   * still ended up 'draft' correctly (via base logic), but this override never recorded
   * 'auto-write-disabled' in appliedOverrides, silently dropping the "why" trail.
   *
   * Note: the punch list's suggested `decision !== 'draft'` guard (meant to avoid
   * double-counting with applyFirstTimeRecipientOverride, which runs first and may have
   * already forced 'draft' for its own reason) turned out to also suppress the exact
   * case this fix targets — here, `decision` is *already* 'draft' by the time this runs,
   * because getBaseDecision itself falls through to 'draft' whenever userAutoWriteEnabled
   * is false, even at a HIGH score. Checking for the first-time-recipient override by
   * name (rather than decision's current value) is what actually distinguishes "already
   * handled by that other override" from "draft because auto-write is simply disabled" —
   * verified against the test rather than assumed, per the punch list's own caveat.
   */
  private applyUserPreferenceOverride(
    decision: ThresholdDecision,
    baseScore: number,
    context: PolicyContext,
    overrides: string[]
  ): ThresholdDecision {
    const wouldQualifyForAutoWrite = baseScore >= THRESHOLD_LEVELS.HIGH;
    const alreadyHandledByRecipientOverride = overrides.includes('first-time-recipient');
    if (wouldQualifyForAutoWrite && !context.userAutoWriteEnabled && !alreadyHandledByRecipientOverride) {
      overrides.push('auto-write-disabled');
      return 'draft';
    }
    return decision;
  }

  private getThresholdLevel(score: number): string {
    if (score >= THRESHOLD_LEVELS.HIGH) return 'HIGH';
    if (score >= THRESHOLD_LEVELS.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  private generateReason(
    decision: ThresholdDecision,
    score: number,
    overrides: string[],
    contextScore: ContextScore
  ): string {
    const baseReason = this.getBaseReasonForDecision(decision, score);
    const overrideReasons = this.getOverrideReasons(overrides);
    const topSignals = contextScore.signals
      .sort((a, b) => (b.confidence * b.weight) - (a.confidence * a.weight))
      .slice(0, 2)
      .map(s => s.reason)
      .join(', ');

    const parts = [baseReason];
    if (overrideReasons.length > 0) {
      parts.push(`with ${overrideReasons.join(', ')}`);
    }
    if (topSignals) {
      parts.push(`based on ${topSignals}`);
    }

    return parts.join(' ');
  }

  private getBaseReasonForDecision(decision: ThresholdDecision, score: number): string {
    switch (decision) {
      case 'auto-write':
        return `High confidence (${Math.round(score * 100)}%) allows auto-write`;
      case 'draft-ask':
        return `Confidence (${Math.round(score * 100)}%) requires an explicit ask before proceeding`;
      case 'draft':
        return `Medium confidence (${Math.round(score * 100)}%) requires confirmation`;
      case 'suggest':
        return `Low confidence (${Math.round(score * 100)}%) suggests manual review`;
      default:
        return `Confidence score: ${Math.round(score * 100)}%`;
    }
  }

  private getOverrideReasons(overrides: string[]): string[] {
    const reasonMap: Record<string, string> = {
      'meeting-context': 'meeting constraints',
      'quiet-hours': 'quiet hours policy',
      'low-productivity-location': 'location considerations',
      'first-time-recipient': 'new recipient safety',
      'auto-write-disabled': 'user preferences',
      'task-green-conditions': 'task safety requirements'
    };

    return overrides.map(override => reasonMap[override] || override);
  }

  private calculateConfidence(score: number, overrideCount: number): number {
    // Base confidence from score, reduced by number of overrides applied
    const baseConfidence = score;
    const overridePenalty = overrideCount * 0.1;
    return Math.max(0.1, Math.min(1.0, baseConfidence - overridePenalty));
  }

  private logDecisionTrace(
    result: ThresholdResult,
    contextScore: ContextScore,
    policyContext: PolicyContext
  ): void {
    decisionTraceService.addTrace({
      feature: 'context',
      signals: [
        {
          type: 'context-score',
          value: contextScore.score.toString(),
          confidence: contextScore.score,
          source: 'context-engine'
        },
        {
          type: 'policy-decision',
          value: result.decision,
          confidence: result.confidence,
          source: 'threshold-ladder'
        },
        ...result.appliedOverrides.map(override => ({
          type: 'policy-override',
          value: override,
          confidence: 1.0,
          source: 'threshold-ladder'
        }))
      ],
      confidenceThreshold: 0.5,
      finalConfidence: result.confidence,
      decision: result.decision,
      action: result.decision,
      becauseText: result.reason,
      undoable: false,
      metadata: {
        originalScore: contextScore.score,
        adjustedScore: result.score,
        baseThreshold: result.baseThreshold,
        overrides: result.appliedOverrides,
        policyContext
      }
    });
  }

  /**
   * Get user-configurable threshold values
   */
  getThresholdConfiguration() {
    const stored = localStorage.getItem('threshold-ladder-config');
    if (stored) {
      try {
        return { ...THRESHOLD_LEVELS, ...JSON.parse(stored) };
      } catch (e) {
        console.warn('Invalid threshold configuration in storage, using defaults');
      }
    }
    return THRESHOLD_LEVELS;
  }

  /**
   * Update threshold configuration
   */
  updateThresholdConfiguration(config: any): void {
    const current = this.getThresholdConfiguration();
    const updated = { ...current, ...config };
    localStorage.setItem('threshold-ladder-config', JSON.stringify(updated));
  }
}

export const thresholdLadderService = new ThresholdLadderService();