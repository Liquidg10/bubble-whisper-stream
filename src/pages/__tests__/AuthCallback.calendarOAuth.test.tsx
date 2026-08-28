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
  oauthService,
  storePendingCalendarOAuth,
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

  it('keeps an opener callback on the legacy popup path even with a copied marker', async () => {
    const opener = { postMessage: vi.fn() };
    setOpener(opener);
    setRoute(`/oauth-callback?code=gmail-code&state=${state}`);
    storePendingCalendarOAuth(state);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const complete = vi.spyOn(oauthService, 'completeGoogleCalendarOAuth');
    vi.spyOn(window, 'close').mockImplementation(() => undefined);

    render(<AuthCallback />);

    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled());
    expect(complete).not.toHaveBeenCalled();
    expect(opener.postMessage).toHaveBeenCalledWith({
      type: 'GOOGLE_OAUTH_SUCCESS',
      code: 'gmail-code',
      state,
    }, window.location.origin);
    expect(replaceState).toHaveBeenCalledWith(expect.anything(), expect.any(String), '/oauth-callback');
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      opener.postMessage.mock.invocationCallOrder[0],
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
});
