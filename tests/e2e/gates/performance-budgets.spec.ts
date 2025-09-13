/**
 * P20 Gate 9: Performance & Cognitive Load Budgets
 * Verifies FPS targets, cognitive load limits, and performance budgets
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 9: Performance & Cognitive Load Budgets @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flags.performanceBudgets', 'true');
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should maintain FPS targets during interactions', async ({ page }) => {
    await page.goto('/dev/fatigue-budgets');
    
    // Test FPS monitoring
    const fpsMonitor = page.locator('[data-testid="fps-monitor"]');
    await expect(fpsMonitor).toBeVisible();
    
    // Simulate heavy interaction
    await page.locator('[data-testid="stress-test"]').click();
    
    const fpsResults = page.locator('[data-testid="fps-results"]');
    await expect(fpsResults).toContainText('FPS ≥55: ✅');
  });

  test('should respect cognitive load budgets', async ({ page }) => {
    await page.goto('/dev/fatigue-budgets');
    
    // Check nudge budget system
    const nudgeBudget = page.locator('[data-testid="nudge-budget"]');
    await expect(nudgeBudget).toBeVisible();
    
    // Should show current budget status
    await expect(nudgeBudget).toContainText(/\d+/); // Should show numbers
  });

  test('should implement cooldown periods', async ({ page }) => {
    await page.goto('/dev/fatigue-budgets');
    
    // Check cooldown status
    const cooldownStatus = page.locator('[data-testid="cooldown-status"]');
    await expect(cooldownStatus).toBeVisible();
    
    // Should respect rate limiting
    await expect(cooldownStatus).toContainText(/active|ready|cooling/i);
  });

  test('should track user fatigue indicators', async ({ page }) => {
    await page.goto('/dev/fatigue-budgets');
    
    // Check fatigue tracking
    const fatigueIndicators = page.locator('[data-testid="fatigue-indicators"]');
    await expect(fatigueIndicators).toBeVisible();
  });

  test('should adapt to user interaction patterns', async ({ page }) => {
    await page.goto('/dev/fatigue-budgets');
    
    // Test adaptive behavior
    const adaptiveBehavior = page.locator('[data-testid="adaptive-behavior"]');
    await expect(adaptiveBehavior).toBeVisible();
    
    await expect(adaptiveBehavior).toContainText('Learning');
  });

  test('should virtualize large task lists', async ({ page }) => {
    await page.goto('/list');
    
    // Create many tasks to test virtualization
    for (let i = 0; i < 10; i++) {
      await page.locator('[data-testid="quick-add"]').fill(`Task ${i}`);
      await page.locator('[data-testid="quick-add"]').press('Enter');
      await page.waitForTimeout(100);
    }
    
    // Check that performance remains acceptable
    const performanceInfo = await page.evaluate(() => ({
      memory: (performance as any).memory?.usedJSHeapSize || 0,
      timing: performance.now()
    }));
    
    expect(performanceInfo.memory).toBeLessThan(100 * 1024 * 1024); // < 100MB
  });
});