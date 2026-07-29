/**
 * P11 Accessibility Test Fixtures
 * Provides configured test environment for accessibility testing
 */

import { test as base, Page } from '@playwright/test';
import { 
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
  a11yPage: async ({ page }, provide) => {
    await provide(page);
  },

  navigateToPage: async ({ a11yPage }, provide) => {
    const navigate = async (url: string) => {
      await navigateAndWaitForReady(a11yPage, url);
    };
    
    await provide(navigate);
  },

  setupA11y: async ({ a11yPage }, provide) => {
    const setup = async (preferences = {}) => {
      await mockUserPreferences(a11yPage, preferences);
    };
    
    await provide(setup);
  },
});

export { expect } from '@playwright/test';
