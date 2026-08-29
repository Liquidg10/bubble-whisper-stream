import {
  combineGoogleOAuthScopes,
  DEFAULT_GMAIL_SCOPE,
  getGoogleOAuthRedirectUri,
  GoogleOAuthRequestError,
  parseGoogleOAuthStartRequest,
  requireAllowedGoogleOAuthOrigin,
} from "./googleOAuthPolicy.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(operation: () => unknown, message: string): void {
  try {
    operation();
  } catch (error) {
    assert(error instanceof GoogleOAuthRequestError, "Expected request error");
    assert(
      error.message.includes(message),
      `Expected error containing ${message}`,
    );
    return;
  }
  throw new Error("Expected operation to throw");
}

Deno.test("generic Google OAuth accepts only Gmail scopes", () => {
  const parsed = parseGoogleOAuthStartRequest({
    service: "email",
    scope: "https://www.googleapis.com/auth/gmail.metadata",
    accountId: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert(parsed.accountId !== null, "Expected a validated account ID");
  assert(parsed.requestedScopes[0] === DEFAULT_GMAIL_SCOPE, "Wrong scope");

  assertThrows(
    () =>
      parseGoogleOAuthStartRequest({
        service: "email",
        scope: "https://www.googleapis.com/auth/drive",
      }),
    "Unsupported Gmail",
  );
  assertThrows(
    () => parseGoogleOAuthStartRequest({ service: "calendar" }),
    "Only Gmail",
  );
});

Deno.test("generic Google OAuth pins origins and callback route", () => {
  const origin = requireAllowedGoogleOAuthOrigin(
    "https://bubble-whisper-stream.lovable.app",
  );
  assert(
    getGoogleOAuthRedirectUri(origin) === `${origin}/oauth-callback`,
    "Unexpected redirect URI",
  );
  assertThrows(
    () => requireAllowedGoogleOAuthOrigin("https://evil.example"),
    "not allowed",
  );
});

Deno.test("scope union ignores untrusted or unsupported stored values", () => {
  const scopes = combineGoogleOAuthScopes(
    ["https://www.googleapis.com/auth/gmail.readonly", "malicious"],
    ["https://www.googleapis.com/auth/gmail.modify"],
  );
  assert(scopes.includes("openid"), "Identity scope missing");
  assert(
    scopes.includes("https://www.googleapis.com/auth/gmail.readonly"),
    "Existing scope missing",
  );
  assert(
    scopes.includes("https://www.googleapis.com/auth/gmail.modify"),
    "Requested scope missing",
  );
  assert(!scopes.includes("malicious"), "Unsupported scope escaped validation");
});
