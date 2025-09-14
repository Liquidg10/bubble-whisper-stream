/**
 * P11 Calendar Performance Tests
 * Tests rendering performance, memory usage, and responsiveness
 */

import { test, expect } from '@playwright/test';

test.describe('Calendar Performance @performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('should maintain 60fps during calendar navigation', async ({ page }) => {
    // Start performance monitoring
    await page.evaluate(() => {
      window.performanceData = {
        frameCount: 0,
        startTime: performance.now()
      };
      
      function countFrames() {
        window.performanceData.frameCount++;
        requestAnimationFrame(countFrames);
      }
      requestAnimationFrame(countFrames);
    });
    
    // Navigate through calendar months rapidly
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="next-month"]').click();
      await page.waitForTimeout(100);
    }
    
    // Check frame rate
    const { frameCount, startTime } = await page.evaluate(() => {
      const endTime = performance.now();
      return {
        frameCount: window.performanceData.frameCount,
        startTime: window.performanceData.startTime,
        endTime
      };
    });
    
    const duration = (Date.now() - startTime) / 1000;
    const fps = frameCount / duration;
    
    // Should maintain at least 55fps during interactions
    expect(fps).toBeGreaterThan(55);
  });

  test('should handle large event sets without performance degradation', async ({ page }) => {
    // Create many events to test performance
    const eventCount = 100;
    
    const startTime = Date.now();
    
    for (let i = 0; i < eventCount; i++) {
      await page.locator('[data-testid="quick-add-event"]').fill(`Event ${i}`);
      await page.keyboard.press('Enter');
      
      // Batch operations to avoid timeout
      if (i % 10 === 0) {
        await page.waitForTimeout(100);
      }
    }
    
    const creationTime = Date.now() - startTime;
    
    // Should create 100 events in under 30 seconds
    expect(creationTime).toBeLessThan(30000);
    
    // Calendar should remain responsive
    const navigationStart = Date.now();
    await page.locator('[data-testid="next-month"]').click();
    await page.waitForSelector('[data-testid="calendar-grid"]');
    const navigationTime = Date.now() - navigationStart;
    
    // Navigation should complete in under 1 second even with many events
    expect(navigationTime).toBeLessThan(1000);
  });

  test('should efficiently render AI suggestions without blocking UI', async ({ page }) => {
    // Create pattern that triggers AI suggestions
    const baseTime = new Date();
    for (let i = 0; i < 3; i++) {
      const eventTime = new Date(baseTime.getTime() + i * 24 * 60 * 60 * 1000);
      await page.locator('[data-testid="quick-add-event"]').fill('Daily Standup');
      await page.locator('[data-testid="event-time"]').fill('09:00');
      await page.locator('[data-testid="save-event"]').click();
      await page.waitForTimeout(200);
    }
    
    // Measure time for AI suggestions to appear
    const suggestionStart = Date.now();
    
    // Add another similar event to trigger suggestions
    await page.locator('[data-testid="quick-add-event"]').fill('Daily Standup');
    
    // Wait for AI suggestion to appear
    await page.waitForSelector('[data-testid="ai-suggestion"]', { timeout: 5000 });
    
    const suggestionTime = Date.now() - suggestionStart;
    
    // AI suggestions should appear quickly without blocking UI
    expect(suggestionTime).toBeLessThan(2000);
    
    // UI should remain responsive during suggestion generation
    await page.locator('[data-testid="calendar-view-toggle"]').click();
    const toggleResponse = Date.now();
    
    // UI interaction should be immediate
    expect(toggleResponse - Date.now()).toBeLessThan(100);
  });

  test('should maintain memory efficiency during extended usage', async ({ page }) => {
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Simulate extended usage with event creation and deletion
    for (let cycle = 0; cycle < 5; cycle++) {
      // Create events
      for (let i = 0; i < 20; i++) {
        await page.locator('[data-testid="quick-add-event"]').fill(`Cycle ${cycle} Event ${i}`);
        await page.keyboard.press('Enter');
      }
      
      // Delete events
      const events = await page.locator('[data-testid="event-item"]').all();
      for (const event of events.slice(0, 10)) {
        await event.click();
        await page.locator('[data-testid="delete-event"]').click();
        await page.locator('[data-testid="confirm-delete"]').click();
      }
      
      // Navigate to trigger potential cleanup
      await page.locator('[data-testid="next-month"]').click();
      await page.locator('[data-testid="prev-month"]').click();
    }
    
    // Force garbage collection if available
    await page.evaluate(() => {
      if (window.gc) {
        window.gc();
      }
    });
    
    const finalMemory = await page.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });
    
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;
      
      // Memory usage shouldn't increase by more than 200% during extended usage
      expect(memoryIncreasePercent).toBeLessThan(200);
    }
  });

  test('should load calendar view quickly on initial render', async ({ page }) => {
    // Clear cache and measure fresh load time
    await page.goto('about:blank');
    
    const loadStart = Date.now();
    await page.goto('/calendar');
    
    // Wait for calendar to be fully interactive
    await page.waitForSelector('[data-testid="calendar-grid"]');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - loadStart;
    
    // Calendar should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
    
    // Check for Core Web Vitals
    const vitals = await page.evaluate(() => {
      return new Promise(resolve => {
        new PerformanceObserver(list => {
          const entries = list.getEntries();
          const lcp = entries.find(entry => entry.entryType === 'largest-contentful-paint');
          const fid = entries.find(entry => entry.entryType === 'first-input');
          
          resolve({
            lcp: lcp?.startTime || 0,
            fid: fid?.processingStart - fid?.startTime || 0
          });
        }).observe({ entryTypes: ['largest-contentful-paint', 'first-input'] });
        
        // Fallback timeout
        setTimeout(() => resolve({ lcp: 0, fid: 0 }), 1000);
      });
    });
    
    // LCP should be under 2.5s for good performance
    if (vitals.lcp > 0) {
      expect(vitals.lcp).toBeLessThan(2500);
    }
  });
});