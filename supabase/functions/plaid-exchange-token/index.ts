import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handlePlaidExchange } from "../_shared/plaidPipeline.ts";
import { createPlaidRuntime } from "../_shared/plaidRuntime.ts";
const runtime = createPlaidRuntime();
serve(wrapMindManualSubjectHandler("plaid-exchange-token", verifiedBearerMindManualScope("authenticated_request"),
  (request, _lifecycle, context) => handlePlaidExchange(request, context.userId, runtime)));
