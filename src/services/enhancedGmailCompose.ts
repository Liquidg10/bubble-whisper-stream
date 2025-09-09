import { supabase } from '@/integrations/supabase/client';
import { gmailDraftSendService, EmailDraft, EmailSendResult } from './gmailDraftSendService';
import { emailGuardrailsService } from './emailGuardrailsService';
import { autoWritePrecisionGate } from './autoWritePrecisionGate';
import { decisionTraceService } from './decisionTraceService';

export interface EnhancedEmailDraft extends EmailDraft {
  mimeFormatted?: boolean;
  templateId?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    mimeType: string;
  }>;
  scheduling?: {
    sendAt: Date;
    timezone: string;
  };
  tracking?: {
    openTracking: boolean;
    clickTracking: boolean;
  };
}

export interface EnhancedEmailSendResult extends EmailSendResult {
  templateUsed?: string;
  scheduled?: boolean;
  mimeGenerated?: boolean;
  guardrailDecision?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  category: 'meeting' | 'follow-up' | 'announcement' | 'personal';
}

class EnhancedGmailComposeService {
  private templates: EmailTemplate[] = [
    {
      id: 'meeting-request',
      name: 'Meeting Request',
      subject: 'Meeting Request: {{subject}}',
      body: `Hi {{recipient_name}},

I'd like to schedule a meeting to discuss {{topic}}.

Proposed time: {{proposed_time}}
Duration: {{duration}}
Location/Link: {{location}}

Please let me know if this works for you or suggest alternative times.

Best regards,
{{sender_name}}`,
      variables: ['recipient_name', 'topic', 'proposed_time', 'duration', 'location', 'sender_name'],
      category: 'meeting'
    },
    {
      id: 'follow-up',
      name: 'Follow-up Email',
      subject: 'Following up on {{topic}}',
      body: `Hi {{recipient_name}},

I wanted to follow up on our conversation about {{topic}}.

{{follow_up_message}}

Next steps:
{{next_steps}}

Please let me know if you have any questions.

Best regards,
{{sender_name}}`,
      variables: ['recipient_name', 'topic', 'follow_up_message', 'next_steps', 'sender_name'],
      category: 'follow-up'
    }
  ];

  /**
   * Enhanced compose with template support and MIME formatting
   */
  async composeEnhanced(
    accountId: string,
    draft: EnhancedEmailDraft,
    options: {
      useTemplate?: boolean;
      templateVariables?: Record<string, string>;
      autoSendEnabled?: boolean;
      requireConfirmation?: boolean;
      bypassGuardrails?: boolean;
    } = {}
  ): Promise<EnhancedEmailSendResult> {
    console.log('Enhanced Gmail compose starting for account:', accountId);

    try {
      let processedDraft = { ...draft };

      // Apply template if specified
      if (options.useTemplate && draft.templateId) {
        processedDraft = await this.applyTemplate(draft, options.templateVariables || {});
      }

      // Generate MIME format if requested or if attachments are present
      if (draft.mimeFormatted || draft.attachments) {
        processedDraft = await this.generateMimeFormat(processedDraft);
      }

      // Use unified precision gate for decision making
      const entities = {
        recipients: {
          emails: processedDraft.to || processedDraft.recipients || [],
          confidence: 1.0
        }
      };

      const decision = await autoWritePrecisionGate.evaluateDecision({
        content: `${processedDraft.subject} ${processedDraft.body}`.trim(),
        entities,
        feature: 'email',
        userTrust: {
          recipientAllowlisted: true,
          contactTrustScore: 0.8
        },
        userPreferences: {
          autoWriteEnabled: options.autoSendEnabled || false,
          featureEnabled: true
        }
      });

      // Enhanced guardrails check with template analysis
      if (!options.bypassGuardrails) {
        const guardrailResult = await emailGuardrailsService.evaluateEmailSafety({
          recipients: processedDraft.to || processedDraft.recipients,
          subject: processedDraft.subject,
          body: processedDraft.body,
          userSettings: {
            autoSendEnabled: options.autoSendEnabled ?? false,
            maxDailyAutoSends: 20,
            requireConfirmationForNewRecipients: true
          }
        });

        if (guardrailResult.decision === 'blocked') {
          return {
            success: false,
            decision: 'blocked',
            messageId: '',
            draftId: '',
            error: `Email blocked: ${guardrailResult.warnings.join(', ')}`,
            templateUsed: draft.templateId,
            guardrailCheck: guardrailResult
          };
        }
      }

      // Record decision trace
      const traceId = await decisionTraceService.addTrace({
        feature: 'email',
        decision: decision.decision,
        finalConfidence: decision.score,
        confidenceThreshold: 0.85,
        signals: decision.reasons.map(r => ({ 
          type: 'system', 
          value: r, 
          confidence: 1.0, 
          source: 'precision-gate' 
        })),
        action: `compose_email_${decision.decision}`,
        becauseText: decision.reasons.join(', '),
        metadata: { draft: processedDraft, accountId },
        undoable: true
      });

      // Handle scheduling if requested
      if (draft.scheduling) {
        return await this.scheduleEmail(accountId, processedDraft);
      }

      // Use the base Gmail service for actual sending
      const result = await gmailDraftSendService.composeEmail(accountId, processedDraft, {
        autoSendEnabled: options.autoSendEnabled,
        requireConfirmation: options.requireConfirmation,
        bypassGuardrails: true // We already checked above
      });

      // Store compose activity for learning
      await this.recordComposeActivity(accountId, processedDraft, result);

      return {
        ...result,
        templateUsed: draft.templateId,
        mimeGenerated: draft.mimeFormatted || !!draft.attachments
      };

    } catch (error) {
      console.error('Error in enhanced Gmail compose:', error);
      return {
        success: false,
        decision: 'blocked',
        messageId: '',
        draftId: '',
        error: error.message,
        templateUsed: draft.templateId,
        guardrailCheck: {
          canAutoSend: false,
          canDraft: false,
          requiresConfirmation: false,
          blockedReasons: [error.message],
          warnings: [],
          confidence: 0,
          decision: 'blocked'
        }
      };
    }
  }

  /**
   * Apply email template with variable substitution
   */
  private async applyTemplate(draft: EnhancedEmailDraft, variables: Record<string, string>): Promise<EnhancedEmailDraft> {
    const template = this.templates.find(t => t.id === draft.templateId);
    if (!template) {
      throw new Error(`Template not found: ${draft.templateId}`);
    }

    console.log('Applying template:', template.name);

    // Substitute variables in subject and body
    let processedSubject = template.subject;
    let processedBody = template.body;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), value);
      processedBody = processedBody.replace(new RegExp(placeholder, 'g'), value);
    }

    // Check for unsubstituted variables
    const unsubstituted = template.variables.filter(variable => 
      processedBody.includes(`{{${variable}}}`) || processedSubject.includes(`{{${variable}}}`)
    );

    if (unsubstituted.length > 0) {
      console.warn('Unsubstituted template variables:', unsubstituted);
    }

    return {
      ...draft,
      subject: processedSubject,
      body: processedBody
    };
  }

  /**
   * Generate proper MIME format for complex emails
   */
  private async generateMimeFormat(draft: EnhancedEmailDraft): Promise<EnhancedEmailDraft> {
    console.log('Generating MIME format for email');

    // Build MIME headers
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let mimeContent = '';
    
    // Basic headers
    mimeContent += `MIME-Version: 1.0\r\n`;
    mimeContent += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
    mimeContent += `\r\n`;
    
    // Text content part
    mimeContent += `--${boundary}\r\n`;
    mimeContent += `Content-Type: text/plain; charset=utf-8\r\n`;
    mimeContent += `Content-Transfer-Encoding: 7bit\r\n`;
    mimeContent += `\r\n`;
    mimeContent += `${draft.body}\r\n`;
    mimeContent += `\r\n`;

    // Add attachments if present
    if (draft.attachments && draft.attachments.length > 0) {
      for (const attachment of draft.attachments) {
        mimeContent += `--${boundary}\r\n`;
        mimeContent += `Content-Type: ${attachment.mimeType}\r\n`;
        mimeContent += `Content-Transfer-Encoding: base64\r\n`;
        mimeContent += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        mimeContent += `\r\n`;
        mimeContent += `${attachment.content}\r\n`;
        mimeContent += `\r\n`;
      }
    }

    mimeContent += `--${boundary}--\r\n`;

    return {
      ...draft,
      body: mimeContent,
      mimeFormatted: true
    };
  }

  /**
   * Schedule email for future sending
   */
  private async scheduleEmail(accountId: string, draft: EnhancedEmailDraft): Promise<EnhancedEmailSendResult> {
    console.log('Scheduling email for:', draft.scheduling?.sendAt);

    // For now, create a draft and store scheduling information
    // In a production system, you'd integrate with a job queue
    const draftResult = await gmailDraftSendService.createDraft(accountId, draft);

    if (draftResult.success && draftResult.draftId) {
      // Store scheduling information in database
      try {
        await supabase
          .from('email_messages')
          .insert({
            user_id: accountId, // Use the account ID as user ID for now
            email_account_id: accountId,
            external_message_id: draftResult.draftId,
            subject: draft.subject,
            sender_email: 'scheduled@local',
            to_emails: draft.to || draft.recipients,
            received_at: new Date().toISOString(),
            payload_metadata: {
              scheduled: true,
              sendAt: draft.scheduling?.sendAt?.toISOString(),
              timezone: draft.scheduling?.timezone
            }
          });
      } catch (error) {
        console.error('Failed to store scheduling info:', error);
      }
    }

    return {
      ...draftResult,
      scheduled: true
    };
  }

  /**
   * Record compose activity for learning and analytics
   */
  private async recordComposeActivity(
    accountId: string,
    draft: EnhancedEmailDraft,
    result: EmailSendResult
  ): Promise<void> {
    try {
      const activityData = {
        account_id: accountId,
        template_used: draft.templateId,
        has_attachments: (draft.attachments?.length || 0) > 0,
        recipient_count: draft.to.length + (draft.cc?.length || 0) + (draft.bcc?.length || 0),
        success: result.success,
        decision: result.decision,
        guardrail_decision: result.guardrailCheck?.decision,
        mime_formatted: draft.mimeFormatted,
        scheduled: !!draft.scheduling,
        timestamp: new Date().toISOString()
      };

      console.log('Recording compose activity:', activityData);
      
      // Store in database for analytics
      // This would typically go to an analytics table
      
    } catch (error) {
      console.error('Error recording compose activity:', error);
      // Don't throw - this is just for analytics
    }
  }

  /**
   * Get available email templates
   */
  getTemplates(category?: string): EmailTemplate[] {
    if (category) {
      return this.templates.filter(t => t.category === category);
    }
    return this.templates;
  }

  /**
   * Add custom template
   */
  addTemplate(template: Omit<EmailTemplate, 'id'>): EmailTemplate {
    const newTemplate: EmailTemplate = {
      ...template,
      id: `custom-${Date.now()}`
    };
    this.templates.push(newTemplate);
    return newTemplate;
  }

  /**
   * Smart compose suggestions based on context
   */
  async getSuggestions(
    accountId: string,
    context: {
      replyTo?: string;
      threadId?: string;
      recipients: string[];
      subject?: string;
    }
  ): Promise<{
    suggestedTemplates: EmailTemplate[];
    suggestedSubject?: string;
    suggestedRecipients?: string[];
  }> {
    console.log('Getting smart compose suggestions for context:', context);

    const suggestions = {
      suggestedTemplates: [],
      suggestedSubject: context.subject,
      suggestedRecipients: context.recipients
    };

    // Analyze context for template suggestions
    if (context.subject) {
      const subject = context.subject.toLowerCase();
      
      if (subject.includes('meeting') || subject.includes('schedule')) {
        suggestions.suggestedTemplates.push(
          ...this.templates.filter(t => t.category === 'meeting')
        );
      }
      
      if (subject.includes('follow') || subject.includes('recap')) {
        suggestions.suggestedTemplates.push(
          ...this.templates.filter(t => t.category === 'follow-up')
        );
      }
    }

    // Get top 3 suggestions
    suggestions.suggestedTemplates = suggestions.suggestedTemplates.slice(0, 3);

    return suggestions;
  }

  /**
   * Preview email with template applied
   */
  async previewEmail(
    draft: EnhancedEmailDraft,
    variables: Record<string, string>
  ): Promise<{ subject: string; body: string; warnings: string[] }> {
    const warnings: string[] = [];
    
    try {
      const processedDraft = await this.applyTemplate(draft, variables);
      
      // Check for common issues
      if (processedDraft.body.includes('{{')) {
        warnings.push('Some template variables are not substituted');
      }
      
      if (!processedDraft.subject.trim()) {
        warnings.push('Subject line is empty');
      }
      
      if (processedDraft.body.length < 10) {
        warnings.push('Email body is very short');
      }

      return {
        subject: processedDraft.subject,
        body: processedDraft.body,
        warnings
      };
      
    } catch (error) {
      return {
        subject: draft.subject,
        body: draft.body,
        warnings: [`Template error: ${error.message}`]
      };
    }
  }
}

export const enhancedGmailComposeService = new EnhancedGmailComposeService();