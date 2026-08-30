import { defineConfig, devices } from '@playwright/test';

// Disposable browser-only contracts. No application server, credentials or
// external network is needed; each test supplies a synthetic intercepted page.
export default defineConfig({
  testDir: '.',
  testMatch: 'storage-bubble-commit.spec.ts',
  outputDir: '../../test-results/storage-runtime',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'] },
});
