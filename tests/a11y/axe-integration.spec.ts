/**
 * @file Axe-core Integration Tests
 * Comprehensive accessibility audits using axe-core
 */

import { test, expect } from '../fixtures/a11y-test-app';
import { expectNoA11yViolations, getA11yViolations } from '../utils/a11y-helpers';
import { COMMON_PREFERENCE_COMBINATIONS } from '../utils/mock-preferences';

test.describe('Comprehensive Accessibility Audit (Axe-core) @a11y', () => {
  test('Home page passes full accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    await expectNoA11yViolations(a11yPage);
  });

  test('Matrix view passes full accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/matrix');
    await expectNoA11yViolations(a11yPage);
  });

  test('Atomic view passes full accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/atomic');
    await expectNoA11yViolations(a11yPage);
  });

  test('List view passes full accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/list');
    await expectNoA11yViolations(a11yPage);
  });

  test('Kanban view passes full accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/kanban');
    await expectNoA11yViolations(a11yPage);
  });

  test('Dev routes pass accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    const devRoutes = [
      '/dev/mood',
      '/dev/voice', 
      '/dev/vision',
      '/dev/sync',
      '/dev/cbt',
      '/dev/health'
    ];
    
    for (const route of devRoutes) {
      await navigateToPage(route);
      
      // Allow for 404s on non-existent dev routes
      const title = await a11yPage.title();
      if (!title.includes('404') && !title.includes('Not Found')) {
        await expectNoA11yViolations(a11yPage);
      }
    }
  });

  test('Modal dialogs pass accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Look for buttons that open modals
    const modalTriggers = await a11yPage.locator(
      'button[aria-haspopup="dialog"], button[data-dialog-trigger]'
    ).all();
    
    for (const trigger of modalTriggers.slice(0, 3)) { // Test first 3 modals
      await trigger.click();
      
      // Wait for modal to appear
      await a11yPage.waitForSelector('[role="dialog"]', { timeout: 2000 }).catch(() => {
        // Modal might not appear, continue
      });
      
      const modal = a11yPage.locator('[role="dialog"]');
      if (await modal.count() > 0) {
        await expectNoA11yViolations(a11yPage, '[role="dialog"]');
        
        // Close modal
        await a11yPage.keyboard.press('Escape');
        await a11yPage.waitForTimeout(300);
      }
    }
  });

  test('Form elements pass accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Test forms on different pages
    const pagesWithForms = ['/', '/matrix'];
    
    for (const page of pagesWithForms) {
      await navigateToPage(page);
      
      const forms = await a11yPage.locator('form').all();
      
      for (const form of forms) {
        await expectNoA11yViolations(a11yPage, 'form');
      }
    }
  });

  test('Color contrast passes WCAG AA standards', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Specifically test color contrast
    await expectNoA11yViolations(a11yPage, undefined, {
      includeTags: ['wcag2aa'],
      excludeTags: ['experimental']
    });
  });

  test('Keyboard navigation passes accessibility audit', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Test keyboard navigation
    await a11yPage.keyboard.press('Tab');
    await a11yPage.keyboard.press('Tab');
    await a11yPage.keyboard.press('Tab');
    
    // Check accessibility after navigation
    await expectNoA11yViolations(a11yPage, undefined, {
      includeTags: ['wcag2a', 'wcag21a']
    });
  });

  test('Screen reader compatibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Test screen reader specific rules
    await expectNoA11yViolations(a11yPage, undefined, {
      includeTags: ['wcag2a', 'wcag2aa'],
    });
    
    // Check for proper ARIA usage
    const violations = await getA11yViolations(a11yPage);
    const ariaViolations = violations.filter(v => 
      v.id.includes('aria') || v.help.toLowerCase().includes('aria')
    );
    
    expect(ariaViolations.length, 'Should have no ARIA violations').toBe(0);
  });

  test('Accessibility across different user preferences', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    for (const combo of COMMON_PREFERENCE_COMBINATIONS) {
      await setupA11y(combo.preferences);
      await navigateToPage('/');
      
      // Should pass accessibility audit regardless of preferences
      await expectNoA11yViolations(a11yPage);
    }
  });

  test('Dynamic content accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Interact with dynamic content
    const buttons = await a11yPage.locator('button').all();
    
    if (buttons.length > 0) {
      // Click a button to trigger dynamic content
      await buttons[0].click();
      await a11yPage.waitForTimeout(500);
      
      // Re-run accessibility audit
      await expectNoA11yViolations(a11yPage);
    }
  });

  test('Focus management in single page application', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Navigate between routes
    const navLinks = await a11yPage.locator('nav a, [role="navigation"] a').all();
    
    for (const link of navLinks.slice(0, 3)) { // Test first 3 nav links
      await link.click();
      await a11yPage.waitForLoadState('networkidle');
      
      // Check accessibility after navigation
      await expectNoA11yViolations(a11yPage);
    }
  });

  test('Error states maintain accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Test accessibility during error states
    await navigateToPage('/nonexistent-route');
    
    // Should still be accessible even on error pages
    const isErrorPage = await a11yPage.locator('h1, h2').textContent();
    if (isErrorPage && (isErrorPage.includes('404') || isErrorPage.includes('Error'))) {
      await expectNoA11yViolations(a11yPage);
    }
  });

  test('Loading states maintain accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Navigate to a page that might have loading states
    await navigateToPage('/');
    
    // Look for loading indicators
    const loadingIndicators = await a11yPage.locator(
      '[aria-live], [role="status"], [aria-label*="loading"]'
    ).all();
    
    // Loading states should be accessible
    if (loadingIndicators.length > 0) {
      await expectNoA11yViolations(a11yPage);
    }
  });
});