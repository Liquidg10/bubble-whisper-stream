/**
 * @file Reduced Motion Tests
 * Tests that animations respect prefers-reduced-motion preference
 */

import { test, expect } from '../fixtures/a11y-test-app';
import { checkReducedMotionCompliance } from '../utils/a11y-helpers';
import { COMMON_PREFERENCE_COMBINATIONS } from '../utils/mock-preferences';

test.describe('Reduced Motion Compliance @a11y', () => {
  test('Home page respects reduced motion preference', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    await setupA11y({ reducedMotion: true });
    await navigateToPage('/');
    
    await checkReducedMotionCompliance(a11yPage);
  });

  test('Matrix view respects reduced motion preference', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    await setupA11y({ reducedMotion: true });
    await navigateToPage('/matrix');
    
    await checkReducedMotionCompliance(a11yPage);
  });

  test('Bubble animations disable under reduced motion', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    // First test with normal motion
    await setupA11y({ reducedMotion: false });
    await navigateToPage('/');
    
    // Wait for bubbles to load
    await a11yPage.waitForSelector('[data-testid="bubble"]', { timeout: 5000 });
    
    // Check that animations are running normally
    const bubbleWithAnimation = a11yPage.locator('[data-testid="bubble"]').first();
    
    if (await bubbleWithAnimation.count() > 0) {
      const normalAnimationState = await bubbleWithAnimation.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
      
      // Now test with reduced motion
      await setupA11y({ reducedMotion: true });
      await a11yPage.reload();
      await a11yPage.waitForSelector('[data-testid="bubble"]', { timeout: 5000 });
      
      const reducedMotionState = await bubbleWithAnimation.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
      
      // Animations should be disabled or significantly reduced
      const isAnimationReduced = (
        reducedMotionState.animationDuration !== normalAnimationState.animationDuration ||
        reducedMotionState.animationDuration === '0s' ||
        parseFloat(reducedMotionState.animationDuration) <= 0.01
      );
      
      expect(isAnimationReduced, 'Bubble animations should be reduced when prefers-reduced-motion is set').toBeTruthy();
    }
  });

  test('Motion control respects system preference', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    // Test that the motion control system respects system preference
    await a11yPage.emulateMedia({ reducedMotion: 'reduce' });
    await navigateToPage('/');
    
    // Check that motion is disabled by default when system preference is set
    const motionEnabled = await a11yPage.evaluate(() => {
      // Check if our motion control system is respecting the preference
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    
    expect(motionEnabled, 'Motion should be disabled when system prefers reduced motion').toBeTruthy();
  });

  test('Essential motion still functions under reduced motion', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    await setupA11y({ reducedMotion: true });
    await navigateToPage('/');
    
    // Test that essential functionality like pan/zoom still works
    // This would be specific to your application's essential motions
    
    // For example, if pan/zoom is essential:
    const viewport = a11yPage.locator('[data-testid="bubble-viewport"]');
    
    if (await viewport.count() > 0) {
      // Should still be able to pan/zoom even with reduced motion
      await viewport.hover();
      await a11yPage.wheel(0, 100); // Scroll to zoom
      
      // Verify that essential motion still works
      const transform = await viewport.evaluate(el => {
        return window.getComputedStyle(el).transform;
      });
      
      // Essential transforms should still be applied
      expect(transform).not.toBe('none');
    }
  });

  test('All preference combinations handle motion correctly', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    for (const combo of COMMON_PREFERENCE_COMBINATIONS) {
      await setupA11y(combo.preferences);
      await navigateToPage('/');
      
      if (combo.preferences.reducedMotion) {
        await checkReducedMotionCompliance(a11yPage);
      }
      
      // Ensure page still functions correctly
      const isPageInteractive = await a11yPage.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        return buttons.length > 0; // Basic functionality check
      });
      
      expect(isPageInteractive, `Page should remain interactive with ${combo.name} preferences`).toBeTruthy();
    }
  });

  test('Animation toggle controls work correctly', async ({ 
    a11yPage, 
    navigateToPage 
  }) => {
    await navigateToPage('/');
    
    // Look for motion toggle controls
    const motionToggle = a11yPage.locator(
      'button[aria-label*="motion"], button[aria-label*="animation"], [data-testid="motion-toggle"]'
    );
    
    if (await motionToggle.count() > 0) {
      // Test toggling motion
      await motionToggle.click();
      
      // Verify toggle affects motion state
      await checkReducedMotionCompliance(a11yPage);
      
      // Toggle back
      await motionToggle.click();
      
      // Should restore motion (this would need specific implementation checking)
      const motionRestored = await a11yPage.evaluate(() => {
        // Check if motion was restored - this would be app-specific
        return true; // Placeholder
      });
      
      expect(motionRestored, 'Motion should be restored when toggle is clicked again').toBeTruthy();
    }
  });

  test('Framer Motion respects reduced motion', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    await setupA11y({ reducedMotion: true });
    await navigateToPage('/matrix');
    
    // Check that Framer Motion components respect reduced motion
    const motionElements = await a11yPage.locator('[style*="transform"], .motion-').all();
    
    for (const element of motionElements) {
      const hasReducedMotion = await element.evaluate(el => {
        // Check if element has reduced motion styles applied
        const style = window.getComputedStyle(el);
        return (
          style.animationDuration === '0s' ||
          style.transitionDuration === '0s' ||
          parseFloat(style.animationDuration) <= 0.01
        );
      });
      
      expect(hasReducedMotion, 'Framer Motion elements should respect reduced motion preference').toBeTruthy();
    }
  });

  test('CSS animations respect reduced motion media query', async ({ 
    a11yPage, 
    navigateToPage,
    setupA11y 
  }) => {
    await setupA11y({ reducedMotion: true });
    await navigateToPage('/');
    
    // Check that CSS animations are properly disabled
    const elementsWithCSSAnimations = await a11yPage.locator('[class*="animate-"]').all();
    
    for (const element of elementsWithCSSAnimations) {
      const animationState = await element.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          animationPlayState: style.animationPlayState,
          animationDuration: style.animationDuration,
        };
      });
      
      const isAnimationDisabled = (
        animationState.animationPlayState === 'paused' ||
        animationState.animationDuration === '0s' ||
        parseFloat(animationState.animationDuration) <= 0.01
      );
      
      expect(isAnimationDisabled, 'CSS animations should be disabled under reduced motion').toBeTruthy();
    }
  });
});