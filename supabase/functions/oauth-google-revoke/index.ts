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
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";

class OAuthRevokeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OAuthRevokeError";
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
  if (!match) throw new OAuthRevokeError("Authentication required", 401);
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
      throw new OAuthRevokeError("Method not allowed", 405);
    }

    const supabase = createClient(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const tokenEncryptionKey = await loadOAuthTokenEncryptionKey();

    const { data: authData, error: authError } = await supabase.auth.getUser(
      bearerToken(request),
    );
    if (authError || !authData.user) {
      throw new OAuthRevokeError("Authentication required", 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new OAuthRevokeError("Invalid request body", 400);
    }
    const accountId = rawBody && typeof rawBody === "object" &&
        !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>).account_id
      : null;
    if (!isUuid(accountId)) {
      throw new OAuthRevokeError("A valid OAuth account ID is required", 400);
    }

    const { data: account, error: accountError } = await supabase
      .from("oauth_accounts")
      .select("id,user_id,provider,access_token,refresh_token")
      .eq("id", accountId)
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .maybeSingle();
    if (accountError || !account) {
      throw new OAuthRevokeError("OAuth account not found", 404);
    }

    const storedCredential = typeof account.refresh_token === "string"
      ? account.refresh_token
      : account.access_token;
    if (typeof storedCredential !== "string") {
      throw new OAuthRevokeError("No provider credential is available", 409);
    }
    const providerCredential = await decryptOAuthToken(
      storedCredential,
      tokenEncryptionKey,
    );

    const providerResponse = await fetch(
      "https://oauth2.googleapis.com/revoke",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: providerCredential }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    // Google uses 400 for an already-invalid credential. Treat that as an
    // already-revoked terminal state, but never delete local state for network
    // failures or other provider errors.
    if (!providerResponse.ok && providerResponse.status !== 400) {
      console.error("Google credential revocation failed", {
        status: providerResponse.status,
      });
      throw new OAuthRevokeError("Google access could not be revoked", 502);
    }

    const { error: deleteError } = await supabase
      .from("oauth_accounts")
      .delete()
      .eq("id", accountId)
      .eq("user_id", authData.user.id);
    if (deleteError) {
      console.error("OAuth account deletion failed", {
        code: deleteError.code,
      });
      throw new OAuthRevokeError(
        "Google access was revoked, but the local account needs cleanup",
        500,
      );
    }

    return jsonResponse(origin, {
      success: true,
      accountId,
      providerStatus: providerResponse.status === 400
        ? "already-revoked"
        : "revoked",
    }, 200);
  } catch (error) {
    const status = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthRevokeError
      ? error.status
      : 500;
    const message = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthRevokeError
      ? error.message
      : "Unable to revoke Google access";
    if (status >= 500) {
      console.error("OAuth revoke failed", {
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

serve(handler);
