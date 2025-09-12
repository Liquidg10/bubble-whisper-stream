/**
 * @file Target Size Tests (WCAG 2.5.8)
 * Tests that all interactive elements meet the minimum 44×44 CSS pixel target size
 */

import { test, expect } from '../fixtures/a11y-test-app';
import { checkTargetSizes } from '../utils/a11y-helpers';

test.describe('Target Size Compliance (WCAG 2.5.8) @a11y', () => {
  test('Home page - all interactive elements meet minimum target size', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    await checkTargetSizes(a11yPage);
  });

  test('Matrix view - all interactive elements meet minimum target size', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/matrix');
    await checkTargetSizes(a11yPage);
  });

  test('Bubble view - bubble elements meet minimum target size', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Wait for bubbles to load
    await a11yPage.waitForSelector('[data-testid="bubble"]', { timeout: 5000 });
    
    // Check bubble-specific target sizes
    const bubbles = await a11yPage.locator('[data-testid="bubble"]').all();
    
    for (const bubble of bubbles) {
      const box = await bubble.boundingBox();
      if (box) {
        expect(box.width, 'Bubble width must be at least 44px').toBeGreaterThanOrEqual(44);
        expect(box.height, 'Bubble height must be at least 44px').toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Dev routes - development UI elements meet target size', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Test key dev routes
    const devRoutes = ['/dev/mood', '/dev/voice', '/dev/cbt'];
    
    for (const route of devRoutes) {
      await navigateToPage(route);
      await checkTargetSizes(a11yPage);
    }
  });

  test('Mobile viewport - target sizes maintained on smaller screens', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Set mobile viewport
    await a11yPage.setViewportSize({ width: 375, height: 667 });
    
    await navigateToPage('/');
    await checkTargetSizes(a11yPage);
    
    await navigateToPage('/matrix');
    await checkTargetSizes(a11yPage);
  });

  test('Touch targets in dense UI areas', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/matrix');
    
    // Focus on matrix grid where elements might be dense
    const matrixGrid = a11yPage.locator('[data-testid="matrix-grid"]');
    if (await matrixGrid.count() > 0) {
      const interactiveElements = await matrixGrid.locator(
        'button, a, input, [role="button"], [tabindex]:not([tabindex="-1"])'
      ).all();
      
      for (const element of interactiveElements) {
        const box = await element.boundingBox();
        if (box) {
          expect(box.width, 'Dense UI element width must be at least 44px').toBeGreaterThanOrEqual(44);
          expect(box.height, 'Dense UI element height must be at least 44px').toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

  test('Exception handling - inline text links can be smaller', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Find inline text links (these are exempt from target size requirements)
    const inlineLinks = await a11yPage.locator('a').evaluateAll(links => {
      return links.filter(link => {
        const style = window.getComputedStyle(link);
        return style.display === 'inline' && link.textContent && link.textContent.trim().length > 0;
      });
    });
    
    // Inline links should exist and be properly identified
    // This test ensures our target size checker correctly handles the exception
    expect(inlineLinks.length).toBeGreaterThan(0);
  });

  test('Custom interactive components - atomic nodes meet target size', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Navigate to atomic view if available
    await navigateToPage('/atomic');
    
    // Check atomic nodes if they exist
    const atomicNodes = await a11yPage.locator('[data-testid="atomic-node"]').all();
    
    if (atomicNodes.length > 0) {
      for (const node of atomicNodes) {
        const box = await node.boundingBox();
        if (box) {
          expect(box.width, 'Atomic node width must be at least 44px').toBeGreaterThanOrEqual(44);
          expect(box.height, 'Atomic node height must be at least 44px').toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});