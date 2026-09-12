import { wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { verifiedPlaidMindManualScope, processPlaidWebhook } from "../_shared/plaidPipeline.ts";
import { createPlaidRuntime } from "../_shared/plaidRuntime.ts";
const runtime = createPlaidRuntime();
// Verification and authoritative owner lookup precede owner admission. All sync
// work is awaited in-process inside this same lease; no service-bearer child route.
serve(wrapMindManualSubjectHandler("plaid-webhook-handler", verifiedPlaidMindManualScope(runtime),
  (_request, _lifecycle, context) => processPlaidWebhook(runtime, context)));
