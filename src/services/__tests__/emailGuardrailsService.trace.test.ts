import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailGuardrailsService } from '../emailGuardrailsService';
import { decisionTraceService } from '../decisionTraceService';
import { recipientAllowlistService } from '../recipientAllowlistService';

vi.mock('../recipientAllowlistService', () => ({
  recipientAllowlistService: { checkRecipientStatus: vi.fn() }
}));

describe('emailGuardrailsService trace vocabulary', () => {
  beforeEach(() => {
    decisionTraceService.clear();
    vi.mocked(recipientAllowlistService.checkRecipientStatus).mockReset();
  });

  it('records confirmation-required as draft-ask instead of skip', async () => {
    vi.mocked(recipientAllowlistService.checkRecipientStatus).mockResolvedValue({
      email: 'known@example.com',
      isAllowlisted: false,
      isFirstTime: false,
      trustScore: 0.9,
      interactionCount: 4
    });

    const result = await emailGuardrailsService.evaluateEmailSafety({
      recipients: ['known@example.com'],
      subject: 'A sufficiently clear subject',
      body: 'A sufficiently clear message body.',
      userSettings: {
        autoSendEnabled: true,
        maxDailyAutoSends: 20,
        requireConfirmationForNewRecipients: true
      }
    });

    expect(result.decision).toBe('confirmation-required');
    expect(decisionTraceService.getTraces()[0]?.decision).toBe('draft-ask');
  });
});
