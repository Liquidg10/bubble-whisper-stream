import {
  type GmailWatchMigrationContext,
  gmailWatchMigrationScope,
} from "./gmailMigrationScope.ts";
import type {
  MindManualResolverRuntime,
  MindManualScopeResolution,
} from "./migrationWriteFence.ts";
import {
  GoogleOidcVerificationError,
  type GooglePubSubOidcClaims,
} from "../gmail-watch/googleOidcJwt.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const WATCH_ID = "44444444-4444-4444-8444-444444444444";
const SERVICE_KEY = "server-owned-service-role-secret";
const ORIGIN = "https://project.supabase.co";
const SUBSCRIPTION = "projects/mind-manual/subscriptions/gmail-watch-push";
const AUDIENCE = `${ORIGIN}/functions/v1/gmail-watch`;
const PUSH_IDENTITY = "gmail-push@mind-manual.iam.gserviceaccount.com";

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

function runtime(
  fetcher: typeof fetch,
  envValues: Record<string, string> = {},
): MindManualResolverRuntime {
  return {
    origin: ORIGIN,
    serviceKey: SERVICE_KEY,
    fetch: fetcher,
    env: (name) => envValues[name],
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function controlRequest(
  authorization: string,
  body: Record<string, unknown> = {},
): Request {
  return new Request(`${ORIGIN}/functions/v1/gmail-watch`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "renew", accountId: ACCOUNT_ID, ...body }),
  });
}

function encodeJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pushEnvelope(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    message: {
      data: encodeJson({
        emailAddress: "owner@example.com",
        historyId: "123456789",
      }),
      messageId: "message-1",
      publishTime: "2026-08-31T12:00:00.000Z",
    },
    subscription: SUBSCRIPTION,
    ...extra,
  };
}

function pushRequest(
  body: Record<string, unknown> = pushEnvelope(),
): Request {
  return new Request(`${ORIGIN}/functions/v1/gmail-watch`, {
    method: "POST",
    headers: {
      authorization: "Bearer provider.signed.oidc",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function pushRuntime(fetcher: typeof fetch): MindManualResolverRuntime {
  return runtime(fetcher, {
    GMAIL_PUBSUB_PUSH_AUDIENCE: AUDIENCE,
    GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT: PUSH_IDENTITY,
    GMAIL_PUBSUB_SUBSCRIPTION: SUBSCRIPTION,
  });
}

function verifiedClaims(): GooglePubSubOidcClaims {
  return {
    aud: AUDIENCE,
    email: PUSH_IDENTITY,
    email_verified: true,
    exp: 1_800_000_000,
    iat: 1_799_999_900,
    iss: "https://accounts.google.com",
    sub: "provider-subject",
  };
}

function resolved(
  resolution: MindManualScopeResolution<GmailWatchMigrationContext>,
): asserts resolution is Extract<
  MindManualScopeResolution<GmailWatchMigrationContext>,
  { kind: "resolved" }
> {
  assert(resolution.kind === "resolved", "Expected a resolved migration scope");
}

Deno.test("Gmail user control derives the owner from verified Auth and the exact account row", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = (input) => {
    const url = String(input);
    calls.push(url);
    if (url === `${ORIGIN}/auth/v1/user`) {
      return Promise.resolve(jsonResponse({ id: USER_ID }));
    }
    const parsed = new URL(url);
    assertEquals(
      parsed.pathname,
      "/rest/v1/oauth_accounts",
      "Unexpected owner lookup",
    );
    assertEquals(
      parsed.searchParams.get("id"),
      `eq.${ACCOUNT_ID}`,
      "Account ID was not exact",
    );
    assertEquals(
      parsed.searchParams.get("user_id"),
      `eq.${USER_ID}`,
      "Auth owner was not bound",
    );
    return Promise.resolve(
      jsonResponse([{ id: ACCOUNT_ID, user_id: USER_ID }]),
    );
  };
  const request = controlRequest("Bearer user-access-token", {
    userId: OTHER_USER_ID,
    ownerId: OTHER_USER_ID,
  });
  const resolution = await gmailWatchMigrationScope()(
    request,
    runtime(fetcher),
  );
  resolved(resolution);
  assertEquals(
    resolution.subjectId,
    USER_ID,
    "Request owner overrode canonical ownership",
  );
  assertEquals(resolution.action, "user_renew", "Control action changed");
  assertEquals(resolution.context, {
    kind: "control",
    callerKind: "user",
    subjectId: USER_ID,
    accountId: ACCOUNT_ID,
    action: "renew",
  }, "Resolved user context changed");
  assertEquals(calls.length, 2, "Unexpected authentication or lookup calls");
  assert(request.bodyUsed, "Resolver must consume the bounded original stream");
});

Deno.test("Gmail service control accepts only the exact service bearer and resolves the row owner", async () => {
  let authCalls = 0;
  const fetcher: typeof fetch = (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) authCalls += 1;
    const parsed = new URL(url);
    assertEquals(
      parsed.pathname,
      "/rest/v1/oauth_accounts",
      "Service used an unexpected lookup",
    );
    assertEquals(
      parsed.searchParams.get("user_id"),
      null,
      "Service trusted a supplied owner",
    );
    return Promise.resolve(
      jsonResponse([{ id: ACCOUNT_ID, user_id: USER_ID }]),
    );
  };
  const resolution = await gmailWatchMigrationScope()(
    controlRequest(`Bearer ${SERVICE_KEY}`),
    runtime(fetcher),
  );
  resolved(resolution);
  assertEquals(
    resolution.action,
    "service_renew",
    "Service action was not closed",
  );
  assertEquals(
    authCalls,
    0,
    "Exact service authentication called the user Auth endpoint",
  );
  assertEquals(resolution.context, {
    kind: "control",
    callerKind: "service",
    subjectId: USER_ID,
    accountId: ACCOUNT_ID,
    action: "renew",
  }, "Resolved service context changed");
});

Deno.test("Gmail service-like bearers do not bypass verified user Auth", async () => {
  let accountLookups = 0;
  const fetcher: typeof fetch = (input) => {
    const url = String(input);
    if (url === `${ORIGIN}/auth/v1/user`) {
      return Promise.resolve(jsonResponse({ error: "invalid token" }, 401));
    }
    accountLookups += 1;
    return Promise.resolve(
      jsonResponse([{ id: ACCOUNT_ID, user_id: USER_ID }]),
    );
  };
  const resolution = await gmailWatchMigrationScope()(
    controlRequest(`Bearer ${SERVICE_KEY}-suffix`),
    runtime(fetcher),
  );
  assert(
    resolution.kind === "respond",
    "Inexact service bearer unexpectedly resolved",
  );
  assertEquals(
    resolution.response.status,
    401,
    "Inexact service bearer bypassed Auth",
  );
  assertEquals(accountLookups, 0, "Rejected bearer reached an account lookup");
});

Deno.test("Gmail Pub/Sub verifies provider OIDC before mailbox parsing or owner lookup", async () => {
  const order: string[] = [];
  const fetcher: typeof fetch = (input) => {
    order.push("watch_lookup");
    const parsed = new URL(String(input));
    assertEquals(
      parsed.pathname,
      "/rest/v1/gmail_watch_subscriptions",
      "Push used an unexpected lookup",
    );
    assertEquals(
      parsed.searchParams.get("account_email"),
      "eq.owner@example.com",
      "Mailbox lookup was not exact",
    );
    assertEquals(
      parsed.searchParams.get("subscription_name"),
      `eq.${SUBSCRIPTION}`,
      "Subscription lookup was not exact",
    );
    assertEquals(
      parsed.searchParams.get("status"),
      "eq.active",
      "Inactive watches were eligible",
    );
    return Promise.resolve(jsonResponse([{
      id: WATCH_ID,
      user_id: USER_ID,
      account_email: "owner@example.com",
      subscription_name: SUBSCRIPTION,
      status: "active",
    }]));
  };
  const resolution = await gmailWatchMigrationScope({
    verifyOidc: async () => {
      order.push("oidc");
      return verifiedClaims();
    },
  })(pushRequest(), pushRuntime(fetcher));
  resolved(resolution);
  assertEquals(
    order,
    ["oidc", "watch_lookup"],
    "Owner lookup preceded provider verification",
  );
  assertEquals(resolution.action, "pubsub_history", "Push action changed");
  assertEquals(resolution.context.kind, "pubsub", "Push context changed");
  if (resolution.context.kind === "pubsub") {
    assertEquals(
      resolution.context.subjectId,
      USER_ID,
      "Watch owner was not authoritative",
    );
    assertEquals(
      resolution.context.watchId,
      WATCH_ID,
      "Exact watch was not retained",
    );
  }
});

Deno.test("Gmail Pub/Sub ACKs a missing watch and NACKs an unavailable owner lookup", async () => {
  const resolver = gmailWatchMigrationScope({
    verifyOidc: async () => verifiedClaims(),
  });
  const missing = await resolver(
    pushRequest(),
    pushRuntime(() => Promise.resolve(jsonResponse([]))),
  );
  assert(missing.kind === "respond", "Missing watch unexpectedly resolved");
  assertEquals(
    missing.response.status,
    204,
    "Missing watch was not acknowledged",
  );

  const unavailable = await resolver(
    pushRequest(),
    pushRuntime(() => Promise.resolve(jsonResponse({ error: "down" }, 500))),
  );
  assert(unavailable.kind === "respond", "Failed lookup unexpectedly resolved");
  assertEquals(
    unavailable.response.status,
    503,
    "Failed lookup was acknowledged",
  );
  assertEquals(
    (await unavailable.response.json()).code,
    "WATCH_LOOKUP_FAILED",
    "Failed lookup returned the wrong retry contract",
  );
});

Deno.test("Gmail Pub/Sub-shaped requests never fall back to user or service control", async () => {
  let lookups = 0;
  const resolution = await gmailWatchMigrationScope({
    verifyOidc: async () => {
      throw new GoogleOidcVerificationError(
        "invalid provider",
        "OIDC_SIGNATURE_INVALID",
      );
    },
  })(
    pushRequest(pushEnvelope({ action: "renew", accountId: ACCOUNT_ID })),
    pushRuntime(() => {
      lookups += 1;
      return Promise.resolve(jsonResponse({ id: USER_ID }));
    }),
  );
  assert(
    resolution.kind === "respond",
    "Invalid provider request unexpectedly resolved",
  );
  assertEquals(
    resolution.response.status,
    401,
    "Invalid provider identity was not rejected",
  );
  assertEquals(
    lookups,
    0,
    "Invalid provider request reached an application lookup",
  );
  assertEquals(
    (await resolution.response.json()).code,
    "OIDC_SIGNATURE_INVALID",
    "OIDC rejection code changed",
  );
});

Deno.test("Gmail user control cannot target another owner's account", async () => {
  const fetcher: typeof fetch = (input) => {
    const url = String(input);
    if (url === `${ORIGIN}/auth/v1/user`) {
      return Promise.resolve(jsonResponse({ id: USER_ID }));
    }
    const parsed = new URL(url);
    assertEquals(
      parsed.searchParams.get("user_id"),
      `eq.${USER_ID}`,
      "Auth owner filter was omitted",
    );
    return Promise.resolve(jsonResponse([]));
  };
  const resolution = await gmailWatchMigrationScope()(
    controlRequest("Bearer user-access-token", { userId: OTHER_USER_ID }),
    runtime(fetcher),
  );
  assert(
    resolution.kind === "respond",
    "Cross-owner account unexpectedly resolved",
  );
  assertEquals(
    resolution.response.status,
    404,
    "Cross-owner account existence leaked",
  );
});
