import { beforeEach, describe, expect, it, vi } from 'vitest';

const { eq, maybeSingle, query, select } = vi.hoisted(() => {
  const queryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn()
  };
  queryBuilder.select.mockReturnValue(queryBuilder);
  queryBuilder.eq.mockReturnValue(queryBuilder);
  return {
    eq: queryBuilder.eq,
    maybeSingle: queryBuilder.maybeSingle,
    query: queryBuilder,
    select: queryBuilder.select
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => query) }
}));

import { userTrustService } from '../userTrustService';

describe('userTrustService calendar account receipts', () => {
  beforeEach(() => {
    localStorage.clear();
    eq.mockClear();
    select.mockClear();
    maybeSingle.mockReset();
  });

  it('resolves the canonical account id and exact stored domain allowlist', async () => {
    userTrustService.saveTrustPreferences({
      autoAllowFrequentContacts: true,
      trustThreshold: 0.7,
      maxInteractionsForTrust: 10,
      whitelistedDomains: ['EXAMPLE.COM'],
      blockedDomains: []
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: 'account-1',
        account_email: 'owner@example.com',
        account_name: 'Owner',
        calendar_id: 'primary',
        calendar_name: 'Primary',
        is_primary: true,
        sync_enabled: true
      },
      error: null
    });

    await expect(userTrustService.getCalendarTrustByAccountId('account-1'))
      .resolves.toEqual({
        calendarAccountId: 'account-1',
        calendarId: 'primary',
        calendarName: 'Primary',
        accountEmail: 'owner@example.com',
        isWhitelisted: true,
        autoWriteEnabled: true,
        trustLevel: 'high'
      });
    expect(eq).toHaveBeenCalledWith('id', 'account-1');
  });

  it('does not treat a suffix lookalike domain as allowlisted', async () => {
    userTrustService.saveTrustPreferences({
      autoAllowFrequentContacts: true,
      trustThreshold: 0.7,
      maxInteractionsForTrust: 10,
      whitelistedDomains: ['example.com'],
      blockedDomains: []
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: 'account-2',
        account_email: 'owner@notexample.com',
        account_name: 'Owner',
        calendar_id: 'primary',
        calendar_name: null,
        is_primary: false,
        sync_enabled: true
      },
      error: null
    });

    const result = await userTrustService.getCalendarTrustByAccountId('account-2');

    expect(result).toMatchObject({
      isWhitelisted: false,
      autoWriteEnabled: false,
      trustLevel: 'low'
    });
  });
});
