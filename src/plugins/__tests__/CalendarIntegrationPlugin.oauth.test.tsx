import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  redirectToGoogleCalendar: vi.fn(),
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
    redirectToGoogleCalendar: mocks.redirectToGoogleCalendar,
    getCanonicalCalendarAccounts: mocks.getCanonicalCalendarAccounts,
    getCanonicalCalendarEvents: mocks.getCanonicalCalendarEvents,
    syncCalendarAccount: mocks.syncCalendarAccount,
  },
}));

import { CalendarIntegrationPlugin } from '@/plugins/CalendarIntegrationPlugin';

describe('CalendarIntegrationPlugin same-tab OAuth launch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getCanonicalCalendarAccounts.mockResolvedValue([]);
    mocks.getCanonicalCalendarEvents.mockResolvedValue([]);
    mocks.updateSettings.mockResolvedValue(undefined);
  });

  it('launches the isolated Calendar grant in the same tab without a popup', async () => {
    const open = vi.spyOn(window, 'open');
    mocks.redirectToGoogleCalendar.mockResolvedValue(undefined);
    render(<CalendarIntegrationPlugin />);
    await waitFor(() => expect(mocks.getCanonicalCalendarAccounts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /add calendar/i }));

    await waitFor(() => {
      expect(mocks.redirectToGoogleCalendar).toHaveBeenCalledWith({
        provider: 'google',
        service: 'calendar',
        requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        reason: 'view your calendar events',
      });
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('surfaces an actionable launch error', async () => {
    mocks.redirectToGoogleCalendar.mockRejectedValue(
      new Error('Unable to save the secure Google Calendar handoff.'),
    );
    render(<CalendarIntegrationPlugin />);
    await waitFor(() => expect(mocks.getCanonicalCalendarAccounts).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /add calendar/i }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Connection Failed',
        variant: 'destructive',
        description: expect.stringContaining('secure Google Calendar handoff'),
      }));
    });
    expect(screen.getByText(/secure Google Calendar handoff/i)).toBeInTheDocument();
  });
});
