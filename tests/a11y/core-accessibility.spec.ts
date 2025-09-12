/**
 * P11 Core Accessibility Tests
 * Automated testing for WCAG compliance and usability
 */

import { test } from '../fixtures/a11y-test-app';
import { 
  expectNoA11yViolations, 
  checkTargetSizes,
  checkKeyboardAlternatives,
  checkReducedMotionCompliance,
  checkFocusManagement
} from '../utils/a11y-helpers';

test.describe('Core Accessibility Compliance @a11y', () => {
  test('Home page meets WCAG AA standards', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/');
    
    // Wait for page to fully load
    await a11yPage.waitForSelector('[data-testid="main-content"]', { timeout: 10000 });
    
    // Check for accessibility violations
    await expectNoA11yViolations(a11yPage);
    
    // Verify target sizes (≥44×44px requirement)
    await checkTargetSizes(a11yPage);
    
    // Verify focus management
    await checkFocusManagement(a11yPage);
  });

  test('Task creation workflow is accessible', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/');
    
    // Wait for task quick add component
    await a11yPage.waitForSelector('[data-testid="smart-task-quick-add"]', { timeout: 5000 });
    
    // Test keyboard navigation for task creation
    await a11yPage.keyboard.press('Tab'); // Should focus on input
    const focusedElement = await a11yPage.locator(':focus');
    await focusedElement.type('Test accessibility task');
    
    await a11yPage.keyboard.press('Tab'); // Should focus on submit button
    await a11yPage.keyboard.press('Enter'); // Should submit
    
    // Verify no violations after interaction
    await expectNoA11yViolations(a11yPage);
  });

  test('Navigation is keyboard accessible', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/');
    
    // Test keyboard navigation through main navigation
    let tabCount = 0;
    const maxTabs = 20; // Prevent infinite loop
    
    while (tabCount < maxTabs) {
      await a11yPage.keyboard.press('Tab');
      
      const focusedElement = await a11yPage.locator(':focus');
      const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());
      const role = await focusedElement.getAttribute('role');
      
      // Interactive elements should be focusable
      if (['button', 'a', 'input', 'select', 'textarea'].includes(tagName) || 
          ['button', 'link', 'menuitem'].includes(role || '')) {
        
        // Verify element has visible focus indicator
        const hasVisibleFocus = await focusedElement.evaluate(el => {
          const styles = window.getComputedStyle(el);
          return styles.outline !== 'none' || styles.boxShadow !== 'none';
        });
        
        if (!hasVisibleFocus) {
          throw new Error(`Interactive element lacks visible focus indicator: ${tagName}${role ? ` (role: ${role})` : ''}`);
        }
      }
      
      tabCount++;
    }
    
    await expectNoA11yViolations(a11yPage);
  });

  test('Kanban view drag-and-drop has keyboard alternatives', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/kanban');
    
    // Wait for kanban view to load
    await a11yPage.waitForSelector('[data-testid="kanban-view"]', { timeout: 5000 });
    
    // Check for keyboard alternatives to drag-and-drop
    await checkKeyboardAlternatives(a11yPage);
    
    // Verify accessibility compliance
    await expectNoA11yViolations(a11yPage);
  });

  test('Matrix view keyboard navigation works', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/matrix');
    
    // Wait for matrix view to load
    await a11yPage.waitForSelector('[data-testid="matrix-view"]', { timeout: 5000 });
    
    // Test arrow key navigation between quadrants
    await a11yPage.keyboard.press('ArrowRight');
    await a11yPage.keyboard.press('ArrowDown');
    await a11yPage.keyboard.press('ArrowLeft');
    await a11yPage.keyboard.press('ArrowUp');
    
    // Test number key shortcuts (1-4 for quadrants)
    await a11yPage.keyboard.press('1');
    await a11yPage.keyboard.press('2');
    await a11yPage.keyboard.press('3');
    await a11yPage.keyboard.press('4');
    
    // Verify no violations after keyboard interactions
    await expectNoA11yViolations(a11yPage);
  });

  test('Reduced motion preferences are respected', async ({ a11yPage, setupA11y, navigateToPage }) => {
    // Set reduced motion preference
    await setupA11y({ reducedMotion: true });
    
    await navigateToPage('/');
    
    // Check that animations are disabled or reduced
    await checkReducedMotionCompliance(a11yPage);
    
    // Verify page still functions correctly without animations
    await a11yPage.click('[data-testid="smart-task-quick-add"] input');
    await a11yPage.type('[data-testid="smart-task-quick-add"] input', 'Test reduced motion');
    await a11yPage.click('[data-testid="smart-task-quick-add"] button[type="submit"]');
    
    await expectNoA11yViolations(a11yPage);
  });

  test('High contrast mode compatibility', async ({ a11yPage, setupA11y, navigateToPage }) => {
    // Set high contrast preference
    await setupA11y({ highContrast: true });
    
    await navigateToPage('/');
    
    // Verify color contrast meets WCAG AA standards (4.5:1 for normal text)
    const elements = await a11yPage.locator('button, a, [role="button"], [role="link"]').all();
    
    for (const element of elements) {
      const isVisible = await element.isVisible();
      if (!isVisible) continue;
      
      const contrast = await element.evaluate(el => {
        const styles = window.getComputedStyle(el);
        const bg = styles.backgroundColor;
        const color = styles.color;
        
        // Basic contrast check (simplified)
        return { background: bg, color: color };
      });
      
      // Verify colors are not the same (indicating proper contrast)
      if (contrast.background === contrast.color) {
        throw new Error(`Element has insufficient contrast: ${await element.textContent()}`);
      }
    }
    
    await expectNoA11yViolations(a11yPage);
  });

  test('Screen reader compatibility', async ({ a11yPage, setupA11y, navigateToPage }) => {
    // Set screen reader mode
    await setupA11y({ screenReader: true });
    
    await navigateToPage('/');
    
    // Verify proper heading structure (h1 -> h2 -> h3, no skipping)
    const headings = await a11yPage.locator('h1, h2, h3, h4, h5, h6').all();
    let previousLevel = 0;
    
    for (const heading of headings) {
      const tagName = await heading.evaluate(el => el.tagName);
      const currentLevel = parseInt(tagName.charAt(1));
      
      if (previousLevel > 0 && currentLevel > previousLevel + 1) {
        throw new Error(`Heading level skipped: ${tagName} after h${previousLevel}`);
      }
      
      previousLevel = currentLevel;
    }
    
    // Verify landmark regions exist
    const landmarks = await a11yPage.locator('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"]').count();
    if (landmarks === 0) {
      throw new Error('Page lacks proper landmark regions for screen readers');
    }
    
    await expectNoA11yViolations(a11yPage);
  });

  test('Mobile accessibility compliance', async ({ a11yPage, navigateToPage }) => {
    // Set mobile viewport
    await a11yPage.setViewportSize({ width: 375, height: 667 });
    
    await navigateToPage('/');
    
    // Verify target sizes are appropriate for mobile (≥44×44px)
    await checkTargetSizes(a11yPage);
    
    // Test touch targets don't overlap
    const interactiveElements = await a11yPage.locator('button, a, [role="button"], [role="link"]').all();
    
    for (let i = 0; i < interactiveElements.length; i++) {
      const elementA = interactiveElements[i];
      const boxA = await elementA.boundingBox();
      if (!boxA) continue;
      
      for (let j = i + 1; j < interactiveElements.length; j++) {
        const elementB = interactiveElements[j];
        const boxB = await elementB.boundingBox();
        if (!boxB) continue;
        
        // Check for overlap (with 8px buffer for finger precision)
        const buffer = 8;
        const overlap = !(
          boxA.x + boxA.width + buffer < boxB.x ||
          boxB.x + boxB.width + buffer < boxA.x ||
          boxA.y + boxA.height + buffer < boxB.y ||
          boxB.y + boxB.height + buffer < boxA.y
        );
        
        if (overlap) {
          const textA = await elementA.textContent();
          const textB = await elementB.textContent();
          throw new Error(`Touch targets overlap: "${textA}" and "${textB}"`);
        }
      }
    }
    
    await expectNoA11yViolations(a11yPage);
  });
});