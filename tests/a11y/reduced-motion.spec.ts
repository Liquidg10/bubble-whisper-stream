/**
 * A11Y P11: Reduced Motion Testing
 * Verifies prefers-reduced-motion compliance
 */

import { test, expect } from '@playwright/test';

test.describe('A11Y P11: Reduced Motion Compliance @a11y', () => {
  test('should respect prefers-reduced-motion: reduce', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    
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

    const onboardingDialog = page.getByRole('dialog', { name: 'Welcome' });
    const onboardingAppeared = await onboardingDialog
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true, () => false);
    if (onboardingAppeared) {
      await page.keyboard.press('Escape');
      await expect(onboardingDialog).toBeHidden();
    }
    
    // Exercise a non-mutating core interaction against current List semantics.
    await expect(page.getByRole('heading', { name: 'List View' })).toBeVisible();
    await page.getByRole('button', { name: 'Show keyboard shortcuts' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' }))
      .toBeVisible();
  });
});
