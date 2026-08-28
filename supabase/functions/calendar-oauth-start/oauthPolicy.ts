export const GOOGLE_CALENDAR_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_CALENDAR_OAUTH_SCOPES = Object.freeze([
  "openid",
  "email",
  "profile",
  GOOGLE_CALENDAR_READ_SCOPE,
]);

export const ALLOWED_CALENDAR_OAUTH_ORIGINS = Object.freeze([
  "https://bubble-whisper-stream.lovable.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://localhost:3000",
]);

const ALLOWED_ORIGIN_SET = new Set<string>(ALLOWED_CALENDAR_OAUTH_ORIGINS);
const ALLOWED_SCOPE_SET = new Set<string>(GOOGLE_CALENDAR_OAUTH_SCOPES);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CalendarOAuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CalendarOAuthRequestError";
  }
}

export interface CalendarOAuthStartRequest {
  accountId: string | null;
}

function parseScopes(value: unknown, field: string): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") {
    throw new CalendarOAuthRequestError(`${field} must be a string`, 400);
  }

  const scopes = value.split(/\s+/).filter(Boolean);
  const unsupported = scopes.filter((scope) => !ALLOWED_SCOPE_SET.has(scope));
  if (unsupported.length > 0) {
    throw new CalendarOAuthRequestError(
      "Unsupported Google Calendar OAuth scope requested",
      400,
    );
  }

  return scopes;
}

export function parseCalendarOAuthStartRequest(
  value: unknown,
): CalendarOAuthStartRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CalendarOAuthRequestError("Invalid request body", 400);
  }

  const body = value as Record<string, unknown>;
  if (body.service !== "calendar") {
    throw new CalendarOAuthRequestError(
      "Only Google Calendar OAuth is supported by this endpoint",
      400,
    );
  }

  const requestedScopes = parseScopes(body.scope, "scope");
  const existingScopes = parseScopes(body.existingScopes, "existingScopes");
  if (
    requestedScopes.length > 0 &&
    !requestedScopes.includes(GOOGLE_CALENDAR_READ_SCOPE)
  ) {
    throw new CalendarOAuthRequestError(
      "Google Calendar read permission is required",
      400,
    );
  }

  // Parsing existingScopes is intentionally validation-only. The authorization
  // URL always uses the server-owned fixed scope set below.
  void existingScopes;

  if (
    body.accountId === undefined || body.accountId === null ||
    body.accountId === ""
  ) {
    return { accountId: null };
  }

  if (
    typeof body.accountId !== "string" || !UUID_PATTERN.test(body.accountId)
  ) {
    throw new CalendarOAuthRequestError("Invalid calendar account ID", 400);
  }

  return { accountId: body.accountId };
}

export function requireAllowedCalendarOAuthOrigin(
  origin: string | null,
): string {
  if (!origin || !ALLOWED_ORIGIN_SET.has(origin)) {
    throw new CalendarOAuthRequestError("Origin is not allowed", 403);
  }
  return origin;
}

export function getCalendarOAuthRedirectUri(origin: string): string {
  requireAllowedCalendarOAuthOrigin(origin);
  return `${origin}/oauth-callback`;
}

export function calendarOAuthCorsHeaders(
  origin: string,
): Record<string, string> {
  requireAllowedCalendarOAuthOrigin(origin);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}
