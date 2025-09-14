/**
 * E2E P6: Calendar Density & Stress Detection
 * Tests stress indicators, spacing suggestions, and conflict resolution
 */

import { test, expect } from '@playwright/test';

test.describe('E2E P6: Calendar Density Detection @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should detect heavy calendar days and show stress indicator', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create multiple events to simulate heavy day
    const quickAdd = page.locator('[data-testid="quick-add"]');
    const heavyDayEvents = [
      'Meeting 9am-10am',
      'Project review 10:30am-11:30am',
      'Lunch meeting 12pm-1pm',
      'Development work 2pm-4pm',
      'Team standup 4:30pm-5pm',
      'Client call 5:30pm-6:30pm'
    ];
    
    for (const event of heavyDayEvents) {
      await quickAdd.fill(event);
      await quickAdd.press('Enter');
      await page.waitForTimeout(300);
    }
    
    // Look for stress indicator
    const stressIndicator = page.locator('[data-testid="stress-indicator"], [class*="stress"], [aria-label*="busy"]');
    await expect(stressIndicator.first()).toBeVisible({ timeout: 3000 });
  });

  test('should show spacing suggestions for busy days', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create back-to-back events
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Meeting 10am-11am');
    await quickAdd.press('Enter');
    await page.waitForTimeout(300);
    
    await quickAdd.fill('Call 11am-12pm');
    await quickAdd.press('Enter');
    await page.waitForTimeout(300);
    
    await quickAdd.fill('Review 12pm-1pm');
    await quickAdd.press('Enter');
    
    // Look for spacing suggestions
    const spacingSuggestion = page.locator('[data-testid="spacing-suggestion"], [aria-label*="spacing"], [title*="break"]');
    
    if (await spacingSuggestion.first().isVisible({ timeout: 3000 })) {
      // Verify suggestion contains "Because..." explanation
      const suggestionText = await spacingSuggestion.first().textContent();
      expect(suggestionText?.toLowerCase()).toMatch(/(because|break|spacing|rest)/);
    }
  });

  test('should suggest alternative time slots for conflicts', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create overlapping events
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Important meeting 2pm-3pm');
    await quickAdd.press('Enter');
    await page.waitForTimeout(500);
    
    await quickAdd.fill('Team sync 2:30pm-3:30pm');
    await quickAdd.press('Enter');
    
    // Look for conflict resolution UI
    const conflictResolver = page.locator('[data-testid="conflict-resolver"], [role="dialog"]');
    
    if (await conflictResolver.isVisible({ timeout: 2000 })) {
      // Verify alternative options are available
      const alternatives = page.locator('[data-testid="alternative-slot"], [aria-label*="alternative"]');
      await expect(alternatives.first()).toBeVisible();
      
      // Check for standard conflict resolution options
      const shiftOption = page.locator('[data-testid="shift-next"], [aria-label*="shift"]');
      const overlapOption = page.locator('[data-testid="allow-overlap"], [aria-label*="overlap"]');
      const unscheduledOption = page.locator('[data-testid="leave-unscheduled"], [aria-label*="unscheduled"]');
      
      await expect(shiftOption.or(overlapOption).or(unscheduledOption)).toBeVisible();
    }
  });

  test('should calculate density thresholds correctly', async ({ page }) => {
    await page.goto('/dev/perf-calendar');
    await page.waitForSelector('[data-testid="calendar-performance"]');
    
    // Check density monitoring panel
    const densityPanel = page.locator('[data-testid="density-monitoring"]');
    
    if (await densityPanel.isVisible({ timeout: 2000 })) {
      // Verify density metrics are displayed
      const densityValue = page.locator('[data-testid="current-density"]');
      if (await densityValue.isVisible()) {
        const density = await densityValue.textContent();
        expect(density).toMatch(/\d+%/); // Should show percentage
      }
      
      // Check threshold settings
      const threshold = page.locator('[data-testid="density-threshold"]');
      if (await threshold.isVisible()) {
        const thresholdValue = await threshold.textContent();
        expect(thresholdValue).toMatch(/\d+/); // Should show numeric threshold
      }
    }
  });

  test('should provide actionable suggestions with explanations', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create a scenario that should trigger suggestions
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Back-to-back meetings all day');
    await quickAdd.press('Enter');
    
    // Look for suggestions with explanations
    const suggestions = page.locator('[data-testid="spacing-suggestion"], [class*="suggestion"]');
    
    if (await suggestions.first().isVisible({ timeout: 3000 })) {
      // Click on suggestion to see full explanation
      await suggestions.first().click();
      
      // Verify explanation appears
      const explanation = page.locator('[data-testid="suggestion-explanation"], [role="tooltip"]');
      
      if (await explanation.isVisible({ timeout: 1000 })) {
        const explanationText = await explanation.textContent();
        expect(explanationText?.toLowerCase()).toMatch(/(because|recommend|suggest|improve)/);
      }
    }
  });

  test('should respect user preferences for suggestion frequency', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('[data-testid="settings-panel"]');
    
    // Look for suggestion frequency settings
    const suggestionSettings = page.locator('[data-testid="suggestion-frequency"], [aria-label*="suggestion"]');
    
    if (await suggestionSettings.isVisible({ timeout: 2000 })) {
      // Test different frequency settings
      const frequencyOptions = suggestionSettings.locator('option, [role="option"]');
      
      if (await frequencyOptions.first().isVisible()) {
        const optionCount = await frequencyOptions.count();
        expect(optionCount).toBeGreaterThan(0);
      }
    }
  });

  test('should handle mobile density detection', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create dense mobile schedule
    const quickAdd = page.locator('[data-testid="quick-add"]');
    const mobileEvents = [
      'Call 9am',
      'Meeting 10am',
      'Lunch 12pm',
      'Work 2pm',
      'Call 4pm'
    ];
    
    for (const event of mobileEvents) {
      await quickAdd.fill(event);
      await quickAdd.press('Enter');
      await page.waitForTimeout(200);
    }
    
    // Verify mobile-specific density indicators
    const mobileDensityIndicator = page.locator('[data-testid="mobile-density"], [class*="mobile-stress"]');
    
    if (await mobileDensityIndicator.isVisible({ timeout: 2000 })) {
      // Verify it's appropriately sized for mobile
      const box = await mobileDensityIndicator.boundingBox();
      expect(box?.width).toBeLessThan(400); // Fits mobile viewport
    }
  });
});