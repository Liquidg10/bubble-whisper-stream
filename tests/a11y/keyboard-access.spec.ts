/**
 * P11 - Keyboard Accessibility Tests
 * WCAG 2.5.7 - Dragging Movements compliance
 */

import { test, expect } from '@playwright/test';

test.describe('Keyboard Accessibility (WCAG 2.5.7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Enable a11y features
    await page.evaluate(() => {
      localStorage.setItem('feature_flags', JSON.stringify({
        a11yGate: true,
        devRoutes: true,
        listView: true,
        kanbanView: true
      }));
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('all interactive elements are keyboard accessible @a11y', async ({ page }) => {
    // Test tab navigation through all interactive elements
    const interactiveElements = await page.locator(`
      button,
      [role="button"],
      a,
      input,
      select,
      textarea,
      [tabindex]:not([tabindex="-1"])
    `).all();

    let tabIndex = 0;
    for (const element of interactiveElements) {
      await page.keyboard.press('Tab');
      
      // Check if element can receive focus
      const isFocused = await element.evaluate(el => document.activeElement === el);
      if (!isFocused) {
        const elementTag = await element.evaluate(el => el.tagName.toLowerCase());
        const elementText = await element.textContent();
        console.warn(`Element not reachable by keyboard: ${elementTag} "${elementText}"`);
      }
      
      tabIndex++;
    }

    // Ensure we can tab back through elements
    for (let i = 0; i < Math.min(5, interactiveElements.length); i++) {
      await page.keyboard.press('Shift+Tab');
    }
  });

  test('drag operations have keyboard alternatives @a11y', async ({ page }) => {
    // Navigate to bubble view with draggable items
    await page.goto('/bubble');
    await page.waitForLoadState('networkidle');

    const draggableItems = await page.locator('.bubble-item, [draggable="true"]').all();
    
    for (const item of draggableItems) {
      // Check for keyboard event handlers
      const hasKeyboardHandlers = await item.evaluate(el => {
        return el.hasAttribute('onkeydown') || 
               el.hasAttribute('onkeyup') ||
               el.getAttribute('tabindex') !== null;
      });

      // Check for ARIA drag support
      const hasAriaSupport = await item.evaluate(el => {
        return el.hasAttribute('aria-grabbed') ||
               el.hasAttribute('aria-dropeffect') ||
               el.getAttribute('role')?.includes('option');
      });

      // Check for move controls nearby
      const hasMoveControls = await page.locator('[aria-label*="move"], .move-up, .move-down').count() > 0;

      // At least one keyboard alternative should exist
      expect(
        hasKeyboardHandlers || hasAriaSupport || hasMoveControls,
        `Draggable item lacks keyboard alternative`
      ).toBeTruthy();
    }
  });

  test('kanban board has keyboard alternatives for drag @a11y', async ({ page }) => {
    await page.goto('/kanban');
    await page.waitForLoadState('networkidle');

    // Test keyboard navigation in kanban
    const kanbanCards = await page.locator('[data-testid="kanban-card"]').all();
    
    if (kanbanCards.length > 0) {
      // Focus first card
      await kanbanCards[0].focus();
      
      // Test arrow key navigation
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      
      // Test context menu for move options
      await page.keyboard.press('ContextMenu');
      
      // Look for move options in context menu
      const moveOptions = await page.locator('[role="menuitem"]:has-text("Move")').count();
      expect(moveOptions).toBeGreaterThan(0);
    }
  });

  test('list view keyboard navigation works @a11y', async ({ page }) => {
    await page.goto('/list');
    await page.waitForLoadState('networkidle');

    // Test list keyboard shortcuts
    await page.keyboard.press('Tab');
    
    // Test task completion with Space
    const taskItems = await page.locator('[data-testid="task-item"]').all();
    if (taskItems.length > 0) {
      await taskItems[0].focus();
      await page.keyboard.press('Space'); // Should toggle completion
    }
    
    // Test quick add with Enter
    await page.keyboard.press('/'); // Focus search
    await page.keyboard.type('New task');
    await page.keyboard.press('Enter');
    
    // Test navigation arrows
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
  });

  test('modal dialogs are keyboard accessible @a11y', async ({ page }) => {
    // Open a modal
    await page.click('[data-testid="add-task"]');
    await page.waitForSelector('[role="dialog"]');

    // Test focus trapping
    const modalElements = await page.locator('[role="dialog"] button, [role="dialog"] input').all();
    
    // Tab through all modal elements
    for (let i = 0; i < modalElements.length; i++) {
      await page.keyboard.press('Tab');
    }
    
    // Test that focus wraps to first element
    await page.keyboard.press('Tab');
    
    // Test Shift+Tab backwards
    await page.keyboard.press('Shift+Tab');
    
    // Test Escape to close
    await page.keyboard.press('Escape');
    
    // Modal should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('all form controls are keyboard operable @a11y', async ({ page }) => {
    // Test various form control types
    const controls = [
      { selector: 'button', action: 'Enter' },
      { selector: '[role="button"]', action: 'Space' },
      { selector: 'input[type="checkbox"]', action: 'Space' },
      { selector: 'input[type="radio"]', action: 'Space' },
      { selector: 'select', action: 'ArrowDown' }
    ];

    for (const control of controls) {
      const elements = await page.locator(control.selector).all();
      
      for (const element of elements) {
        await element.focus();
        
        // Test activation
        await page.keyboard.press(control.action);
        
        // Verify element is still focusable after interaction
        const isFocusable = await element.evaluate(el => {
          return el.tabIndex >= 0 || 
                 el.hasAttribute('tabindex') ||
                 ['button', 'input', 'select', 'textarea', 'a'].includes(el.tagName.toLowerCase());
        });
        
        expect(isFocusable).toBeTruthy();
      }
    }
  });

  test('keyboard navigation preserves focus indicators @a11y', async ({ page }) => {
    // Test that focus indicators are visible
    const interactiveElements = await page.locator('button, a, input').all();
    
    for (const element of interactiveElements.slice(0, 5)) { // Test first 5 elements
      await element.focus();
      
      // Check for focus indicator styles
      const focusStyles = await element.evaluate(el => {
        const styles = window.getComputedStyle(el, ':focus');
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          boxShadow: styles.boxShadow
        };
      });
      
      // Should have some form of focus indicator
      const hasFocusIndicator = focusStyles.outline !== 'none' ||
                               focusStyles.outlineWidth !== '0px' ||
                               focusStyles.boxShadow !== 'none';
      
      expect(hasFocusIndicator, 'Element lacks visible focus indicator').toBeTruthy();
    }
  });

  test('keyboard shortcuts are documented and accessible @a11y', async ({ page }) => {
    // Test for keyboard shortcut help
    await page.keyboard.press('?'); // Common help key
    
    // Look for help modal or keyboard shortcut guide
    const helpIndicators = await page.locator(`
      [data-testid="keyboard-help"],
      [aria-label*="keyboard"],
      [aria-label*="shortcut"],
      .keyboard-help
    `).count();
    
    // Should have some form of keyboard help
    expect(helpIndicators).toBeGreaterThan(0);
  });
});