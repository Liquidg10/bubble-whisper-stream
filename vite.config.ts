import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { resolveDevHost } from "./vite.dev-host";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
