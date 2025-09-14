/**
 * Performance P6: Calendar Performance Testing
 * Tests FPS, memory usage, and performance targets for calendar views
 */

import { test, expect } from '@playwright/test';

test.describe('Performance P6: Calendar Performance @performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should maintain ≥55 FPS during calendar interactions', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Measure FPS during interaction
    const performanceMetrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        let frameCount = 0;
        let startTime = performance.now();
        const duration = 2000; // 2 seconds
        
        function countFrames() {
          frameCount++;
          
          if (performance.now() - startTime < duration) {
            requestAnimationFrame(countFrames);
          } else {
            const fps = frameCount / (duration / 1000);
            resolve({ fps, frameCount, duration });
          }
        }
        
        requestAnimationFrame(countFrames);
      });
    });
    
    const metrics = performanceMetrics as { fps: number; frameCount: number; duration: number };
    expect(metrics.fps).toBeGreaterThanOrEqual(55);
  });

  test('should handle large datasets efficiently', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create many events to test performance
    const quickAdd = page.locator('[data-testid="quick-add"]');
    const startTime = performance.now();
    
    for (let i = 0; i < 50; i++) {
      await quickAdd.fill(`Performance test event ${i + 1}`);
      await quickAdd.press('Enter');
      
      // Don't wait between events to stress test
      if (i % 10 === 0) {
        await page.waitForTimeout(50); // Brief pause every 10 events
      }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // Should complete 50 events in reasonable time
    expect(totalTime).toBeLessThan(10000); // 10 seconds max
    
    // Calendar should still be responsive
    const calendarView = page.locator('[data-testid="calendar-view"]');
    await expect(calendarView).toBeVisible();
    
    // Test scrolling performance
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    
    await page.waitForTimeout(100);
    await expect(calendarView).toBeVisible();
  });

  test('should implement adaptive LOD correctly', async ({ page }) => {
    await page.goto('/dev/perf-calendar');
    await page.waitForSelector('[data-testid="calendar-performance"]');
    
    // Check LOD system status
    const lodLevel = page.locator('[data-testid="lod-level"]');
    
    if (await lodLevel.isVisible()) {
      const level = await lodLevel.textContent();
      expect(level).toMatch(/(minimal|low|medium|high)/i);
    }
    
    // Test LOD adaptation under stress
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create stress conditions
    await page.evaluate(() => {
      // Simulate high CPU usage
      const heavyTask = () => {
        const start = Date.now();
        while (Date.now() - start < 100) {
          Math.random() * Math.random();
        }
        setTimeout(heavyTask, 10);
      };
      heavyTask();
    });
    
    await page.waitForTimeout(2000);
    
    // Check if LOD adapted
    await page.goto('/dev/perf-calendar');
    const adaptedLod = page.locator('[data-testid="lod-level"]');
    
    if (await adaptedLod.isVisible()) {
      const adaptedLevel = await adaptedLod.textContent();
      expect(adaptedLevel).toMatch(/(minimal|low)/i); // Should degrade under stress
    }
  });

  test('should monitor memory usage and prevent leaks', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Measure initial memory
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    // Perform memory-intensive operations
    const quickAdd = page.locator('[data-testid="quick-add"]');
    
    for (let i = 0; i < 20; i++) {
      await quickAdd.fill(`Memory test event ${i + 1}`);
      await quickAdd.press('Enter');
      
      // Delete every other event to test cleanup
      if (i % 2 === 0) {
        const events = await page.locator('[data-testid="calendar-event"]').all();
        if (events.length > 5) {
          await events[0].click();
          const deleteButton = page.locator('[data-testid="delete-task"], [aria-label*="delete"]');
          if (await deleteButton.isVisible()) {
            await deleteButton.click();
          }
        }
      }
      
      await page.waitForTimeout(50);
    }
    
    // Force garbage collection if available
    await page.evaluate(() => {
      if ((window as any).gc) {
        (window as any).gc();
      }
    });
    
    await page.waitForTimeout(1000);
    
    // Measure final memory
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    // Memory should not have grown excessively
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryGrowth = finalMemory - initialMemory;
      const maxAllowedGrowth = 50 * 1024 * 1024; // 50MB
      expect(memoryGrowth).toBeLessThan(maxAllowedGrowth);
    }
  });

  test('should handle mobile performance requirements', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Test mobile gesture performance
    const calendar = page.locator('[data-testid="calendar-view"]');
    
    // Measure touch response time
    const touchStartTime = performance.now();
    
    await calendar.dispatchEvent('touchstart', {
      touches: [{ clientX: 100, clientY: 100 }]
    });
    
    await calendar.dispatchEvent('touchmove', {
      touches: [{ clientX: 150, clientY: 100 }]
    });
    
    await calendar.dispatchEvent('touchend', {});
    
    const touchEndTime = performance.now();
    const gestureLatency = touchEndTime - touchStartTime;
    
    // Gesture should be responsive (under 100ms)
    expect(gestureLatency).toBeLessThan(100);
    
    // Check mobile performance indicators
    await page.goto('/dev/perf-calendar');
    const mobilePerf = page.locator('[data-testid="mobile-performance"]');
    
    if (await mobilePerf.isVisible()) {
      const isMobile = await mobilePerf.getAttribute('data-is-mobile');
      expect(isMobile).toBe('true');
    }
  });

  test('should optimize rendering during animations', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Trigger animation that should be optimized
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Animation test event');
    
    // Measure frame timing during animation
    const animationMetrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        let frames: number[] = [];
        let startTime = performance.now();
        
        function measureFrame() {
          const currentTime = performance.now();
          frames.push(currentTime);
          
          if (currentTime - startTime < 1000) { // 1 second
            requestAnimationFrame(measureFrame);
          } else {
            // Calculate frame intervals
            const intervals = [];
            for (let i = 1; i < frames.length; i++) {
              intervals.push(frames[i] - frames[i - 1]);
            }
            
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const maxInterval = Math.max(...intervals);
            
            resolve({ avgInterval, maxInterval, frameCount: frames.length });
          }
        }
        
        requestAnimationFrame(measureFrame);
      });
    });
    
    await quickAdd.press('Enter');
    await page.waitForTimeout(1000);
    
    const metrics = animationMetrics as { avgInterval: number; maxInterval: number; frameCount: number };
    
    // Average frame interval should be close to 16.67ms (60 FPS)
    expect(metrics.avgInterval).toBeLessThan(20); // Allow some variance
    
    // No frame should take longer than 33ms (30 FPS minimum)
    expect(metrics.maxInterval).toBeLessThan(33);
  });

  test('should handle concurrent operations efficiently', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Start multiple concurrent operations
    const operations = [];
    const quickAdd = page.locator('[data-testid="quick-add"]');
    
    const startTime = performance.now();
    
    // Create multiple events rapidly
    for (let i = 0; i < 10; i++) {
      operations.push(
        (async () => {
          await quickAdd.fill(`Concurrent event ${i + 1}`);
          await quickAdd.press('Enter');
          await page.waitForTimeout(10);
        })()
      );
    }
    
    // Wait for all operations to complete
    await Promise.all(operations);
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // Should handle concurrent operations efficiently
    expect(totalTime).toBeLessThan(5000); // 5 seconds max
    
    // Verify all events were created
    const events = await page.locator('[data-testid="calendar-event"]').count();
    expect(events).toBeGreaterThanOrEqual(10);
    
    // UI should remain responsive
    const calendar = page.locator('[data-testid="calendar-view"]');
    await expect(calendar).toBeVisible();
    
    // Test interaction responsiveness
    await calendar.click();
    await page.waitForTimeout(100);
    // Should not freeze or become unresponsive
  });

  test('should maintain performance with background sync', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Simulate background sync activity
    const quickAdd = page.locator('[data-testid="quick-add"]');
    
    // Create event that should trigger sync
    await quickAdd.fill('Background sync test');
    await quickAdd.press('Enter');
    
    // Monitor performance during sync
    const syncPerformance = await page.evaluate(() => {
      return new Promise((resolve) => {
        let frameCount = 0;
        let longFrames = 0;
        const startTime = performance.now();
        
        function checkFrame() {
          const frameTime = performance.now();
          frameCount++;
          
          // Check for long frames (> 16.67ms)
          if (frameTime - (startTime + frameCount * 16.67) > 5) {
            longFrames++;
          }
          
          if (frameTime - startTime < 2000) { // 2 seconds
            requestAnimationFrame(checkFrame);
          } else {
            resolve({ frameCount, longFrames, duration: frameTime - startTime });
          }
        }
        
        requestAnimationFrame(checkFrame);
      });
    });
    
    const metrics = syncPerformance as { frameCount: number; longFrames: number; duration: number };
    
    // Should maintain smooth framerate even during sync
    const longFramePercentage = (metrics.longFrames / metrics.frameCount) * 100;
    expect(longFramePercentage).toBeLessThan(10); // Less than 10% long frames
  });
});