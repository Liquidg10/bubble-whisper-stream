/**
 * Test fixtures for accessibility testing
 */

import { test as base, Page } from '@playwright/test';
import { setupA11yTesting, navigateAndWaitForReady } from '../utils/a11y-helpers';
import { applyMockPreferences, MockPreferences } from '../utils/mock-preferences';

interface A11yTestFixtures {
  a11yPage: Page;
  setupA11y: (preferences?: MockPreferences) => Promise<void>;
  navigateToPage: (path: string) => Promise<void>;
}

/**
 * Accessibility test fixture that sets up axe-core and common utilities
 */
export const test = base.extend<A11yTestFixtures>({
  a11yPage: async ({ page }, use) => {
    // Set up accessibility testing
    await setupA11yTesting(page);
    
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });
    
    await use(page);
  },
  
  setupA11y: async ({ a11yPage }, use) => {
    const setupFn = async (preferences?: MockPreferences) => {
      if (preferences) {
        await applyMockPreferences(a11yPage, preferences);
      }
      
      // Wait for any preference changes to take effect
      await a11yPage.waitForTimeout(100);
    };
    
    await use(setupFn);
  },
  
  navigateToPage: async ({ a11yPage }, use) => {
    const navigateFn = async (path: string) => {
      const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';
      await navigateAndWaitForReady(a11yPage, `${baseUrl}${path}`);
    };
    
    await use(navigateFn);
  },
});

export { expect } from '@playwright/test';