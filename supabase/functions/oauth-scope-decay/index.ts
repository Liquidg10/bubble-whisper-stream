import { wrapMindManualHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  googleOAuthCorsHeaders,
  requireAllowedGoogleOAuthOrigin,
} from "../_shared/googleOAuthPolicy.ts";

// Retired legacy scope-decay endpoint. It used the service role to rewrite
// every user's scope metadata without authenticating or proving that provider
// grants had actually changed. Real least-privilege changes now require
// provider revocation followed by an explicit minimal reauthorization.
serve(wrapMindManualHandler("oauth-scope-decay", (request: Request): Response => {
  const requestOrigin = request.headers.get("origin");
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const origin = requireAllowedGoogleOAuthOrigin(requestOrigin);
    headers = {
      ...googleOAuthCorsHeaders(origin),
      "Content-Type": "application/json",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
  } catch {
    // Do not reflect an untrusted Origin on the retired endpoint.
  }

  return new Response(
    JSON.stringify({
      success: false,
      error:
        "Automatic OAuth scope decay is retired. Revoke and reconnect with the minimum permissions from Settings.",
      code: "OAUTH_SCOPE_DECAY_RETIRED",
    }),
    { status: 410, headers },
  );
}));
