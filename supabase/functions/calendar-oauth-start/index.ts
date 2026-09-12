import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  calendarOAuthCorsHeaders,
  CalendarOAuthRequestError,
  getCalendarOAuthRedirectUri,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  parseCalendarOAuthStartRequest,
  requireAllowedCalendarOAuthOrigin,
} from "./oauthPolicy.ts";
import { buildCalendarOAuthStartResponse } from "./startResponse.ts";

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
      throw new OAuthStartError("Method not allowed", 405);
    }

    const supabase = createClient(
      requireEnvironment("SUPABASE_URL"),
      requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const googleClientId = requireEnvironment("GOOGLE_CLIENT_ID");

    const { data: authData, error: authError } = await supabase.auth.getUser(
      bearerToken(request),
    );
    if (authError || !authData.user) {
      throw new OAuthStartError("Authentication required", 401);
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      throw new OAuthStartError("Invalid request body", 400);
    }
    const { accountId } = parseCalendarOAuthStartRequest(requestBody);

    if (accountId) {
      const { data: ownedAccount, error: accountError } = await supabase
        .from("calendar_accounts")
        .select("id")
        .eq("id", accountId)
        .eq("user_id", authData.user.id)
        .eq("provider", "google")
        .maybeSingle();

      if (accountError || !ownedAccount) {
        throw new OAuthStartError("Calendar account not found", 404);
      }
    }

    const redirectUri = getCalendarOAuthRedirectUri(origin);
    const state = randomBase64Url(32);
    const codeVerifier = randomBase64Url(64);

    const { error: cleanupError } = await supabase.rpc(
      "cleanup_expired_google_calendar_oauth_state",
    );
    if (cleanupError) {
      console.warn("Expired Calendar OAuth state cleanup failed", {
        code: cleanupError.code,
      });
    }

    const { error: stateError } = await supabase.from("oauth_state").insert({
      state,
      code_verifier: codeVerifier,
      service: "calendar",
      origin,
      redirect_uri: redirectUri,
      user_id: authData.user.id,
      calendar_account_id: accountId,
    });
    if (stateError) {
      console.error("Calendar OAuth state persistence failed", {
        code: stateError.code,
      });
      throw new OAuthStartError(
        "Unable to initialize Google Calendar connection",
        500,
      );
    }

    const parameters = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_CALENDAR_OAUTH_SCOPES.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent select_account",
      state,
      code_challenge: await codeChallenge(codeVerifier),
      code_challenge_method: "S256",
    });

    return jsonResponse(
      origin,
      buildCalendarOAuthStartResponse(
        `https://accounts.google.com/o/oauth2/v2/auth?${parameters.toString()}`,
        state,
      ),
      200,
    );
  } catch (error) {
    const status = error instanceof CalendarOAuthRequestError ||
        error instanceof OAuthStartError
      ? error.status
      : 500;
    const message = error instanceof CalendarOAuthRequestError ||
        error instanceof OAuthStartError
      ? error.message
      : "Unable to initialize Google Calendar connection";

    if (status >= 500) {
      console.error("Calendar OAuth start failed", {
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

serve(wrapMindManualSubjectHandler("calendar-oauth-start", verifiedBearerMindManualScope("authenticated_request"), handler));
