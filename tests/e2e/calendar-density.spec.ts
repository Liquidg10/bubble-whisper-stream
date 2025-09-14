/**
 * E2E P6: Calendar Density & Stress Detection
 * Tests calendar overload detection and spacing suggestions
 */

import { test, expect } from '@playwright/test';

test.describe('Calendar Density & Stress Detection @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('should detect calendar overload patterns', async ({ page }) => {
    // Create multiple events on same day to trigger density warnings
    const today = new Date().toISOString().split('T')[0];
    
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="quick-add-event"]').fill(`Event ${i + 1}`);
      await page.locator('[data-testid="set-time"]').fill(`${9 + i}:00`);
      await page.locator('[data-testid="add-event-button"]').click();
      await page.waitForTimeout(200);
    }
    
    // Should trigger density warning
    const densityWarning = page.locator('[data-testid="calendar-density-warning"]');
    await expect(densityWarning).toBeVisible();
    
    // Should contain stress reduction suggestions
    await expect(densityWarning).toContainText('overwhelm');
  });

  test('should suggest optimal spacing between events', async ({ page }) => {
    // Add two events close together
    await page.locator('[data-testid="calendar-grid-cell"][data-date="today"]').click();
    await page.locator('[data-testid="event-title"]').fill('Meeting A');
    await page.locator('[data-testid="event-time"]').fill('10:00');
    await page.locator('[data-testid="save-event"]').click();
    
    await page.locator('[data-testid="calendar-grid-cell"][data-date="today"]').click();
    await page.locator('[data-testid="event-title"]').fill('Meeting B');
    await page.locator('[data-testid="event-time"]').fill('10:15');
    await page.locator('[data-testid="save-event"]').click();
    
    // Should show spacing suggestion
    const spacingSuggestion = page.locator('[data-testid="spacing-suggestion"]');
    await expect(spacingSuggestion).toBeVisible();
    await expect(spacingSuggestion).toContainText('buffer time');
  });

  test('should track cognitive load metrics', async ({ page }) => {
    // Navigate to dev performance dashboard
    await page.goto('/dev/perf-calendar');
    await page.waitForSelector('[data-testid="cognitive-load-meter"]');
    
    // Should show current cognitive load percentage
    const loadMeter = page.locator('[data-testid="cognitive-load-meter"]');
    const loadValue = await loadMeter.getAttribute('data-load-value');
    
    expect(parseInt(loadValue || '0')).toBeGreaterThanOrEqual(0);
    expect(parseInt(loadValue || '0')).toBeLessThanOrEqual(100);
  });

  test('should respect stress reduction preferences', async ({ page }) => {
    // Enable stress reduction in settings
    await page.goto('/settings');
    await page.locator('[data-testid="enable-stress-reduction"]').check();
    await page.locator('[data-testid="save-settings"]').click();
    
    await page.goto('/calendar');
    
    // Create high-density day
    for (let i = 0; i < 8; i++) {
      await page.locator('[data-testid="quick-add-event"]').fill(`Task ${i}`);
      await page.keyboard.press('Enter');
    }
    
    // Should offer to reschedule some items
    const rescheduleOffer = page.locator('[data-testid="reschedule-suggestion"]');
    await expect(rescheduleOffer).toBeVisible();
    await expect(rescheduleOffer).toContainText('spread out');
  });
});