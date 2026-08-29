import React, { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getSession: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(window.location.search)],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

import { AuthCallback } from '@/pages/AuthCallback';
import {
  CALENDAR_OAUTH_PENDING_KEY,
  CALENDAR_OAUTH_RETURN_PATH,
  GOOGLE_OAUTH_PENDING_KEY,
  GOOGLE_OAUTH_RETURN_PATH,
  oauthService,
  storePendingCalendarOAuth,
  storePendingGoogleOAuth,
} from '@/services/oauthService';

const state = 'calendar-oauth-state-12345678901234567890';
const completion = {
  calendarAccountId: '11111111-1111-4111-8111-111111111111',
  account: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'mark@example.com',
    provider: 'google',
    calendarId: 'primary',
  },
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
};

function setRoute(path: string) {
  window.history.replaceState({}, '', path);
}

function setOpener(opener: unknown) {
  Object.defineProperty(window, 'opener', {
    configurable: true,
    writable: true,
    value: opener,
  });
}

describe('AuthCallback same-tab Calendar OAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.navigate.mockReset();
    mocks.getSession.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    sessionStorage.clear();
    setOpener(null);
    setRoute('/');
  });

  it('consumes an exact-state callback once, scrubs the URL, and initializes Calendar', async () => {
    setRoute(`/oauth-callback?code=code-1&state=${state}#provider-fragment`);
    storePendingCalendarOAuth(state);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth')
      .mockResolvedValue(completion);
    const initialize = vi.spyOn(oauthService, 'initializeCalendarAccount')
      .mockResolvedValue({} as never);

    render(<StrictMode><AuthCallback /></StrictMode>);

    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith('code-1', state);
    expect(complete.mock.invocationCallOrder[0]).toBeLessThan(
      initialize.mock.invocationCallOrder[0],
    );
    expect(replaceState).toHaveBeenCalledWith(expect.anything(), expect.any(String), '/oauth-callback');
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0],
    );
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Google Calendar connected',
      expect.objectContaining({ description: expect.stringContaining('live updates') }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith(
      CALENDAR_OAUTH_RETURN_PATH,
      { replace: true },
    );
  });

  it('rejects a mismatched state and clears the one-shot marker', async () => {
    setRoute('/oauth-callback?code=code-1&state=wrong-state');
    storePendingCalendarOAuth(state);
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(complete).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Google Calendar connection failed',
      expect.objectContaining({ description: expect.stringContaining('did not match') }),
    );
  });

  it('handles provider denial without calling Calendar services and cleans up', async () => {
    setRoute(`/oauth-callback?error=access_denied&state=${state}`);
    storePendingCalendarOAuth(state);
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(complete).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Google Calendar access was not granted',
      expect.objectContaining({ description: expect.stringContaining('No Calendar access was saved') }),
    );
  });

  it('rejects duplicate or mixed Calendar callback parameters', async () => {
    setRoute(`/oauth-callback?code=one&code=two&error=access_denied&state=${state}`);
    storePendingCalendarOAuth(state);
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(complete).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Google Calendar connection failed',
      expect.objectContaining({ description: expect.stringContaining('invalid authorization response') }),
    );
  });

  it('cleans up and keeps callback failures generic', async () => {
    setRoute(`/oauth-callback?code=code-1&state=${state}`);
    storePendingCalendarOAuth(state);
    vi.spyOn(oauthService, 'completeGoogleCalendarOAuth').mockResolvedValue(completion);
    vi.spyOn(oauthService, 'initializeCalendarAccount')
      .mockRejectedValue(new Error('provider token secret should not render'));

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();
    const errorCall = mocks.toastError.mock.calls.at(-1);
    expect(errorCall?.[0]).toBe('Google Calendar connection failed');
    expect(JSON.stringify(errorCall)).not.toContain('provider token secret');
  });

  it('never relays an OAuth code through an opener when a secure marker is present', async () => {
    const opener = { postMessage: vi.fn() };
    setOpener(opener);
    setRoute(`/oauth-callback?code=calendar-code&state=${state}`);
    storePendingCalendarOAuth(state);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth')
      .mockResolvedValue(completion);
    const initialize = vi.spyOn(oauthService, 'initializeCalendarAccount')
      .mockResolvedValue({} as never);

    render(<AuthCallback />);

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(opener.postMessage).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(expect.anything(), expect.any(String), '/oauth-callback');
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0],
    );
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('keeps /auth/callback on the legacy path despite a stale Calendar marker', async () => {
    setRoute(`/auth/callback?code=legacy-code&state=${state}`);
    storePendingCalendarOAuth(state);
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'));
    expect(complete).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('OAuth completed successfully');
  });

  it('completes Gmail in the same tab without invoking Calendar setup', async () => {
    setRoute(`/oauth-callback?code=gmail-code&state=${state}#provider-fragment`);
    storePendingGoogleOAuth(state);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const completeGmail = vi.spyOn(oauthService, 'completeGoogleOAuth')
      .mockResolvedValue({
        oauthAccountId: '22222222-2222-4222-8222-222222222222',
        account: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'mark@example.com',
          provider: 'google',
          expiresAt: '2099-01-01T00:00:00.000Z',
          lastUsedAt: '2026-08-29T00:00:00.000Z',
        },
        scopes: ['https://www.googleapis.com/auth/gmail.metadata'],
      });
    const completeCalendar = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');
    const initializeCalendar = vi.spyOn(oauthService, 'initializeCalendarAccount');

    render(<StrictMode><AuthCallback /></StrictMode>);

    await waitFor(() => expect(completeGmail).toHaveBeenCalledTimes(1));
    expect(completeGmail).toHaveBeenCalledWith('gmail-code', state);
    expect(completeCalendar).not.toHaveBeenCalled();
    expect(initializeCalendar).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(expect.anything(), expect.any(String), '/oauth-callback');
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      completeGmail.mock.invocationCallOrder[0],
    );
    expect(sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY)).toBeNull();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Gmail connected',
      expect.objectContaining({ description: expect.stringContaining('stored securely') }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith(
      GOOGLE_OAUTH_RETURN_PATH,
      { replace: true },
    );
  });

  it('fails closed when Calendar and Gmail handoffs are both present', async () => {
    setRoute(`/oauth-callback?code=code-1&state=${state}`);
    storePendingCalendarOAuth(state);
    storePendingGoogleOAuth(state);
    const completeGmail = vi.spyOn(oauthService, 'completeGoogleOAuth');
    const completeCalendar = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(completeGmail).not.toHaveBeenCalled();
    expect(completeCalendar).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CALENDAR_OAUTH_PENDING_KEY)).toBeNull();
    expect(sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY)).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Google connection failed',
      expect.objectContaining({ description: expect.stringContaining('ambiguous') }),
    );
  });
});
