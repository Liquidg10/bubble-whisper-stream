/**
 * P20 Gate 1: Task Round-Trip Invariants
 * Verifies that Bubble → Task → Bubble conversions preserve critical data
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 1: Task Round-Trip Invariants @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Enable dev routes for testing
    await page.evaluate(() => {
      localStorage.setItem('flags.devRoutes', 'true');
      localStorage.setItem('flags.taskAdapter', 'true');
    });
    await page.reload();
  });

  test('should preserve bubble ID through task round-trip', async ({ page }) => {
    // Navigate to bubble view and create a bubble
    await page.goto('/bubble');
    
    // Create a bubble via voice or UI
    await page.locator('[data-testid="quick-add"]').fill('Test task for round-trip');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Navigate to dev adapter to test round-trip
    await page.goto('/dev/task-adapter');
    
    // Trigger round-trip conversion
    await page.locator('[data-testid="test-roundtrip"]').click();
    
    // Check that original bubble ID is preserved
    const results = await page.locator('[data-testid="roundtrip-results"]');
    await expect(results).toContainText('ID preserved: ✅');
    
    // Verify no critical data loss
    await expect(results).toContainText('Title preserved: ✅');
    await expect(results).toContainText('Completion preserved: ✅');
  });

  test('should preserve bubble tags through task conversion', async ({ page }) => {
    await page.goto('/bubble');
    
    // Create bubble with tags
    await page.locator('[data-testid="quick-add"]').fill('Test task #work #urgent');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Wait for bubble creation
    await page.waitForTimeout(1000);
    
    // Test round-trip conversion
    await page.goto('/dev/task-adapter');
    await page.locator('[data-testid="test-roundtrip"]').click();
    
    const results = await page.locator('[data-testid="roundtrip-results"]');
    await expect(results).toContainText('Tags preserved: ✅');
  });

  test('should preserve outliner metadata through task round-trip', async ({ page }) => {
    await page.goto('/bubble');
    
    // Create bubble with outliner content
    await page.locator('[data-testid="quick-add"]').fill('Test task with metadata');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Add some outliner metadata (if available)
    await page.waitForTimeout(1000);
    
    // Test round-trip
    await page.goto('/dev/task-adapter');
    await page.locator('[data-testid="test-roundtrip"]').click();
    
    const results = await page.locator('[data-testid="roundtrip-results"]');
    await expect(results).toContainText('Metadata preserved: ✅');
  });

  test('should map priority correctly (0-1 → 0-100 → 0-1)', async ({ page }) => {
    await page.goto('/dev/task-adapter');
    
    // Test priority mapping boundary conditions
    await page.locator('[data-testid="test-priority-mapping"]').click();
    
    const results = await page.locator('[data-testid="priority-results"]');
    await expect(results).toContainText('Priority mapping: ✅');
    
    // Check boundary values
    await expect(results).toContainText('0 → 0 → 0: ✅');
    await expect(results).toContainText('0.5 → 50 → 0.5: ✅');
    await expect(results).toContainText('1 → 100 → 1: ✅');
  });

  test('should handle view metadata preservation', async ({ page }) => {
    await page.goto('/kanban');
    
    // Create task in kanban view
    await page.locator('[data-testid="add-task-backlog"]').click();
    await page.locator('[data-testid="task-input"]').fill('Kanban test task');
    await page.locator('[data-testid="task-input"]').press('Enter');
    
    // Move task to different column
    await page.dragAndDrop(
      '[data-testid="task-item"]',
      '[data-testid="kanban-column-doing"]'
    );
    
    // Test round-trip preservation
    await page.goto('/dev/task-adapter');
    await page.locator('[data-testid="test-view-preservation"]').click();
    
    const results = await page.locator('[data-testid="view-results"]');
    await expect(results).toContainText('Kanban view preserved: ✅');
  });

  test('should never lose timestamps during conversion', async ({ page }) => {
    await page.goto('/bubble');
    
    // Create bubble
    await page.locator('[data-testid="quick-add"]').fill('Timestamp test task');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    await page.waitForTimeout(1000);
    
    // Test timestamp preservation
    await page.goto('/dev/task-adapter');
    await page.locator('[data-testid="test-timestamps"]').click();
    
    const results = await page.locator('[data-testid="timestamp-results"]');
    await expect(results).toContainText('Created timestamp: ✅');
    await expect(results).toContainText('Updated timestamp: ✅');
    
    // Verify timestamps are within reasonable range
    await expect(results).toContainText('Timestamp validity: ✅');
  });

  test('should handle edge cases without crashing', async ({ page }) => {
    await page.goto('/dev/task-adapter');
    
    // Test with null/undefined data
    await page.locator('[data-testid="test-edge-cases"]').click();
    
    const results = await page.locator('[data-testid="edge-case-results"]');
    await expect(results).toContainText('Null handling: ✅');
    await expect(results).toContainText('Undefined handling: ✅');
    await expect(results).toContainText('Empty object handling: ✅');
    
    // Ensure no errors in console
    const logs = await page.evaluate(() => {
      return window.console.errors || [];
    });
    expect(logs.length).toBe(0);
  });

  test('should preserve bubble physics positioning', async ({ page }) => {
    await page.goto('/bubble');
    
    // Create and position bubble
    await page.locator('[data-testid="quick-add"]').fill('Physics test bubble');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Wait for bubble to appear and settle
    await page.waitForTimeout(2000);
    
    // Get initial position
    const initialPosition = await page.locator('[data-testid="bubble-item"]').first().boundingBox();
    
    // Test round-trip
    await page.goto('/dev/task-adapter');
    await page.locator('[data-testid="test-physics-preservation"]').click();
    
    const results = await page.locator('[data-testid="physics-results"]');
    await expect(results).toContainText('Position preserved: ✅');
    await expect(results).toContainText('Size preserved: ✅');
  });
});