import { defineConfig, devices } from '@playwright/test';

// A disposable build, fake low-privilege key, and intercepted browser network.
// No real owner UUID, session, credentials, Auth change or remote DB is used.
const output = 'node_modules/.cache/mind-manual-owner-fixture';
export default defineConfig({
  testDir: '.',
  testMatch: ['deployment-boundary.spec.ts', 'environment-exposure.spec.ts'],
  outputDir: '../../test-results/deployment-boundary',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'] },
  webServer: {
    command: `npm run build -- --outDir ${output} && npm run preview -- --host 127.0.0.1 --port 4181 --strictPort --outDir ${output}`,
    url: 'http://127.0.0.1:4181',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_PROJECT_ID: 'fjxedbaskrbewjunfxaj',
      VITE_SUPABASE_URL: 'https://fjxedbaskrbewjunfxaj.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`,
      VITE_MIND_MANUAL_DEPLOYMENT_MODE: 'owner-isolated',
      VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'http://127.0.0.1:4181',
      VITE_UNUSED_BOUNDARY_SENTINEL: 'unused-boundary-value-must-not-ship-20260830',
    },
  },
});
