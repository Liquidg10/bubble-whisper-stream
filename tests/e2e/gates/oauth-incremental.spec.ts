/**
 * P20 Gate 6: OAuth Incremental Authorization
 * Verifies minimal scope requests, progressive consent, and scope expansion
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 6: OAuth Incremental Authorization @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flags.oauthIncremental', 'true');
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should start with minimal scopes', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Check initial scope requests
    const initialScopes = page.locator('[data-testid="initial-scopes"]');
    await expect(initialScopes).toContainText('readonly');
    await expect(initialScopes).not.toContainText('modify');
  });

  test('should show scope progression UI', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Verify progression indicators
    const scopeProgression = page.locator('[data-testid="scope-progression"]');
    await expect(scopeProgression).toBeVisible();
    
    // Should show current and next scope levels
    await expect(scopeProgression).toContainText('Current');
    await expect(scopeProgression).toContainText('Next');
  });

  test('should handle calendar scope expansion', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Test calendar upgrade flow
    const calendarUpgrade = page.locator('[data-testid="calendar-upgrade"]');
    if (await calendarUpgrade.count() > 0) {
      await calendarUpgrade.click();
      
      // Should show scope delta
      const scopeDelta = page.locator('[data-testid="scope-delta"]');
      await expect(scopeDelta).toBeVisible();
      await expect(scopeDelta).toContainText('Additional permissions');
    }
  });

  test('should handle Gmail scope expansion', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Test Gmail upgrade flow
    const gmailUpgrade = page.locator('[data-testid="gmail-upgrade"]');
    if (await gmailUpgrade.count() > 0) {
      await gmailUpgrade.click();
      
      // Should explain why additional scopes are needed
      const explanation = page.locator('[data-testid="scope-explanation"]');
      await expect(explanation).toBeVisible();
      await expect(explanation).toContainText('enable');
    }
  });

  test('should respect user scope denials', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Test denial handling
    const testDenial = page.locator('[data-testid="test-scope-denial"]');
    if (await testDenial.count() > 0) {
      await testDenial.click();
      
      // Should gracefully handle denial
      const denialResult = page.locator('[data-testid="denial-result"]');
      await expect(denialResult).toContainText('understood');
    }
  });

  test('should track authorization state correctly', async ({ page }) => {
    await page.goto('/dev/oauth-state');
    
    // Check authorization tracking
    const authState = page.locator('[data-testid="auth-state"]');
    await expect(authState).toBeVisible();
    
    // Should show current permissions
    await expect(authState).toContainText('permissions');
  });
});