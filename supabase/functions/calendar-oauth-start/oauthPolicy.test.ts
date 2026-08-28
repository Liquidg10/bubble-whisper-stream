import {
  calendarOAuthCorsHeaders,
  getCalendarOAuthRedirectUri,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  GOOGLE_CALENDAR_READ_SCOPE,
  parseCalendarOAuthStartRequest,
  requireAllowedCalendarOAuthOrigin,
} from "./oauthPolicy.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(operation: () => unknown, expectedMessage: string): void {
  try {
    operation();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error");
    assert(
      error.message.includes(expectedMessage),
      `Expected error containing "${expectedMessage}", got "${error.message}"`,
    );
    return;
  }
  throw new Error("Expected operation to throw");
}

Deno.test("Calendar OAuth policy uses a fixed least-privilege scope set", () => {
  assert(
    GOOGLE_CALENDAR_OAUTH_SCOPES.join(" ") ===
      `openid email profile ${GOOGLE_CALENDAR_READ_SCOPE}`,
    "Unexpected Google Calendar scope set",
  );

  const parsed = parseCalendarOAuthStartRequest({
    service: "calendar",
    scope: GOOGLE_CALENDAR_READ_SCOPE,
    existingScopes: "openid email profile",
  });
  assert(parsed.accountId === null, "Unexpected account ID");
});

Deno.test("Calendar OAuth policy rejects other services and scope escalation", () => {
  assertThrows(
    () => parseCalendarOAuthStartRequest({ service: "email" }),
    "Only Google Calendar OAuth",
  );
  assertThrows(
    () =>
      parseCalendarOAuthStartRequest({
        service: "calendar",
        scope: "https://www.googleapis.com/auth/calendar.events",
      }),
    "Unsupported Google Calendar OAuth scope",
  );
});

Deno.test("Calendar OAuth policy accepts only exact production and local origins", () => {
  const production = "https://bubble-whisper-stream.lovable.app";
  assert(
    requireAllowedCalendarOAuthOrigin(production) === production,
    "Origin rejected",
  );
  assert(
    getCalendarOAuthRedirectUri(production) === `${production}/oauth-callback`,
    "Unexpected redirect URI",
  );
  assert(
    calendarOAuthCorsHeaders(production)["Access-Control-Allow-Origin"] ===
      production,
    "CORS did not echo the exact allowed origin",
  );

  assertThrows(
    () => requireAllowedCalendarOAuthOrigin("https://evil.example"),
    "Origin is not allowed",
  );
  assertThrows(
    () =>
      requireAllowedCalendarOAuthOrigin(
        "https://bubble-whisper-stream.lovable.app.evil.example",
      ),
    "Origin is not allowed",
  );
});

Deno.test("Calendar OAuth account IDs must be canonical UUIDs", () => {
  const accountId = "76967cad-65cf-4d8b-9ab1-bb56be68012c";
  assert(
    parseCalendarOAuthStartRequest({
      service: "calendar",
      scope: GOOGLE_CALENDAR_READ_SCOPE,
      accountId,
    }).accountId === accountId,
    "Valid account ID was rejected",
  );

  assertThrows(
    () =>
      parseCalendarOAuthStartRequest({
        service: "calendar",
        accountId: "not-a-uuid",
      }),
    "Invalid calendar account ID",
  );
});
