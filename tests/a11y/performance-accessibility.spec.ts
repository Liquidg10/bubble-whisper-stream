/**
 * P11 Performance Accessibility Tests
 * Ensures accessibility features perform well under load
 */

import { test, expect } from '../fixtures/a11y-test-app';
import { checkReducedMotionCompliance } from '../utils/a11y-helpers';

test.describe('Accessibility Performance @a11y', () => {
  test('Target size validation under high task load', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/');
    
    // Create multiple tasks to test performance
    const taskInput = a11yPage.locator('[data-testid="smart-task-quick-add"] input');
    const submitButton = a11yPage.locator('[data-testid="smart-task-quick-add"] button[type="submit"]');
    
    // Add 20 tasks quickly
    for (let i = 0; i < 20; i++) {
      await taskInput.fill(`Performance test task ${i + 1}`);
      await submitButton.click();
      await a11yPage.waitForTimeout(100); // Brief pause
    }
    
    // Measure target size validation performance
    const startTime = Date.now();
    
    const interactiveElements = await a11yPage.locator('button, a, [role="button"], [role="link"]').all();
    let validTargets = 0;
    
    for (const element of interactiveElements) {
      const box = await element.boundingBox();
      if (box && box.width >= 44 && box.height >= 44) {
        validTargets++;
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Performance should be under 1 second even with many elements
    expect(duration).toBeLessThan(1000);
    expect(validTargets).toBeGreaterThan(0);
  });

  test('Reduced motion performance with animations', async ({ a11yPage, setupA11y, navigateToPage }) => {
    await setupA11y({ reducedMotion: true });
    await navigateToPage('/');
    
    // Measure frame rate during interactions with reduced motion
    await a11yPage.evaluate(() => {
      // Start frame rate monitoring
      (window as any).frameCount = 0;
      (window as any).startTime = performance.now();
      
      function countFrames() {
        (window as any).frameCount++;
        requestAnimationFrame(countFrames);
      }
      requestAnimationFrame(countFrames);
    });
    
    // Perform multiple interactions
    const actions = [
      () => a11yPage.click('[data-testid="smart-task-quick-add"] input'),
      () => a11yPage.type('[data-testid="smart-task-quick-add"] input', 'Animation test'),
      () => a11yPage.click('[data-testid="smart-task-quick-add"] button[type="submit"]'),
      () => a11yPage.keyboard.press('Tab'),
      () => a11yPage.keyboard.press('Tab'),
      () => a11yPage.keyboard.press('Enter')
    ];
    
    for (const action of actions) {
      await action();
      await a11yPage.waitForTimeout(100);
    }
    
    // Check frame rate
    const frameData = await a11yPage.evaluate(() => {
      const endTime = performance.now();
      const duration = endTime - (window as any).startTime;
      const fps = ((window as any).frameCount / duration) * 1000;
      return { fps, duration, frameCount: (window as any).frameCount };
    });
    
    // Should maintain >30 FPS even with reduced motion
    expect(frameData.fps).toBeGreaterThan(30);
    
    // Verify reduced motion is actually working
    await checkReducedMotionCompliance(a11yPage);
  });

  test('Keyboard navigation performance with large datasets', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/matrix');
    
    // Wait for matrix view
    await a11yPage.waitForSelector('[data-testid="matrix-view"]', { timeout: 5000 });
    
    // Measure keyboard navigation performance
    const startTime = Date.now();
    
    // Perform 50 keyboard navigation actions
    for (let i = 0; i < 50; i++) {
      const direction = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'][i % 4];
      await a11yPage.keyboard.press(direction);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Each navigation should be <20ms on average
    const avgTime = duration / 50;
    expect(avgTime).toBeLessThan(20);
  });

  test('Focus management performance during rapid interactions', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/');
    
    // Test rapid tab navigation
    const startTime = Date.now();
    
    for (let i = 0; i < 30; i++) {
      await a11yPage.keyboard.press('Tab');
      
      // Verify focus is visible (should be fast)
      const focusedElement = a11yPage.locator(':focus');
      await expect(focusedElement).toBeVisible();
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should handle 30 focus changes in under 2 seconds
    expect(duration).toBeLessThan(2000);
  });

  test('Screen reader announcement performance', async ({ a11yPage, setupA11y, navigateToPage }) => {
    await setupA11y({ screenReader: true });
    await navigateToPage('/');
    
    // Monitor aria-live announcements
    await a11yPage.evaluate(() => {
      (window as any).announcements = [];
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            const target = mutation.target as Element;
            if (target.getAttribute && (
              target.getAttribute('aria-live') || 
              target.getAttribute('role') === 'status' ||
              target.getAttribute('role') === 'alert'
            )) {
              (window as any).announcements.push({
                text: target.textContent,
                timestamp: Date.now()
              });
            }
          }
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    });
    
    // Trigger actions that should create announcements
    await a11yPage.click('[data-testid="smart-task-quick-add"] input');
    await a11yPage.type('[data-testid="smart-task-quick-add"] input', 'Screen reader test');
    await a11yPage.click('[data-testid="smart-task-quick-add"] button[type="submit"]');
    
    await a11yPage.waitForTimeout(1000); // Wait for announcements
    
    const announcements = await a11yPage.evaluate(() => (window as any).announcements);
    
    // Should have announcements and they should be timely
    expect(announcements.length).toBeGreaterThan(0);
    
    // Check timing between announcements (shouldn't be too rapid)
    for (let i = 1; i < announcements.length; i++) {
      const timeDiff = announcements[i].timestamp - announcements[i-1].timestamp;
      expect(timeDiff).toBeGreaterThan(100); // At least 100ms between announcements
    }
  });

  test('Color contrast calculation performance', async ({ a11yPage, navigateToPage }) => {
    await navigateToPage('/');
    
    // Test contrast checking on all visible elements
    const startTime = Date.now();
    
    const contrastResults = await a11yPage.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const results = [];
      
      elements.forEach(el => {
        if (el instanceof HTMLElement && el.offsetParent !== null) {
          const styles = window.getComputedStyle(el);
          const bg = styles.backgroundColor;
          const color = styles.color;
          
          if (bg !== 'rgba(0, 0, 0, 0)' && color !== 'rgba(0, 0, 0, 0)') {
            results.push({
              tag: el.tagName,
              background: bg,
              color: color,
              hasText: el.textContent && el.textContent.trim().length > 0
            });
          }
        }
      });
      
      return results;
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should process contrast for all elements quickly
    expect(duration).toBeLessThan(3000); // Under 3 seconds
    expect(contrastResults.length).toBeGreaterThan(0);
  });
});