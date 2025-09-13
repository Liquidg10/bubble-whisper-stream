/**
 * P20 Gate 5: CRDT Conflict Resolution
 * Verifies multi-device sync, conflict resolution, and data consistency
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 5: CRDT Conflict Resolution @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flags.crdtSync', 'true');
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should handle concurrent task edits', async ({ page }) => {
    await page.goto('/dev/crdt-conflicts');
    
    // Simulate concurrent edits
    await page.locator('[data-testid="simulate-concurrent-edits"]').click();
    
    const conflictResults = page.locator('[data-testid="conflict-results"]');
    await expect(conflictResults).toContainText('Concurrent edits merged: ✅');
    await expect(conflictResults).toContainText('No data loss: ✅');
  });

  test('should preserve task data during conflicts', async ({ page }) => {
    await page.goto('/dev/crdt-conflicts');
    
    // Test data preservation
    await page.locator('[data-testid="test-data-preservation"]').click();
    
    const preservationResults = page.locator('[data-testid="preservation-results"]');
    await expect(preservationResults).toContainText('Task content preserved: ✅');
    await expect(preservationResults).toContainText('Timestamps preserved: ✅');
    await expect(preservationResults).toContainText('Metadata preserved: ✅');
  });

  test('should handle offline/online sync', async ({ page }) => {
    await page.goto('/dev/crdt-conflicts');
    
    // Test offline sync
    await page.locator('[data-testid="test-offline-sync"]').click();
    
    const offlineResults = page.locator('[data-testid="offline-results"]');
    await expect(offlineResults).toContainText('Offline changes queued: ✅');
    await expect(offlineResults).toContainText('Online sync successful: ✅');
  });

  test('should resolve priority conflicts correctly', async ({ page }) => {
    await page.goto('/dev/crdt-conflicts');
    
    // Test priority conflict resolution
    await page.locator('[data-testid="test-priority-conflicts"]').click();
    
    const priorityResults = page.locator('[data-testid="priority-results"]');
    await expect(priorityResults).toContainText('Priority conflicts resolved: ✅');
    await expect(priorityResults).toContainText('Last-write-wins applied: ✅');
  });

  test('should maintain view consistency across devices', async ({ page }) => {
    await page.goto('/dev/crdt-conflicts');
    
    // Test view consistency
    await page.locator('[data-testid="test-view-consistency"]').click();
    
    const viewResults = page.locator('[data-testid="view-results"]');
    await expect(viewResults).toContainText('View state synced: ✅');
    await expect(viewResults).toContainText('Position data consistent: ✅');
  });

  test('should handle merge conflicts in outliner data', async ({ page }) => {
    await page.goto('/dev/crdt-conflicts');
    
    // Test outliner merge conflicts
    await page.locator('[data-testid="test-outliner-conflicts"]').click();
    
    const outlinerResults = page.locator('[data-testid="outliner-results"]');
    await expect(outlinerResults).toContainText('Outliner structure preserved: ✅');
    await expect(outlinerResults).toContainText('Hierarchical data intact: ✅');
  });
});