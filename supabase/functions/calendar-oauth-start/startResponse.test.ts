import { buildCalendarOAuthStartResponse } from "./startResponse.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Calendar OAuth start response includes its URL-bound state", () => {
  const state = "state-value-with-more-than-thirty-two-random-characters";
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("state", state);

  const response = buildCalendarOAuthStartResponse(authUrl.toString(), state);
  assert(response.success === true, "Success flag missing");
  assert(response.authUrl === authUrl.toString(), "Authorization URL mismatch");
  assert(response.state === state, "State missing from response");
  assert(response.expiresIn === 300, "Unexpected state lifetime");
});

Deno.test("Calendar OAuth start response rejects a mismatched state", () => {
  try {
    buildCalendarOAuthStartResponse(
      "https://accounts.google.com/o/oauth2/v2/auth?state=one",
      "two",
    );
  } catch (error) {
    assert(error instanceof Error, "Expected an Error");
    assert(error.message.includes("not bound"), "Unexpected error message");
    return;
  }
  throw new Error("Expected mismatched state to be rejected");
});
