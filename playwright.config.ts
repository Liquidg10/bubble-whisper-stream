import { defineConfig, devices } from '@playwright/test';

/**
 * P11 Accessibility CI Integration
 * Playwright configuration for automated accessibility testing
 */

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['github'],
    ...(process.env.CI ? [['junit', { outputFile: 'test-results/junit.xml' }]] : [])
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium-a11y',
      use: { 
        ...devices['Desktop Chrome'],
        // Disable smooth scrolling for consistent a11y testing
        launchOptions: {
          args: ['--disable-smooth-scrolling', '--disable-web-security']
        }
      },
      testMatch: '**/a11y/**/*.spec.ts'
    },
    {
      name: 'firefox-a11y',
      use: { 
        ...devices['Desktop Firefox'],
        // Set Firefox preferences for accessibility testing
        launchOptions: {
          firefoxUserPrefs: {
            'ui.prefersReducedMotion': 1, // Test reduced motion
            'browser.display.document_color_use': 2 // High contrast
          }
        }
      },
      testMatch: '**/a11y/**/*.spec.ts'
    },
    {
      name: 'webkit-a11y',
      use: { 
        ...devices['Desktop Safari'],
        // Safari-specific accessibility settings
        contextOptions: {
          reducedMotion: 'reduce'
        }
      },
      testMatch: '**/a11y/**/*.spec.ts'
    },
    {
      name: 'mobile-a11y',
      use: { 
        ...devices['iPhone 13'],
        // Mobile-specific accessibility settings
        contextOptions: {
          reducedMotion: 'reduce'
        }
      },
      testMatch: '**/a11y/mobile/**/*.spec.ts'
    }
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});