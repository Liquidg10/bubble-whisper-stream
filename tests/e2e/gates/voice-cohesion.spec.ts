/**
 * P20 Gate 10: Voice Cohesion & Persona Consistency
 * Verifies consistent voice, no persona leaks, and tone consistency
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 10: Voice Cohesion & Persona Consistency @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should maintain consistent voice across all views', async ({ page }) => {
    const views = ['/', '/list', '/kanban', '/matrix', '/bubble'];
    
    for (const view of views) {
      await page.goto(view);
      
      // Check for consistent tone in UI text
      const pageContent = await page.textContent('body');
      
      // Should not contain aggressive or judgmental language
      expect(pageContent?.toLowerCase()).not.toMatch(/must|should|need to|have to|required/);
      
      // Should contain supportive language patterns
      expect(pageContent?.toLowerCase()).toMatch(/ready|when|if|help|support/);
    }
  });

  test('should never leak persona identifiers', async ({ page }) => {
    const pages = ['/', '/list', '/kanban', '/matrix', '/settings'];
    const forbiddenTerms = ['Coach', 'Scientist', 'Friend', 'Persona', 'Assistant', 'AI'];
    
    for (const pagePath of pages) {
      await page.goto(pagePath);
      
      const pageContent = await page.textContent('body');
      for (const term of forbiddenTerms) {
        expect(pageContent?.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  test('should use compassionate language in error states', async ({ page }) => {
    // Test error handling language
    await page.goto('/dev/context-drift');
    
    // Trigger error state if possible
    const errorTrigger = page.locator('[data-testid="trigger-error"]');
    if (await errorTrigger.count() > 0) {
      await errorTrigger.click();
      
      const errorMessage = page.locator('[data-testid="error-message"]');
      if (await errorMessage.count() > 0) {
        const errorText = await errorMessage.textContent();
        
        // Should not blame the user
        expect(errorText?.toLowerCase()).not.toMatch(/you did|your fault|you must/);
        
        // Should offer solutions
        expect(errorText?.toLowerCase()).toMatch(/try|help|support|check/);
      }
    }
  });

  test('should maintain tone in notifications', async ({ page }) => {
    await page.goto('/');
    
    // Check notification tone (if any exist)
    const notifications = page.locator('[role="alert"], .toast, [data-testid="notification"]');
    
    if (await notifications.count() > 0) {
      const notificationText = await notifications.first().textContent();
      
      // Should be gentle and non-demanding
      expect(notificationText?.toLowerCase()).not.toMatch(/must|urgent|critical|immediately/);
    }
  });

  test('should use progressive disclosure patterns', async ({ page }) => {
    await page.goto('/settings');
    
    // Check that complex features are hidden behind progressive disclosure
    const advancedSettings = page.locator('[data-testid="advanced-settings"]');
    
    if (await advancedSettings.count() > 0) {
      // Should start collapsed
      const isVisible = await advancedSettings.isVisible();
      
      // If visible, should have clear labeling about complexity
      if (isVisible) {
        const settingsText = await advancedSettings.textContent();
        expect(settingsText?.toLowerCase()).toMatch(/advanced|optional|when ready/);
      }
    }
  });

  test('should avoid commitment pressure language', async ({ page }) => {
    const views = ['/', '/list', '/kanban'];
    
    for (const view of views) {
      await page.goto(view);
      
      const pageContent = await page.textContent('body');
      
      // Should not pressure users into commitments
      expect(pageContent?.toLowerCase()).not.toMatch(/commit|promise|stick to|discipline/);
      
      // Should emphasize choice and flexibility
      expect(pageContent?.toLowerCase()).toMatch(/when|if|choose|option/);
    }
  });

  test('should provide gentle guidance without judgment', async ({ page }) => {
    await page.goto('/');
    
    // Add a task and check guidance language
    await page.locator('[data-testid="quick-add"]').fill('Test task');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Look for any guidance or suggestions
    const guidance = page.locator('[data-testid="guidance"], [data-testid="suggestion"]');
    
    if (await guidance.count() > 0) {
      const guidanceText = await guidance.textContent();
      
      // Should be suggestions, not commands
      expect(guidanceText?.toLowerCase()).toMatch(/might|could|consider|perhaps/);
      expect(guidanceText?.toLowerCase()).not.toMatch(/should|must|need to/);
    }
  });
});