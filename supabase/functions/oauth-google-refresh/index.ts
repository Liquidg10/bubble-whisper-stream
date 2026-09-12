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

class OAuthRefreshError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OAuthRefreshError";
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
  if (!match) throw new OAuthRefreshError("Authentication required", 401);
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
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
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
      throw new OAuthRefreshError("Method not allowed", 405);
    }

    const supabase = createClient(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const googleClientId = requireEnvironment("GOOGLE_CLIENT_ID");
    const googleClientSecret = requireEnvironment("GOOGLE_CLIENT_SECRET");
    const tokenEncryptionKey = await loadOAuthTokenEncryptionKey();

    const { data: authData, error: authError } = await supabase.auth.getUser(
      bearerToken(request),
    );
    if (authError || !authData.user) {
      throw new OAuthRefreshError("Authentication required", 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new OAuthRefreshError("Invalid request body", 400);
    }
    const accountId = rawBody && typeof rawBody === "object" &&
        !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>).account_id
      : null;
    if (!isUuid(accountId)) {
      throw new OAuthRefreshError("A valid OAuth account ID is required", 400);
    }

    const { data: account, error: accountError } = await supabase
      .from("oauth_accounts")
      .select("id,user_id,provider,refresh_token,scopes_string")
      .eq("id", accountId)
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .maybeSingle();
    if (accountError || !account) {
      throw new OAuthRefreshError("OAuth account not found", 404);
    }
    if (typeof account.refresh_token !== "string") {
      throw new OAuthRefreshError("No refresh credential is available", 409);
    }

    const refreshToken = await decryptOAuthToken(
      account.refresh_token,
      tokenEncryptionKey,
    );
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      console.error("Google token refresh failed", {
        status: tokenResponse.status,
      });
      throw new OAuthRefreshError("Google token refresh failed", 502);
    }

    let tokenPayload: unknown;
    try {
      tokenPayload = await tokenResponse.json();
    } catch {
      throw new OAuthRefreshError("Google token refresh failed", 502);
    }
    if (
      !tokenPayload || typeof tokenPayload !== "object" ||
      Array.isArray(tokenPayload)
    ) {
      throw new OAuthRefreshError("Google token refresh failed", 502);
    }
    const tokens = tokenPayload as Record<string, unknown>;
    if (
      typeof tokens.access_token !== "string" || !tokens.access_token ||
      tokens.access_token.length > 64 * 1024 ||
      typeof tokens.expires_in !== "number" ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 ||
      (tokens.refresh_token !== undefined &&
        (typeof tokens.refresh_token !== "string" || !tokens.refresh_token))
    ) {
      throw new OAuthRefreshError("Google token refresh failed", 502);
    }

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000,
    ).toISOString();
    const updateValues: Record<string, unknown> = {
      access_token: await encryptOAuthToken(
        tokens.access_token,
        tokenEncryptionKey,
      ),
      expires_at: expiresAt,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (typeof tokens.refresh_token === "string") {
      updateValues.refresh_token = await encryptOAuthToken(
        tokens.refresh_token,
        tokenEncryptionKey,
      );
    }
    if (typeof tokens.token_type === "string" && tokens.token_type) {
      updateValues.token_type = tokens.token_type;
    }
    if (typeof tokens.scope === "string" && tokens.scope) {
      updateValues.scopes_string = tokens.scope;
      updateValues.scopes = tokens.scope.split(/\s+/).filter(Boolean);
    }

    const { error: updateError } = await supabase
      .from("oauth_accounts")
      .update(updateValues)
      .eq("id", accountId)
      .eq("user_id", authData.user.id);
    if (updateError) {
      console.error("OAuth token persistence failed", {
        code: updateError.code,
      });
      throw new OAuthRefreshError("Unable to save refreshed access", 500);
    }

    return jsonResponse(origin, {
      success: true,
      accountId,
      expiresAt,
      scopes: typeof tokens.scope === "string"
        ? tokens.scope.split(/\s+/).filter(Boolean)
        : account.scopes_string?.split(/\s+/).filter(Boolean) ?? [],
    }, 200);
  } catch (error) {
    const status = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthRefreshError
      ? error.status
      : 500;
    const message = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthRefreshError
      ? error.message
      : "Unable to refresh Google access";
    if (status >= 500) {
      console.error("OAuth refresh failed", {
        category: error instanceof Error ? error.name : "unknown",
      });
    }
    return jsonResponse(
      requestOrigin,
      { success: false, error: message },
      status,
    );
  }
};

serve(wrapMindManualSubjectHandler("oauth-google-refresh", verifiedBearerMindManualScope("authenticated_request"), handler));
