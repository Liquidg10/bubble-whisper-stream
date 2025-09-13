/**
 * A11Y P11: Reduced Motion Testing
 * Verifies prefers-reduced-motion compliance
 */

import { test, expect } from '@playwright/test';

test.describe('A11Y P11: Reduced Motion Compliance @a11y', () => {
  test('should respect prefers-reduced-motion: reduce', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/bubble');
    
    // Check that animations are disabled or minimal
    const animatedElements = await page.locator('[style*="animation"], [class*="animate"]').all();
    
    for (const element of animatedElements) {
      const styles = await element.evaluate(el => {
        const computed = getComputedStyle(el);
        return {
          animationDuration: computed.animationDuration,
          transitionDuration: computed.transitionDuration
        };
      });
      
      // Animations should be disabled or very short
      expect(
        styles.animationDuration === '0s' || 
        parseFloat(styles.animationDuration) <= 0.2
      ).toBe(true);
    }
  });

  test('should maintain functionality without animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/list');
    
    // Test that core functionality works
    await page.locator('[data-testid="quick-add"]').fill('Reduced motion test');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    await expect(page.locator('[data-testid="task-item"]')).toBeVisible();
  });
});