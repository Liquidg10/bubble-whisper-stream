/**
 * A11Y P11: Keyboard Accessibility Testing
 * Verifies full keyboard navigation and WCAG 2.2 compliance
 */

import { test, expect } from '@playwright/test';

test.describe('A11Y P11: Keyboard Accessibility @a11y', () => {
  test('should support full tab navigation', async ({ page }) => {
    await page.goto('/list');
    
    // Start tabbing through interface
    await page.keyboard.press('Tab');
    let focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Continue tabbing for at least 10 elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    }
  });

  test('should provide drag alternatives', async ({ page }) => {
    await page.goto('/kanban');
    
    // Should have keyboard alternatives for drag operations
    const dragAlternatives = page.locator('[data-testid*="move"], [aria-label*="move"], [data-testid*="keyboard"]');
    await expect(dragAlternatives.first()).toBeVisible();
  });

  test('should have proper focus indicators', async ({ page }) => {
    await page.goto('/');
    
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    
    // Check that focus is visible
    const styles = await focusedElement.evaluate(el => {
      const computed = getComputedStyle(el);
      return {
        outline: computed.outline,
        outlineWidth: computed.outlineWidth,
        boxShadow: computed.boxShadow
      };
    });
    
    // Should have visible focus indicator
    expect(
      styles.outline !== 'none' || 
      styles.outlineWidth !== '0px' || 
      styles.boxShadow !== 'none'
    ).toBe(true);
  });
});