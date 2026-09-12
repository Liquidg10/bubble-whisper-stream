import { verifiedBearerMindManualScope, wrapMindManualSubjectHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { handleBubbleSuggestion } from './handler.ts';

// Match the existing project's provider/key/model; never provision or fall back
// to a different project. getUser independently rejects anon/service credentials.
serve(wrapMindManualSubjectHandler("ai-bubble-suggest", verifiedBearerMindManualScope("authenticated_request"), req => handleBubbleSuggestion(req, {
  apiKey: Deno.env.get('OPENAI_API_KEY'),
  fetch,
  authenticate: async bearer => {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key) return false;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(bearer);
    return !error && Boolean(data.user?.id) && data.user?.is_anonymous !== true;
  },
})));
