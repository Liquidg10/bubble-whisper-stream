/**
 * P11 Accessibility Test Fixtures
 * Provides configured test environment for accessibility testing
 */

import { test as base, Page } from '@playwright/test';
import { injectAxe } from 'axe-playwright';
import { 
  setupA11yTesting,
  navigateAndWaitForReady,
  mockUserPreferences
} from '../utils/a11y-helpers';

type A11yTestFixtures = {
  a11yPage: Page;
  navigateToPage: (url: string) => Promise<void>;
  setupA11y: (preferences?: {
    reducedMotion?: boolean;
    highContrast?: boolean;
    screenReader?: boolean;
  }) => Promise<void>;
};

export const test = base.extend<A11yTestFixtures>({
  a11yPage: async ({ page }, use) => {
    // Inject axe-core for accessibility testing
    await injectAxe(page);
    
    // Setup default accessibility testing configuration
    await setupA11yTesting(page);
    
    await use(page);
  },

  navigateToPage: async ({ a11yPage }, use) => {
    const navigate = async (url: string) => {
      await navigateAndWaitForReady(a11yPage, url);
    };
    
    await use(navigate);
  },

  setupA11y: async ({ a11yPage }, use) => {
    const setup = async (preferences = {}) => {
      await mockUserPreferences(a11yPage, preferences);
    };
    
    await use(setup);
  },
});

export { expect } from '@playwright/test';