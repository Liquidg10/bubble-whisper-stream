/**
 * P20 Gate 2: Accessibility & Keyboard Navigation
 * Verifies WCAG 2.2 compliance, target sizes, and drag alternatives
 */

import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('P20 Gate 2: Accessibility & Keyboard Navigation @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should pass axe-core accessibility tests', async ({ page }) => {
    // Test main views for accessibility including new calendar and masonry
    const views = ['/', '/list', '/kanban', '/matrix', '/calendar', '/masonry'];
    
    for (const view of views) {
      await page.goto(view);
      await page.waitForLoadState('networkidle');
      
      // Run axe accessibility checks
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    }
    
    // Test dev routes if available
    const devViews = ['/dev/perf-calendar'];
    for (const view of devViews) {
      try {
        await page.goto(view);
        await page.waitForLoadState('networkidle');
        await checkA11y(page, null, {
          detailedReport: true,
          detailedReportOptions: { html: true }
        });
      } catch (error) {
        // Dev routes may not be available in all environments
        console.log(`Dev route ${view} not available`);
      }
    }
  });

  test('should have minimum target sizes ≥44×44 CSS px', async ({ page }) => {
    await page.goto('/list');
    
    // Check all interactive elements
    const interactiveElements = await page.locator('button, a, input, [role="button"]').all();
    
    for (const element of interactiveElements) {
      const box = await element.boundingBox();
      if (box) {
        // WCAG 2.2 SC 2.5.8 - minimum 24×24, but we target 44×44 for comfort
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should provide keyboard alternatives to drag operations', async ({ page }) => {
    await page.goto('/kanban');
    
    // Create a task first
    await page.locator('[data-testid="add-task-backlog"]').click();
    await page.locator('[data-testid="task-input"]').fill('Drag test task');
    await page.locator('[data-testid="task-input"]').press('Enter');
    
    // Focus the task
    await page.locator('[data-testid="task-item"]').first().focus();
    
    // Test keyboard navigation for moving tasks
    await page.keyboard.press('Enter'); // Should open move menu or similar
    
    // Look for move options
    const moveOptions = page.locator('[data-testid="move-menu"], [aria-label*="move"], [data-testid="keyboard-move"]');
    await expect(moveOptions.first()).toBeVisible();
    
    // Test arrow key navigation
    await page.keyboard.press('ArrowRight'); // Should move to next column
    await page.keyboard.press('Enter'); // Should confirm move
    
    // Verify task moved
    const movedTask = page.locator('[data-testid="kanban-column-next"] [data-testid="task-item"]');
    await expect(movedTask).toBeVisible();
  });

  test('should support full keyboard navigation in List view', async ({ page }) => {
    await page.goto('/list');
    
    // Test quick add with keyboard
    await page.keyboard.press('Tab'); // Should focus quick add
    await page.keyboard.type('Keyboard test task');
    await page.keyboard.press('Enter');
    
    // Wait for task to appear
    await page.waitForTimeout(500);
    
    // Navigate through tasks with arrow keys
    await page.keyboard.press('ArrowDown'); // Focus first task
    
    const focusedTask = page.locator('[data-testid="task-item"]:focus');
    await expect(focusedTask).toBeVisible();
    
    // Test task completion with keyboard
    await page.keyboard.press('Space'); // Should toggle completion
    
    // Test task editing
    await page.keyboard.press('KeyE'); // Should enter edit mode
    const editInput = page.locator('[data-testid="task-edit-input"]');
    await expect(editInput).toBeFocused();
  });

  test('should support Matrix view keyboard navigation', async ({ page }) => {
    await page.goto('/matrix');
    
    // Create task first
    await page.locator('[data-testid="matrix-quick-add"]').fill('Matrix test task');
    await page.locator('[data-testid="matrix-quick-add"]').press('Enter');
    
    // Wait for task to appear
    await page.waitForTimeout(500);
    
    // Focus the task
    await page.locator('[data-testid="matrix-task"]').first().focus();
    
    // Test arrow key movement between quadrants
    await page.keyboard.press('ArrowRight'); // Should move to next quadrant
    await page.keyboard.press('ArrowDown');  // Should move down quadrant
    
    // Verify task position changed
    const taskInNewQuadrant = page.locator('[data-testid="matrix-quadrant-2"] [data-testid="matrix-task"]');
    await expect(taskInNewQuadrant).toBeVisible();
  });

  test('should respect prefers-reduced-motion', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    await page.goto('/bubble');
    
    // Check that animations are disabled
    const bubbleContainer = page.locator('[data-testid="bubble-container"]');
    const styles = await bubbleContainer.evaluate(el => getComputedStyle(el));
    
    // Should have minimal or no animation
    expect(styles.animationDuration).toBe('0s');
    
    // Test with user interaction
    await page.locator('[data-testid="quick-add"]').fill('Motion test');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Bubbles should appear without extensive animation
    await page.waitForTimeout(100); // Minimal wait
    const newBubble = page.locator('[data-testid="bubble-item"]');
    await expect(newBubble).toBeVisible();
  });

  test('should provide proper focus management', async ({ page }) => {
    await page.goto('/list');
    
    // Test focus trap in modals
    await page.locator('[data-testid="add-task-button"]').click();
    
    const modal = page.locator('[data-testid="task-modal"]');
    await expect(modal).toBeVisible();
    
    // Focus should be in modal
    const modalInput = page.locator('[data-testid="task-title-input"]');
    await expect(modalInput).toBeFocused();
    
    // Tab should stay within modal
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Focus should still be within modal bounds
    const focusedElement = page.locator(':focus');
    const isWithinModal = await focusedElement.evaluate((el, modal) => {
      return modal.contains(el);
    }, await modal.elementHandle());
    
    expect(isWithinModal).toBe(true);
  });

  test('should have proper ARIA labels and roles', async ({ page }) => {
    await page.goto('/kanban');
    
    // Check kanban board structure
    const board = page.locator('[data-testid="kanban-board"]');
    await expect(board).toHaveAttribute('role', 'application');
    
    // Check columns have proper labels
    const columns = page.locator('[data-testid^="kanban-column-"]');
    const columnCount = await columns.count();
    
    for (let i = 0; i < columnCount; i++) {
      const column = columns.nth(i);
      await expect(column).toHaveAttribute('aria-label');
      await expect(column).toHaveAttribute('role', 'region');
    }
    
    // Check tasks have proper accessibility
    await page.locator('[data-testid="add-task-backlog"]').click();
    await page.locator('[data-testid="task-input"]').fill('ARIA test task');
    await page.locator('[data-testid="task-input"]').press('Enter');
    
    const task = page.locator('[data-testid="task-item"]').first();
    await expect(task).toHaveAttribute('role', 'button');
    await expect(task).toHaveAttribute('aria-label');
  });

  test('should support screen reader navigation patterns', async ({ page }) => {
    await page.goto('/list');
    
    // Create some tasks for testing
    const tasks = ['Task 1', 'Task 2', 'Task 3'];
    for (const task of tasks) {
      await page.locator('[data-testid="quick-add"]').fill(task);
      await page.locator('[data-testid="quick-add"]').press('Enter');
      await page.waitForTimeout(200);
    }
    
    // Test landmark navigation
    const main = page.locator('main');
    await expect(main).toHaveAttribute('role', 'main');
    
    // Test list structure
    const taskList = page.locator('[data-testid="task-list"]');
    await expect(taskList).toHaveAttribute('role', 'list');
    
    const taskItems = page.locator('[data-testid="task-item"]');
    const itemCount = await taskItems.count();
    
    for (let i = 0; i < itemCount; i++) {
      const item = taskItems.nth(i);
      await expect(item).toHaveAttribute('role', 'listitem');
    }
  });

  test('should handle high contrast mode', async ({ page }) => {
    // Simulate high contrast mode
    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
    
    await page.goto('/bubble');
    
    // Elements should remain visible and functional
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await expect(quickAdd).toBeVisible();
    
    // Test that interactive elements are distinguishable
    await quickAdd.fill('High contrast test');
    await quickAdd.press('Enter');
    
    await page.waitForTimeout(500);
    
    const bubble = page.locator('[data-testid="bubble-item"]');
    await expect(bubble).toBeVisible();
    
    // Check that focus indicators are visible
    await bubble.focus();
    const focusedBubble = page.locator('[data-testid="bubble-item"]:focus');
    await expect(focusedBubble).toBeVisible();
  });
});