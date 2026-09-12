import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handlePlaidUserSync } from "../_shared/plaidPipeline.ts";
import { createPlaidRuntime } from "../_shared/plaidRuntime.ts";
const runtime = createPlaidRuntime();
serve(wrapMindManualSubjectHandler("plaid-get-accounts", verifiedBearerMindManualScope("authenticated_request"),
  (request, _lifecycle, context) => handlePlaidUserSync(request, context.userId, runtime, "accounts")));
