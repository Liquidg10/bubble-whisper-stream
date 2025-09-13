/**
 * P20 Gate 7: CBT Safety & Crisis Detection
 * Verifies crisis detection, appropriate responses, and safety protocols
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 7: CBT Safety & Crisis Detection @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flags.cbtAssist', 'true');
      localStorage.setItem('flags.cbtCrisisEnabled', 'true');
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should detect crisis language appropriately', async ({ page }) => {
    await page.goto('/dev/cbt');
    
    // Test crisis detection
    await page.locator('[data-testid="test-crisis-detection"]').click();
    
    const crisisResults = page.locator('[data-testid="crisis-results"]');
    await expect(crisisResults).toContainText('Crisis detection active: ✅');
    await expect(crisisResults).toContainText('Safety protocols ready: ✅');
  });

  test('should provide appropriate crisis resources', async ({ page }) => {
    await page.goto('/dev/cbt');
    
    // Test crisis resource provision
    await page.locator('[data-testid="test-crisis-resources"]').click();
    
    const resourceResults = page.locator('[data-testid="resource-results"]');
    await expect(resourceResults).toContainText('Crisis resources available: ✅');
    await expect(resourceResults).toContainText('Regional hotlines included: ✅');
  });

  test('should disable nudges during crisis mode', async ({ page }) => {
    await page.goto('/dev/cbt');
    
    // Test crisis mode behavior
    await page.locator('[data-testid="test-crisis-mode"]').click();
    
    const modeResults = page.locator('[data-testid="mode-results"]');
    await expect(modeResults).toContainText('Nudges disabled: ✅');
    await expect(modeResults).toContainText('Safe mode activated: ✅');
  });

  test('should respect CBT consent preferences', async ({ page }) => {
    await page.goto('/dev/cbt');
    
    // Test consent handling
    await page.locator('[data-testid="test-cbt-consent"]').click();
    
    const consentResults = page.locator('[data-testid="consent-results"]');
    await expect(consentResults).toContainText('Consent respected: ✅');
    await expect(consentResults).toContainText('Opt-out honored: ✅');
  });

  test('should never provide medical advice', async ({ page }) => {
    await page.goto('/dev/cbt');
    
    // Test medical advice boundaries
    await page.locator('[data-testid="test-medical-boundaries"]').click();
    
    const boundaryResults = page.locator('[data-testid="boundary-results"]');
    await expect(boundaryResults).toContainText('No medical advice: ✅');
    await expect(boundaryResults).toContainText('Appropriate disclaimers: ✅');
  });

  test('should handle sensitive data appropriately', async ({ page }) => {
    await page.goto('/dev/cbt');
    
    // Test sensitive data handling
    await page.locator('[data-testid="test-sensitive-data"]').click();
    
    const dataResults = page.locator('[data-testid="data-results"]');
    await expect(dataResults).toContainText('Data encrypted: ✅');
    await expect(dataResults).toContainText('Auto-purge enabled: ✅');
  });
});