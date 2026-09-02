// The production helpers use a type-only Deno URL import. Resolve that exact
// versioned type boundary to the installed SDK for application-hosted tests.
declare module 'https://esm.sh/@supabase/supabase-js@2.57.4' {
  export type { SupabaseClient } from '@supabase/supabase-js';
}
