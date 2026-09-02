import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  combineGoogleOAuthScopes,
  getGoogleOAuthRedirectUri,
  googleOAuthCorsHeaders,
  GoogleOAuthRequestError,
  requireAllowedGoogleOAuthOrigin,
} from "../_shared/googleOAuthPolicy.ts";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";
import { buildGoogleOAuthCompletion } from "./completionResponse.ts";

interface ConsumedOAuthState {
  code_verifier: string;
  service: string;
  origin: string;
  redirect_uri: string;
  oauth_account_id: string | null;
  requested_scope: string;
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
}

class OAuthCallbackError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OAuthCallbackError";
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
  if (!match) throw new OAuthCallbackError("Authentication required", 401);
  return match[1];
}

function parseCallbackBody(value: unknown): { code: string; state: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthCallbackError("Invalid callback request", 400);
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.code !== "string" || !body.code || body.code.length > 4096 ||
    typeof body.state !== "string" || !body.state || body.state.length > 512
  ) {
    throw new OAuthCallbackError("Invalid callback request", 400);
  }
  return { code: body.code, state: body.state };
}

function parseGoogleTokens(value: unknown): GoogleTokenResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthCallbackError("Google token exchange failed", 502);
  }
  const token = value as Record<string, unknown>;
  if (
    typeof token.access_token !== "string" || !token.access_token ||
    token.access_token.length > 64 * 1024 ||
    typeof token.token_type !== "string" || !token.token_type ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) || token.expires_in <= 0 ||
    typeof token.scope !== "string" || !token.scope ||
    (token.refresh_token !== undefined &&
      (typeof token.refresh_token !== "string" || !token.refresh_token ||
        token.refresh_token.length > 64 * 1024))
  ) {
    throw new OAuthCallbackError("Google token exchange failed", 502);
  }
  return token as unknown as GoogleTokenResponse;
}

function parseGoogleUser(value: unknown): GoogleUserInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthCallbackError("Unable to verify the Google account", 502);
  }
  const user = value as Record<string, unknown>;
  if (
    typeof user.sub !== "string" || !user.sub || user.sub.length > 512 ||
    typeof user.email !== "string" || !user.email || user.email.length > 320 ||
    user.email_verified !== true
  ) {
    throw new OAuthCallbackError("Unable to verify the Google account", 502);
  }
  return user as unknown as GoogleUserInfo;
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
      throw new OAuthCallbackError("Method not allowed", 405);
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
      throw new OAuthCallbackError("Authentication required", 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new OAuthCallbackError("Invalid callback request", 400);
    }
    const { code, state } = parseCallbackBody(rawBody);

    const { data: consumedRows, error: consumeError } = await supabase.rpc(
      "consume_google_oauth_state",
      { p_state: state, p_user_id: authData.user.id },
    );
    const consumed = Array.isArray(consumedRows)
      ? consumedRows[0] as ConsumedOAuthState | undefined
      : undefined;
    if (consumeError || !consumed) {
      if (consumeError) {
        console.error("OAuth state consume failed", {
          code: consumeError.code,
        });
      }
      throw new OAuthCallbackError("Invalid or expired OAuth state", 400);
    }
    if (
      consumed.service !== "email" || consumed.origin !== origin ||
      consumed.redirect_uri !== getGoogleOAuthRedirectUri(origin)
    ) {
      throw new OAuthCallbackError("Invalid or expired OAuth state", 400);
    }

    const requestedScopes = consumed.requested_scope.split(/\s+/).filter(
      Boolean,
    );
    const normalizedRequestedScopes = combineGoogleOAuthScopes(
      [],
      requestedScopes,
    );
    if (
      requestedScopes.length !== normalizedRequestedScopes.length ||
      requestedScopes.some((scope) =>
        !normalizedRequestedScopes.includes(scope)
      )
    ) {
      throw new OAuthCallbackError("Invalid or expired OAuth state", 400);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: consumed.redirect_uri,
        code_verifier: consumed.code_verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      console.error("Google token exchange failed", {
        status: tokenResponse.status,
      });
      throw new OAuthCallbackError("Google token exchange failed", 502);
    }

    let tokenPayload: unknown;
    try {
      tokenPayload = await tokenResponse.json();
    } catch {
      throw new OAuthCallbackError("Google token exchange failed", 502);
    }
    const tokens = parseGoogleTokens(tokenPayload);

    const grantedScopes = new Set(tokens.scope.split(/\s+/).filter(Boolean));
    for (
      const requestedScope of requestedScopes.filter((scope) =>
        scope.startsWith("https://www.googleapis.com/auth/gmail.")
      )
    ) {
      if (!grantedScopes.has(requestedScope)) {
        throw new OAuthCallbackError(
          "Google did not grant the requested Gmail permissions",
          409,
        );
      }
    }

    const userResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!userResponse.ok) {
      console.error("Google identity verification failed", {
        status: userResponse.status,
      });
      throw new OAuthCallbackError("Unable to verify the Google account", 502);
    }

    let userPayload: unknown;
    try {
      userPayload = await userResponse.json();
    } catch {
      throw new OAuthCallbackError("Unable to verify the Google account", 502);
    }
    const googleUser = parseGoogleUser(userPayload);

    let existingAccount: Record<string, unknown> | null = null;
    if (consumed.oauth_account_id) {
      const { data, error } = await supabase
        .from("oauth_accounts")
        .select(
          "id,user_id,provider,provider_user_id,refresh_token,scopes,scopes_string",
        )
        .eq("id", consumed.oauth_account_id)
        .eq("user_id", authData.user.id)
        .eq("provider", "google")
        .maybeSingle();
      if (error || !data) {
        throw new OAuthCallbackError("OAuth account not found", 404);
      }
      if (data.provider_user_id !== googleUser.sub) {
        throw new OAuthCallbackError(
          "The selected Google account does not match this Gmail connection",
          409,
        );
      }
      existingAccount = data;
    } else {
      const { data, error } = await supabase
        .from("oauth_accounts")
        .select(
          "id,user_id,provider,provider_user_id,refresh_token,scopes,scopes_string",
        )
        .eq("user_id", authData.user.id)
        .eq("provider", "google")
        .eq("provider_user_id", googleUser.sub)
        .maybeSingle();
      if (error) {
        throw new OAuthCallbackError("Unable to save Gmail connection", 500);
      }
      existingAccount = data;
    }

    const encryptedAccessToken = await encryptOAuthToken(
      tokens.access_token,
      tokenEncryptionKey,
    );
    let encryptedRefreshToken: string;
    if (tokens.refresh_token) {
      encryptedRefreshToken = await encryptOAuthToken(
        tokens.refresh_token,
        tokenEncryptionKey,
      );
    } else if (typeof existingAccount?.refresh_token === "string") {
      const retained = await decryptOAuthToken(
        existingAccount.refresh_token,
        tokenEncryptionKey,
      );
      encryptedRefreshToken = await encryptOAuthToken(
        retained,
        tokenEncryptionKey,
      );
    } else {
      throw new OAuthCallbackError(
        "Google did not issue offline Gmail access; reconnect and approve access again",
        409,
      );
    }

    const existingScopes = typeof existingAccount?.scopes_string === "string"
      ? existingAccount.scopes_string.split(/\s+/).filter(Boolean)
      : Array.isArray(existingAccount?.scopes)
      ? existingAccount.scopes.filter((scope): scope is string =>
        typeof scope === "string"
      )
      : [];
    const persistedScopes = combineGoogleOAuthScopes(
      existingScopes,
      grantedScopes,
    );
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
      .toISOString();
    const accountEmail = googleUser.email.trim().toLowerCase();
    const values = {
      user_id: authData.user.id,
      provider: "google",
      provider_user_id: googleUser.sub,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      expires_at: expiresAt,
      last_used_at: new Date().toISOString(),
      scopes: persistedScopes,
      scopes_string: persistedScopes.join(" "),
      account_email: accountEmail,
      token_type: tokens.token_type,
      updated_at: new Date().toISOString(),
    };

    let savedAccount: Record<string, unknown> | null = null;
    if (typeof existingAccount?.id === "string") {
      const { data, error } = await supabase
        .from("oauth_accounts")
        .update(values)
        .eq("id", existingAccount.id)
        .eq("user_id", authData.user.id)
        .select(
          "id,provider,provider_user_id,account_email,expires_at,last_used_at",
        )
        .single();
      if (error || !data) {
        throw new OAuthCallbackError("Unable to save Gmail connection", 500);
      }
      savedAccount = data;
    } else {
      const { data, error } = await supabase
        .from("oauth_accounts")
        .insert(values)
        .select(
          "id,provider,provider_user_id,account_email,expires_at,last_used_at",
        )
        .single();
      if (error || !data) {
        throw new OAuthCallbackError("Unable to save Gmail connection", 500);
      }
      savedAccount = data;
    }

    return jsonResponse(
      origin,
      buildGoogleOAuthCompletion(savedAccount, persistedScopes),
      200,
    );
  } catch (error) {
    const status = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthCallbackError
      ? error.status
      : 500;
    const message = error instanceof GoogleOAuthRequestError ||
        error instanceof OAuthCallbackError
      ? error.message
      : "Unable to complete Gmail connection";

    if (status >= 500) {
      console.error("OAuth callback failed", {
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

serve(wrapMindManualSubjectHandler("oauth-google-callback", verifiedBearerMindManualScope("authenticated_request"), handler));
