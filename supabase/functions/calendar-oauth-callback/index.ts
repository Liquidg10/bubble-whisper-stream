import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";
import {
  calendarOAuthCorsHeaders,
  CalendarOAuthRequestError,
  getCalendarOAuthRedirectUri,
  GOOGLE_CALENDAR_READ_SCOPE,
  requireAllowedCalendarOAuthOrigin,
} from "../calendar-oauth-start/oauthPolicy.ts";
import { buildCalendarOAuthCompletion } from "./completionResponse.ts";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

interface ConsumedOAuthState {
  code_verifier: string;
  service: string;
  origin: string;
  redirect_uri: string;
  calendar_account_id: string | null;
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

function responseHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { "Content-Type": "application/json" };
  try {
    return {
      ...calendarOAuthCorsHeaders(origin),
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

function parseCallbackBody(value: unknown): { code: string; state: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthCallbackError("Invalid callback request", 400);
  }

  const body = value as Record<string, unknown>;
  if (
    typeof body.code !== "string" ||
    body.code.length === 0 ||
    body.code.length > 4096 ||
    typeof body.state !== "string" ||
    body.state.length < 32 ||
    body.state.length > 512
  ) {
    throw new OAuthCallbackError("Invalid callback request", 400);
  }

  return { code: body.code, state: body.state };
}

function parseGoogleTokens(value: unknown): GoogleTokenResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthCallbackError("Google token exchange failed", 502);
  }

  const tokens = value as Record<string, unknown>;
  if (
    typeof tokens.access_token !== "string" ||
    tokens.access_token.length === 0 ||
    tokens.access_token.length > 64 * 1024 ||
    typeof tokens.expires_in !== "number" ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    tokens.expires_in > 24 * 60 * 60 ||
    typeof tokens.scope !== "string"
  ) {
    throw new OAuthCallbackError("Google token exchange failed", 502);
  }

  if (
    tokens.refresh_token !== undefined &&
    (typeof tokens.refresh_token !== "string" ||
      tokens.refresh_token.length === 0 ||
      tokens.refresh_token.length > 64 * 1024)
  ) {
    throw new OAuthCallbackError("Google token exchange failed", 502);
  }

  const grantedScopes = tokens.scope.split(/\s+/).filter(Boolean);
  if (!grantedScopes.includes(GOOGLE_CALENDAR_READ_SCOPE)) {
    throw new OAuthCallbackError(
      "Google Calendar read permission was not granted",
      403,
    );
  }

  return tokens as unknown as GoogleTokenResponse;
}

function parseGoogleUserInfo(value: unknown): GoogleUserInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthCallbackError("Unable to verify the Google account", 502);
  }

  const user = value as Record<string, unknown>;
  if (
    typeof user.sub !== "string" ||
    user.sub.length === 0 ||
    user.sub.length > 255 ||
    typeof user.email !== "string" ||
    user.email.length === 0 ||
    user.email.length > 320 ||
    user.email_verified !== true ||
    (user.name !== undefined && typeof user.name !== "string")
  ) {
    throw new OAuthCallbackError("Unable to verify the Google account", 502);
  }

  return user as unknown as GoogleUserInfo;
}

const handler = async (request: Request): Promise<Response> => {
  const requestOrigin = request.headers.get("origin");

  try {
    const origin = requireAllowedCalendarOAuthOrigin(requestOrigin);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: calendarOAuthCorsHeaders(origin),
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
      "consume_google_calendar_oauth_state",
      { p_state: state, p_user_id: authData.user.id },
    );
    const consumedState = Array.isArray(consumedRows)
      ? consumedRows[0] as ConsumedOAuthState | undefined
      : undefined;
    if (consumeError || !consumedState) {
      if (consumeError) {
        console.error("Calendar OAuth state consume failed", {
          code: consumeError.code,
        });
      }
      throw new OAuthCallbackError("Invalid or expired OAuth state", 400);
    }

    if (
      consumedState.service !== "calendar" ||
      consumedState.origin !== origin ||
      consumedState.redirect_uri !== getCalendarOAuthRedirectUri(origin)
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
        redirect_uri: consumedState.redirect_uri,
        code_verifier: consumedState.code_verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      console.error("Google Calendar token exchange failed", {
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

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!userInfoResponse.ok) {
      console.error("Google Calendar identity verification failed", {
        status: userInfoResponse.status,
      });
      throw new OAuthCallbackError("Unable to verify the Google account", 502);
    }

    let userInfoPayload: unknown;
    try {
      userInfoPayload = await userInfoResponse.json();
    } catch {
      throw new OAuthCallbackError("Unable to verify the Google account", 502);
    }
    const googleUser = parseGoogleUserInfo(userInfoPayload);

    if (consumedState.calendar_account_id) {
      const { data: calendarAccount, error: accountError } = await supabase
        .from("calendar_accounts")
        .select("oauth_token_id")
        .eq("id", consumedState.calendar_account_id)
        .eq("user_id", authData.user.id)
        .eq("provider", "google")
        .maybeSingle();
      if (accountError || !calendarAccount) {
        throw new OAuthCallbackError("Calendar account not found", 404);
      }

      const { data: linkedToken, error: linkedTokenError } = await supabase
        .from("oauth_tokens")
        .select("provider_account_id")
        .eq("id", calendarAccount.oauth_token_id)
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (
        linkedTokenError ||
        !linkedToken ||
        linkedToken.provider_account_id !== googleUser.sub
      ) {
        throw new OAuthCallbackError(
          "The selected Google account does not match this calendar connection",
          409,
        );
      }
    }

    const accountEmail = googleUser.email.trim().toLowerCase();
    const { data: existingToken, error: existingTokenError } = await supabase
      .from("oauth_tokens")
      .select("id, refresh_token, scope")
      .eq("user_id", authData.user.id)
      .eq("provider", "google")
      .eq("service_type", "calendar")
      .eq("provider_account_id", googleUser.sub)
      .maybeSingle();
    if (existingTokenError) {
      console.error("Canonical Calendar token lookup failed", {
        code: existingTokenError.code,
      });
      throw new OAuthCallbackError(
        "Unable to save Google Calendar connection",
        500,
      );
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
    } else if (existingToken?.refresh_token) {
      const retainedRefreshToken = await decryptOAuthToken(
        existingToken.refresh_token,
        tokenEncryptionKey,
      );
      encryptedRefreshToken = await encryptOAuthToken(
        retainedRefreshToken,
        tokenEncryptionKey,
      );
    } else {
      throw new OAuthCallbackError(
        "Google did not issue offline Calendar access; reconnect and approve access again",
        409,
      );
    }

    const grantedScopes = new Set(tokens.scope.split(/\s+/).filter(Boolean));
    for (
      const scope of existingToken?.scope?.split(/\s+/).filter(Boolean) ?? []
    ) {
      grantedScopes.add(scope);
    }

    const { data: connectionRows, error: connectionError } = await supabase.rpc(
      "upsert_google_calendar_connection",
      {
        p_user_id: authData.user.id,
        p_provider_account_id: googleUser.sub,
        p_account_email: accountEmail,
        p_account_name: googleUser.name?.trim() || accountEmail,
        p_access_token: encryptedAccessToken,
        p_refresh_token: encryptedRefreshToken,
        p_token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        p_scope: Array.from(grantedScopes).sort().join(" "),
      },
    );
    const connection = Array.isArray(connectionRows) ? connectionRows[0] : null;
    if (connectionError || !connection?.calendar_account_id) {
      if (connectionError) {
        console.error("Canonical Calendar connection upsert failed", {
          code: connectionError.code,
        });
      }
      throw new OAuthCallbackError(
        "Unable to save Google Calendar connection",
        500,
      );
    }

    return jsonResponse(
      origin,
      buildCalendarOAuthCompletion(
        connection.calendar_account_id,
        accountEmail,
        grantedScopes,
      ),
      200,
    );
  } catch (error) {
    const status = error instanceof CalendarOAuthRequestError ||
        error instanceof OAuthCallbackError
      ? error.status
      : 500;
    const message = error instanceof CalendarOAuthRequestError ||
        error instanceof OAuthCallbackError
      ? error.message
      : "Unable to complete Google Calendar connection";

    if (status >= 500) {
      console.error("Calendar OAuth callback failed", {
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

serve(wrapMindManualSubjectHandler("calendar-oauth-callback", verifiedBearerMindManualScope("authenticated_request"), handler));
