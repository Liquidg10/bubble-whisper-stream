/**
 * P20 Gate 4: Auto-Write Safety Ladder
 * Verifies confidence thresholds, consent gates, and undo functionality
 */

import { test, expect } from '@playwright/test';

test.describe('P20 Gate 4: Auto-Write Safety Ladder @e2e @gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flags.autoWriteCalendar', 'true');
      localStorage.setItem('flags.autoWriteEmail', 'false'); // Email never auto-sends
      localStorage.setItem('flags.devRoutes', 'true');
    });
    await page.reload();
  });

  test('should enforce confidence thresholds correctly', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test confidence threshold validation
    await page.locator('[data-testid="confidence-test"]').click();
    
    const results = page.locator('[data-testid="confidence-results"]');
    await expect(results).toContainText('Suggest threshold (<60%): ✅');
    await expect(results).toContainText('Draft threshold (60-85%): ✅');
    await expect(results).toContainText('Auto-write threshold (>85%): ✅');
  });

  test('should never auto-send emails', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test email safety
    await page.locator('[data-testid="test-email-safety"]').click();
    
    const emailResults = page.locator('[data-testid="email-safety-results"]');
    await expect(emailResults).toContainText('Email auto-send disabled: ✅');
    await expect(emailResults).toContainText('Draft-only mode: ✅');
  });

  test('should provide working undo for all auto-writes', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test undo functionality
    await page.locator('[data-testid="test-undo-stack"]').click();
    
    const undoResults = page.locator('[data-testid="undo-results"]');
    await expect(undoResults).toContainText('Undo stack operational: ✅');
    await expect(undoResults).toContainText('Reversible actions: ✅');
  });

  test('should enforce calendar auto-write conditions', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test calendar conditions
    await page.locator('[data-testid="test-calendar-conditions"]').click();
    
    const calendarResults = page.locator('[data-testid="calendar-results"]');
    await expect(calendarResults).toContainText('Self-owned calendar check: ✅');
    await expect(calendarResults).toContainText('14-day limit check: ✅');
    await expect(calendarResults).toContainText('No external attendees: ✅');
  });

  test('should generate decision traces for audit', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test decision tracing
    await page.locator('[data-testid="test-decision-traces"]').click();
    
    const traceResults = page.locator('[data-testid="trace-results"]');
    await expect(traceResults).toContainText('Decision traces logged: ✅');
    await expect(traceResults).toContainText('Audit trail complete: ✅');
  });

  test('should respect user consent preferences', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test consent gates
    await page.locator('[data-testid="test-consent-gates"]').click();
    
    const consentResults = page.locator('[data-testid="consent-results"]');
    await expect(consentResults).toContainText('Consent preferences honored: ✅');
    await expect(consentResults).toContainText('Opt-out respected: ✅');
  });

  test('should handle edge cases gracefully', async ({ page }) => {
    await page.goto('/dev/auto-write');
    
    // Test edge case handling
    await page.locator('[data-testid="test-edge-cases"]').click();
    
    const edgeResults = page.locator('[data-testid="edge-case-results"]');
    await expect(edgeResults).toContainText('Malformed input handled: ✅');
    await expect(edgeResults).toContainText('Network failures handled: ✅');
    await expect(edgeResults).toContainText('Token expiry handled: ✅');
  });
});