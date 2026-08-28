import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
    from: mocks.from,
  },
}));

import {
  CALENDAR_OAUTH_PENDING_KEY,
  clearPendingCalendarOAuth,
  oauthService,
  readPendingCalendarOAuth,
  storePendingCalendarOAuth,
  validateGoogleOAuthUrl,
  type CanonicalCalendarAccount,
} from '@/services/oauthService';

const session = {
  access_token: 'mind-manual-user-jwt',
  user: { id: 'user-1' },
};

const connectedAccount: CanonicalCalendarAccount = {
  id: 'calendar-account-1',
  accountEmail: 'mark@example.com',
  accountName: 'Mark',
  provider: 'google',
  calendarId: 'primary',
  calendarName: 'Primary',
  syncStatus: 'complete',
  syncError: null,
  watchStatus: 'active',
  watchChannelId: 'channel-1',
  watchResourceId: 'resource-1',
  watchExpiresAt: '2099-01-01T00:00:00.000Z',
  connected: true,
};

describe('canonical Calendar OAuth service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.from.mockReset();
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    sessionStorage.clear();
  });

  it('accepts only the exact Google authorization endpoint with matching state', () => {
    const safeUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=client&state=state-1';

    expect(validateGoogleOAuthUrl(safeUrl, 'state-1')).toBe(safeUrl);
    expect(() => validateGoogleOAuthUrl(
      'https://accounts.google.com.evil.example/o/oauth2/v2/auth?state=state-1',
      'state-1',
    )).toThrow('failed the security check');
    expect(() => validateGoogleOAuthUrl(
      'https://accounts.google.com/o/oauth2/v2/auth?state=other-state',
      'state-1',
    )).toThrow('failed the security check');
  });

  it('starts Calendar OAuth with the authenticated user JWT and returns state', async () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1';
    mocks.invoke.mockResolvedValue({
      data: { success: true, authUrl, state: 'state-1' },
      error: null,
    });

    await expect(oauthService.beginScopeEscalation({
      provider: 'google',
      service: 'calendar',
      requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      reason: 'view your calendar events',
    })).resolves.toEqual({ authUrl, state: 'state-1' });

    expect(mocks.invoke).toHaveBeenCalledWith('calendar-oauth-start', {
      body: expect.objectContaining({
        service: 'calendar',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      }),
      headers: { Authorization: 'Bearer mind-manual-user-jwt' },
    });
  });

  it('stores only a short-lived state marker before same-tab navigation', async () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1';
    vi.spyOn(oauthService, 'beginScopeEscalation').mockResolvedValue({
      authUrl,
      state: 'state-1',
    });
    const navigation = { assign: vi.fn() };

    await oauthService.redirectToGoogleCalendar(
      {
        provider: 'google',
        service: 'calendar',
        reason: 'view your calendar events',
      },
      navigation,
      sessionStorage,
    );

    expect(navigation.assign).toHaveBeenCalledWith(authUrl);
    const rawMarker = sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY);
    expect(rawMarker).not.toBeNull();
    expect(Object.keys(JSON.parse(rawMarker!)).sort()).toEqual(['expiresAt', 'state']);
    expect(rawMarker).not.toMatch(/access.?token|refresh.?token|provider/i);
    expect(readPendingCalendarOAuth()).toEqual(expect.objectContaining({ state: 'state-1' }));
  });

  it('rejects expired, malformed, or far-future markers and removes them', () => {
    const now = 1_000_000;
    storePendingCalendarOAuth('state-1', sessionStorage, now);
    expect(readPendingCalendarOAuth(sessionStorage, now)).not.toBeNull();
    expect(readPendingCalendarOAuth(sessionStorage, now + 5 * 60 * 1000)).toBeNull();
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();

    sessionStorage.setItem(CALENDAR_OAUTH_PENDING_KEY, '{not-json');
    expect(readPendingCalendarOAuth(sessionStorage, now)).toBeNull();
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();

    sessionStorage.setItem(CALENDAR_OAUTH_PENDING_KEY, JSON.stringify({
      state: 'state-1',
      expiresAt: now + 60 * 60 * 1000,
    }));
    expect(readPendingCalendarOAuth(sessionStorage, now)).toBeNull();
    clearPendingCalendarOAuth();
  });

  it('rejects a callback response that exposes provider credentials', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        success: true,
        calendarAccountId: 'calendar-account-1',
        account: {
          id: 'calendar-account-1',
          email: 'mark@example.com',
          provider: 'google',
          calendarId: 'primary',
        },
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        access_token: 'must-never-reach-browser',
      },
      error: null,
    });

    await expect(
      oauthService.completeGoogleCalendarOAuth('code-1', 'state-1'),
    ).rejects.toThrow('exposed provider credentials');
  });

  it('completes Calendar OAuth through the authenticated calendar callback', async () => {
    const completion = {
      success: true,
      calendarAccountId: 'calendar-account-1',
      account: {
        id: 'calendar-account-1',
        email: 'mark@example.com',
        provider: 'google',
        calendarId: 'primary',
      },
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    };
    mocks.invoke.mockResolvedValue({ data: completion, error: null });

    await expect(
      oauthService.completeGoogleCalendarOAuth('code-1', 'state-1'),
    ).resolves.toEqual({
      calendarAccountId: completion.calendarAccountId,
      account: completion.account,
      scopes: completion.scopes,
    });

    expect(mocks.invoke).toHaveBeenCalledWith('calendar-oauth-callback', {
      body: { code: 'code-1', state: 'state-1' },
      headers: { Authorization: 'Bearer mind-manual-user-jwt' },
    });
  });

  it('runs bounded sync before watch setup and verifies the canonical receipt', async () => {
    const sync = vi.spyOn(oauthService, 'syncCalendarAccount').mockResolvedValue();
    const watch = vi.spyOn(oauthService, 'setupCalendarWatch').mockResolvedValue();
    const reload = vi.spyOn(oauthService, 'getCanonicalCalendarAccount')
      .mockResolvedValue(connectedAccount);

    await expect(
      oauthService.initializeCalendarAccount('calendar-account-1'),
    ).resolves.toEqual(connectedAccount);

    expect(sync).toHaveBeenCalledWith('calendar-account-1', true);
    expect(watch).toHaveBeenCalledWith('calendar-account-1');
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(watch.mock.invocationCallOrder[0]);
    expect(watch.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  });

  it('requires durable sync and watch receipts from the Edge functions', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          syncType: 'full',
          eventsProcessed: 0,
          syncToken: 'next-sync-token',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          channelId: 'channel-1',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        error: null,
      });

    await expect(
      oauthService.syncCalendarAccount('calendar-account-1', true),
    ).resolves.toBeUndefined();
    await expect(
      oauthService.setupCalendarWatch('calendar-account-1'),
    ).resolves.toBeUndefined();

    mocks.invoke.mockResolvedValue({
      data: { success: true, syncType: 'full', eventsProcessed: 0 },
      error: null,
    });
    await expect(
      oauthService.syncCalendarAccount('calendar-account-1', true),
    ).rejects.toThrow('without a valid durable receipt');

    mocks.invoke.mockResolvedValue({
      data: {
        success: true,
        syncType: 'full',
        boundedWindow: true,
        eventsProcessed: 2,
        syncToken: 'replacement-sync-token',
      },
      error: null,
    });
    await expect(
      oauthService.syncCalendarAccount('calendar-account-1'),
    ).resolves.toBeUndefined();
  });

  it('does not report a partial canonical account as connected', async () => {
    vi.spyOn(oauthService, 'syncCalendarAccount').mockResolvedValue();
    vi.spyOn(oauthService, 'setupCalendarWatch').mockResolvedValue();
    vi.spyOn(oauthService, 'getCanonicalCalendarAccount').mockResolvedValue({
      ...connectedAccount,
      connected: false,
      watchStatus: 'failed',
      watchChannelId: null,
    });

    await expect(
      oauthService.initializeCalendarAccount('calendar-account-1'),
    ).rejects.toThrow('without an active sync and watch receipt');
  });
});
