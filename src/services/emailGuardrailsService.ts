import { recipientAllowlistService, RecipientStatus } from './recipientAllowlistService';
import { decisionTraceService } from './decisionTraceService';
import { DecisionSignal } from './decisionTraceService';

export interface EmailGuardrailCheck {
  canAutoSend: boolean;
  canDraft: boolean;
  requiresConfirmation: boolean;
  blockedReasons: string[];
  warnings: string[];
  confidence: number;
  decision: 'auto-send' | 'draft-only' | 'confirmation-required' | 'blocked';
}

export interface EmailComposeRequest {
  recipients: string[];
  subject: string;
  body: string;
  context?: any;
  userSettings?: {
    autoSendEnabled: boolean;
    maxDailyAutoSends: number;
    requireConfirmationForNewRecipients: boolean;
  };
}

class EmailGuardrailsService {
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.85;
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.65;
  private readonly MAX_DAILY_AUTO_SENDS = 20;

  /**
   * Evaluate email composition request against all guardrails
   */
  async evaluateEmailSafety(request: EmailComposeRequest): Promise<EmailGuardrailCheck> {
    const signals: DecisionSignal[] = [];
    const blockedReasons: string[] = [];
    const warnings: string[] = [];
    
    // Check user settings
    const userSettings = request.userSettings || {
      autoSendEnabled: false,
      maxDailyAutoSends: this.MAX_DAILY_AUTO_SENDS,
      requireConfirmationForNewRecipients: true
    };

    if (!userSettings.autoSendEnabled) {
      signals.push({
        type: 'user_setting',
        value: 'auto_send_disabled',
        confidence: 1.0,
        source: 'user_preferences'
      });
    }

    // Check recipients
    const recipientChecks = await Promise.all(
      request.recipients.map(email => this.checkRecipient(email))
    );

    const newRecipients = recipientChecks.filter(check => check.isFirstTime);
    const nonAllowlistedRecipients = recipientChecks.filter(check => !check.isAllowlisted);
    const lowTrustRecipients = recipientChecks.filter(check => check.trustScore < 0.5);

    // Check for first-time recipients
    if (newRecipients.length > 0) {
      blockedReasons.push(`Cannot auto-send to first-time recipients: ${newRecipients.map(r => r.email).join(', ')}`);
      signals.push({
        type: 'recipient_safety',
        value: 'first_time_recipients',
        confidence: 1.0,
        source: 'recipient_allowlist'
      });
    }

    // Check for non-allowlisted recipients
    if (nonAllowlistedRecipients.length > 0) {
      warnings.push(`Non-allowlisted recipients: ${nonAllowlistedRecipients.map(r => r.email).join(', ')}`);
      signals.push({
        type: 'recipient_safety',
        value: 'non_allowlisted',
        confidence: 0.8,
        source: 'recipient_allowlist'
      });
    }

    // Check daily send limits
    const todaysSends = await this.getTodaysAutoSendCount();
    if (todaysSends >= userSettings.maxDailyAutoSends) {
      blockedReasons.push(`Daily auto-send limit reached (${todaysSends}/${userSettings.maxDailyAutoSends})`);
      signals.push({
        type: 'rate_limit',
        value: 'daily_limit_exceeded',
        confidence: 1.0,
        source: 'send_tracker'
      });
    }

    // Analyze email content for safety
    const contentAnalysis = this.analyzeEmailContent(request);
    signals.push(...contentAnalysis.signals);
    warnings.push(...contentAnalysis.warnings);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(signals, recipientChecks);

    // Make decision
    const decision = this.makeEmailDecision(
      confidence,
      blockedReasons.length === 0,
      newRecipients.length === 0,
      nonAllowlistedRecipients.length === 0,
      userSettings.autoSendEnabled
    );

    const result: EmailGuardrailCheck = {
      canAutoSend: decision === 'auto-send',
      canDraft: decision !== 'blocked',
      requiresConfirmation: decision === 'confirmation-required',
      blockedReasons,
      warnings,
      confidence,
      decision
    };

    // Record decision trace
    const traceId = decisionTraceService.addTrace({
      feature: 'email_composition',
      signals,
      confidence,
      decision: decision,
      action: result.canAutoSend ? 'auto_send' : result.canDraft ? 'create_draft' : 'block',
      undoable: true,
      metadata: {
        recipients: request.recipients,
        subject: request.subject,
        recipientCount: request.recipients.length,
        newRecipientCount: newRecipients.length,
        nonAllowlistedCount: nonAllowlistedRecipients.length
      }
    });

    return result;
  }

  /**
   * Check individual recipient safety
   */
  private async checkRecipient(email: string): Promise<RecipientStatus> {
    return await recipientAllowlistService.checkRecipientStatus(email);
  }

  /**
   * Analyze email content for potential issues
   */
  private analyzeEmailContent(request: EmailComposeRequest): { signals: DecisionSignal[], warnings: string[] } {
    const signals: DecisionSignal[] = [];
    const warnings: string[] = [];

    // Check for sensitive content patterns
    const sensitivePatterns = [
      /password/i,
      /credit card/i,
      /ssn|social security/i,
      /bank account/i,
      /confidential/i,
      /urgent.*action.*required/i,
      /click.*here.*immediately/i
    ];

    const content = `${request.subject} ${request.body}`.toLowerCase();
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        warnings.push('Email contains potentially sensitive content');
        signals.push({
          type: 'content_analysis',
          value: 'sensitive_content_detected',
          confidence: 0.7,
          source: 'content_scanner'
        });
        break;
      }
    }

    // Check email length and complexity
    if (request.body.length > 5000) {
      warnings.push('Very long email - consider breaking into smaller messages');
      signals.push({
        type: 'content_analysis',
        value: 'very_long_content',
        confidence: 0.6,
        source: 'content_scanner'
      });
    }

    // Check for empty or very short content
    if (request.body.trim().length < 10) {
      warnings.push('Very short email content');
      signals.push({
        type: 'content_analysis',
        value: 'minimal_content',
        confidence: 0.8,
        source: 'content_scanner'
      });
    }

    return { signals, warnings };
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(signals: DecisionSignal[], recipientChecks: RecipientStatus[]): number {
    let confidence = 0.5; // Base confidence

    // Positive factors
    const allowlistedCount = recipientChecks.filter(r => r.isAllowlisted).length;
    const totalRecipients = recipientChecks.length;
    
    if (totalRecipients > 0) {
      const allowlistedRatio = allowlistedCount / totalRecipients;
      confidence += allowlistedRatio * 0.3;
    }

    // Average trust score
    const avgTrustScore = recipientChecks.reduce((sum, r) => sum + r.trustScore, 0) / recipientChecks.length;
    confidence += avgTrustScore * 0.2;

    // Negative factors
    const hasNewRecipients = recipientChecks.some(r => r.isFirstTime);
    if (hasNewRecipients) {
      confidence -= 0.4;
    }

    const hasSensitiveContent = signals.some(s => s.type === 'content_analysis' && s.value.includes('sensitive'));
    if (hasSensitiveContent) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Make final email decision based on all factors
   */
  private makeEmailDecision(
    confidence: number,
    noBlockingIssues: boolean,
    noNewRecipients: boolean,
    allRecipientsAllowlisted: boolean,
    autoSendEnabled: boolean
  ): 'auto-send' | 'draft-only' | 'confirmation-required' | 'blocked' {
    
    if (!noBlockingIssues) {
      return 'blocked';
    }

    if (!autoSendEnabled) {
      return 'draft-only';
    }

    if (!noNewRecipients) {
      return 'draft-only'; // Never auto-send to new recipients
    }

    if (confidence >= this.HIGH_CONFIDENCE_THRESHOLD && allRecipientsAllowlisted) {
      return 'auto-send';
    }

    if (confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
      return 'confirmation-required';
    }

    return 'draft-only';
  }

  /**
   * Get today's auto-send count for rate limiting
   */
  private async getTodaysAutoSendCount(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    
    // This would typically query a send_log table
    // For now, return a mock value
    return 0;
  }

  /**
   * Record email send for rate limiting
   */
  async recordEmailSend(recipients: string[], decision: string): Promise<void> {
    // Record in send log for rate limiting and audit
    // Implementation would insert into send_log table
    console.log('Email send recorded:', { recipients, decision, timestamp: new Date().toISOString() });
  }
}

export const emailGuardrailsService = new EmailGuardrailsService();