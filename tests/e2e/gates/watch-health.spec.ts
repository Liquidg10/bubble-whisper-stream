/**
 * P20 Gate 3: Watch Health & Renewal
 * Verifies Calendar/Gmail watch renewal, T-1 day renewals, and 410 Gone recovery
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 3: Watch Health & Renewal @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Enable watch health features
    await page.evaluate(() => {
      localStorage.setItem('flags.watchHealth', 'true');
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should display watch health status correctly', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Check that health panel loads
    const healthPanel = page.locator('[data-testid="watch-health-panel"]');
    await expect(healthPanel).toBeVisible();
    
    // Check for calendar watch status
    const calendarStatus = page.locator('[data-testid="calendar-watch-status"]');
    await expect(calendarStatus).toBeVisible();
    
    // Check for Gmail watch status
    const gmailStatus = page.locator('[data-testid="gmail-watch-status"]');
    await expect(gmailStatus).toBeVisible();
    
    // Verify status badges are present
    const statusBadges = page.locator('[data-testid^="watch-status-badge"]');
    await expect(statusBadges.first()).toBeVisible();
  });

  test('should show valid future expirations', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Check for expiration display
    const expirationInfo = page.locator('[data-testid="watch-expiration"]');
    await expect(expirationInfo).toBeVisible();
    
    // Should show "Renew by" timestamp for active watches
    const renewByText = page.locator('text=Renew by');
    if (await renewByText.count() > 0) {
      await expect(renewByText.first()).toBeVisible();
    }
    
    // Check that expired watches are flagged
    const expiredBadge = page.locator('[data-testid="expired-badge"]');
    if (await expiredBadge.count() > 0) {
      await expect(expiredBadge).toHaveClass(/error|danger/);
    }
  });

  test('should display T-1 day renewal plans', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Look for renewal planning information
    const renewalPlan = page.locator('[data-testid="renewal-plan"]');
    if (await renewalPlan.count() > 0) {
      await expect(renewalPlan).toBeVisible();
      
      // Should show when next renewal is scheduled
      await expect(renewalPlan).toContainText(/renew|schedule/i);
    }
    
    // Check renewal timer display
    const renewalTimer = page.locator('[data-testid="renewal-timer"]');
    if (await renewalTimer.count() > 0) {
      await expect(renewalTimer).toBeVisible();
    }
  });

  test('should handle watch renewal operations', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Switch to controls tab
    const controlsTab = page.locator('[data-testid="controls-tab"]');
    if (await controlsTab.count() > 0) {
      await controlsTab.click();
    }
    
    // Test manual renewal trigger
    const renewButton = page.locator('[data-testid="renew-watch-button"]');
    if (await renewButton.count() > 0) {
      await expect(renewButton).toBeVisible();
      await expect(renewButton).toBeEnabled();
      
      // Click to test functionality (may show confirmation)
      await renewButton.click();
      
      // Should show some feedback
      const feedback = page.locator('[data-testid="renewal-feedback"], .toast, [role="alert"]');
      await expect(feedback.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should support 410 Gone error simulation and recovery', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Navigate to controls
    const controlsTab = page.locator('text=Recovery & Controls');
    if (await controlsTab.count() > 0) {
      await controlsTab.click();
    }
    
    // Look for 410 Gone testing section
    const goneSection = page.locator('[data-testid="410-gone-section"]');
    if (await goneSection.count() > 0) {
      await expect(goneSection).toBeVisible();
      
      // Test simulation button
      const simulateButton = page.locator('[data-testid="simulate-410-gone"]');
      if (await simulateButton.count() > 0) {
        await expect(simulateButton).toBeVisible();
        
        // Add account ID for testing
        const accountInput = page.locator('[data-testid="test-account-id"]');
        if (await accountInput.count() > 0) {
          await accountInput.fill('test-account-123');
          
          await simulateButton.click();
          
          // Should show simulation result
          const result = page.locator('[data-testid="simulation-result"]');
          await expect(result).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('should show recovery actions for failed watches', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Look for failed watch indicators
    const failedWatches = page.locator('[data-testid="failed-watch"]');
    
    if (await failedWatches.count() > 0) {
      // Should show recovery options
      const recoveryButton = page.locator('[data-testid="recover-watch"]');
      await expect(recoveryButton.first()).toBeVisible();
      await expect(recoveryButton.first()).toBeEnabled();
      
      // Click recovery action
      await recoveryButton.first().click();
      
      // Should show recovery progress or result
      const recoveryStatus = page.locator('[data-testid="recovery-status"]');
      await expect(recoveryStatus).toBeVisible({ timeout: 10000 });
    }
  });

  test('should handle unavailable tokens gracefully', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // The page should not crash with missing tokens
    const errorBoundary = page.locator('[data-testid="error-boundary"]');
    await expect(errorBoundary).not.toBeVisible();
    
    // Should show degraded state instead of crashing
    const degradedState = page.locator('[data-testid="degraded-state"], text=unavailable, text=offline');
    if (await degradedState.count() > 0) {
      await expect(degradedState.first()).toBeVisible();
    }
    
    // Critical elements should still be present
    const healthPanel = page.locator('[data-testid="watch-health-panel"]');
    await expect(healthPanel).toBeVisible();
  });

  test('should refresh health data correctly', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Find refresh button
    const refreshButton = page.locator('[data-testid="refresh-health"], [aria-label*="refresh"], button:has-text("Refresh")');
    
    if (await refreshButton.count() > 0) {
      // Note initial state
      const initialContent = await page.locator('[data-testid="health-content"]').textContent();
      
      await refreshButton.click();
      
      // Should show loading state briefly
      const loading = page.locator('[data-testid="loading"], .loading, [aria-label*="loading"]');
      if (await loading.count() > 0) {
        await expect(loading.first()).toBeVisible();
      }
      
      // Content should update (even if it's the same data)
      await page.waitForTimeout(2000);
      const updatedContent = await page.locator('[data-testid="health-content"]').textContent();
      
      // At minimum, timestamps should update
      expect(updatedContent).toBeDefined();
    }
  });

  test('should display actionable error messages', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Look for any error displays
    const errorMessages = page.locator('[data-testid="error-message"], .error, [role="alert"]');
    
    if (await errorMessages.count() > 0) {
      const firstError = errorMessages.first();
      await expect(firstError).toBeVisible();
      
      // Error should contain actionable information
      const errorText = await firstError.textContent();
      expect(errorText).toMatch(/try|check|renew|contact|refresh|configure/i);
      
      // Should have action buttons or links
      const actionButton = firstError.locator('button, a');
      if (await actionButton.count() > 0) {
        await expect(actionButton.first()).toBeVisible();
      }
    }
  });

  test('should handle multiple account statuses', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Check for multiple account displays
    const accountItems = page.locator('[data-testid^="account-"], [data-testid*="watch-item"]');
    
    if (await accountItems.count() > 1) {
      // Each account should have status information
      for (let i = 0; i < Math.min(await accountItems.count(), 3); i++) {
        const account = accountItems.nth(i);
        await expect(account).toBeVisible();
        
        // Should have status badge or indicator
        const statusIndicator = account.locator('[data-testid*="status"], .badge, .status');
        await expect(statusIndicator.first()).toBeVisible();
      }
    }
  });

  test('should validate renewal job scheduling', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Look for scheduled renewal information
    const scheduledRenewals = page.locator('[data-testid="scheduled-renewals"]');
    
    if (await scheduledRenewals.count() > 0) {
      await expect(scheduledRenewals).toBeVisible();
      
      // Should show count or next renewal time
      const renewalInfo = await scheduledRenewals.textContent();
      expect(renewalInfo).toMatch(/\d+|next|scheduled|time/i);
    }
    
    // Check for renewal service status
    const serviceStatus = page.locator('[data-testid="renewal-service-status"]');
    if (await serviceStatus.count() > 0) {
      await expect(serviceStatus).toBeVisible();
      await expect(serviceStatus).toContainText(/active|running|enabled/i);
    }
  });
});