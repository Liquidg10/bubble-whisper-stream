import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type { Database } from "../../../src/integrations/supabase/types.ts";
import { createWatchRenewalHandler } from "./watchRenewalHandler.ts";

serve(createWatchRenewalHandler({
  env: (name) => Deno.env.get(name),
  createAdminClient: (url, serviceKey) =>
    createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
}));
