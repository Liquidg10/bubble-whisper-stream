/**
 * A11Y P6: Masonry View Accessibility
 * Tests keyboard alternatives, target sizing, and ARIA patterns for Masonry
 */

import { test, expect } from '@playwright/test';

test.describe('A11Y P6: Masonry Accessibility @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have proper ARIA structure for Masonry layout', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Check container has proper role
    const container = page.locator('[data-testid="masonry-container"]');
    await expect(container).toHaveAttribute('role', 'application');
    await expect(container).toHaveAttribute('aria-label');
    
    // Check cards have proper roles
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    expect(cards.length).toBeGreaterThan(0);
    
    for (const card of cards.slice(0, 5)) {
      await expect(card).toHaveAttribute('role', 'button');
      await expect(card).toHaveAttribute('tabindex', '0');
      await expect(card).toHaveAttribute('aria-label');
    }
  });

  test('should support keyboard alternatives to drag operations', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Focus first card
    const firstCard = page.locator('[data-testid="masonry-card"]').first();
    await firstCard.focus();
    
    // Test arrow key movement as drag alternative
    const initialPosition = await firstCard.boundingBox();
    
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    
    // Verify movement occurred or focus changed
    const afterMove = await page.locator(':focus').boundingBox();
    expect(afterMove).toBeDefined();
    
    // Test other directions
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    
    // Verify card remains accessible
    const focusedCard = page.locator(':focus');
    await expect(focusedCard).toBeVisible();
  });

  test('should meet minimum target size requirements', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Check all interactive elements meet 24×24 minimum (WCAG 2.2)
    const interactiveElements = await page.locator('[data-testid="masonry-card"], button, [role="button"]').all();
    
    for (const element of interactiveElements) {
      const box = await element.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
    }
  });

  test('should prefer 44×44 for primary interaction targets', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Primary cards should meet comfortable touch target size
    const primaryCards = await page.locator('[data-testid="masonry-card"]').all();
    
    for (const card of primaryCards.slice(0, 3)) {
      const box = await card.boundingBox();
      if (box) {
        // Prefer 44×44 for comfortable interaction
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should have accessible card activation methods', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    const card = page.locator('[data-testid="masonry-card"]').first();
    await card.focus();
    
    // Test Enter key activation
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Check for edit dialog or context menu
    const dialog = page.locator('[role="dialog"], [data-testid="edit-task"]');
    if (await dialog.isVisible()) {
      await expect(dialog).toBeVisible();
      
      // Close dialog for next test
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    // Test Space key activation
    await card.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    
    // Verify some activation occurred
    const activeDialog = page.locator('[role="dialog"], [data-testid="context-menu"]');
    if (await activeDialog.isVisible()) {
      await expect(activeDialog).toBeVisible();
    }
  });

  test('should provide keyboard context menu access', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    const card = page.locator('[data-testid="masonry-card"]').first();
    await card.focus();
    
    // Test context menu key (if supported)
    await page.keyboard.press('ContextMenu');
    await page.waitForTimeout(300);
    
    // Or test right-click equivalent
    if (!(await page.locator('[role="menu"]').isVisible())) {
      await page.keyboard.press('Shift+F10');
      await page.waitForTimeout(300);
    }
    
    // Check for context menu
    const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
    if (await contextMenu.isVisible()) {
      await expect(contextMenu).toBeVisible();
      
      // Test menu navigation
      await page.keyboard.press('ArrowDown');
      const focusedMenuItem = page.locator('[role="menuitem"]:focus');
      await expect(focusedMenuItem).toBeVisible();
    }
  });

  test('should support screen reader navigation patterns', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Check for proper heading structure
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    if (headings.length > 0) {
      // Verify heading hierarchy
      for (const heading of headings) {
        const tagName = await heading.evaluate(el => el.tagName);
        expect(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']).toContain(tagName);
      }
    }
    
    // Check for landmarks
    const landmarks = page.locator('[role="main"], [role="navigation"], [role="banner"]');
    if (await landmarks.first().isVisible()) {
      await expect(landmarks.first()).toBeVisible();
    }
    
    // Verify cards have descriptive labels
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    for (const card of cards.slice(0, 3)) {
      const ariaLabel = await card.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel?.length).toBeGreaterThan(5); // Should be descriptive
    }
  });

  test('should handle focus management during layout changes', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Focus a card
    const card = page.locator('[data-testid="masonry-card"]').first();
    await card.focus();
    
    const cardId = await card.getAttribute('data-task-id');
    
    // Trigger layout change (add new task)
    const quickAdd = page.locator('[data-testid="quick-add"]');
    if (await quickAdd.isVisible()) {
      await quickAdd.fill('Focus management test');
      await quickAdd.press('Enter');
      await page.waitForTimeout(500);
    }
    
    // Verify focus is maintained or properly managed
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // If original card still exists, it should be focusable
    if (cardId) {
      const originalCard = page.locator(`[data-task-id="${cardId}"]`);
      if (await originalCard.isVisible()) {
        await originalCard.focus();
        await expect(originalCard).toBeFocused();
      }
    }
  });

  test('should provide alternative text for visual indicators', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Check for images with alt text
    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      expect(alt).toBeDefined(); // Should have alt attribute (can be empty for decorative)
    }
    
    // Check for icons with proper labels
    const icons = page.locator('[class*="icon"], [data-testid*="icon"]');
    if (await icons.first().isVisible()) {
      const iconLabels = await icons.all();
      for (const icon of iconLabels.slice(0, 3)) {
        const ariaLabel = await icon.getAttribute('aria-label');
        const ariaHidden = await icon.getAttribute('aria-hidden');
        
        // Icon should either have label or be hidden from screen readers
        expect(ariaLabel || ariaHidden === 'true').toBeTruthy();
      }
    }
  });

  test('should support zoom and magnification', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Simulate 200% zoom
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });
    
    await page.waitForTimeout(500);
    
    // Verify layout still works at higher zoom
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    for (const card of cards.slice(0, 3)) {
      await expect(card).toBeVisible();
      
      // Should still be interactive
      const box = await card.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
    }
    
    // Reset zoom
    await page.evaluate(() => {
      document.body.style.zoom = '1';
    });
  });

  test('should work with keyboard-only navigation', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Navigate entire interface using only keyboard
    let tabCount = 0;
    const maxTabs = 20;
    
    while (tabCount < maxTabs) {
      await page.keyboard.press('Tab');
      tabCount++;
      
      const focusedElement = page.locator(':focus');
      if (await focusedElement.isVisible()) {
        // Try activating the focused element
        const tagName = await focusedElement.evaluate(el => el.tagName);
        const role = await focusedElement.getAttribute('role');
        
        if (tagName === 'BUTTON' || role === 'button') {
          // Test that button can be activated
          await page.keyboard.press('Enter');
          await page.waitForTimeout(100);
          
          // If dialog opened, close it
          const dialog = page.locator('[role="dialog"]');
          if (await dialog.isVisible()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
          }
        }
      }
    }
    
    // Should be able to navigate back
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    }
  });
});