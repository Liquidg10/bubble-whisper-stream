import { buildCalendarOAuthCompletion } from "./completionResponse.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Calendar OAuth completion matches the token-free UI contract", () => {
  const id = "76967cad-65cf-4d8b-9ab1-bb56be68012c";
  const response = buildCalendarOAuthCompletion(
    id,
    "calendar-owner@example.com",
    [
      "profile",
      "openid",
      "https://www.googleapis.com/auth/calendar.readonly",
      "email",
      "email",
    ],
  );

  assert(response.success === true, "Success flag missing");
  assert(response.calendarAccountId === id, "Canonical account ID missing");
  assert(response.account.id === id, "Nested account ID is not canonical");
  assert(response.account.provider === "google", "Provider mismatch");
  assert(response.account.calendarId === "primary", "Calendar ID mismatch");
  assert(response.scopes.length === 4, "Scopes were not deduplicated");

  const serialized = JSON.stringify(response);
  for (
    const forbidden of [
      "access_token",
      "refresh_token",
      "accessToken",
      "refreshToken",
      "session_url",
    ]
  ) {
    assert(!serialized.includes(forbidden), `Completion leaked ${forbidden}`);
  }
});
