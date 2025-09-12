/**
 * Accessibility test utilities for Playwright tests
 */

import { Page, Locator, expect } from '@playwright/test';
import { injectAxe, checkA11y, getViolations } from 'axe-playwright';

export interface A11yTestConfig {
  includeTags?: string[];
  excludeTags?: string[];
  rules?: Record<string, { enabled: boolean }>;
}

/**
 * Setup accessibility testing on a page
 */
export async function setupA11yTesting(page: Page, config?: A11yTestConfig): Promise<void> {
  await injectAxe(page);
  
  // Configure axe-core rules if provided
  if (config?.rules) {
    await page.evaluate((rules) => {
      // @ts-ignore - axe is injected globally
      window.axe.configure({ rules });
    }, config.rules);
  }
}

/**
 * Run full accessibility audit and expect no violations
 */
export async function expectNoA11yViolations(
  page: Page, 
  selector?: string,
  config?: A11yTestConfig
): Promise<void> {
  await checkA11y(page, selector, {
    includeTags: config?.includeTags || ['wcag2a', 'wcag2aa', 'wcag21aa'],
    excludeTags: config?.excludeTags,
  });
}

/**
 * Get accessibility violations for detailed analysis
 */
export async function getA11yViolations(page: Page, selector?: string) {
  return await getViolations(page, selector);
}

/**
 * Check that all interactive elements meet minimum target size (44x44px)
 */
export async function checkTargetSizes(page: Page): Promise<void> {
  const interactiveElements = await page.locator(
    'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
  ).all();

  for (const element of interactiveElements) {
    const box = await element.boundingBox();
    if (box) {
      const { width, height } = box;
      
      // Skip inline text links (exception in WCAG 2.5.8)
      const tagName = await element.evaluate(el => el.tagName.toLowerCase());
      const isInlineLink = tagName === 'a' && await element.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'inline' || style.display === 'inline-block';
      });
      
      if (!isInlineLink) {
        expect(width, `Element has insufficient width: ${width}px (minimum 44px)`).toBeGreaterThanOrEqual(44);
        expect(height, `Element has insufficient height: ${height}px (minimum 44px)`).toBeGreaterThanOrEqual(44);
      }
    }
  }
}

/**
 * Check that draggable elements have keyboard alternatives
 */
export async function checkKeyboardAlternatives(page: Page): Promise<void> {
  const draggableElements = await page.locator('[draggable="true"], [data-draggable]').all();
  
  for (const element of draggableElements) {
    // Check for keyboard accessibility
    const hasTabIndex = await element.getAttribute('tabindex');
    const hasKeyboardHandler = await element.evaluate(el => {
      // Check for keyboard event listeners
      const events = ['keydown', 'keyup', 'keypress'];
      return events.some(event => {
        const listeners = (el as any).getEventListeners?.(event) || [];
        return listeners.length > 0;
      });
    });
    
    // Should be focusable and have keyboard handlers, or have ARIA controls
    const hasAriaControls = await element.getAttribute('aria-controls');
    const hasAriaDropeffect = await element.getAttribute('aria-dropeffect');
    
    const hasKeyboardSupport = (
      (hasTabIndex !== null && hasTabIndex !== '-1') ||
      hasKeyboardHandler ||
      hasAriaControls ||
      hasAriaDropeffect
    );
    
    expect(hasKeyboardSupport, 
      'Draggable element must have keyboard alternative (tabindex, keyboard handlers, or ARIA controls)'
    ).toBeTruthy();
  }
}

/**
 * Mock reduced motion preference and verify animations are disabled
 */
export async function checkReducedMotionCompliance(page: Page): Promise<void> {
  // Set reduced motion preference
  await page.emulateMedia({ reducedMotion: 'reduce' });
  
  // Wait for any media query changes to take effect
  await page.waitForTimeout(100);
  
  // Check that animations are disabled or simplified
  const animatedElements = await page.locator(
    '[class*="animate-"], [style*="animation"], [style*="transition"]'
  ).all();
  
  for (const element of animatedElements) {
    const computedStyle = await element.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        animationDuration: style.animationDuration,
        animationPlayState: style.animationPlayState,
        transitionDuration: style.transitionDuration,
      };
    });
    
    // Animations should be paused, have zero duration, or be very short
    const isAnimationDisabled = (
      computedStyle.animationPlayState === 'paused' ||
      computedStyle.animationDuration === '0s' ||
      parseFloat(computedStyle.animationDuration) <= 0.01
    );
    
    const isTransitionDisabled = (
      computedStyle.transitionDuration === '0s' ||
      parseFloat(computedStyle.transitionDuration) <= 0.01
    );
    
    // At least one should be disabled when reduced motion is preferred
    expect(isAnimationDisabled || isTransitionDisabled,
      'Animations should be disabled or simplified when prefers-reduced-motion is set'
    ).toBeTruthy();
  }
}

/**
 * Check focus management and keyboard navigation
 */
export async function checkFocusManagement(page: Page): Promise<void> {
  // Check that focus indicators are visible
  const focusableElements = await page.locator(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ).all();
  
  for (const element of focusableElements.slice(0, 5)) { // Test first 5 to avoid timeout
    await element.focus();
    
    // Check for visible focus indicator
    const hasFocusOutline = await element.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.outline !== 'none' ||
        style.outlineWidth !== '0px' ||
        style.boxShadow.includes('0 0') ||
        style.borderColor !== 'transparent'
      );
    });
    
    expect(hasFocusOutline, 'Focusable element must have visible focus indicator').toBeTruthy();
  }
}

/**
 * Utility to navigate to a page and wait for it to be ready
 */
export async function navigateAndWaitForReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  
  // Wait for React to hydrate
  await page.waitForFunction(() => {
    return window.React !== undefined || document.querySelector('[data-reactroot], #root')?.children.length > 0;
  });
  
  // Additional wait for any initial animations
  await page.waitForTimeout(500);
}

/**
 * Mock user preferences for testing
 */
export async function mockUserPreferences(page: Page, preferences: {
  reducedMotion?: boolean;
  highContrast?: boolean;
  screenReader?: boolean;
}): Promise<void> {
  if (preferences.reducedMotion !== undefined) {
    await page.emulateMedia({ 
      reducedMotion: preferences.reducedMotion ? 'reduce' : 'no-preference' 
    });
  }
  
  if (preferences.highContrast !== undefined) {
    await page.emulateMedia({
      colorScheme: preferences.highContrast ? 'dark' : 'light'
    });
  }
  
  if (preferences.screenReader !== undefined) {
    // Mock screen reader by setting ARIA live region announcements
    await page.evaluate((enabled) => {
      if (enabled) {
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.style.position = 'absolute';
        announcer.style.left = '-10000px';
        announcer.id = 'screen-reader-announcer';
        document.body.appendChild(announcer);
      }
    }, preferences.screenReader);
  }
}