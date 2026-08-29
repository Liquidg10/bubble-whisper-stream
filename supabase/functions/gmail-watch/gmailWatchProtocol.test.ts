import {
  buildGmailWatchRequest,
  classifyHistoryCursor,
  collectOAuthScopes,
  compareHistoryIds,
  hasGmailWatchCapability,
  normalizeGmailWatchAction,
  normalizeOAuthAccountId,
  parseGmailPubSubEnvelope,
  requireGmailPubSubTopic,
} from "./gmailWatchProtocol.ts";
import {
  extractOidcBearerToken,
  GoogleOidcVerificationError,
  resetGoogleOidcJwksCacheForTest,
  verifyGooglePubSubOidcJwt,
} from "./googleOidcJwt.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pubSubEnvelope(input: {
  subscription?: string;
  messageId?: string;
  emailAddress?: string;
  historyId?: string;
} = {}): Record<string, unknown> {
  const payload = {
    emailAddress: input.emailAddress ?? "Owner@Example.com",
    historyId: input.historyId ?? "9876543210",
  };
  return {
    message: {
      data: encodeJson(payload),
      messageId: input.messageId ?? "2070443601311540",
      publishTime: "2026-08-29T12:00:00.000Z",
    },
    subscription: input.subscription ??
      "projects/mind-manual/subscriptions/gmail-watch-push",
  };
}

async function assertRejectsCode(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof GoogleOidcVerificationError,
      "Expected an OIDC verification error",
    );
    assertEquals(error.code, expectedCode, "Unexpected OIDC rejection code");
    return;
  }
  throw new Error(`Expected ${expectedCode} rejection`);
}

Deno.test("Gmail Pub/Sub envelope binds exact subscription, message, mailbox, and cursor", () => {
  assertEquals(
    parseGmailPubSubEnvelope(
      pubSubEnvelope(),
      "projects/mind-manual/subscriptions/gmail-watch-push",
    ),
    {
      messageId: "2070443601311540",
      publishTime: "2026-08-29T12:00:00.000Z",
      subscription: "projects/mind-manual/subscriptions/gmail-watch-push",
      emailAddress: "owner@example.com",
      historyId: "9876543210",
    },
    "Authenticated envelope parsing changed",
  );

  let rejected = false;
  try {
    parseGmailPubSubEnvelope(
      pubSubEnvelope(),
      "projects/mind-manual/subscriptions/other",
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "A different Pub/Sub subscription was accepted");
});

Deno.test("Gmail history cursors compare numerically without JavaScript precision loss", () => {
  assert(
    compareHistoryIds("18446744073709551615", "18446744073709551614") > 0,
    "Large cursor regressed",
  );
  assertEquals(
    classifyHistoryCursor(null, "100"),
    "bootstrap_required",
    "Missing cursor was accepted",
  );
  assertEquals(
    classifyHistoryCursor("100", "100"),
    "stale",
    "Duplicate cursor was reprocessed",
  );
  assertEquals(
    classifyHistoryCursor("100", "99"),
    "stale",
    "Out-of-order cursor was reprocessed",
  );
  assertEquals(
    classifyHistoryCursor("100", "101"),
    "advance",
    "New cursor was ignored",
  );
});

Deno.test("Gmail watch registration contains only the documented Pub/Sub contract", () => {
  const topic = requireGmailPubSubTopic(
    "projects/mind-manual/topics/gmail-notifications",
    "mind-manual",
  );
  const request = buildGmailWatchRequest(topic);
  assertEquals(request, {
    topicName: "projects/mind-manual/topics/gmail-notifications",
    labelIds: ["INBOX"],
    labelFilterBehavior: "INCLUDE",
  }, "Gmail users.watch request changed");
  assert(
    !("address" in request),
    "Calendar-style webhook address leaked into Gmail watch",
  );
  assert(
    !("channelId" in request),
    "Calendar-style channel ID leaked into Gmail watch",
  );
});

Deno.test("Gmail watch controls remain account-specific and scope-gated", () => {
  assertEquals(
    normalizeGmailWatchAction("renew", undefined),
    "renew",
    "Renew action was rejected",
  );
  assertEquals(
    normalizeGmailWatchAction(undefined, "start"),
    "start",
    "Legacy start action was rejected",
  );
  assertEquals(
    normalizeGmailWatchAction("start", "stop"),
    null,
    "Conflicting controls were accepted",
  );
  assertEquals(
    normalizeOAuthAccountId("00000000-0000-4000-8000-000000000001"),
    "00000000-0000-4000-8000-000000000001",
    "UUID was rejected",
  );
  assertEquals(
    normalizeOAuthAccountId("all"),
    null,
    "Global account sentinel was accepted",
  );

  const scopes = collectOAuthScopes({
    scopes_string: "openid https://www.googleapis.com/auth/gmail.metadata",
  });
  assert(
    scopes.has("https://www.googleapis.com/auth/gmail.metadata"),
    "Scope parsing failed",
  );
  assert(
    hasGmailWatchCapability({
      provider: "google",
      scopes_string: "https://www.googleapis.com/auth/gmail.metadata",
    }),
    "Metadata-capable Google account was rejected",
  );
  assert(
    !hasGmailWatchCapability({
      provider: "google",
      scopes_string: "https://www.googleapis.com/auth/calendar.readonly",
    }),
    "Calendar-only account was accepted",
  );
});

Deno.test("Google Pub/Sub OIDC verifies signature, issuer, audience, and service identity", async () => {
  resetGoogleOidcJwksCacheForTest();
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const now = 1_788_000_000;
  const header = encodeJson({
    alg: "RS256",
    kid: "test-google-key",
    typ: "JWT",
  });
  const payload = encodeJson({
    aud: "https://example.supabase.co/functions/v1/gmail-watch",
    email: "gmail-push@mind-manual.iam.gserviceaccount.com",
    email_verified: true,
    exp: now + 1800,
    iat: now - 60,
    iss: "https://accounts.google.com",
    sub: "1234567890",
  });
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  const token = `${signingInput}.${toBase64Url(signature)}`;
  let jwksFetches = 0;
  const fetcher: typeof fetch = () => {
    jwksFetches += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          keys: [{
            ...publicJwk,
            kid: "test-google-key",
            alg: "RS256",
            use: "sig",
          }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public,max-age=60",
          },
        },
      ),
    );
  };

  const claims = await verifyGooglePubSubOidcJwt(token, {
    expectedAudience: "https://example.supabase.co/functions/v1/gmail-watch",
    expectedServiceAccountEmail:
      "gmail-push@mind-manual.iam.gserviceaccount.com",
    fetcher,
    nowEpochSeconds: now,
  });
  assertEquals(claims.sub, "1234567890", "Verified OIDC subject changed");
  assertEquals(
    extractOidcBearerToken(`Bearer ${token}`),
    token,
    "Bearer extraction failed",
  );
  assertEquals(
    extractOidcBearerToken(`Basic ${token}`),
    null,
    "Non-bearer token was accepted",
  );

  await assertRejectsCode(() =>
    verifyGooglePubSubOidcJwt(token, {
      expectedAudience: "https://attacker.example/push",
      expectedServiceAccountEmail:
        "gmail-push@mind-manual.iam.gserviceaccount.com",
      fetcher,
      nowEpochSeconds: now,
    }), "OIDC_AUDIENCE_MISMATCH");
  await assertRejectsCode(() =>
    verifyGooglePubSubOidcJwt(token, {
      expectedAudience: "https://example.supabase.co/functions/v1/gmail-watch",
      expectedServiceAccountEmail: "other@mind-manual.iam.gserviceaccount.com",
      fetcher,
      nowEpochSeconds: now,
    }), "OIDC_EMAIL_MISMATCH");

  const forgedPayload = encodeJson({
    aud: "https://example.supabase.co/functions/v1/gmail-watch",
    email: "gmail-push@mind-manual.iam.gserviceaccount.com",
    email_verified: true,
    exp: now + 1800,
    iat: now - 60,
    iss: "https://accounts.google.com",
    sub: "forged",
  });
  await assertRejectsCode(() =>
    verifyGooglePubSubOidcJwt(
      `${header}.${forgedPayload}.${toBase64Url(signature)}`,
      {
        expectedAudience:
          "https://example.supabase.co/functions/v1/gmail-watch",
        expectedServiceAccountEmail:
          "gmail-push@mind-manual.iam.gserviceaccount.com",
        fetcher,
        nowEpochSeconds: now,
      },
    ), "OIDC_SIGNATURE_INVALID");

  const unknownKeyHeader = encodeJson({
    alg: "RS256",
    kid: "attacker-controlled-kid",
    typ: "JWT",
  });
  await assertRejectsCode(() =>
    verifyGooglePubSubOidcJwt(
      `${unknownKeyHeader}.${payload}.${toBase64Url(signature)}`,
      {
        expectedAudience:
          "https://example.supabase.co/functions/v1/gmail-watch",
        expectedServiceAccountEmail:
          "gmail-push@mind-manual.iam.gserviceaccount.com",
        fetcher,
        nowEpochSeconds: now,
      },
    ), "OIDC_KEY_NOT_FOUND");
  assertEquals(
    jwksFetches,
    1,
    "An unknown signing key invalidated the bounded JWKS cache",
  );
});
