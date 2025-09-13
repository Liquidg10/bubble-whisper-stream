/**
 * E2E Verification Gates - P20
 * End-to-end validation before feature flag enablement
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('E2E Verification Gates @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('Task round-trip invariants preserve data integrity', async ({ page }) => {
    // Navigate to dev route for task testing
    await page.goto('/dev/task-adapter');
    
    // Verify task adapter functionality
    const adapterStatus = await page.locator('[data-testid="adapter-status"]').textContent();
    expect(adapterStatus).toContain('Ready');
    
    // Test round-trip conversion
    await page.click('[data-testid="test-round-trip"]');
    await page.waitForSelector('[data-testid="round-trip-result"]');
    
    const result = await page.locator('[data-testid="round-trip-result"]').textContent();
    expect(result).toContain('PASS');
  });

  test('List view: full keyboard CRUD + accessibility', async ({ page }) => {
    await page.goto('/list');
    
    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await page.keyboard.type('Test task');
    await page.keyboard.press('Enter');
    
    // Verify task was created
    await expect(page.locator('[data-testid="task-item"]')).toBeVisible();
    
    // Test completion with keyboard
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid="task-item"][data-completed="true"]')).toBeVisible();
    
    // Accessibility check
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    });
  });

  test('Kanban view: keyboard drag alternatives + target sizing', async ({ page }) => {
    await page.goto('/kanban');
    
    // Verify drag alternatives exist
    await expect(page.locator('[data-testid="move-task-button"]')).toBeVisible();
    
    // Test keyboard move
    await page.click('[data-testid="move-task-button"]');
    await page.click('[data-testid="move-to-column"][data-column="doing"]');
    
    // Verify target sizes ≥ 44x44
    const actionButtons = await page.locator('[data-testid*="action-button"]').all();
    for (const button of actionButtons) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    
    await checkA11y(page);
  });

  test('Matrix view: quadrant navigation + reduced motion', async ({ page }) => {
    await page.goto('/matrix');
    
    // Test arrow key navigation
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    
    // Verify reduced motion compliance
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    const animationElements = await page.locator('[style*="animation"]').count();
    expect(animationElements).toBe(0);
    
    await checkA11y(page);
  });

  test('OAuth incremental auth flow', async ({ page }) => {
    await page.goto('/settings/integrations');
    
    // Verify scope progression exists
    await expect(page.locator('[data-testid="scope-progression"]')).toBeVisible();
    
    // Test incremental auth UI
    await page.click('[data-testid="connect-calendar"]');
    await expect(page.locator('[data-testid="scope-delta"]')).toBeVisible();
  });

  test('Auto-Write ladder compliance', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Verify confidence gates
    const confidenceGate = await page.locator('[data-testid="confidence-gate"]').textContent();
    expect(confidenceGate).toContain('Active');
    
    // Verify undo functionality
    await expect(page.locator('[data-testid="undo-stack"]')).toBeVisible();
  });

  test('Planning mode acceptance thresholds', async ({ page }) => {
    await page.goto('/dev/planning-stats');
    
    // Verify acceptance rate tracking
    const acceptanceRate = await page.locator('[data-testid="acceptance-rate"]').textContent();
    const rate = parseFloat(acceptanceRate?.match(/(\d+\.?\d*)%/)?.[1] || '0');
    expect(rate).toBeGreaterThanOrEqual(30); // ≥30% acceptance threshold
  });

  test('Cognitive load budgets active', async ({ page }) => {
    await page.goto('/dev/fatigue-budgets');
    
    // Verify budget system is operational
    await expect(page.locator('[data-testid="nudge-budget"]')).toBeVisible();
    await expect(page.locator('[data-testid="cooldown-status"]')).toBeVisible();
  });

  test('Assistant voice cohesion (no persona leaks)', async ({ page }) => {
    // Check multiple pages for persona strings
    const pages = ['/', '/list', '/kanban', '/matrix'];
    const forbiddenTerms = ['Coach', 'Scientist', 'Friend', 'Persona'];
    
    for (const pagePath of pages) {
      await page.goto(pagePath);
      
      const pageContent = await page.textContent('body');
      for (const term of forbiddenTerms) {
        expect(pageContent?.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  test('Watcher health monitoring active', async ({ page }) => {
    await page.goto('/dev/watch-health');
    
    // Verify calendar and gmail watch status
    await expect(page.locator('[data-testid="calendar-watch-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="gmail-watch-status"]')).toBeVisible();
    
    // Verify renewal scheduling
    await expect(page.locator('[data-testid="renewal-schedule"]')).toBeVisible();
  });

  test('Context drift detection operational', async ({ page }) => {
    await page.goto('/dev/context-drift');
    
    // Verify drift monitoring
    await expect(page.locator('[data-testid="drift-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="rollback-button"]')).toBeVisible();
  });
});