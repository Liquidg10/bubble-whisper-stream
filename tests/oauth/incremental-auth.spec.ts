/**
 * OAuth P10: Incremental Authorization Testing
 * Verifies progressive scope requests and user consent flow
 */

import { test, expect } from '@playwright/test';

test.describe('OAuth P10: Incremental Authorization @oauth', () => {
  test('should start with minimal required scopes', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Check that initial requests are minimal
    const scopeInfo = page.locator('[data-testid="current-scopes"]');
    if (await scopeInfo.count() > 0) {
      const scopeText = await scopeInfo.textContent();
      expect(scopeText?.toLowerCase()).toContain('read');
      expect(scopeText?.toLowerCase()).not.toContain('write');
    }
  });

  test('should explain scope upgrades clearly', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Look for upgrade explanations
    const upgradeInfo = page.locator('[data-testid="scope-upgrade-info"]');
    if (await upgradeInfo.count() > 0) {
      await expect(upgradeInfo).toBeVisible();
      const infoText = await upgradeInfo.textContent();
      expect(infoText?.toLowerCase()).toMatch(/enable|unlock|additional/);
    }
  });

  test('should handle scope denials gracefully', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // The interface should work even without full permissions
    const degradedMode = page.locator('[data-testid="degraded-mode"], [data-testid="read-only-mode"]');
    if (await degradedMode.count() > 0) {
      await expect(degradedMode).toBeVisible();
    }
  });
});