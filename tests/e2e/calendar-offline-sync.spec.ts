/**
 * E2E P6: Calendar Offline Sync & Conflict Resolution
 * Tests offline task queue and multi-device synchronization
 */

import { test, expect } from '@playwright/test';

test.describe('Calendar Offline Sync & Conflict Resolution @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('should queue events when offline', async ({ page }) => {
    // Simulate offline mode
    await page.setOffline(true);
    
    // Create event while offline
    await page.locator('[data-testid="quick-add-event"]').fill('Offline Event');
    await page.locator('[data-testid="add-event-button"]').click();
    
    // Should show offline indicator
    const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
    await expect(offlineIndicator).toBeVisible();
    
    // Should show queued item count
    const queueCount = page.locator('[data-testid="sync-queue-count"]');
    await expect(queueCount).toContainText('1');
    
    // Event should appear locally but marked as unsynced
    const unsyncedEvent = page.locator('[data-testid="event-item"][data-sync-status="pending"]');
    await expect(unsyncedEvent).toBeVisible();
  });

  test('should sync queued events when back online', async ({ page }) => {
    // Create offline event first
    await page.setOffline(true);
    await page.locator('[data-testid="quick-add-event"]').fill('Sync Test Event');
    await page.locator('[data-testid="add-event-button"]').click();
    
    // Go back online
    await page.setOffline(false);
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should trigger sync process
    const syncIndicator = page.locator('[data-testid="sync-in-progress"]');
    await expect(syncIndicator).toBeVisible();
    
    // Wait for sync to complete
    await page.waitForSelector('[data-testid="sync-complete"]', { timeout: 10000 });
    
    // Event should now be synced
    const syncedEvent = page.locator('[data-testid="event-item"][data-sync-status="synced"]');
    await expect(syncedEvent).toBeVisible();
  });

  test('should handle conflict resolution for duplicate events', async ({ page }) => {
    // Simulate conflict scenario
    await page.evaluate(() => {
      // Mock a conflict in local storage
      localStorage.setItem('sync-conflicts', JSON.stringify([
        {
          id: 'conflict-1',
          local: { title: 'Local Version', time: '10:00' },
          remote: { title: 'Remote Version', time: '10:30' },
          type: 'event-conflict'
        }
      ]));
    });
    
    await page.reload();
    
    // Should show conflict resolution dialog
    const conflictDialog = page.locator('[data-testid="conflict-resolution-dialog"]');
    await expect(conflictDialog).toBeVisible();
    
    // Should offer merge options
    const mergeOptions = page.locator('[data-testid="merge-option"]');
    await expect(mergeOptions).toHaveCount(3); // Keep local, keep remote, merge both
    
    // Choose to keep both versions
    await page.locator('[data-testid="keep-both-versions"]').click();
    await page.locator('[data-testid="resolve-conflict"]').click();
    
    // Should see both events in calendar
    const events = page.locator('[data-testid="event-item"]');
    await expect(events).toHaveCount(2);
  });

  test('should maintain data integrity during sync failures', async ({ page }) => {
    // Simulate sync failure
    await page.route('**/api/calendar/sync', route => {
      route.abort('failed');
    });
    
    // Create event
    await page.locator('[data-testid="quick-add-event"]').fill('Failure Test Event');
    await page.locator('[data-testid="add-event-button"]').click();
    
    // Should show sync error
    const syncError = page.locator('[data-testid="sync-error"]');
    await expect(syncError).toBeVisible();
    
    // Should offer retry option
    const retryButton = page.locator('[data-testid="retry-sync"]');
    await expect(retryButton).toBeVisible();
    
    // Event should remain in local queue
    const queuedEvent = page.locator('[data-testid="event-item"][data-sync-status="pending"]');
    await expect(queuedEvent).toBeVisible();
    
    // Data should not be lost
    await page.reload();
    await expect(queuedEvent).toBeVisible();
  });
});
