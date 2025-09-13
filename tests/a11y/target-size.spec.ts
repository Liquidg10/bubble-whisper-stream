/**
 * A11Y P11: Target Size Testing
 * Verifies WCAG 2.2 SC 2.5.8 Target Size (Minimum) compliance
 */

import { test, expect } from '@playwright/test';

test.describe('A11Y P11: Target Size Compliance @a11y', () => {
  test('should have minimum 24×24 CSS px targets (WCAG 2.2)', async ({ page }) => {
    await page.goto('/');
    
    // Get all interactive elements
    const interactiveElements = await page.locator('button, a, input, [role="button"], [tabindex="0"]').all();
    
    for (const element of interactiveElements) {
      const box = await element.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        // WCAG 2.2 SC 2.5.8 minimum requirement
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
    }
  });

  test('should prefer 44×44 CSS px for comfortable interaction', async ({ page }) => {
    const views = ['/list', '/kanban', '/matrix'];
    
    for (const view of views) {
      await page.goto(view);
      
      const primaryButtons = await page.locator('button[data-testid*="primary"], button[data-testid*="add"]').all();
      
      for (const button of primaryButtons) {
        const box = await button.boundingBox();
        if (box) {
          // Prefer 44×44 for primary interactions
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});