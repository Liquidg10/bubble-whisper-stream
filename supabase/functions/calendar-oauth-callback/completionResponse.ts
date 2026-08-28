export interface CalendarOAuthCompletion {
  success: true;
  calendarAccountId: string;
  account: {
    id: string;
    email: string;
    provider: "google";
    calendarId: "primary";
  };
  scopes: string[];
}

export function buildCalendarOAuthCompletion(
  calendarAccountId: string,
  accountEmail: string,
  scopes: Iterable<string>,
): CalendarOAuthCompletion {
  return {
    success: true,
    calendarAccountId,
    account: {
      id: calendarAccountId,
      email: accountEmail,
      provider: "google",
      calendarId: "primary",
    },
    scopes: Array.from(new Set(scopes)).sort(),
  };
}
