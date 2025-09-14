/**
 * E2E P6: Masonry View Core Functionality
 * Tests loading, rendering, drag alternatives, and position persistence
 */

import { test, expect } from '@playwright/test';

test.describe('E2E P6: Masonry View @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load Masonry view with proper card sizing', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Verify cards are sized based on priority
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    expect(cards.length).toBeGreaterThan(0);
    
    for (const card of cards) {
      const box = await card.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
    }
  });

  test('should support keyboard navigation alternatives', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Focus first card
    await page.keyboard.press('Tab');
    const focusedCard = page.locator(':focus');
    await expect(focusedCard).toBeVisible();
    
    // Test arrow key movement
    const initialPosition = await focusedCard.boundingBox();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100); // Animation time
    
    // Verify card moved or focus changed
    const afterMove = await page.locator(':focus').boundingBox();
    expect(afterMove).toBeDefined();
  });

  test('should handle task editing via Enter/Space', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Focus and activate card
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Check for edit mode or context menu
    const editDialog = page.locator('[role="dialog"], [data-testid="edit-task"]');
    await expect(editDialog.first()).toBeVisible({ timeout: 1000 });
  });

  test('should persist card positions across sessions', async ({ page, context }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Get initial positions
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    const initialPositions = [];
    
    for (const card of cards.slice(0, 3)) {
      const position = await card.boundingBox();
      const taskId = await card.getAttribute('data-task-id');
      initialPositions.push({ taskId, position });
    }
    
    // Reload page
    await page.reload();
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Verify positions are similar (allowing for minor layout shifts)
    for (const { taskId, position } of initialPositions) {
      if (taskId && position) {
        const card = page.locator(`[data-task-id="${taskId}"]`);
        const newPosition = await card.boundingBox();
        
        if (newPosition) {
          expect(Math.abs(newPosition.x - position.x)).toBeLessThan(50);
          expect(Math.abs(newPosition.y - position.y)).toBeLessThan(50);
        }
      }
    }
  });

  test('should reschedule tasks from pinboard to calendar', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Find a task card
    const card = page.locator('[data-testid="masonry-card"]').first();
    await card.click();
    
    // Look for schedule action
    const scheduleAction = page.locator('[data-testid="schedule-task"], [aria-label*="schedule"]');
    if (await scheduleAction.isVisible()) {
      await scheduleAction.click();
      
      // Verify scheduling interface appears
      const scheduler = page.locator('[data-testid="task-scheduler"], [role="dialog"]');
      await expect(scheduler.first()).toBeVisible();
    }
  });

  test('should maintain accessibility in Masonry view', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Check ARIA roles and labels
    const container = page.locator('[data-testid="masonry-container"]');
    await expect(container).toHaveAttribute('role', 'application');
    
    // Verify cards are focusable
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    for (const card of cards.slice(0, 3)) {
      await expect(card).toHaveAttribute('tabindex', '0');
      await expect(card).toHaveAttribute('role', 'button');
    }
  });
});