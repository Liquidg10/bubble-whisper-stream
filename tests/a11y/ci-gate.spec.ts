/**
 * P11 & P20 - A11y CI Gate Testing
 * Comprehensive accessibility validation that fails builds if violated
 * WCAG 2.2 compliance with 44×44px targets and drag alternatives
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('P11: A11y CI Gate @a11y @ci-gate', () => {
  
  test('should pass axe-core accessibility scan', async ({ page }) => {
    const views = ['/', '/list', '/kanban', '/matrix', '/bubble'];
    
    for (const view of views) {
      await page.goto(view);
      await page.waitForLoadState('networkidle');
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });
  
  test('should enforce 44×44px minimum target size', async ({ page }) => {
    const views = ['/', '/list', '/kanban', '/matrix', '/bubble'];
    
    for (const view of views) {
      await page.goto(view);
      
      // Get all interactive elements
      const interactiveElements = await page.locator(
        'button, a, input, [role="button"], [tabindex="0"], [data-testid*="button"]'
      ).all();
      
      for (const element of interactiveElements) {
        const box = await element.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          // CI Gate: Fail if any target < 44×44
          expect(box.width, `Target width ${box.width}px < 44px in ${view}`).toBeGreaterThanOrEqual(44);
          expect(box.height, `Target height ${box.height}px < 44px in ${view}`).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
  
  test('should provide keyboard alternatives for all drag operations', async ({ page }) => {
    // Test Kanban drag alternatives
    await page.goto('/kanban');
    await page.waitForLoadState('networkidle');
    
    // Should have move buttons or menu alternatives for draggable items
    const draggableItems = page.locator('[draggable="true"], [data-testid*="draggable"]');
    const itemCount = await draggableItems.count();
    
    if (itemCount > 0) {
      // Each draggable item should have keyboard alternative
      const moveAlternatives = page.locator(
        '[data-testid*="move"], [aria-label*="move"], [data-testid*="keyboard-move"]'
      );
      const alternativeCount = await moveAlternatives.count();
      
      expect(alternativeCount, 'Missing keyboard alternatives for drag operations').toBeGreaterThan(0);
    }
    
    // Test Matrix drag alternatives
    await page.goto('/matrix');
    await page.waitForLoadState('networkidle');
    
    // Should have arrow key instructions or move buttons
    const matrixInstructions = page.locator('text=/arrow/i, text=/keyboard/i, [data-testid*="keyboard"]');
    const hasKeyboardInstructions = await matrixInstructions.count() > 0;
    
    const moveButtons = page.locator('[data-testid*="move"], [aria-label*="move"]');
    const hasMoveButtons = await moveButtons.count() > 0;
    
    expect(hasKeyboardInstructions || hasMoveButtons, 'Matrix view missing keyboard alternatives').toBe(true);
  });
  
  test('should respect prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    const views = ['/', '/list', '/kanban', '/matrix', '/bubble'];
    
    for (const view of views) {
      await page.goto(view);
      
      // Check that animations are disabled or minimal
      const animatedElements = await page.locator('[style*="animation"], [class*="animate"]').all();
      
      for (const element of animatedElements) {
        const styles = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return {
            animationDuration: computed.animationDuration,
            transitionDuration: computed.transitionDuration
          };
        });
        
        // CI Gate: Animations must be disabled or very short under reduced motion
        const animationOk = styles.animationDuration === '0s' || parseFloat(styles.animationDuration) <= 0.2;
        const transitionOk = styles.transitionDuration === '0s' || parseFloat(styles.transitionDuration) <= 0.3;
        
        expect(animationOk, `Animation too long in reduced motion: ${styles.animationDuration}`).toBe(true);
        expect(transitionOk, `Transition too long in reduced motion: ${styles.transitionDuration}`).toBe(true);
      }
    }
  });
  
  test('should support full keyboard navigation', async ({ page }) => {
    const views = ['/', '/list', '/kanban', '/matrix'];
    
    for (const view of views) {
      await page.goto(view);
      
      // Start at the beginning
      await page.keyboard.press('Tab');
      let focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
      
      // Should be able to tab through at least 5 focusable elements
      let tabCount = 0;
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        focusedElement = page.locator(':focus');
        
        if (await focusedElement.isVisible()) {
          tabCount++;
        }
        
        if (tabCount >= 5) break;
      }
      
      expect(tabCount, `Insufficient keyboard navigation in ${view}`).toBeGreaterThanOrEqual(5);
    }
  });
  
  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/');
    
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    
    // Check that focus is visually indicated
    const styles = await focusedElement.evaluate(el => {
      const computed = getComputedStyle(el);
      return {
        outline: computed.outline,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
        boxShadow: computed.boxShadow
      };
    });
    
    // Should have visible focus indicator
    const hasOutline = styles.outline !== 'none' && styles.outlineWidth !== '0px';
    const hasShadow = styles.boxShadow !== 'none' && !styles.boxShadow.includes('0px 0px 0px');
    const hasValidColor = styles.outlineColor !== 'rgba(0, 0, 0, 0)' && styles.outlineColor !== 'transparent';
    
    expect(
      (hasOutline && hasValidColor) || hasShadow,
      'No visible focus indicator detected'
    ).toBe(true);
  });
  
  test('should have proper semantic structure', async ({ page }) => {
    const views = ['/', '/list', '/kanban', '/matrix'];
    
    for (const view of views) {
      await page.goto(view);
      
      // Should have proper heading structure
      const h1Elements = page.locator('h1');
      const h1Count = await h1Elements.count();
      expect(h1Count, `Missing or multiple H1 in ${view}`).toBe(1);
      
      // Should have semantic landmarks
      const landmarks = page.locator('main, nav, aside, section, article');
      const landmarkCount = await landmarks.count();
      expect(landmarkCount, `Insufficient semantic structure in ${view}`).toBeGreaterThan(0);
      
      // Interactive elements should have accessible names
      const unnamedButtons = page.locator('button:not([aria-label]):not([title]):not(:has-text)');
      const unnamedCount = await unnamedButtons.count();
      expect(unnamedCount, `Unnamed buttons found in ${view}`).toBe(0);
    }
  });
});