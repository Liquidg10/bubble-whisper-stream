export interface CalendarOAuthStartResponse {
  success: true;
  authUrl: string;
  state: string;
  expiresIn: 300;
}

export function buildCalendarOAuthStartResponse(
  authUrl: string,
  state: string,
): CalendarOAuthStartResponse {
  const parsedUrl = new URL(authUrl);
  if (
    parsedUrl.origin !== "https://accounts.google.com" ||
    parsedUrl.pathname !== "/o/oauth2/v2/auth" ||
    parsedUrl.searchParams.get("state") !== state
  ) {
    throw new Error(
      "OAuth authorization URL is not bound to the returned state",
    );
  }

  return { success: true, authUrl, state, expiresIn: 300 };
}
