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
  GOOGLE_OAUTH_PENDING_KEY,
  oauthService,
  readPendingGoogleOAuth,
} from '@/services/oauthService';

const session = {
  access_token: 'mind-manual-user-jwt',
  user: { id: 'user-1' },
};

describe('generic Google OAuth browser boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.from.mockReset();
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    sessionStorage.clear();
  });

  it('starts Gmail OAuth with JWT auth and server-owned account context', async () => {
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1';
    mocks.invoke.mockResolvedValue({
      data: { success: true, authUrl, state: 'state-1' },
      error: null,
    });

    await expect(oauthService.requestScopeEscalation({
      provider: 'google',
      service: 'email',
      accountId: '123e4567-e89b-42d3-a456-426614174000',
      requiredScopes: ['https://www.googleapis.com/auth/gmail.metadata'],
      reason: 'read Gmail metadata',
      currentScopes: ['untrusted-browser-scope'],
    })).resolves.toEqual({ authUrl, state: 'state-1' });

    expect(mocks.invoke).toHaveBeenCalledWith('oauth-google-start', {
      body: {
        service: 'email',
        scope: 'https://www.googleapis.com/auth/gmail.metadata',
        reason: 'read Gmail metadata',
        accountId: '123e4567-e89b-42d3-a456-426614174000',
      },
      headers: { Authorization: 'Bearer mind-manual-user-jwt' },
    });
  });

  it('stores only a one-shot state marker before same-tab navigation', () => {
    const navigation = { assign: vi.fn() };
    oauthService.redirectToGoogleOAuth({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1',
      state: 'state-1',
    }, navigation, sessionStorage);

    expect(navigation.assign).toHaveBeenCalledTimes(1);
    const raw = sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY);
    expect(raw).not.toBeNull();
    expect(Object.keys(JSON.parse(raw!)).sort()).toEqual(['expiresAt', 'state']);
    expect(raw).not.toMatch(/access.?token|refresh.?token|provider/i);
    expect(readPendingGoogleOAuth()).toEqual(expect.objectContaining({ state: 'state-1' }));
  });

  it('rejects credential-bearing callback and refresh responses', async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: {
        success: true,
        oauthAccountId: 'account-1',
        account: { id: 'account-1', email: 'mark@example.com', provider: 'google' },
        scopes: [],
        access_token: 'must-never-reach-browser',
      },
      error: null,
    });
    await expect(
      oauthService.completeGoogleOAuth('code-1', 'state-1'),
    ).rejects.toThrow('exposed provider credentials');

    mocks.invoke.mockResolvedValueOnce({
      data: {
        success: true,
        accountId: 'account-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        access_token: 'must-never-reach-browser',
      },
      error: null,
    });
    await expect(oauthService.refreshAccessToken('account-1'))
      .rejects.toThrow('exposed provider credentials');
  });

  it('loads account metadata from the safe view and never a token column', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: 'account-1',
        user_id: 'user-1',
        provider: 'google',
        provider_user_id: 'google-sub-1',
        expires_at: null,
        last_used_at: null,
        scopes: ['https://www.googleapis.com/auth/gmail.metadata'],
        scopes_string: 'https://www.googleapis.com/auth/gmail.metadata',
        account_email: 'mark@example.com',
        token_type: 'Bearer',
        created_at: '2026-08-29T00:00:00.000Z',
        updated_at: '2026-08-29T00:00:00.000Z',
      }],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    const accounts = await oauthService.getConnectedAccounts();
    expect(mocks.from).toHaveBeenCalledWith('oauth_accounts_metadata');
    expect(select.mock.calls[0][0]).not.toMatch(/access_token|refresh_token/);
    expect(accounts[0]).not.toHaveProperty('access_token');
    expect(accounts[0]).not.toHaveProperty('refresh_token');
  });

  it('refreshes and revokes with account_id only', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          accountId: 'account-1',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          accountId: 'account-1',
          providerStatus: 'revoked',
        },
        error: null,
      });

    await oauthService.refreshAccessToken('account-1');
    await oauthService.revokeAccess('account-1');

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'oauth-google-refresh', {
      body: { account_id: 'account-1' },
      headers: { Authorization: 'Bearer mind-manual-user-jwt' },
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'oauth-google-revoke', {
      body: { account_id: 'account-1' },
      headers: { Authorization: 'Bearer mind-manual-user-jwt' },
    });
  });
});
