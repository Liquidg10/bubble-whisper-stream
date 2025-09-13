/**
 * P10 - OAuth Incremental Auth Verification Tests
 * Verifies incremental authorization follows least-privilege principle
 */

import { test, expect } from '@playwright/test';

test.describe('OAuth Incremental Authorization @oauth', () => {
  test('starts with minimal permissions by default', async ({ page }) => {
    await page.goto('/settings');
    
    // Wait for settings page to load
    await page.waitForSelector('[data-testid="settings-page"]');
    
    // Navigate to integrations tab
    await page.click('[data-testid="integrations-tab"]');
    
    // Verify OAuth service starts with minimal scopes
    const oauthDefaults = await page.evaluate(() => {
      // Access the OAuth service configuration
      return window.oauthService?.DEFAULT_SCOPES || {};
    });
    
    // Verify minimal scope defaults
    expect(oauthDefaults['google-calendar']).toContain('calendar.readonly');
    expect(oauthDefaults['gmail']).toContain('gmail.metadata');
    expect(oauthDefaults['google']).toBe('openid email profile');
  });
  
  test('scope consent modal shows before/after comparison', async ({ page }) => {
    await page.goto('/dev/oauth-test');
    
    // Mock a scope escalation request
    await page.evaluate(() => {
      window.testScopeEscalation = {
        service: 'calendar',
        requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
        reason: 'create calendar events from your tasks',
        currentScopes: ['https://www.googleapis.com/auth/calendar.readonly']
      };
    });
    
    // Trigger scope consent modal
    await page.click('[data-testid="trigger-scope-escalation"]');
    
    // Verify modal appears with comparison view
    await expect(page.locator('[data-testid="scope-consent-modal"]')).toBeVisible();
    await expect(page.locator('[role="tab"][value="comparison"]')).toBeVisible();
    
    // Click on comparison tab
    await page.click('[role="tab"][value="comparison"]');
    
    // Verify before/after scope comparison is shown
    await expect(page.locator('[data-testid="current-scopes"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-scopes"]')).toBeVisible();
    
    // Verify security notice is present
    await expect(page.locator('text=Your privacy matters')).toBeVisible();
  });
  
  test('scope progression indicator shows permission levels', async ({ page }) => {
    await page.goto('/dev/oauth-test');
    
    // Trigger scope consent with progression view
    await page.evaluate(() => {
      window.testScopeProgression = {
        service: 'gmail',
        currentScopes: ['https://www.googleapis.com/auth/gmail.metadata'],
        targetScopes: ['https://www.googleapis.com/auth/gmail.readonly']
      };
    });
    
    await page.click('[data-testid="trigger-scope-progression"]');
    
    // Switch to progression tab
    await page.click('[role="tab"][value="progression"]');
    
    // Verify progression levels are shown
    await expect(page.locator('[data-testid="scope-level-minimal"]')).toBeVisible();
    await expect(page.locator('[data-testid="scope-level-read"]')).toBeVisible();
    
    // Verify current and target levels are highlighted
    await expect(page.locator('[data-testid="current-level"]')).toHaveClass(/current/);
    await expect(page.locator('[data-testid="target-level"]')).toHaveClass(/target/);
  });
  
  test('handles scope denial gracefully', async ({ page }) => {
    await page.goto('/dev/oauth-test');
    
    // Mock scope escalation request
    await page.evaluate(() => {
      window.testScopeRequest = {
        service: 'calendar',
        requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
        reason: 'create calendar events'
      };
    });
    
    await page.click('[data-testid="trigger-scope-request"]');
    
    // Deny the scope request
    await page.click('button:has-text("Keep Current Level")');
    
    // Verify graceful fallback behavior
    await expect(page.locator('[data-testid="fallback-message"]')).toBeVisible();
    await expect(page.locator('text=continue using')).toBeVisible();
  });
  
  test('enforces 30-day scope decay', async ({ page }) => {
    await page.goto('/dev/oauth-test');
    
    // Mock old token data (30+ days old)
    await page.evaluate(() => {
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      localStorage.setItem('test-oauth-account', JSON.stringify({
        id: 'test-account',
        provider: 'google',
        scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.send'],
        last_used_at: new Date(thirtyOneDaysAgo).toISOString()
      }));
    });
    
    // Trigger scope decay check
    await page.click('[data-testid="check-scope-decay"]');
    
    // Verify scopes were reduced to minimal
    const scopesAfterDecay = await page.evaluate(() => {
      const account = JSON.parse(localStorage.getItem('test-oauth-account') || '{}');
      return account.scopes;
    });
    
    expect(scopesAfterDecay).toEqual([
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.metadata'
    ]);
  });
  
  test('validates incremental auth UX flow', async ({ page }) => {
    await page.goto('/settings');
    
    // Navigate to integrations
    await page.click('[data-testid="integrations-tab"]');
    
    // Connect Google Calendar with minimal permissions first
    await page.click('[data-testid="connect-google-calendar"]');
    
    // Verify initial connection uses minimal scope
    await expect(page.locator('[data-testid="calendar-permission-level"]')).toHaveText('Read-only');
    
    // Try to create a calendar event (should trigger escalation)
    await page.click('[data-testid="create-calendar-event"]');
    
    // Verify escalation modal appears
    await expect(page.locator('[data-testid="scope-consent-modal"]')).toBeVisible();
    await expect(page.locator('text=Permission Upgrade')).toBeVisible();
    
    // Approve the escalation
    await page.click('button:has-text("Upgrade Access")');
    
    // Verify permission level updated
    await expect(page.locator('[data-testid="calendar-permission-level"]')).toHaveText('Read & Write');
  });
});