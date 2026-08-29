import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireGmailMutationIdentity,
  GMAIL_TERMINAL_REPLAY_RETENTION_MS,
  settleGmailMutationIdentity
} from '../gmailComposeIdempotency';

const mutation = {
  accountId: 'account-1',
  operation: 'send' as const,
  payload: {
    message: {
      raw: 'private-message-payload'
    }
  }
};

describe('Gmail browser idempotency state', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn(async (_name: string, work: () => Promise<unknown>) => work())
      }
    });
    localStorage.clear();
  });

  it('stores only a fingerprint and reuses one key across reload-style acquisition', async () => {
    const first = await acquireGmailMutationIdentity(mutation);
    const retry = await acquireGmailMutationIdentity(mutation);

    expect(retry.key).toBe(first.key);
    const stored = localStorage.getItem('mind-manual:gmail-compose-idempotency:v1');
    expect(stored).not.toContain('private-message-payload');
  });

  it('retains a succeeded key when another request acquired it before completion', async () => {
    const first = await acquireGmailMutationIdentity(mutation);
    const concurrent = await acquireGmailMutationIdentity(mutation);
    expect(concurrent.key).toBe(first.key);

    expect(await settleGmailMutationIdentity(first, 'succeeded')).toBe(true);
    const ambiguousTabRetry = await acquireGmailMutationIdentity(mutation);
    expect(ambiguousTabRetry.key).toBe(first.key);
  });

  it('allows a later explicit identical action after the terminal replay window', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-29T00:00:00Z'));
      const first = await acquireGmailMutationIdentity(mutation);
      await acquireGmailMutationIdentity(mutation);
      expect(await settleGmailMutationIdentity(first, 'succeeded')).toBe(true);

      vi.setSystemTime(Date.now() + GMAIL_TERMINAL_REPLAY_RETENTION_MS);
      expect((await acquireGmailMutationIdentity(mutation)).key).toBe(first.key);

      vi.setSystemTime(Date.now() + 1);
      expect((await acquireGmailMutationIdentity(mutation)).key).not.toBe(first.key);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases a single-consumer terminal key for a later explicit action', async () => {
    const first = await acquireGmailMutationIdentity(mutation);
    expect(await settleGmailMutationIdentity(first, 'succeeded')).toBe(true);

    const laterAction = await acquireGmailMutationIdentity(mutation);
    expect(laterAction.key).not.toBe(first.key);
  });
});
