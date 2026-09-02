import {
  type MindManualScopeResolution,
  type MindManualScopeResolver,
  verifiedBearerMindManualScope,
} from "./migrationWriteFence.ts";
import { isExactServiceRoleBearer } from "./calendarWatchSecurity.ts";
import {
  type GmailPubSubNotification,
  type GmailWatchAction,
  GmailWatchProtocolError,
  isPubSubEnvelopeCandidate,
  normalizeGmailWatchAction,
  normalizeOAuthAccountId,
  parseGmailPubSubEnvelope,
} from "../gmail-watch/gmailWatchProtocol.ts";
import {
  extractOidcBearerToken,
  GoogleOidcVerificationError,
  verifyGooglePubSubOidcJwt,
} from "../gmail-watch/googleOidcJwt.ts";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_REQUEST_CHUNKS = 1024;
const REQUEST_DEADLINE_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "X-Gmail-Watch-Contract": "pubsub-oidc-v1",
};
const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

type JsonObject = Record<string, unknown>;

export interface GmailMigrationScopeDependencies {
  verifyOidc?: typeof verifyGooglePubSubOidcJwt;
}

export interface GmailWatchControlMigrationContext {
  kind: "control";
  callerKind: "user" | "service";
  subjectId: string;
  accountId: string;
  action: GmailWatchAction;
}

export interface GmailWatchPushMigrationContext {
  kind: "pubsub";
  subjectId: string;
  watchId: string;
  notification: GmailPubSubNotification;
}

export type GmailWatchMigrationContext =
  | GmailWatchControlMigrationContext
  | GmailWatchPushMigrationContext;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function unavailable(): Response {
  return jsonResponse(
    {
      error: "MIND_MANUAL_TEMPORARILY_UNAVAILABLE",
      message: "Mind Manual is temporarily unavailable. Please retry shortly.",
    },
    503,
    { "Retry-After": "30" },
  );
}

function pushAcknowledgement(): Response {
  return new Response(null, {
    status: 204,
    headers: { "X-Gmail-Watch-Contract": "pubsub-oidc-v1" },
  });
}

function pushRetry(code: string): Response {
  return jsonResponse({
    error: "Gmail push processing must be retried",
    code,
  }, 503);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value) &&
    value !== "00000000-0000-0000-0000-000000000000";
}

async function readRequestBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_REQUEST_BYTES)
  ) {
    void request.body?.cancel().catch(() => undefined);
    throw new GmailWatchProtocolError(
      "Request body is too large",
      "REQUEST_TOO_LARGE",
    );
  }
  // Consume the original stream: cloning would tee it and allow an unread
  // branch to buffer attacker-controlled bytes outside this limit.
  const reader = request.body?.getReader();
  if (!reader) {
    throw new GmailWatchProtocolError(
      "Request body is invalid",
      "INVALID_REQUEST",
    );
  }
  // A single bounded buffer also snapshots reused producer chunks immediately.
  const bytes = new Uint8Array(MAX_REQUEST_BYTES);
  let byteLength = 0;
  let chunkCount = 0;
  const deadline = Date.now() + REQUEST_DEADLINE_MS;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() =>
              reject(
                new GmailWatchProtocolError(
                  "Request body timed out",
                  "REQUEST_TIMEOUT",
                ),
              ), Math.max(0, deadline - Date.now()));
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (chunk.done) break;
      chunkCount += 1;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES || chunkCount > MAX_REQUEST_CHUNKS) {
        throw new GmailWatchProtocolError(
          "Request body is too large",
          "REQUEST_TOO_LARGE",
        );
      }
      bytes.set(chunk.value, byteLength - chunk.value.byteLength);
    }
  } catch (error) {
    // Do not wait for a potentially hostile stream's cancellation promise.
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, byteLength),
      ),
    );
  } catch {
    throw new GmailWatchProtocolError(
      "Request body is not valid JSON",
      "INVALID_JSON",
    );
  }
}

async function readExactRows(
  url: URL,
  runtime: { serviceKey: string; fetch: typeof fetch },
): Promise<unknown[] | null> {
  let response: Response;
  try {
    response = await runtime.fetch(url.toString(), {
      method: "GET",
      redirect: "error",
      headers: {
        apikey: runtime.serviceKey,
        Authorization: `Bearer ${runtime.serviceKey}`,
        Accept: "application/json",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const rows: unknown = await response.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

type AccountOwnerLookup = Readonly<
  | { kind: "resolved"; accountId: string; subjectId: string }
  | { kind: "missing" }
  | { kind: "unavailable" }
>;

async function resolveAccountOwner(
  accountId: string,
  expectedUserId: string | null,
  runtime: { origin: string; serviceKey: string; fetch: typeof fetch },
): Promise<AccountOwnerLookup> {
  const url = new URL(`${runtime.origin}/rest/v1/oauth_accounts`);
  url.searchParams.set("select", "id,user_id");
  url.searchParams.set("id", `eq.${accountId}`);
  if (expectedUserId) url.searchParams.set("user_id", `eq.${expectedUserId}`);
  url.searchParams.set("limit", "2");
  const rows = await readExactRows(url, runtime);
  if (rows === null || rows.length > 1) return { kind: "unavailable" };
  if (rows.length === 0) return { kind: "missing" };
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { kind: "unavailable" };
  }
  const record = row as JsonObject;
  if (
    record.id !== accountId || !validUuid(record.user_id) ||
    (expectedUserId !== null && record.user_id !== expectedUserId)
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "resolved", accountId, subjectId: record.user_id };
}

type WatchOwnerLookup = Readonly<
  | { kind: "resolved"; watchId: string; subjectId: string }
  | { kind: "missing" }
  | { kind: "unavailable" }
>;

async function resolveActiveWatchOwner(
  notification: GmailPubSubNotification,
  runtime: { origin: string; serviceKey: string; fetch: typeof fetch },
): Promise<WatchOwnerLookup> {
  const url = new URL(`${runtime.origin}/rest/v1/gmail_watch_subscriptions`);
  url.searchParams.set(
    "select",
    "id,user_id,account_email,subscription_name,status",
  );
  url.searchParams.set("account_email", `eq.${notification.emailAddress}`);
  url.searchParams.set("subscription_name", `eq.${notification.subscription}`);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", "2");
  const rows = await readExactRows(url, runtime);
  if (rows === null || rows.length > 1) return { kind: "unavailable" };
  if (rows.length === 0) return { kind: "missing" };
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { kind: "unavailable" };
  }
  const record = row as JsonObject;
  if (
    !validUuid(record.id) || !validUuid(record.user_id) ||
    record.account_email !== notification.emailAddress ||
    record.subscription_name !== notification.subscription ||
    record.status !== "active"
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "resolved", watchId: record.id, subjectId: record.user_id };
}

async function resolvePushScope(
  request: Request,
  body: unknown,
  runtime: Parameters<MindManualScopeResolver<GmailWatchMigrationContext>>[1],
  dependencies: GmailMigrationScopeDependencies,
): Promise<MindManualScopeResolution<GmailWatchMigrationContext>> {
  const bearer = extractOidcBearerToken(request.headers.get("authorization"));
  if (!bearer) {
    return {
      kind: "respond",
      response: jsonResponse({
        error: "Unauthorized Pub/Sub push",
        code: "OIDC_TOKEN_MISSING",
      }, 401),
    };
  }
  try {
    // Provider authentication is deliberately complete before parsing the
    // mailbox identity or issuing any application-row lookup.
    await (dependencies.verifyOidc ?? verifyGooglePubSubOidcJwt)(bearer, {
      expectedAudience: runtime.env("GMAIL_PUBSUB_PUSH_AUDIENCE") ?? "",
      expectedServiceAccountEmail:
        runtime.env("GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT") ?? "",
      fetcher: runtime.fetch,
    });
    const notification = parseGmailPubSubEnvelope(
      body,
      runtime.env("GMAIL_PUBSUB_SUBSCRIPTION") ?? "",
    );
    const owner = await resolveActiveWatchOwner(notification, runtime);
    if (owner.kind === "missing") {
      return { kind: "respond", response: pushAcknowledgement() };
    }
    if (owner.kind !== "resolved") {
      return { kind: "respond", response: pushRetry("WATCH_LOOKUP_FAILED") };
    }
    return {
      kind: "resolved",
      subjectId: owner.subjectId,
      action: "pubsub_history",
      context: Object.freeze({
        kind: "pubsub",
        subjectId: owner.subjectId,
        watchId: owner.watchId,
        notification,
      }),
    };
  } catch (error) {
    if (error instanceof GoogleOidcVerificationError) {
      if (
        ["OIDC_JWKS_UNAVAILABLE", "OIDC_JWKS_INVALID", "OIDC_CONFIG_MISSING"]
          .includes(error.code)
      ) {
        return {
          kind: "respond",
          response: pushRetry("OIDC_VERIFICATION_UNAVAILABLE"),
        };
      }
      return {
        kind: "respond",
        response: jsonResponse({
          error: "Unauthorized Pub/Sub push",
          code: error.code,
        }, 401),
      };
    }
    if (error instanceof GmailWatchProtocolError) {
      return {
        kind: "respond",
        response: jsonResponse({ error: error.message, code: error.code }, 400),
      };
    }
    return { kind: "respond", response: unavailable() };
  }
}

export function gmailWatchMigrationScope(
  dependencies: GmailMigrationScopeDependencies = {},
): MindManualScopeResolver<GmailWatchMigrationContext> {
  return async (request, runtime) => {
    if (request.method !== "POST") {
      return {
        kind: "respond",
        response: jsonResponse({
          error: "Method not allowed",
          code: "METHOD_NOT_ALLOWED",
        }, 405),
      };
    }

    let body: unknown;
    try {
      body = await readRequestBody(request);
    } catch (error) {
      const protocolError = error instanceof GmailWatchProtocolError
        ? error
        : new GmailWatchProtocolError(
          "Request body is invalid",
          "INVALID_REQUEST",
        );
      return {
        kind: "respond",
        response: jsonResponse(
          {
            error: protocolError.message,
            code: protocolError.code,
          },
          protocolError.code === "REQUEST_TOO_LARGE"
            ? 413
            : protocolError.code === "REQUEST_TIMEOUT"
            ? 408
            : 400,
        ),
      };
    }

    if (isPubSubEnvelopeCandidate(body)) {
      return await resolvePushScope(request, body, runtime, dependencies);
    }

    const input = body && typeof body === "object" && !Array.isArray(body)
      ? body as JsonObject
      : {};
    const action = normalizeGmailWatchAction(input.action, input.operation);
    const accountId = normalizeOAuthAccountId(input.accountId);
    if (!action || !accountId) {
      return {
        kind: "respond",
        response: jsonResponse({
          error:
            "A specific OAuth account and start, renew, or stop action are required",
          code: "INVALID_CONTROL_REQUEST",
        }, 400),
      };
    }

    const authorization = request.headers.get("authorization");
    if (
      authorization && authorization.length <= 16_384 &&
      isExactServiceRoleBearer(authorization, runtime.serviceKey)
    ) {
      const owner = await resolveAccountOwner(accountId, null, runtime);
      if (owner.kind === "missing") {
        return {
          kind: "respond",
          response: jsonResponse({
            error: "OAuth account not found",
            code: "OAUTH_ACCOUNT_NOT_FOUND",
          }, 404),
        };
      }
      if (owner.kind !== "resolved") {
        return { kind: "respond", response: unavailable() };
      }
      return {
        kind: "resolved",
        subjectId: owner.subjectId,
        action: `service_${action}`,
        context: Object.freeze({
          kind: "control",
          callerKind: "service",
          subjectId: owner.subjectId,
          accountId: owner.accountId,
          action,
        }),
      };
    }

    const authenticated = await verifiedBearerMindManualScope("user_request")(
      request,
      runtime,
    );
    if (authenticated.kind === "respond") return authenticated;
    const owner = await resolveAccountOwner(
      accountId,
      authenticated.subjectId,
      runtime,
    );
    if (owner.kind === "missing") {
      return {
        kind: "respond",
        response: jsonResponse({
          error: "OAuth account not found",
          code: "OAUTH_ACCOUNT_NOT_FOUND",
        }, 404),
      };
    }
    if (owner.kind !== "resolved") {
      return { kind: "respond", response: unavailable() };
    }
    return {
      kind: "resolved",
      subjectId: owner.subjectId,
      action: `user_${action}`,
      context: Object.freeze({
        kind: "control",
        callerKind: "user",
        subjectId: owner.subjectId,
        accountId: owner.accountId,
        action,
      }),
    };
  };
}
