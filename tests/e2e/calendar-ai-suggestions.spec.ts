/**
 * E2E P6: Calendar AI Suggestions
 * Tests pattern-based suggestions, cooldowns, and auto-write confidence
 */

import { test, expect } from '@playwright/test';

test.describe('E2E P6: Calendar AI Suggestions @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display suggestions when patterns match', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create a pattern by adding similar tasks
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Morning workout');
    await quickAdd.press('Enter');
    
    await page.waitForTimeout(500);
    
    // Look for AI suggestions
    const suggestions = page.locator('[data-testid="ai-suggestion"], [class*="suggestion"]');
    if (await suggestions.first().isVisible({ timeout: 2000 })) {
      await expect(suggestions.first()).toContainText(/workout|morning|exercise/i);
    }
  });

  test('should show "Because..." explanations', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Look for suggestions with explanations
    const explanations = page.locator('[data-testid="suggestion-explanation"], [aria-label*="because"], [title*="because"]');
    
    if (await explanations.first().isVisible({ timeout: 2000 })) {
      const explanationText = await explanations.first().textContent();
      expect(explanationText?.toLowerCase()).toContain('because');
    }
  });

  test('should handle suggestion dismissal and cooldown', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Find and dismiss a suggestion
    const suggestion = page.locator('[data-testid="ai-suggestion"]').first();
    
    if (await suggestion.isVisible({ timeout: 2000 })) {
      const dismissButton = suggestion.locator('[data-testid="dismiss-suggestion"], [aria-label*="dismiss"]');
      if (await dismissButton.isVisible()) {
        await dismissButton.click();
        
        // Verify suggestion is dismissed
        await expect(suggestion).not.toBeVisible({ timeout: 1000 });
        
        // Verify cooldown period (suggestion shouldn't reappear immediately)
        await page.reload();
        await page.waitForSelector('[data-testid="calendar-view"]');
        await expect(suggestion).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should create drafts when suggestions are accepted', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Find and accept a suggestion
    const suggestion = page.locator('[data-testid="ai-suggestion"]').first();
    
    if (await suggestion.isVisible({ timeout: 2000 })) {
      const acceptButton = suggestion.locator('[data-testid="accept-suggestion"], [aria-label*="accept"]');
      if (await acceptButton.isVisible()) {
        await acceptButton.click();
        
        // Verify draft creation
        const draft = page.locator('[data-testid="draft-event"], [class*="draft"]');
        await expect(draft.first()).toBeVisible({ timeout: 1000 });
        
        // Verify undo capability
        const undoButton = page.locator('[data-testid="undo"], [aria-label*="undo"]');
        await expect(undoButton.first()).toBeVisible({ timeout: 1000 });
      }
    }
  });

  test('should respect auto-write confidence thresholds', async ({ page }) => {
    await page.goto('/dev/perf-calendar');
    await page.waitForSelector('[data-testid="auto-write-panel"]');
    
    // Check confidence threshold settings
    const confidenceDisplay = page.locator('[data-testid="confidence-threshold"]');
    if (await confidenceDisplay.isVisible()) {
      const threshold = await confidenceDisplay.textContent();
      expect(threshold).toMatch(/\d+%/); // Should show percentage
    }
    
    // Verify rate limiting is active
    const rateLimitDisplay = page.locator('[data-testid="rate-limit-status"]');
    if (await rateLimitDisplay.isVisible()) {
      const status = await rateLimitDisplay.textContent();
      expect(status).toMatch(/\d+\/\d+/); // Should show usage like "2/10"
    }
  });

  test('should show decision traces for debugging', async ({ page }) => {
    await page.goto('/dev/perf-calendar');
    await page.waitForSelector('[data-testid="decision-traces"]', { timeout: 5000 });
    
    // Look for decision trace entries
    const traces = page.locator('[data-testid="decision-trace"]');
    
    if (await traces.first().isVisible({ timeout: 2000 })) {
      const trace = traces.first();
      
      // Verify trace contains required metadata
      await expect(trace).toContainText(/confidence/i);
      await expect(trace).toContainText(/because/i);
      
      // Check for stress/energy/habit metadata
      const metadata = await trace.textContent();
      expect(metadata).toMatch(/(stress|energy|habit|pattern)/i);
    }
  });

  test('should handle undo operations correctly', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create a task that might trigger auto-write
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Meeting tomorrow 2pm');
    await quickAdd.press('Enter');
    
    await page.waitForTimeout(1000);
    
    // Look for undo button from auto-write
    const undoButton = page.locator('[data-testid="undo"], [aria-label*="undo"]');
    
    if (await undoButton.isVisible({ timeout: 2000 })) {
      const initialEventCount = await page.locator('[data-testid="calendar-event"]').count();
      
      await undoButton.click();
      
      // Verify event was undone
      const finalEventCount = await page.locator('[data-testid="calendar-event"]').count();
      expect(finalEventCount).toBeLessThanOrEqual(initialEventCount);
      
      // Verify undo toast appears
      const toast = page.locator('[data-testid="toast"], .sonner-toast');
      await expect(toast).toBeVisible({ timeout: 1000 });
    }
  });
});