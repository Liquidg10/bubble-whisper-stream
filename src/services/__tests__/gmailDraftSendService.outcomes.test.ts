import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkScopePermissions: vi.fn(),
  evaluateEmailSafety: vi.fn(),
  recordEmailSend: vi.fn(),
  recordInteraction: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('../oauthService', () => ({
  oauthService: {
    checkScopePermissions: mocks.checkScopePermissions
  },
  SCOPES: {
    GMAIL: {
      MODIFY: 'https://www.googleapis.com/auth/gmail.modify'
    }
  }
}));

vi.mock('../emailGuardrailsService', () => ({
  emailGuardrailsService: {
    evaluateEmailSafety: mocks.evaluateEmailSafety,
    recordEmailSend: mocks.recordEmailSend
  }
}));

vi.mock('../recipientAllowlistService', () => ({
  recipientAllowlistService: {
    recordInteraction: mocks.recordInteraction
  }
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke
    }
  }
}));

import {
  formatEmailForGmail,
  gmailDraftSendService,
  type EmailDraft
} from '../gmailDraftSendService';
import {
  decisionTraceService,
  getDecisionUserAction,
  isAcceptanceTelemetryTrace
} from '../decisionTraceService';

const draft: EmailDraft = {
  recipients: ['recipient@example.com'],
  subject: 'Provider outcome test',
  body: 'A test message'
};

const permissiveGuardrail = {
  canAutoSend: true,
  canDraft: true,
  requiresConfirmation: false,
  blockedReasons: [],
  warnings: [],
  confidence: 0.95,
  decision: 'auto-send' as const
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mockMutationSuccess(id: string, replayed = false) {
  mocks.invoke.mockImplementation((_: string, options: { body: { idempotencyKey: string } }) =>
    Promise.resolve({
      data: {
        id,
        idempotency: {
          key: options.body.idempotencyKey,
          status: 'succeeded',
          replayed
        }
      },
      error: null
    })
  );
}

describe('gmailDraftSendService observed outcomes', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn(async (_name: string, work: () => Promise<unknown>) => work())
      }
    });
    localStorage.clear();
    decisionTraceService.clear();
    vi.clearAllMocks();
    mocks.checkScopePermissions.mockResolvedValue({ hasPermission: true, missingScopes: [] });
    mocks.evaluateEmailSafety.mockResolvedValue(permissiveGuardrail);
    mocks.recordEmailSend.mockResolvedValue(undefined);
    mocks.recordInteraction.mockResolvedValue(undefined);
  });

  it('persists a provider draft before recording acceptance and never promotes draft intent to send', async () => {
    mockMutationSuccess('provider-draft-1');

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'draft',
      autoSendEnabled: true,
      surface: 'email-compose-modal',
      recordUserAcceptance: true
    });

    expect(result).toMatchObject({
      success: true,
      traceId: expect.any(String),
      draftId: 'provider-draft-1',
      decision: 'drafted',
      requestedOperation: 'draft',
      providerOperation: 'create_draft',
      undoAvailable: true
    });
    expect(mocks.invoke).toHaveBeenCalledWith('gmail-compose', {
      body: expect.objectContaining({ operation: 'create_draft' })
    });

    const trace = decisionTraceService.getTrace(result.traceId!);
    expect(trace?.undoable).toBe(true);
    expect(trace?.metadata.executionStatus).toBe('succeeded');
    expect(trace?.metadata.executionReference).toBe('provider-draft-1');
    expect(getDecisionUserAction(trace!)).toBe('accept');
    expect(trace?.metadata.telemetryKind).toBe('operational');
    expect(isAcceptanceTelemetryTrace(trace!)).toBe(false);
  });

  it('records a provider send as accepted but never advertises sent-mail undo', async () => {
    mockMutationSuccess('provider-message-1');

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      surface: 'email-compose-modal',
      recordUserAcceptance: true
    });

    expect(result).toMatchObject({
      success: true,
      messageId: 'provider-message-1',
      decision: 'sent',
      requestedOperation: 'send',
      providerOperation: 'send',
      undoAvailable: false
    });
    expect(mocks.invoke).toHaveBeenCalledWith('gmail-compose', {
      body: expect.objectContaining({ operation: 'send' })
    });
    const trace = decisionTraceService.getTrace(result.traceId!);
    expect(trace?.undoable).toBe(false);
    expect(getDecisionUserAction(trace!)).toBe('accept');
  });

  it('records failed execution without inventing a provider artifact or acceptance', async () => {
    mocks.invoke.mockImplementation((_: string, options: { body: { idempotencyKey: string } }) =>
      Promise.resolve({
        data: {
          error: 'Gmail unavailable',
          code: 'GMAIL_PROVIDER_REJECTED',
          idempotency: {
            key: options.body.idempotencyKey,
            status: 'failed',
            replayed: false
          }
        },
        error: null
      })
    );

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      surface: 'email-compose-modal',
      recordUserAcceptance: true
    });

    expect(result).toMatchObject({
      success: false,
      decision: 'blocked',
      error: 'Gmail unavailable',
      undoAvailable: false
    });
    expect(result.messageId).toBeUndefined();
    expect(result.draftId).toBeUndefined();
    const trace = decisionTraceService.getTrace(result.traceId!);
    expect(trace?.metadata.executionStatus).toBe('failed');
    expect(getDecisionUserAction(trace!)).toBeNull();
  });

  it('leaves a guardrail downgrade unresolved until the user explicitly accepts the provider draft', async () => {
    mocks.evaluateEmailSafety.mockResolvedValue({
      ...permissiveGuardrail,
      canAutoSend: false,
      requiresConfirmation: true,
      confidence: 0.7,
      decision: 'draft-only'
    });
    mockMutationSuccess('provider-draft-2');

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      surface: 'email-compose-modal',
      recordUserAcceptance: true
    });

    expect(result).toMatchObject({
      success: true,
      decision: 'drafted',
      requestedOperation: 'send',
      providerOperation: 'create_draft',
      undoAvailable: true
    });
    expect(mocks.invoke).toHaveBeenCalledWith('gmail-compose', {
      body: expect.objectContaining({ operation: 'create_draft' })
    });
    const trace = decisionTraceService.getTrace(result.traceId!)!;
    expect(trace.metadata.executionStatus).toBe('succeeded');
    expect(trace.metadata.executionStatusSource).toBe('gmail-provider-draft');
    expect(getDecisionUserAction(trace)).toBeNull();
  });

  it('coalesces identical concurrent requests into one provider call and one trace', async () => {
    const provider = deferred<string>();
    mocks.invoke.mockImplementation(async (
      _: string,
      options: { body: { idempotencyKey: string } }
    ) => ({
      data: {
        id: await provider.promise,
        idempotency: {
          key: options.body.idempotencyKey,
          status: 'succeeded',
          replayed: false
        }
      },
      error: null
    }));

    const first = gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      surface: 'email-compose-modal',
      recordUserAcceptance: true
    });
    const second = gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      surface: 'email-compose-modal',
      recordUserAcceptance: true
    });

    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    provider.resolve('provider-message-2');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.traceId).toBe(secondResult.traceId);
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(decisionTraceService.getTraces()).toHaveLength(1);
    expect(decisionTraceService.getTrace(firstResult.traceId!)?.metadata.outcomes).toHaveLength(2);
  });

  it('does not fabricate acceptance for a successful service-initiated provider write', async () => {
    const traceId = decisionTraceService.addTrace({
      feature: 'email',
      signals: [],
      confidenceThreshold: 0.85,
      finalConfidence: 0.9,
      decision: 'auto-write',
      action: 'Email precision gate',
      becauseText: 'Test',
      metadata: { telemetryKind: 'acceptance', outcomeFeature: 'email' },
      undoable: false
    });
    mockMutationSuccess('provider-message-auto');

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      traceId,
      surface: 'enhanced-gmail-compose'
    });

    expect(result.success).toBe(true);
    const trace = decisionTraceService.getTrace(traceId)!;
    expect(trace.metadata.executionStatus).toBe('succeeded');
    expect(getDecisionUserAction(trace)).toBeNull();
  });

  it('does not report a duplicate-send failure when post-send learning rejects', async () => {
    mockMutationSuccess('provider-message-3');
    mocks.recordInteraction.mockRejectedValue(new Error('learning store unavailable'));
    mocks.recordEmailSend.mockRejectedValue(new Error('guardrail history unavailable'));

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('provider-message-3');
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });

  it('records undo only after the provider draft delete succeeds', async () => {
    mocks.invoke
      .mockImplementationOnce((_: string, options: { body: { idempotencyKey: string } }) =>
        Promise.resolve({
          data: {
            id: 'provider-draft-3',
            idempotency: {
              key: options.body.idempotencyKey,
              status: 'succeeded',
              replayed: false
            }
          },
          error: null
        })
      )
      .mockResolvedValueOnce({ data: { success: true }, error: null });

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'draft'
    });
    expect(await gmailDraftSendService.undoComposedDraft(
      'account-1',
      result.draftId!,
      result.traceId!
    )).toBe(true);

    expect(mocks.invoke).toHaveBeenLastCalledWith('gmail-compose', {
      body: {
        accountId: 'account-1',
        operation: 'delete_draft',
        draftId: 'provider-draft-3'
      }
    });
    const trace = decisionTraceService.getTrace(result.traceId!);
    expect(getDecisionUserAction(trace!)).toBe('undo');
    expect(trace?.metadata.executionStatus).toBe('reverted');
  });

  it('retains one durable key across an ambiguous response and resolves it without a new key', async () => {
    mocks.invoke
      .mockImplementationOnce((_: string, options: { body: { idempotencyKey: string } }) =>
        Promise.resolve({
          data: {
            error: 'Provider response is ambiguous',
            idempotency: {
              key: options.body.idempotencyKey,
              status: 'pending',
              replayed: false
            }
          },
          error: null
        })
      )
      .mockImplementationOnce((_: string, options: { body: { idempotencyKey: string } }) =>
        Promise.resolve({
          data: {
            id: 'provider-message-replayed',
            idempotency: {
              key: options.body.idempotencyKey,
              status: 'succeeded',
              replayed: true
            }
          },
          error: null
        })
      );

    const first = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      recordUserAcceptance: true
    });
    expect(first).toMatchObject({
      success: false,
      idempotencyStatus: 'pending',
      idempotencyKey: expect.any(String)
    });
    expect(decisionTraceService.getTrace(first.traceId!)?.metadata.executionStatus).toBe('pending');

    const retry = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true,
      recordUserAcceptance: true,
      traceId: first.traceId
    });
    expect(retry).toMatchObject({
      success: true,
      messageId: 'provider-message-replayed',
      replayed: true,
      idempotencyStatus: 'succeeded'
    });
    const firstKey = mocks.invoke.mock.calls[0][1].body.idempotencyKey;
    const retryKey = mocks.invoke.mock.calls[1][1].body.idempotencyKey;
    expect(retryKey).toBe(firstKey);
  });

  it('keeps a confirmed provider success when local key cleanup fails', async () => {
    let setItemSpy: ReturnType<typeof vi.spyOn> | undefined;
    mocks.invoke.mockImplementation((_: string, options: { body: { idempotencyKey: string } }) => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage quota exhausted');
      });
      return Promise.resolve({
        data: {
          id: 'provider-message-cleanup-failed',
          idempotency: {
            key: options.body.idempotencyKey,
            status: 'succeeded',
            replayed: false
          }
        },
        error: null
      });
    });

    try {
      const result = await gmailDraftSendService.composeEmail('account-1', draft, {
        requestedOperation: 'send',
        autoSendEnabled: true
      });
      expect(result).toMatchObject({
        success: true,
        messageId: 'provider-message-cleanup-failed',
        idempotencyStatus: 'succeeded'
      });
    } finally {
      setItemSpy?.mockRestore();
    }
  });

  it('fails closed without a cross-tab storage lock', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined
    });

    const result = await gmailDraftSendService.composeEmail('account-1', draft, {
      requestedOperation: 'send',
      autoSendEnabled: true
    });

    expect(result).toMatchObject({
      success: false,
      decision: 'blocked',
      error: 'Gmail action blocked: cross-tab idempotency locking is unavailable'
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('rejects RFC-822 header injection before invoking Gmail', async () => {
    const poisonedSubject = await gmailDraftSendService.composeEmail('account-1', {
      ...draft,
      subject: 'Hello\r\nBcc: attacker@example.com'
    }, { requestedOperation: 'draft' });
    const poisonedRecipient = await gmailDraftSendService.composeEmail('account-1', {
      ...draft,
      recipients: ['victim@example.com\r\nBcc: attacker@example.com']
    }, { requestedOperation: 'draft' });

    expect(poisonedSubject).toMatchObject({ success: false, decision: 'blocked' });
    expect(poisonedRecipient).toMatchObject({ success: false, decision: 'blocked' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('encodes Unicode subjects and bodies as UTF-8 Gmail raw messages', () => {
    const formatted = formatEmailForGmail({
      ...draft,
      subject: 'Résumé ✓',
      body: 'Olá — café'
    });
    const padded = formatted.raw.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(formatted.raw.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);

    expect(decoded).toContain('Subject: =?UTF-8?B?');
    expect(decoded).toContain('Content-Type: text/plain; charset=utf-8');
    expect(decoded).toContain('\r\n\r\nOlá — café');
  });
});
