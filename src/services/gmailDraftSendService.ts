import { supabase } from '@/integrations/supabase/client';
import { oauthService, SCOPES } from './oauthService';
import { emailGuardrailsService, EmailComposeRequest, EmailGuardrailCheck } from './emailGuardrailsService';
import { recipientAllowlistService } from './recipientAllowlistService';
import { decisionTraceService } from './decisionTraceService';

export interface EmailDraft {
  id?: string;
  recipients: string[];
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  replyTo?: string;
  references?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  draftId?: string;
  error?: string;
  decision: 'sent' | 'drafted' | 'blocked';
  guardrailCheck: EmailGuardrailCheck;
}

class GmailDraftSendService {

  /**
   * Compose and handle email (draft or send based on guardrails)
   */
  async composeEmail(
    accountId: string,
    draft: EmailDraft,
    options: {
      autoSendEnabled?: boolean;
      requireConfirmation?: boolean;
      bypassGuardrails?: boolean;
    } = {}
  ): Promise<EmailSendResult> {
    
    try {
      // Check OAuth scope permissions
      const scopeCheck = await oauthService.checkScopePermissions(accountId, [SCOPES.GMAIL.MODIFY]);
      if (!scopeCheck.hasPermission) {
        throw new Error('Insufficient Gmail permissions. Compose scope required.');
      }

      // Prepare compose request
      const composeRequest: EmailComposeRequest = {
        recipients: draft.recipients,
        subject: draft.subject,
        body: draft.body,
        userSettings: {
          autoSendEnabled: options.autoSendEnabled ?? false,
          maxDailyAutoSends: 20,
          requireConfirmationForNewRecipients: true
        }
      };

      // Evaluate guardrails unless bypassed
      let guardrailCheck: EmailGuardrailCheck;
      if (options.bypassGuardrails) {
        guardrailCheck = {
          canAutoSend: true,
          canDraft: true,
          requiresConfirmation: false,
          blockedReasons: [],
          warnings: [],
          confidence: 1.0,
          decision: 'auto-send'
        };
      } else {
        guardrailCheck = await emailGuardrailsService.evaluateEmailSafety(composeRequest);
      }

      // Handle based on guardrail decision
      if (!guardrailCheck.canDraft) {
        return {
          success: false,
          error: guardrailCheck.blockedReasons.join('; '),
          decision: 'blocked',
          guardrailCheck
        };
      }

      if (guardrailCheck.canAutoSend && !options.requireConfirmation) {
        // Auto-send allowed
        const result = await this.sendEmail(accountId, draft);
        
        if (result.success) {
          // Record successful interactions
          await Promise.all(
            draft.recipients.map(email => 
              recipientAllowlistService.recordInteraction(email)
            )
          );
          
          await emailGuardrailsService.recordEmailSend(draft.recipients, 'auto-sent');
        }

        return {
          ...result,
          decision: 'sent',
          guardrailCheck
        };
      } else {
        // Create draft only
        const result = await this.createDraft(accountId, draft);
        
        return {
          ...result,
          decision: 'drafted',
          guardrailCheck
        };
      }

    } catch (error: any) {
      console.error('Email composition error:', error);
      
      return {
        success: false,
        error: error.message,
        decision: 'blocked',
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
   * Create Gmail draft
   */
  async createDraft(accountId: string, draft: EmailDraft): Promise<EmailSendResult> {
    try {
      const response = await supabase.functions.invoke('gmail-compose', {
        body: {
          accountId,
          operation: 'create_draft',
          draft: this.formatEmailForGmail(draft)
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return {
        success: true,
        draftId: response.data.id,
        decision: 'drafted',
        guardrailCheck: {
          canAutoSend: false,
          canDraft: true,
          requiresConfirmation: false,
          blockedReasons: [],
          warnings: [],
          confidence: 0.5,
          decision: 'draft-only'
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        decision: 'blocked',
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
   * Send email directly
   */
  async sendEmail(accountId: string, draft: EmailDraft): Promise<EmailSendResult> {
    try {
      const response = await supabase.functions.invoke('gmail-compose', {
        body: {
          accountId,
          operation: 'send',
          message: this.formatEmailForGmail(draft)
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return {
        success: true,
        messageId: response.data.id,
        decision: 'sent',
        guardrailCheck: {
          canAutoSend: true,
          canDraft: true,
          requiresConfirmation: false,
          blockedReasons: [],
          warnings: [],
          confidence: 0.9,
          decision: 'auto-send'
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        decision: 'blocked',
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
   * Send existing draft
   */
  async sendDraft(accountId: string, draftId: string): Promise<EmailSendResult> {
    try {
      const response = await supabase.functions.invoke('gmail-compose', {
        body: {
          accountId,
          operation: 'send_draft',
          draftId
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return {
        success: true,
        messageId: response.data.id,
        decision: 'sent',
        guardrailCheck: {
          canAutoSend: true,
          canDraft: true,
          requiresConfirmation: false,
          blockedReasons: [],
          warnings: [],
          confidence: 1.0,
          decision: 'auto-send'
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        decision: 'blocked',
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
   * Delete draft
   */
  async deleteDraft(accountId: string, draftId: string): Promise<boolean> {
    try {
      const response = await supabase.functions.invoke('gmail-compose', {
        body: {
          accountId,
          operation: 'delete_draft',
          draftId
        }
      });

      return !response.error;
    } catch (error) {
      console.error('Draft deletion error:', error);
      return false;
    }
  }

  /**
   * Get user's Gmail drafts
   */
  async getDrafts(accountId: string): Promise<any[]> {
    try {
      const response = await supabase.functions.invoke('gmail-compose', {
        body: {
          accountId,
          operation: 'list_drafts'
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data.drafts || [];
    } catch (error) {
      console.error('Draft listing error:', error);
      return [];
    }
  }

  /**
   * Format email for Gmail API
   */
  private formatEmailForGmail(draft: EmailDraft): any {
    const headers = [
      `To: ${draft.recipients.join(', ')}`,
      `Subject: ${draft.subject}`
    ];

    if (draft.threadId) {
      headers.push(`In-Reply-To: ${draft.inReplyTo}`);
      headers.push(`References: ${draft.references}`);
    }

    const body = draft.htmlBody || draft.body;
    const isHtml = !!draft.htmlBody;

    if (isHtml) {
      headers.push('Content-Type: text/html; charset=utf-8');
    } else {
      headers.push('Content-Type: text/plain; charset=utf-8');
    }

    const rawMessage = headers.join('\r\n') + '\r\n\r\n' + body;
    
    return {
      raw: btoa(rawMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      threadId: draft.threadId
    };
  }
}

export const gmailDraftSendService = new GmailDraftSendService();