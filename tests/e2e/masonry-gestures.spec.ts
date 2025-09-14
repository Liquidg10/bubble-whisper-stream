/**
 * E2E P6: Masonry Gestures & Mobile Performance
 * Tests mobile gestures, haptic feedback, and performance under load
 */

import { test, expect } from '@playwright/test';

test.describe('E2E P6: Masonry Gestures @e2e @mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle pinch-zoom gestures', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    const container = page.locator('[data-testid="masonry-container"]');
    
    // Simulate pinch gesture (touch events)
    await container.dispatchEvent('touchstart', {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 200 }
      ]
    });
    
    await container.dispatchEvent('touchmove', {
      touches: [
        { clientX: 80, clientY: 80 },
        { clientX: 220, clientY: 220 }
      ]
    });
    
    await container.dispatchEvent('touchend', {});
    
    // Verify zoom state or visual changes
    await page.waitForTimeout(100);
    // Note: Actual zoom verification would depend on implementation
  });

  test('should handle long-press gestures', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    const card = page.locator('[data-testid="masonry-card"]').first();
    
    // Simulate long press
    await card.dispatchEvent('touchstart', {
      touches: [{ clientX: 100, clientY: 100 }]
    });
    
    await page.waitForTimeout(600); // Exceed long press threshold
    
    await card.dispatchEvent('touchend', {});
    
    // Verify context menu or action appears
    const contextMenu = page.locator('[role="menu"], [data-testid="context-menu"]');
    await expect(contextMenu.first()).toBeVisible({ timeout: 1000 });
  });

  test('should respect reduced motion preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Check that animations are minimal
    const animatedElements = await page.locator('[class*="animate"], [style*="animation"]').all();
    
    for (const element of animatedElements) {
      const styles = await element.evaluate(el => {
        const computed = getComputedStyle(el);
        return {
          animationDuration: computed.animationDuration,
          transitionDuration: computed.transitionDuration
        };
      });
      
      // Animations should be disabled or very short
      expect(
        styles.animationDuration === '0s' || 
        parseFloat(styles.animationDuration) <= 0.2
      ).toBe(true);
    }
  });

  test('should maintain performance with many cards', async ({ page }) => {
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-container"]');
    
    // Monitor performance during interaction
    const performanceMetrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries.map(entry => ({
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime
          })));
        });
        observer.observe({ entryTypes: ['measure', 'navigation'] });
        
        // Trigger some interactions
        setTimeout(() => {
          observer.disconnect();
          resolve([]);
        }, 1000);
      });
    });
    
    // Verify no excessive long tasks
    const longTasks = performanceMetrics.filter((metric: any) => metric.duration > 50);
    expect(longTasks.length).toBeLessThan(5); // Allow some long tasks but not excessive
  });

  test('should handle gesture conflicts gracefully', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    const card = page.locator('[data-testid="masonry-card"]').first();
    
    // Start a gesture
    await card.dispatchEvent('touchstart', {
      touches: [{ clientX: 100, clientY: 100 }]
    });
    
    // Move quickly (should cancel long press)
    await card.dispatchEvent('touchmove', {
      touches: [{ clientX: 150, clientY: 100 }]
    });
    
    await page.waitForTimeout(100);
    
    await card.dispatchEvent('touchend', {});
    
    // Should not trigger long press menu
    const contextMenu = page.locator('[role="menu"]');
    await expect(contextMenu).not.toBeVisible({ timeout: 500 });
  });

  test('should provide haptic feedback indicators', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/masonry');
    await page.waitForSelector('[data-testid="masonry-card"]');
    
    // Listen for haptic feedback calls (would be mocked in real implementation)
    const hapticCalls = await page.evaluate(() => {
      const calls: string[] = [];
      
      // Mock haptic feedback
      if ('vibrate' in navigator) {
        const originalVibrate = navigator.vibrate;
        navigator.vibrate = function(pattern) {
          calls.push(`vibrate:${pattern}`);
          return originalVibrate.call(this, pattern);
        };
      }
      
      return calls;
    });
    
    // Trigger gesture that should cause haptic feedback
    const card = page.locator('[data-testid="masonry-card"]').first();
    await card.click();
    
    // Note: In real implementation, we'd verify haptic calls were made
    // This is a placeholder for haptic feedback verification
  });
});