/**
 * P11 Masonry/Pinboard Accessibility Tests
 * Comprehensive accessibility testing for the masonry layout view
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Masonry Accessibility @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/masonry');
    await injectAxe(page);
    await page.waitForLoadState('networkidle');
  });

  test('should meet WCAG accessibility standards', async ({ page }) => {
    // Check for accessibility violations
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true }
    });
  });

  test('should have proper ARIA structure for masonry grid', async ({ page }) => {
    const masonryContainer = page.locator('[data-testid="masonry-container"]');
    
    // Container should have application role for complex widget
    await expect(masonryContainer).toHaveAttribute('role', 'application');
    await expect(masonryContainer).toHaveAttribute('aria-label', /pinboard|masonry/i);
    
    // Should provide instructions for interaction
    const instructions = page.locator('[data-testid="masonry-instructions"]');
    await expect(instructions).toBeVisible();
    await expect(instructions).toHaveAttribute('role', 'region');
    await expect(instructions).toHaveAttribute('aria-live', 'polite');
  });

  test('should support keyboard navigation through cards', async ({ page }) => {
    // Add some test tasks first
    await page.locator('[data-testid="quick-add-task"]').fill('Test Task 1');
    await page.keyboard.press('Enter');
    await page.locator('[data-testid="quick-add-task"]').fill('Test Task 2');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(500);
    
    // Focus first card
    await page.keyboard.press('Tab');
    let focusedCard = page.locator('[data-testid="masonry-card"]:focus');
    await expect(focusedCard).toBeVisible();
    
    // Navigate with arrow keys
    await page.keyboard.press('ArrowRight');
    focusedCard = page.locator('[data-testid="masonry-card"]:focus');
    await expect(focusedCard).toBeVisible();
    
    // Arrow down should work
    await page.keyboard.press('ArrowDown');
    focusedCard = page.locator('[data-testid="masonry-card"]:focus');
    await expect(focusedCard).toBeVisible();
  });

  test('should provide keyboard alternatives to drag positioning', async ({ page }) => {
    // Add a task
    await page.locator('[data-testid="quick-add-task"]').fill('Moveable Task');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // Focus the task
    await page.keyboard.press('Tab');
    const card = page.locator('[data-testid="masonry-card"]:focus');
    
    // Enter should activate move mode or open context menu
    await page.keyboard.press('Enter');
    
    // Should show move controls or context menu
    const moveControls = page.locator('[data-testid="move-controls"], [data-testid="context-menu"]');
    await expect(moveControls.first()).toBeVisible();
    
    // Should be able to move with keyboard
    if (await page.locator('[data-testid="move-controls"]').isVisible()) {
      await page.keyboard.press('ArrowUp'); // Move up
      await page.keyboard.press('Enter'); // Confirm position
    }
  });

  test('should have accessible focus indicators on all cards', async ({ page }) => {
    // Add test tasks
    for (let i = 1; i <= 3; i++) {
      await page.locator('[data-testid="quick-add-task"]').fill(`Task ${i}`);
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(500);
    
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    
    for (const card of cards) {
      await card.focus();
      
      // Check for visible focus indicator
      const hasVisibleFocus = await card.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return styles.outline !== 'none' || 
               styles.boxShadow !== 'none' ||
               styles.border !== styles.borderColor; // Border change indicates focus
      });
      
      expect(hasVisibleFocus).toBe(true);
    }
  });

  test('should support screen reader announcements for card changes', async ({ page }) => {
    // Create announcement region for screen readers
    const liveRegion = page.locator('[aria-live="polite"], [aria-live="assertive"]');
    await expect(liveRegion).toBeVisible();
    
    // Add a task - should trigger announcement
    await page.locator('[data-testid="quick-add-task"]').fill('Announced Task');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(200);
    
    // Live region should have content about the added task
    const announcement = await liveRegion.textContent();
    expect(announcement).toMatch(/added|created/i);
  });

  test('should handle high contrast mode properly', async ({ page }) => {
    // Simulate high contrast mode
    await page.emulateMedia({ forcedColors: 'active' });
    
    // Cards should remain visible and distinguishable
    const cards = page.locator('[data-testid="masonry-card"]');
    const cardCount = await cards.count();
    
    if (cardCount > 0) {
      const firstCard = cards.first();
      await expect(firstCard).toBeVisible();
      
      // Focus should be clearly visible in high contrast
      await firstCard.focus();
      const focusedCard = page.locator('[data-testid="masonry-card"]:focus');
      await expect(focusedCard).toBeVisible();
    }
  });

  test('should respect reduced motion preferences', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    // Add a task to trigger any animations
    await page.locator('[data-testid="quick-add-task"]').fill('Motion Test');
    await page.keyboard.press('Enter');
    
    // Check that masonry container respects reduced motion
    const container = page.locator('[data-testid="masonry-container"]');
    const styles = await container.evaluate(el => getComputedStyle(el));
    
    // Animations should be disabled or minimal
    expect(styles.animationDuration).toBe('0s');
    expect(styles.transitionDuration).toBe('0s');
  });

  test('should have appropriate target sizes for touch interaction', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Add some tasks
    for (let i = 1; i <= 3; i++) {
      await page.locator('[data-testid="quick-add-task"]').fill(`Mobile Task ${i}`);
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(500);
    
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    
    for (const card of cards) {
      const box = await card.boundingBox();
      if (box) {
        // Cards should meet minimum touch target size (44x44px)
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should provide context about card priorities and groupings', async ({ page }) => {
    // Add tasks with different priorities
    await page.locator('[data-testid="quick-add-task"]').fill('High Priority Task');
    await page.keyboard.press('Enter');
    
    // Set priority through UI or keyboard shortcut
    await page.keyboard.press('Tab'); // Focus the card
    await page.keyboard.press('KeyP'); // Priority shortcut
    await page.keyboard.press('3'); // High priority
    
    const priorityCard = page.locator('[data-testid="masonry-card"][data-priority="high"]');
    
    // Should have appropriate ARIA labels describing priority
    await expect(priorityCard).toHaveAttribute('aria-label', /high.+priority/i);
    
    // Should be grouped or announced appropriately
    const cardDescription = await priorityCard.getAttribute('aria-describedby');
    if (cardDescription) {
      const description = page.locator(`#${cardDescription}`);
      await expect(description).toContainText(/priority/i);
    }
  });
});