import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  combineGoogleOAuthScopes,
  getGoogleOAuthRedirectUri,
  googleOAuthCorsHeaders,
  GoogleOAuthRequestError,
  parseGoogleOAuthStartRequest,
  requireAllowedGoogleOAuthOrigin,
} from "../_shared/googleOAuthPolicy.ts";
import {
  decryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";

class OAuthStartError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OAuthStartError";
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
  if (!match) throw new OAuthStartError("Authentication required", 401);
  return match[1];
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function codeChallenge(codeVerifier: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifier),
    ),
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
      throw new OAuthStartError("Method not allowed", 405);
    }

    const supabase = createClient(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const googleClientId = requireEnvironment("GOOGLE_CLIENT_ID");

    // Fail before sending the user to Google if secure persistence is not
    // available. The callback never has a plaintext/default-key fallback.
    const tokenEncryptionKey = await loadOAuthTokenEncryptionKey();

    const { data: authData, error: authError } = await supabase.auth.getUser(
      bearerToken(request),
    );
    if (authError || !authData.user) {
      throw new OAuthStartError("Authentication required", 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new OAuthStartError("Invalid request body", 400);
    }
    const { accountId, requestedScopes } = parseGoogleOAuthStartRequest(
      rawBody,
    );

    let existingScopes: string[] = [];
    if (accountId) {
      const { data: account, error: accountError } = await supabase
        .from("oauth_accounts")
        .select("id,scopes,scopes_string,refresh_token")
        .eq("id", accountId)
        .eq("user_id", authData.user.id)
        .eq("provider", "google")
        .maybeSingle();
      if (accountError || !account) {
        throw new OAuthStartError("OAuth account not found", 404);
      }
      if (typeof account.refresh_token !== "string") {
        throw new OAuthStartError(
          "This Gmail connection must be reauthorized before permissions can change",
          409,
        );
      }
      // Prove the configured key matches this account before sending the user
      // through another consent flow. A wrong but correctly sized key must fail
      // here instead of silently replacing an otherwise recoverable grant.
      await decryptOAuthToken(account.refresh_token, tokenEncryptionKey);
      existingScopes = account.scopes_string?.split(/\s+/).filter(Boolean) ??
        account.scopes ?? [];
    }

    const scopes = combineGoogleOAuthScopes(existingScopes, requestedScopes);
    const redirectUri = getGoogleOAuthRedirectUri(origin);
    const state = randomBase64Url(32);
    const codeVerifier = randomBase64Url(64);

    const { error: cleanupError } = await supabase.rpc(
      "cleanup_expired_oauth_state",
    );
    if (cleanupError) {
      console.warn("Expired OAuth state cleanup failed", {
        code: cleanupError.code,
      });
    }

    const { error: stateError } = await supabase.from("oauth_state").insert({
      state,
      code_verifier: codeVerifier,
      service: "email",
      origin,
      redirect_uri: redirectUri,
      user_id: authData.user.id,
      oauth_account_id: accountId,
      requested_scope: scopes.join(" "),
    });
    if (stateError) {
      console.error("OAuth state persistence failed", {
        code: stateError.code,
      });
      throw new OAuthStartError("Unable to initialize Gmail connection", 500);
    }

    const parameters = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent select_account",
      state,
      code_challenge: await codeChallenge(codeVerifier),
      code_challenge_method: "S256",
    });

    return jsonResponse(origin, {
      success: true,
      authUrl:
        `https://accounts.google.com/o/oauth2/v2/auth?${parameters.toString()}`,
      state,
      service: "email",
    }, 200);
  } catch (error) {
    const status = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthStartError
      ? error.status
      : 500;
    const message = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthStartError
      ? error.message
      : "Unable to initialize Gmail connection";

    if (status >= 500) {
      console.error("OAuth start failed", {
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

serve(wrapMindManualSubjectHandler("oauth-google-start", verifiedBearerMindManualScope("authenticated_request"), handler));
