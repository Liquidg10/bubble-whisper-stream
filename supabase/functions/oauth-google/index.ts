import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  googleOAuthCorsHeaders,
  requireAllowedGoogleOAuthOrigin,
} from "../_shared/googleOAuthPolicy.ts";

// Retired legacy code-exchange endpoint. It accepted an arbitrary redirect URI,
// created Supabase users, and persisted plaintext provider credentials. Keep a
// bounded tombstone during rollout so stale clients fail closed and operators
// receive an unambiguous receipt instead of a missing-function retry loop.
serve((request: Request): Response => {
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
        "This legacy OAuth endpoint is retired. Start the connection again from Settings.",
      code: "OAUTH_ENDPOINT_RETIRED",
    }),
    { status: 410, headers },
  );
});
