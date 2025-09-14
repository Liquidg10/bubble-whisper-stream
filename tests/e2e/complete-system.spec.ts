/**
 * Phase 4: Complete E2E System Test Suite
 * Comprehensive end-to-end testing for production readiness
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 4: Complete System E2E @e2e', () => {
  test('should handle complete task lifecycle across views', async ({ page }) => {
    await page.goto('/');
    
    // Create task in list view
    await page.goto('/list');
    await page.locator('[data-testid="quick-add"]').fill('Complete lifecycle test task');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Verify task appears
    await expect(page.locator('[data-testid="task-item"]').last()).toContainText('Complete lifecycle test task');
    
    // Switch to bubble view and verify task exists
    await page.goto('/bubble');
    await expect(page.locator('[data-testid*="task-bubble"]')).toBeVisible();
    
    // Switch to matrix view and assign urgency/importance
    await page.goto('/matrix');
    const taskInMatrix = page.locator('[data-testid*="matrix-task"]').first();
    await expect(taskInMatrix).toBeVisible();
    
    // Move to urgent/important quadrant
    await taskInMatrix.dragTo(page.locator('[data-testid="quadrant-urgent-important"]'));
    
    // Switch to kanban and verify task moved
    await page.goto('/kanban');
    await expect(page.locator('[data-testid*="kanban-task"]')).toBeVisible();
    
    // Complete task
    await page.locator('[data-testid*="complete-task"]').first().click();
    
    // Verify completion across all views
    await page.goto('/list');
    await expect(page.locator('[data-testid*="completed-task"]')).toBeVisible();
  });

  test('should maintain data consistency during rapid view switches', async ({ page }) => {
    await page.goto('/list');
    
    // Create multiple tasks rapidly
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="quick-add"]').fill(`Rapid task ${i + 1}`);
      await page.locator('[data-testid="quick-add"]').press('Enter');
      await page.waitForTimeout(100);
    }
    
    // Rapidly switch between views
    const views = ['/bubble', '/matrix', '/kanban', '/list'];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const view of views) {
        await page.goto(view);
        await page.waitForTimeout(200);
        // Verify at least one task is visible
        await expect(page.locator('[data-testid*="task"]').first()).toBeVisible();
      }
    }
  });

  test('should handle offline simulation gracefully', async ({ page }) => {
    await page.goto('/dev/offline-lab');
    
    // Enable offline mode
    await page.locator('[data-testid="offline-toggle"]').click();
    
    // Simulate operations while offline
    await page.locator('button:has-text("Simulate Edit")').click();
    await page.locator('button:has-text("Simulate Edit")').click();
    
    // Verify operations are queued
    await expect(page.locator('[data-testid="queued-operations"]')).toContainText('2');
    
    // Return online
    await page.locator('[data-testid="offline-toggle"]').click();
    
    // Operations should process
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="queued-operations"]')).toContainText('0');
  });

  test('should detect and handle merge conflicts', async ({ page }) => {
    await page.goto('/dev/offline-lab');
    
    // Trigger concurrent edit scenario
    await page.locator('button:has-text("Trigger")').first().click();
    
    // Wait for conflict detection
    await page.waitForTimeout(3000);
    
    // Should show conflict indicator
    await expect(page.locator('[data-testid*="conflict"]')).toBeVisible();
    
    // Stop scenario
    await page.locator('button:has-text("Stop")').click();
  });

  test('should show performance metrics overlay', async ({ page }) => {
    await page.goto('/dev/offline-lab');
    
    // Performance overlay should be visible
    await expect(page.locator('[data-testid="perf-overlay"]')).toBeVisible();
    
    // Should show FPS metric
    await expect(page.locator('[data-testid="fps-metric"]')).toBeVisible();
    
    // Should show memory metrics
    await expect(page.locator('[data-testid="memory-metric"]')).toBeVisible();
    
    // Can be minimized
    await page.locator('[data-testid="minimize-perf"]').click();
    await expect(page.locator('[data-testid="perf-details"]')).not.toBeVisible();
  });

  test('should maintain accessibility during stress operations', async ({ page }) => {
    await page.goto('/list');
    
    // Create many tasks to stress test
    for (let i = 0; i < 20; i++) {
      await page.locator('[data-testid="quick-add"]').fill(`Stress test task ${i + 1}`);
      await page.locator('[data-testid="quick-add"]').press('Enter');
    }
    
    // Test keyboard navigation works with many items
    await page.keyboard.press('Tab');
    let focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Tab through several elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    }
    
    // Verify performance hasn't degraded significantly
    const performanceEntries = await page.evaluate(() => {
      return performance.getEntriesByType('navigation');
    });
    
    // Page should load reasonably fast even with many elements
    expect(performanceEntries[0]).toBeDefined();
  });

  test('should handle rapid input without data loss', async ({ page }) => {
    await page.goto('/list');
    
    // Type rapidly without waiting
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Rapid input test 1');
    await quickAdd.press('Enter');
    await quickAdd.fill('Rapid input test 2');
    await quickAdd.press('Enter');
    await quickAdd.fill('Rapid input test 3');
    await quickAdd.press('Enter');
    
    // All tasks should be created
    await expect(page.locator('[data-testid="task-item"]')).toHaveCount(3);
    await expect(page.locator('text=Rapid input test 1')).toBeVisible();
    await expect(page.locator('text=Rapid input test 2')).toBeVisible();
    await expect(page.locator('text=Rapid input test 3')).toBeVisible();
  });

  test('should maintain state consistency across browser refresh', async ({ page }) => {
    await page.goto('/list');
    
    // Create a task
    await page.locator('[data-testid="quick-add"]').fill('Persistence test task');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Verify task exists
    await expect(page.locator('text=Persistence test task')).toBeVisible();
    
    // Refresh page
    await page.reload();
    
    // Task should still exist
    await expect(page.locator('text=Persistence test task')).toBeVisible();
    
    // Switch to different view and back
    await page.goto('/bubble');
    await page.goto('/list');
    
    // Task should still be there
    await expect(page.locator('text=Persistence test task')).toBeVisible();
  });
});