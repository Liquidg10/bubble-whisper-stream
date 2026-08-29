import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import {
  assertAtomicSupabasePublicOverrides,
  resolveSupabasePublicConfig,
} from "./src/integrations/supabase/config.ts";
import { resolveDevHost } from "./vite.dev-host.ts";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  assertAtomicSupabasePublicOverrides({
    VITE_SUPABASE_PROJECT_ID: process.env.VITE_SUPABASE_PROJECT_ID,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  resolveSupabasePublicConfig({
    VITE_SUPABASE_PROJECT_ID: environment.VITE_SUPABASE_PROJECT_ID,
    VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

  return {
    server: {
      // Keep the vulnerable Vite 5 dev server off the LAN by default. Hosted
      // development environments can opt in explicitly with VITE_DEV_HOST.
      host: resolveDevHost(),
      port: 8080,
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname,
      },
    },
  };
});
