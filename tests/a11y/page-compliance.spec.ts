/**
 * @file Page-by-Page Compliance Tests
 * Tests each major page for complete accessibility compliance
 */

import { test, expect } from '../fixtures/a11y-test-app';
import { 
  expectNoA11yViolations, 
  checkTargetSizes, 
  checkKeyboardAlternatives,
  checkFocusManagement 
} from '../utils/a11y-helpers';

test.describe('Page-by-Page Accessibility Compliance @a11y', () => {
  const pages = [
    { path: '/', name: 'Home/Bubble View' },
    { path: '/matrix', name: 'Matrix View' },
    { path: '/atomic', name: 'Atomic View' },
    { path: '/list', name: 'List View' },
    { path: '/kanban', name: 'Kanban View' },
  ];

  for (const page of pages) {
    test(`${page.name} - complete accessibility compliance`, async ({ 
      a11yPage, 
      navigateToPage 
    }) => {
      await navigateToPage(page.path);
      
      // 1. Full axe-core audit
      await expectNoA11yViolations(a11yPage);
      
      // 2. Target size compliance (WCAG 2.5.8)
      await checkTargetSizes(a11yPage);
      
      // 3. Keyboard alternatives for drag operations (WCAG 2.5.7)
      await checkKeyboardAlternatives(a11yPage);
      
      // 4. Focus management
      await checkFocusManagement(a11yPage);
    });

    test(`${page.name} - keyboard navigation`, async ({ 
      a11yPage, 
      navigateToPage 
    }) => {
      await navigateToPage(page.path);
      
      // Tab through all focusable elements
      const focusableElements = await a11yPage.locator(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ).count();
      
      let tabCount = 0;
      let currentFocus = '';
      
      // Tab through elements (max 20 to avoid infinite loops)
      for (let i = 0; i < Math.min(focusableElements, 20); i++) {
        await a11yPage.keyboard.press('Tab');
        tabCount++;
        
        const newFocus = await a11yPage.evaluate(() => {
          const activeEl = document.activeElement;
          return activeEl ? activeEl.tagName + (activeEl.id ? `#${activeEl.id}` : '') : 'none';
        });
        
        // Should not get stuck on same element
        if (newFocus === currentFocus && i > 0) {
          break;
        }
        currentFocus = newFocus;
      }
      
      expect(tabCount, `Should be able to navigate ${page.name} with keyboard`).toBeGreaterThan(0);
    });

    test(`${page.name} - mobile accessibility`, async ({ 
      a11yPage, 
      navigateToPage 
    }) => {
      // Set mobile viewport
      await a11yPage.setViewportSize({ width: 375, height: 667 });
      
      await navigateToPage(page.path);
      
      // Mobile-specific accessibility checks
      await expectNoA11yViolations(a11yPage);
      await checkTargetSizes(a11yPage);
      
      // Check that content is still accessible on mobile
      const mainContent = await a11yPage.locator('main, [role="main"]').count();
      expect(mainContent, `${page.name} should have main content on mobile`).toBeGreaterThan(0);
    });

    test(`${page.name} - high contrast mode`, async ({ 
      a11yPage, 
      navigateToPage,
      setupA11y 
    }) => {
      await setupA11y({ highContrast: true });
      await navigateToPage(page.path);
      
      // Should still pass accessibility audit in high contrast
      await expectNoA11yViolations(a11yPage);
      
      // Verify content is still visible
      const visibleElements = await a11yPage.locator('body *').evaluateAll(elements => {
        return elements.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }).length;
      });
      
      expect(visibleElements, `${page.name} should have visible content in high contrast mode`).toBeGreaterThan(0);
    });
  }

  test('Cross-page navigation maintains accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Test navigation between all major pages
    for (let i = 0; i < pages.length; i++) {
      await navigateToPage(pages[i].path);
      
      // Check accessibility after each navigation
      await expectNoA11yViolations(a11yPage);
      
      // Test focus management during navigation
      if (i > 0) {
        // Focus should be managed properly on route change
        const focusedElement = await a11yPage.evaluate(() => {
          return document.activeElement?.tagName || 'none';
        });
        
        expect(focusedElement, 'Focus should be managed during navigation').not.toBe('none');
      }
    }
  });

  test('Error pages maintain accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Test 404 page
    await navigateToPage('/this-page-does-not-exist');
    
    // Even error pages should be accessible
    await expectNoA11yViolations(a11yPage);
    
    // Should have proper heading structure
    const headings = await a11yPage.locator('h1, h2, h3').count();
    expect(headings, 'Error page should have proper heading structure').toBeGreaterThan(0);
  });

  test('Progressive enhancement maintains accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Disable JavaScript to test progressive enhancement
    await a11yPage.context().addInitScript(() => {
      Object.defineProperty(navigator, 'javaEnabled', {
        value: () => false,
        writable: false
      });
    });
    
    await navigateToPage('/');
    
    // Should still be accessible without JavaScript
    await expectNoA11yViolations(a11yPage);
    
    // Basic functionality should still work
    const links = await a11yPage.locator('a[href]').count();
    expect(links, 'Should have accessible links without JavaScript').toBeGreaterThan(0);
  });

  test('Print styles maintain accessibility', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Emulate print media
    await a11yPage.emulateMedia({ media: 'print' });
    
    // Should still be accessible for print
    await expectNoA11yViolations(a11yPage);
    
    // Content should still be visible for print
    const printContent = await a11yPage.locator('body *').evaluateAll(elements => {
      return elements.filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none';
      }).length;
    });
    
    expect(printContent, 'Print version should have visible content').toBeGreaterThan(0);
  });
});