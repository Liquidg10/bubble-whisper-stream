import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  googleOAuthCorsHeaders,
  GoogleOAuthRequestError,
  isUuid,
  requireAllowedGoogleOAuthOrigin,
} from "../_shared/googleOAuthPolicy.ts";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";

interface GmailSyncRequest {
  accountId?: unknown;
  operation?: unknown;
  messageId?: unknown;
  query?: unknown;
  maxResults?: unknown;
  pageToken?: unknown;
}

class GmailSyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GmailSyncError";
  }
}

function requireEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new GmailSyncError("Authentication required", 401);
  return match[1];
}

function responseHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { "Content-Type": "application/json" };
  try {
    return {
      ...googleOAuthCorsHeaders(origin),
      "Content-Type": "application/json",
    };
  } catch {
    return { "Content-Type": "application/json" };
  }
}

function jsonResponse(
  origin: string | null,
  body: unknown,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function parseRequest(value: unknown): {
  accountId: string;
  operation: "list" | "get" | "search";
  messageId?: string;
  query?: string;
  maxResults: number;
  pageToken?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GmailSyncError("Invalid request body", 400);
  }
  const body = value as GmailSyncRequest;
  if (!isUuid(body.accountId)) {
    throw new GmailSyncError("A valid OAuth account ID is required", 400);
  }
  if (!["list", "get", "search"].includes(String(body.operation))) {
    throw new GmailSyncError("Unsupported Gmail operation", 400);
  }
  const operation = body.operation as "list" | "get" | "search";
  if (
    body.messageId !== undefined &&
    (typeof body.messageId !== "string" || !body.messageId ||
      body.messageId.length > 512)
  ) {
    throw new GmailSyncError("Invalid Gmail message ID", 400);
  }
  if (
    body.query !== undefined &&
    (typeof body.query !== "string" || body.query.length > 2048)
  ) {
    throw new GmailSyncError("Invalid Gmail search query", 400);
  }
  if (
    body.pageToken !== undefined &&
    (typeof body.pageToken !== "string" || body.pageToken.length > 4096)
  ) {
    throw new GmailSyncError("Invalid Gmail page token", 400);
  }
  const maxResults = body.maxResults === undefined ? 50 : body.maxResults;
  if (
    typeof maxResults !== "number" || !Number.isInteger(maxResults) ||
    maxResults < 1 || maxResults > 100
  ) {
    throw new GmailSyncError(
      "maxResults must be an integer from 1 to 100",
      400,
    );
  }
  if (operation === "get" && typeof body.messageId !== "string") {
    throw new GmailSyncError("Gmail message ID is required", 400);
  }
  if (operation === "search" && typeof body.query !== "string") {
    throw new GmailSyncError("Gmail search query is required", 400);
  }
  return {
    accountId: body.accountId,
    operation,
    messageId: body.messageId as string | undefined,
    query: body.query as string | undefined,
    maxResults,
    pageToken: body.pageToken as string | undefined,
  };
}

function buildGmailUrl(input: ReturnType<typeof parseRequest>): string {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
  if (input.operation === "get") {
    return `${base}/${encodeURIComponent(input.messageId!)}`;
  }

  const params = new URLSearchParams({ maxResults: String(input.maxResults) });
  if (input.query) params.set("q", input.query);
  if (input.pageToken) params.set("pageToken", input.pageToken);
  return `${base}?${params.toString()}`;
}

const handler = async (request: Request): Promise<Response> => {
  const requestOrigin = request.headers.get("origin");

  try {
    const origin = requireAllowedGoogleOAuthOrigin(requestOrigin);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: googleOAuthCorsHeaders(origin),
      });
    }
    if (request.method !== "POST") {
      throw new GmailSyncError("Method not allowed", 405);
    }

    const supabase = createClient(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const googleClientId = requireEnvironment("GOOGLE_CLIENT_ID");
    const googleClientSecret = requireEnvironment("GOOGLE_CLIENT_SECRET");
    const encryptionKey = await loadOAuthTokenEncryptionKey();

    const { data: authData, error: authError } = await supabase.auth.getUser(
      bearerToken(request),
    );
    if (authError || !authData.user) {
      throw new GmailSyncError("Authentication required", 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new GmailSyncError("Invalid request body", 400);
    }
    const input = parseRequest(rawBody);

    const { data: account, error: accountError } = await supabase
      .from("oauth_accounts")
      .select("id,user_id,provider,access_token,refresh_token")
      .eq("id", input.accountId)
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .maybeSingle();
    if (accountError || !account || typeof account.access_token !== "string") {
      throw new GmailSyncError("OAuth account not found", 404);
    }

    let accessToken = await decryptOAuthToken(
      account.access_token,
      encryptionKey,
    );
    const gmailUrl = buildGmailUrl(input);
    const providerRequest = (token: string) =>
      fetch(gmailUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });

    let gmailResponse = await providerRequest(accessToken);
    if (gmailResponse.status === 401) {
      if (typeof account.refresh_token !== "string") {
        throw new GmailSyncError(
          "Gmail access expired; reconnect the account",
          409,
        );
      }
      const refreshToken = await decryptOAuthToken(
        account.refresh_token,
        encryptionKey,
      );
      const refreshResponse = await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: googleClientId,
            client_secret: googleClientSecret,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!refreshResponse.ok) {
        console.error("Gmail token refresh failed", {
          status: refreshResponse.status,
        });
        throw new GmailSyncError(
          "Gmail access expired; reconnect the account",
          409,
        );
      }
      const refreshData = await refreshResponse.json();
      if (
        typeof refreshData?.access_token !== "string" ||
        !refreshData.access_token ||
        refreshData.access_token.length > 64 * 1024 ||
        typeof refreshData?.expires_in !== "number" ||
        !Number.isFinite(refreshData.expires_in) ||
        refreshData.expires_in <= 0 ||
        (refreshData.refresh_token !== undefined &&
          (typeof refreshData.refresh_token !== "string" ||
            !refreshData.refresh_token ||
            refreshData.refresh_token.length > 64 * 1024))
      ) {
        throw new GmailSyncError("Gmail token refresh failed", 502);
      }
      accessToken = refreshData.access_token;
      const tokenUpdate: Record<string, unknown> = {
        access_token: await encryptOAuthToken(accessToken, encryptionKey),
        expires_at: new Date(
          Date.now() + refreshData.expires_in * 1000,
        ).toISOString(),
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (typeof refreshData.refresh_token === "string") {
        tokenUpdate.refresh_token = await encryptOAuthToken(
          refreshData.refresh_token,
          encryptionKey,
        );
      }
      const { error: updateError } = await supabase
        .from("oauth_accounts")
        .update(tokenUpdate)
        .eq("id", input.accountId)
        .eq("user_id", authData.user.id);
      if (updateError) {
        throw new GmailSyncError(
          "Refreshed Gmail access could not be saved",
          500,
        );
      }
      gmailResponse = await providerRequest(accessToken);
    }

    if (!gmailResponse.ok) {
      console.error("Gmail API request failed", {
        status: gmailResponse.status,
      });
      throw new GmailSyncError("Gmail request failed", 502);
    }
    const providerData = await gmailResponse.json();

    const now = new Date().toISOString();
    const { error: logError } = await supabase.from("sync_logs").insert({
      user_id: authData.user.id,
      provider: "google",
      service_type: "gmail",
      operation: input.operation,
      status: "success",
      account_id: input.accountId,
      items_processed: input.operation === "get"
        ? 1
        : Array.isArray(providerData?.messages)
        ? providerData.messages.length
        : 0,
      started_at: now,
      completed_at: now,
    });
    if (logError) {
      console.warn("Gmail sync receipt failed", { code: logError.code });
    }

    return jsonResponse(origin, providerData, 200);
  } catch (error) {
    const status = error instanceof GoogleOAuthRequestError ||
        error instanceof GmailSyncError
      ? error.status
      : 500;
    const message = error instanceof GoogleOAuthRequestError ||
        error instanceof GmailSyncError
      ? error.message
      : "Unable to sync Gmail";
    if (status >= 500) {
      console.error("Gmail sync failed", {
        category: error instanceof Error ? error.name : "unknown",
      });
    }
    return jsonResponse(requestOrigin, { error: message }, status);
  }
};

serve(wrapMindManualSubjectHandler("gmail-sync", verifiedBearerMindManualScope("authenticated_request"), handler));
