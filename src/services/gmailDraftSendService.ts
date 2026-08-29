import { supabase } from '@/integrations/supabase/client';
import { oauthService, SCOPES } from './oauthService';
import { emailGuardrailsService, EmailComposeRequest, EmailGuardrailCheck } from './emailGuardrailsService';
import { recipientAllowlistService } from './recipientAllowlistService';
import { decisionTraceService } from './decisionTraceService';
import {
  acquireGmailMutationIdentity,
  settleGmailMutationIdentity,
  type GmailMutationIdentity,
  type GmailMutationOperation,
  type GmailMutationReceiptStatus
} from './gmailComposeIdempotency';

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

export type EmailComposeOperation = 'send' | 'draft';

export interface EmailComposeOptions {
  autoSendEnabled?: boolean;
  requireConfirmation?: boolean;
  bypassGuardrails?: boolean;
  requestedOperation?: EmailComposeOperation;
  /** Reuse an upstream canonical trace instead of creating a second one. */
  traceId?: string;
  surface?: string;
  presentedAt?: number;
  /** Record an explicit user outcome only when the caller owns a real click/confirmation. */
  recordUserAcceptance?: boolean;
  /** Stable caller-owned key. Omit to use the reload-safe browser key manager. */
  idempotencyKey?: string;
}

export interface EmailSendResult {
  success: boolean;
  traceId?: string;
  messageId?: string;
  draftId?: string;
  error?: string;
  decision: 'sent' | 'drafted' | 'blocked';
  requestedOperation?: EmailComposeOperation;
  providerOperation?: 'send' | 'create_draft';
  undoAvailable?: boolean;
  idempotencyKey?: string;
  idempotencyStatus?: GmailMutationReceiptStatus;
  replayed?: boolean;
  guardrailCheck: EmailGuardrailCheck;
}

interface GmailMutationResponse {
  id?: string;
  error?: string;
  code?: string;
  idempotency?: {
    key?: string;
    status?: GmailMutationReceiptStatus;
    replayed?: boolean;
  };
}

class GmailMutationError extends Error {
  constructor(
    message: string,
    readonly identity?: GmailMutationIdentity,
    readonly status: GmailMutationReceiptStatus = 'pending'
  ) {
    super(message);
  }
}

function assertHeaderSafe(value: string, field: string): void {
  if (/\r|\n/.test(value)) {
    throw new Error(`${field} must not contain line breaks`);
  }
}

function isValidEmailAddress(value: string): boolean {
  const forbiddenHeaderCharacters = '<>(),;:"[]\\';
  if (
    !value ||
    value.length > 254 ||
    /\s/.test(value) ||
    [...value].some(character => forbiddenHeaderCharacters.includes(character))
  ) return false;
  const atIndex = value.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === value.length - 1) return false;
  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  return localPart.length <= 64 && domain.includes('.') &&
    !domain.startsWith('.') && !domain.endsWith('.') && !domain.includes('..');
}

function validateAddresses(addresses: string[], field: string): void {
  for (const address of addresses) {
    assertHeaderSafe(address, field);
    if (!isValidEmailAddress(address)) throw new Error(`Invalid ${field} email address`);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function encodeSubject(subject: string): string {
  assertHeaderSafe(subject, 'Subject');
  return /^[\x20-\x7e\t]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(subject))}?=`;
}

/** Build a Gmail API message without permitting RFC-822 header injection. */
export function formatEmailForGmail(draft: EmailDraft): { raw: string; threadId?: string } {
  if (draft.recipients.length === 0) throw new Error('At least one recipient is required');
  validateAddresses(draft.recipients, 'recipient');
  validateAddresses(draft.cc ?? [], 'CC');
  validateAddresses(draft.bcc ?? [], 'BCC');
  if (draft.replyTo) validateAddresses([draft.replyTo], 'Reply-To');
  if (draft.inReplyTo) assertHeaderSafe(draft.inReplyTo, 'In-Reply-To');
  if (draft.references) assertHeaderSafe(draft.references, 'References');

  const isHtml = !!draft.htmlBody;
  const headers = [
    `To: ${draft.recipients.join(', ')}`,
    ...(draft.cc?.length ? [`Cc: ${draft.cc.join(', ')}`] : []),
    ...(draft.bcc?.length ? [`Bcc: ${draft.bcc.join(', ')}`] : []),
    ...(draft.replyTo ? [`Reply-To: ${draft.replyTo}`] : []),
    `Subject: ${encodeSubject(draft.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
    'Content-Transfer-Encoding: 8bit',
    ...(draft.inReplyTo ? [`In-Reply-To: ${draft.inReplyTo}`] : []),
    ...(draft.references ? [`References: ${draft.references}`] : [])
  ];
  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${draft.htmlBody || draft.body}`;
  const raw = bytesToBase64(new TextEncoder().encode(rawMessage))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return draft.threadId ? { raw, threadId: draft.threadId } : { raw };
}

class GmailDraftSendService {
  /** Coalesce identical in-flight requests so rapid duplicate clicks hit Gmail once. */
  private composeRequests = new Map<string, Promise<EmailSendResult>>();

  /**
   * Compose and handle email (draft or send based on guardrails)
   */
  async composeEmail(
    accountId: string,
    draft: EmailDraft,
    options: EmailComposeOptions = {}
  ): Promise<EmailSendResult> {
    const requestedOperation = options.requestedOperation ??
      (options.autoSendEnabled && !options.requireConfirmation ? 'send' : 'draft');
    const requestKey = JSON.stringify({
      accountId,
      draft,
      requestedOperation,
      requireConfirmation: options.requireConfirmation ?? false,
      bypassGuardrails: options.bypassGuardrails ?? false,
      traceId: options.traceId,
      recordUserAcceptance: options.recordUserAcceptance ?? false,
      idempotencyKey: options.idempotencyKey
    });
    const existingRequest = this.composeRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = this.composeEmailOnce(accountId, draft, requestedOperation, options);
    this.composeRequests.set(requestKey, request);

    try {
      return await request;
    } finally {
      if (this.composeRequests.get(requestKey) === request) {
        this.composeRequests.delete(requestKey);
      }
    }
  }

  private async composeEmailOnce(
    accountId: string,
    draft: EmailDraft,
    requestedOperation: EmailComposeOperation,
    options: EmailComposeOptions
  ): Promise<EmailSendResult> {
    const presentedAt = options.presentedAt ?? Date.now();
    const surface = options.surface || 'gmail-compose-service';
    const traceId = options.traceId || decisionTraceService.addTrace({
      feature: 'email',
      signals: [{
        type: 'email-compose-intent',
        value: requestedOperation,
        confidence: 1,
        source: surface,
        privacyLayer: 'surface'
      }],
      confidenceThreshold: 1,
      finalConfidence: 1,
      decision: requestedOperation === 'send' ? 'auto-write' : 'draft',
      action: requestedOperation === 'send' ? 'Send email' : 'Create Gmail draft',
      becauseText: options.recordUserAcceptance
        ? 'Because the user explicitly requested this email action • SURFACE'
        : 'Because the Gmail compose service requested this provider action • SURFACE',
      privacyWatermark: 'surface',
      metadata: {
        telemetryKind: 'operational',
        outcomeFeature: 'email',
        surface,
        presentedAt,
        requestedOperation,
        decisionOrigin: options.recordUserAcceptance
          ? 'user-initiated-compose'
          : 'service-initiated-compose',
        outcomeBoundary: 'exact-requested-operation-persisted-at-gmail'
      },
      // A provider draft has real delete compensation; sent mail does not.
      undoable: requestedOperation === 'draft'
    });

    let guardrailCheck: EmailGuardrailCheck = {
      canAutoSend: false,
      canDraft: false,
      requiresConfirmation: false,
      blockedReasons: [],
      warnings: [],
      confidence: 0,
      decision: 'blocked'
    };

    try {
      // Check OAuth scope permissions
      const scopeCheck = await oauthService.checkScopePermissions(accountId, [SCOPES.GMAIL.MODIFY]);
      if (!scopeCheck.hasPermission) {
        throw new Error('Insufficient Gmail permissions. Compose scope required.');
      }

      // Prepare compose request
      const composeRequest: EmailComposeRequest = {
        recipients: [...draft.recipients, ...(draft.cc ?? []), ...(draft.bcc ?? [])],
        subject: draft.subject,
        body: draft.body,
        userSettings: {
          autoSendEnabled: options.autoSendEnabled ?? false,
          maxDailyAutoSends: 20,
          requireConfirmationForNewRecipients: true
        }
      };

      // Evaluate guardrails unless bypassed
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
        const error = guardrailCheck.blockedReasons.join('; ') || 'Email blocked by guardrails';
        decisionTraceService.recordExecution(traceId, 'failed', {
          source: 'gmail-guardrails',
          reference: error
        });
        return {
          success: false,
          traceId,
          error,
          decision: 'blocked',
          requestedOperation,
          undoAvailable: false,
          guardrailCheck
        };
      }

      let result: EmailSendResult;
      if (
        requestedOperation === 'send' &&
        guardrailCheck.canAutoSend &&
        !options.requireConfirmation
      ) {
        result = await this.sendEmail(accountId, draft, options.idempotencyKey);

        if (result.success) {
          // Learning failures must not turn a successful provider send into a
          // retryable failure that could duplicate the message.
          const learningResults = await Promise.allSettled([
            ...composeRequest.recipients.map(email =>
              recipientAllowlistService.recordInteraction(email)
            ),
            emailGuardrailsService.recordEmailSend(composeRequest.recipients, 'auto-sent')
          ]);
          learningResults.forEach(learningResult => {
            if (learningResult.status === 'rejected') {
              console.warn('Email learning update failed after provider send:', learningResult.reason);
            }
          });
        }
      } else {
        // An explicit draft request can never be promoted to a send. A send
        // request that the safety gate cannot auto-send is safely downgraded.
        result = await this.createDraft(accountId, draft, options.idempotencyKey);
      }

      const providerOperation = result.success
        ? (result.decision === 'sent' ? 'send' : 'create_draft')
        : undefined;
      const artifactId = result.messageId || result.draftId;

      if (!result.success || !artifactId || !providerOperation) {
        const error = result.error || 'Gmail provider returned no artifact ID';
        const executionStatus = result.idempotencyStatus === 'pending' ? 'pending' : 'failed';
        decisionTraceService.recordExecution(traceId, executionStatus, {
          source: executionStatus === 'pending'
            ? 'gmail-provider-ambiguous'
            : 'gmail-provider',
          reference: error
        });
        return {
          ...result,
          success: false,
          traceId,
          error,
          decision: 'blocked',
          requestedOperation,
          undoAvailable: false,
          guardrailCheck
        };
      }

      decisionTraceService.recordExecution(traceId, 'succeeded', {
        source: providerOperation === 'send'
          ? 'gmail-provider-send'
          : 'gmail-provider-draft',
        reference: artifactId
      });

      const exactRequestedOperationSucceeded =
        (requestedOperation === 'send' && providerOperation === 'send') ||
        (requestedOperation === 'draft' && providerOperation === 'create_draft');
      if (exactRequestedOperationSucceeded && options.recordUserAcceptance) {
        decisionTraceService.recordUserAction(traceId, 'accept', {
          source: surface,
          artifactId,
          latencyMs: Math.max(0, Date.now() - presentedAt)
        });
      }

      return {
        ...result,
        traceId,
        requestedOperation,
        providerOperation,
        undoAvailable: providerOperation === 'create_draft',
        guardrailCheck
      };

    } catch (error: any) {
      console.error('Email composition error:', error);
      const message = error instanceof Error ? error.message : 'Unknown Gmail composition error';
      decisionTraceService.recordExecution(traceId, 'failed', {
        source: 'gmail-provider',
        reference: message
      });

      return {
        success: false,
        traceId,
        error: message,
        decision: 'blocked',
        requestedOperation,
        undoAvailable: false,
        guardrailCheck: {
          ...guardrailCheck,
          canAutoSend: false,
          canDraft: false,
          blockedReasons: guardrailCheck.blockedReasons.length > 0
            ? guardrailCheck.blockedReasons
            : [message],
          confidence: 0,
          decision: 'blocked'
        }
      };
    }
  }

  /**
   * Compensate a provider-backed draft and only then record undo completion.
   */
  async undoComposedDraft(accountId: string, draftId: string, traceId: string): Promise<boolean> {
    const deleted = await this.deleteDraft(accountId, draftId);
    if (!deleted) return false;

    decisionTraceService.recordUndoCompleted(traceId, draftId, 'gmail-provider');
    return true;
  }

  /**
   * Create Gmail draft
   */
  async createDraft(
    accountId: string,
    draft: EmailDraft,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    try {
      const formattedDraft = formatEmailForGmail(draft);
      const mutation = await this.invokeMutation({
        accountId,
        operation: 'create_draft',
        payload: { draft: formattedDraft },
        idempotencyKey
      });

      return {
        success: true,
        draftId: mutation.id,
        decision: 'drafted',
        idempotencyKey: mutation.identity.key,
        idempotencyStatus: 'succeeded',
        replayed: mutation.replayed,
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

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gmail draft failed';
      const mutationError = error instanceof GmailMutationError ? error : undefined;
      return {
        success: false,
        error: message,
        decision: 'blocked',
        idempotencyKey: mutationError?.identity?.key,
        idempotencyStatus: mutationError?.status,
        guardrailCheck: {
          canAutoSend: false,
          canDraft: false,
          requiresConfirmation: false,
          blockedReasons: [message],
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
  async sendEmail(
    accountId: string,
    draft: EmailDraft,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    try {
      const formattedMessage = formatEmailForGmail(draft);
      const mutation = await this.invokeMutation({
        accountId,
        operation: 'send',
        payload: { message: formattedMessage },
        idempotencyKey
      });

      return {
        success: true,
        messageId: mutation.id,
        decision: 'sent',
        idempotencyKey: mutation.identity.key,
        idempotencyStatus: 'succeeded',
        replayed: mutation.replayed,
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

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gmail send failed';
      const mutationError = error instanceof GmailMutationError ? error : undefined;
      return {
        success: false,
        error: message,
        decision: 'blocked',
        idempotencyKey: mutationError?.identity?.key,
        idempotencyStatus: mutationError?.status,
        guardrailCheck: {
          canAutoSend: false,
          canDraft: false,
          requiresConfirmation: false,
          blockedReasons: [message],
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
  async sendDraft(
    accountId: string,
    draftId: string,
    idempotencyKey?: string
  ): Promise<EmailSendResult> {
    try {
      const mutation = await this.invokeMutation({
        accountId,
        operation: 'send_draft',
        payload: { draftId },
        idempotencyKey
      });

      return {
        success: true,
        messageId: mutation.id,
        decision: 'sent',
        idempotencyKey: mutation.identity.key,
        idempotencyStatus: 'succeeded',
        replayed: mutation.replayed,
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

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gmail draft send failed';
      const mutationError = error instanceof GmailMutationError ? error : undefined;
      return {
        success: false,
        error: message,
        decision: 'blocked',
        idempotencyKey: mutationError?.identity?.key,
        idempotencyStatus: mutationError?.status,
        guardrailCheck: {
          canAutoSend: false,
          canDraft: false,
          requiresConfirmation: false,
          blockedReasons: [message],
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

  private async invokeMutation(input: {
    accountId: string;
    operation: GmailMutationOperation;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<{
    id: string;
    identity: GmailMutationIdentity;
    replayed: boolean;
  }> {
    const identity = await acquireGmailMutationIdentity({
      accountId: input.accountId,
      operation: input.operation,
      payload: input.payload
    }, input.idempotencyKey);

    let response: Awaited<ReturnType<typeof supabase.functions.invoke>>;
    try {
      response = await supabase.functions.invoke('gmail-compose', {
        body: {
          accountId: input.accountId,
          operation: input.operation,
          ...input.payload,
          idempotencyKey: identity.key
        }
      });
    } catch (error) {
      throw new GmailMutationError(
        error instanceof Error ? error.message : 'Gmail provider response was ambiguous',
        identity,
        'pending'
      );
    }

    if (response.error) {
      throw new GmailMutationError(response.error.message, identity, 'pending');
    }

    const data = (response.data ?? {}) as GmailMutationResponse;
    const status = data.idempotency?.status;
    if (!status || data.idempotency?.key !== identity.key) {
      throw new GmailMutationError(
        'Gmail provider response had no matching durable receipt',
        identity,
        'pending'
      );
    }

    if (status === 'pending') {
      throw new GmailMutationError(
        data.error || 'Gmail action is still in progress or ambiguous; it was not sent again',
        identity,
        status
      );
    }

    if (status === 'failed') {
      await settleGmailMutationIdentity(identity, status);
      throw new GmailMutationError(data.error || 'Gmail provider rejected the action', identity, status);
    }

    if (!data.id) {
      // The server says the provider mutation succeeded, so clearing this key
      // or using a new key could duplicate it. Keep the key and fail closed.
      throw new GmailMutationError(
        'Gmail succeeded but returned no provider artifact ID; retry was blocked',
        identity,
        'pending'
      );
    }

    await settleGmailMutationIdentity(identity, 'succeeded');
    return {
      id: data.id,
      identity,
      replayed: data.idempotency.replayed === true
    };
  }
}

export const gmailDraftSendService = new GmailDraftSendService();
