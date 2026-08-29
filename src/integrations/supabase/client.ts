import { createClient } from '@supabase/supabase-js';
import { resolveSupabasePublicConfig } from './config';
import type { Database } from './types';

const supabaseConfig = resolveSupabasePublicConfig({
  VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

export const shouldDetectSupabaseSessionInUrl = (pathname: string): boolean =>
  pathname !== '/oauth-callback';
const shouldDetectSupabaseSession =
  typeof window === 'undefined' || shouldDetectSupabaseSessionInUrl(window.location.pathname);

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Calendar has its own PKCE exchange at /oauth-callback. Auth-js must not
    // consume that code or clear the existing app session first.
    detectSessionInUrl: shouldDetectSupabaseSession,
  }
});
