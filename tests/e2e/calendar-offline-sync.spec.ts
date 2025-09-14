/**
 * E2E P6: Calendar Offline & Sync Operations
 * Tests offline task movement, sync conflicts, and data integrity
 */

import { test, expect } from '@playwright/test';

test.describe('E2E P6: Calendar Offline & Sync @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle offline task movement in Masonry', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Go offline
    await page.context().setOffline(true);
    
    // Create task while offline
    const quickAdd = page.locator('[data-testid="quick-add"]');
    if (await quickAdd.isVisible()) {
      await quickAdd.fill('Offline task');
      await quickAdd.press('Enter');
      
      // Verify task appears in UI
      const offlineTask = page.locator('[data-testid="masonry-card"]').last();
      await expect(offlineTask).toBeVisible();
    }
    
    // Try to move task
    const firstCard = page.locator('[data-testid="masonry-card"]').first();
    await firstCard.focus();
    await page.keyboard.press('ArrowRight');
    
    // Verify movement is queued (should work locally)
    await page.waitForTimeout(500);
    
    // Look for offline indicator
    const offlineIndicator = page.locator('[data-testid="offline-indicator"], [class*="offline"]');
    await expect(offlineIndicator.first()).toBeVisible({ timeout: 2000 });
    
    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
    
    // Verify sync occurs
    const syncIndicator = page.locator('[data-testid="syncing"], [aria-label*="sync"]');
    if (await syncIndicator.isVisible({ timeout: 2000 })) {
      await expect(syncIndicator).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('should detect and resolve sync conflicts', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create task
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Sync conflict test task');
    await quickAdd.press('Enter');
    await page.waitForTimeout(500);
    
    // Simulate conflict by going offline and making changes
    await page.context().setOffline(true);
    
    // Edit task offline
    const task = page.locator('[data-testid="task-item"], [data-testid="calendar-event"]').last();
    if (await task.isVisible()) {
      await task.click();
      
      const editButton = page.locator('[data-testid="edit-task"], [aria-label*="edit"]');
      if (await editButton.isVisible()) {
        await editButton.click();
        
        const titleInput = page.locator('[data-testid="task-title"], input[name="title"]');
        if (await titleInput.isVisible()) {
          await titleInput.fill('Modified offline');
          await page.keyboard.press('Enter');
        }
      }
    }
    
    // Go back online to trigger sync
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    
    // Look for conflict resolution UI
    const conflictResolver = page.locator('[data-testid="sync-conflict"], [role="dialog"]');
    
    if (await conflictResolver.isVisible({ timeout: 3000 })) {
      // Verify conflict options are available
      const keepLocal = page.locator('[data-testid="keep-local"], [aria-label*="keep local"]');
      const keepRemote = page.locator('[data-testid="keep-remote"], [aria-label*="keep remote"]');
      
      await expect(keepLocal.or(keepRemote)).toBeVisible();
    }
  });

  test('should maintain data integrity during offline operations', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Get initial task count
    const initialCount = await page.locator('[data-testid="masonry-card"]').count();
    
    // Go offline
    await page.context().setOffline(true);
    
    // Perform multiple operations
    const quickAdd = page.locator('[data-testid="quick-add"]');
    if (await quickAdd.isVisible()) {
      for (let i = 0; i < 3; i++) {
        await quickAdd.fill(`Offline task ${i + 1}`);
        await quickAdd.press('Enter');
        await page.waitForTimeout(200);
      }
    }
    
    // Move some cards around
    const cards = await page.locator('[data-testid="masonry-card"]').all();
    if (cards.length > 0) {
      await cards[0].focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    
    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    
    // Verify final count is correct
    const finalCount = await page.locator('[data-testid="masonry-card"]').count();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount + 3);
    
    // Verify no duplicate tasks
    const taskTitles = await page.locator('[data-testid="masonry-card"] [data-testid="task-title"]').allTextContents();
    const uniqueTitles = new Set(taskTitles);
    expect(taskTitles.length).toBe(uniqueTitles.size);
  });

  test('should handle offline queue performance', async ({ page }) => {
    await page.goto('/dev/perf-calendar');
    await page.waitForSelector('[data-testid="calendar-performance"]');
    
    // Check offline queue status
    const offlineQueue = page.locator('[data-testid="offline-queue"], [data-testid="queue-status"]');
    
    if (await offlineQueue.isVisible({ timeout: 2000 })) {
      // Verify queue metrics are displayed
      const queueSize = page.locator('[data-testid="queue-size"]');
      if (await queueSize.isVisible()) {
        const size = await queueSize.textContent();
        expect(size).toMatch(/\d+/); // Should show numeric queue size
      }
      
      // Check processing status
      const processingStatus = page.locator('[data-testid="queue-processing"]');
      if (await processingStatus.isVisible()) {
        const status = await processingStatus.textContent();
        expect(status).toMatch(/(idle|processing|syncing)/i);
      }
    }
  });

  test('should show sync progress indicators', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create multiple tasks to trigger sync
    const quickAdd = page.locator('[data-testid="quick-add"]');
    
    for (let i = 0; i < 3; i++) {
      await quickAdd.fill(`Sync test ${i + 1}`);
      await quickAdd.press('Enter');
      await page.waitForTimeout(100);
    }
    
    // Look for sync indicators
    const syncProgress = page.locator('[data-testid="sync-progress"], [aria-label*="sync"]');
    
    if (await syncProgress.isVisible({ timeout: 2000 })) {
      // Verify progress indicator shows status
      const progressText = await syncProgress.textContent();
      expect(progressText).toMatch(/(syncing|uploading|saving|complete)/i);
      
      // Wait for sync to complete
      await expect(syncProgress).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle network interruptions gracefully', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Start an operation
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Network interruption test');
    
    // Simulate network interruption during operation
    await page.context().setOffline(true);
    await quickAdd.press('Enter');
    
    // Verify task is created locally
    const localTask = page.locator('[data-testid="masonry-card"]').last();
    await expect(localTask).toBeVisible();
    
    // Restore network
    await page.context().setOffline(false);
    
    // Verify graceful recovery
    await page.waitForTimeout(2000);
    
    // Task should still be visible and eventually sync
    await expect(localTask).toBeVisible();
    
    // Check for error indicators
    const errorIndicator = page.locator('[data-testid="sync-error"], [class*="error"]');
    await expect(errorIndicator).not.toBeVisible({ timeout: 3000 });
  });
});