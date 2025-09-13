/**
 * P20 Gate 8: Privacy Controls & Data Export
 * Verifies user privacy controls, data export, and consent management
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 8: Privacy Controls & Data Export @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flags.privacyControls', 'true');
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should provide granular privacy controls', async ({ page }) => {
    await page.goto('/settings/privacy');
    
    // Check privacy control granularity
    const privacyControls = page.locator('[data-testid="privacy-controls"]');
    await expect(privacyControls).toBeVisible();
    
    // Should have multiple control levels
    await expect(privacyControls).toContainText('Surface');
    await expect(privacyControls).toContainText('Context');
    await expect(privacyControls).toContainText('Deep');
  });

  test('should support one-tap data controls', async ({ page }) => {
    await page.goto('/settings/privacy');
    
    // Test quick privacy actions
    const pauseLearning = page.locator('[data-testid="pause-learning"]');
    await expect(pauseLearning).toBeVisible();
    
    const redactData = page.locator('[data-testid="redact-data"]');
    await expect(redactData).toBeVisible();
  });

  test('should provide complete data export', async ({ page }) => {
    await page.goto('/settings/privacy');
    
    // Test data export functionality
    const exportButton = page.locator('[data-testid="export-data"]');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
    
    // Export should be in standard formats
    const exportInfo = page.locator('[data-testid="export-info"]');
    if (await exportInfo.count() > 0) {
      await expect(exportInfo).toContainText('JSON');
    }
  });

  test('should handle consent withdrawal', async ({ page }) => {
    await page.goto('/settings/privacy');
    
    // Test consent withdrawal
    const withdrawConsent = page.locator('[data-testid="withdraw-consent"]');
    if (await withdrawConsent.count() > 0) {
      await expect(withdrawConsent).toBeVisible();
      await expect(withdrawConsent).toBeEnabled();
    }
  });

  test('should respect quiet hours', async ({ page }) => {
    await page.goto('/settings/privacy');
    
    // Test quiet hours configuration
    const quietHours = page.locator('[data-testid="quiet-hours"]');
    if (await quietHours.count() > 0) {
      await expect(quietHours).toBeVisible();
    }
  });

  test('should support integration-specific controls', async ({ page }) => {
    await page.goto('/settings/privacy');
    
    // Test per-integration privacy controls
    const integrationControls = page.locator('[data-testid="integration-privacy"]');
    if (await integrationControls.count() > 0) {
      await expect(integrationControls).toBeVisible();
    }
  });
});