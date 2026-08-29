import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRecipientStatus: vi.fn(),
  composeEmail: vi.fn(),
  evaluateDecision: vi.fn(),
  evaluateEmailSafety: vi.fn(),
  recordInteraction: vi.fn()
}));

vi.mock('../gmailDraftSendService', () => ({
  gmailDraftSendService: { composeEmail: mocks.composeEmail }
}));

vi.mock('../autoWritePrecisionGate', () => ({
  autoWritePrecisionGate: { evaluateDecision: mocks.evaluateDecision }
}));

vi.mock('../emailGuardrailsService', () => ({
  emailGuardrailsService: { evaluateEmailSafety: mocks.evaluateEmailSafety }
}));

vi.mock('../recipientAllowlistService', () => ({
  recipientAllowlistService: {
    checkRecipientStatus: mocks.checkRecipientStatus,
    recordInteraction: mocks.recordInteraction
  }
}));

import { enhancedGmailComposeService } from '../enhancedGmailCompose';

describe('enhancedGmailCompose provider outcome truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRecipientStatus.mockResolvedValue({
      isAllowlisted: true,
      trustScore: 1
    });
    mocks.evaluateDecision.mockResolvedValue({
      decision: 'auto-write',
      traceId: 'email-trace-1'
    });
    mocks.composeEmail.mockResolvedValue({
      success: true,
      decision: 'sent',
      messageId: 'gmail-message-1',
      traceId: 'email-trace-1',
      guardrailCheck: { decision: 'auto-send' }
    });
  });

  it('does not repeat interaction learning after a provider-confirmed send', async () => {
    mocks.recordInteraction.mockRejectedValue(new Error('learning store unavailable'));

    const result = await enhancedGmailComposeService.composeEnhanced('account-1', {
      recipients: ['recipient@example.com'],
      to: ['recipient@example.com'],
      subject: 'Provider success stays successful',
      body: 'Hello'
    }, {
      autoSendEnabled: true,
      bypassGuardrails: true
    });

    expect(result).toMatchObject({
      success: true,
      decision: 'sent',
      messageId: 'gmail-message-1'
    });
    expect(mocks.composeEmail).toHaveBeenCalledOnce();
    expect(mocks.recordInteraction).not.toHaveBeenCalled();
  });
});
