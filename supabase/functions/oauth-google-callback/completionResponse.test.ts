import { buildGoogleOAuthCompletion } from "./completionResponse.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("generic Google OAuth completion exposes metadata only", () => {
  const receipt = buildGoogleOAuthCompletion({
    id: "11111111-1111-4111-8111-111111111111",
    account_email: "mark@example.com",
    provider: "google",
    expires_at: "2099-01-01T00:00:00.000Z",
    last_used_at: "2026-08-29T00:00:00.000Z",
    access_token: "must-never-reach-browser",
    refresh_token: "must-never-reach-browser",
  }, ["https://www.googleapis.com/auth/gmail.metadata"]);

  const serialized = JSON.stringify(receipt);
  assert(serialized.includes("oauthAccountId"), "Account receipt is missing");
  assert(!serialized.includes("access_token"), "Access token escaped response");
  assert(
    !serialized.includes("refresh_token"),
    "Refresh token escaped response",
  );
  assert(
    !serialized.includes("must-never-reach-browser"),
    "Provider credential escaped response",
  );
});
