import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  beginScopeEscalation: vi.fn(),
  completeGoogleCalendarOAuth: vi.fn(),
  initializeCalendarAccount: vi.fn(),
  getCanonicalCalendarAccounts: vi.fn(),
  getCanonicalCalendarEvents: vi.fn(),
  syncCalendarAccount: vi.fn(),
  addBubble: vi.fn(),
  addReminder: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/stores/bubbleStore', () => ({
  useBubbleStore: () => ({
    addBubble: mocks.addBubble,
    addReminder: mocks.addReminder,
    updateSettings: mocks.updateSettings,
    settings: { calendarIntegrationEnabled: true },
  }),
}));

vi.mock('@/services/oauthService', () => ({
  SCOPES: {
    GOOGLE_CALENDAR: {
      READ: 'https://www.googleapis.com/auth/calendar.readonly',
    },
  },
  oauthService: {
    beginScopeEscalation: mocks.beginScopeEscalation,
    completeGoogleCalendarOAuth: mocks.completeGoogleCalendarOAuth,
    initializeCalendarAccount: mocks.initializeCalendarAccount,
    getCanonicalCalendarAccounts: mocks.getCanonicalCalendarAccounts,
    getCanonicalCalendarEvents: mocks.getCanonicalCalendarEvents,
    syncCalendarAccount: mocks.syncCalendarAccount,
  },
}));

import {
  CalendarIntegrationPlugin,
  waitForGoogleOAuthPopup,
} from '@/plugins/CalendarIntegrationPlugin';

function dispatchOAuthMessage(
  popup: Window,
  data: Record<string, unknown>,
  origin = window.location.origin,
) {
  window.dispatchEvent(new MessageEvent('message', {
    data,
    origin,
    source: popup,
  }));
}

function createPopup() {
  let closed = false;
  const popup = {
    get closed() { return closed; },
    close: vi.fn(() => { closed = true; }),
    focus: vi.fn(),
    location: { replace: vi.fn() },
  } as unknown as Window;
  return popup;
}

const connectedAccount = {
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

describe('Calendar OAuth popup boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('ignores the wrong origin, popup source, and state before accepting success', async () => {
    const popup = createPopup();
    const otherPopup = createPopup();
    const result = waitForGoogleOAuthPopup(popup, 'state-1', window.location.origin, 5_000);
    const settled = vi.fn();
    void result.then(settled);

    dispatchOAuthMessage(popup, {
      type: 'GOOGLE_OAUTH_SUCCESS', code: 'bad-origin', state: 'state-1',
    }, 'https://attacker.example');
    dispatchOAuthMessage(otherPopup, {
      type: 'GOOGLE_OAUTH_SUCCESS', code: 'bad-source', state: 'state-1',
    });
    dispatchOAuthMessage(popup, {
      type: 'GOOGLE_OAUTH_SUCCESS', code: 'bad-state', state: 'state-2',
    });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    dispatchOAuthMessage(popup, {
      type: 'GOOGLE_OAUTH_SUCCESS', code: 'code-1', state: 'state-1',
    });

    await expect(result).resolves.toEqual({
      type: 'GOOGLE_OAUTH_SUCCESS', code: 'code-1', state: 'state-1',
    });
  });

  it('rejects when the user closes the popup', async () => {
    vi.useFakeTimers();
    const popup = createPopup();
    const result = waitForGoogleOAuthPopup(popup, 'state-1');
    const rejection = expect(result).rejects.toThrow('canceled before it completed');
    popup.close();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await rejection;
    vi.useRealTimers();
  });

  it('rejects and cleans up when authorization times out', async () => {
    vi.useFakeTimers();
    const popup = createPopup();
    const result = waitForGoogleOAuthPopup(
      popup,
      'state-1',
      window.location.origin,
      1_000,
    );
    const rejection = expect(result).rejects.toThrow('authorization timed out');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    await rejection;
    vi.useRealTimers();
  });
});

describe('CalendarIntegrationPlugin OAuth setup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getCanonicalCalendarAccounts.mockResolvedValue([]);
    mocks.getCanonicalCalendarEvents.mockResolvedValue([]);
    mocks.updateSettings.mockResolvedValue(undefined);
  });

  it('opens blank synchronously, then completes callback, sync/watch, and canonical reload', async () => {
    const popup = createPopup();
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    let initialized = false;

    mocks.beginScopeEscalation.mockResolvedValue({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1',
      state: 'state-1',
    });
    mocks.completeGoogleCalendarOAuth.mockResolvedValue({
      calendarAccountId: 'calendar-account-1',
      account: {
        id: 'calendar-account-1',
        email: 'mark@example.com',
        provider: 'google',
        calendarId: 'primary',
      },
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    mocks.initializeCalendarAccount.mockImplementation(async () => {
      initialized = true;
      return connectedAccount;
    });
    mocks.getCanonicalCalendarAccounts.mockImplementation(
      async () => initialized ? [connectedAccount] : [],
    );

    render(<CalendarIntegrationPlugin />);
    fireEvent.click(screen.getByRole('button', { name: /add calendar/i }));

    expect(open).toHaveBeenCalledWith(
      'about:blank',
      'mind-manual-google-calendar-oauth',
      expect.any(String),
    );
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.beginScopeEscalation.mock.invocationCallOrder[0],
    );

    await waitFor(() => {
      expect(popup.location.replace).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?state=state-1',
      );
    });

    act(() => {
      dispatchOAuthMessage(popup, {
        type: 'GOOGLE_OAUTH_SUCCESS',
        code: 'code-1',
        state: 'state-1',
      });
    });

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Calendar Connected',
        description: 'Google Calendar is synced and live updates are active.',
      });
    });

    expect(mocks.completeGoogleCalendarOAuth).toHaveBeenCalledWith('code-1', 'state-1');
    expect(mocks.initializeCalendarAccount).toHaveBeenCalledWith('calendar-account-1');
    expect(mocks.completeGoogleCalendarOAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.initializeCalendarAccount.mock.invocationCallOrder[0],
    );
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows an actionable error when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(<CalendarIntegrationPlugin />);
    await waitFor(() => expect(mocks.getCanonicalCalendarAccounts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /add calendar/i }));

    expect(mocks.beginScopeEscalation).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Pop-up Blocked',
      variant: 'destructive',
      description: expect.stringContaining('Allow pop-ups'),
    }));
    expect(screen.getByText(/allow pop-ups for mind manual/i)).toBeInTheDocument();
  });
});
