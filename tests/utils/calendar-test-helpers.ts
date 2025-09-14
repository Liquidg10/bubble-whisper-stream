/**
 * Calendar Test Utilities
 * Helper functions for calendar-related testing
 */

import { Page, Locator, expect } from '@playwright/test';

export interface CalendarTestEvent {
  title: string;
  startTime?: string;
  endTime?: string;
  date?: string;
}

/**
 * Helper to create calendar events for testing
 */
export async function createCalendarEvent(
  page: Page, 
  event: CalendarTestEvent
): Promise<void> {
  const quickAdd = page.locator('[data-testid="quick-add"]');
  
  let eventText = event.title;
  if (event.startTime || event.endTime) {
    eventText += ` ${event.startTime || ''}`;
    if (event.endTime) {
      eventText += `-${event.endTime}`;
    }
  }
  if (event.date) {
    eventText += ` ${event.date}`;
  }
  
  await quickAdd.fill(eventText);
  await quickAdd.press('Enter');
  await page.waitForTimeout(300); // Allow time for event creation
}

/**
 * Helper to create multiple events for stress testing
 */
export async function createMultipleEvents(
  page: Page, 
  count: number, 
  prefix: string = 'Test Event'
): Promise<void> {
  const quickAdd = page.locator('[data-testid="quick-add"]');
  
  for (let i = 0; i < count; i++) {
    await quickAdd.fill(`${prefix} ${i + 1}`);
    await quickAdd.press('Enter');
    
    // Brief pause to prevent overwhelming the system
    if (i % 5 === 0) {
      await page.waitForTimeout(100);
    }
  }
}

/**
 * Helper to check if calendar is in a specific view
 */
export async function expectCalendarView(
  page: Page, 
  viewType: 'month' | 'week' | 'day' | 'list'
): Promise<void> {
  const calendarView = page.locator(`[data-testid="calendar-${viewType}"]`);
  await expect(calendarView).toBeVisible();
}

/**
 * Helper to navigate calendar months
 */
export async function navigateCalendarMonth(
  page: Page, 
  direction: 'next' | 'previous'
): Promise<void> {
  const navButton = page.locator(`[data-testid="${direction === 'next' ? 'next-month' : 'prev-month'}"]`);
  
  if (await navButton.isVisible()) {
    await navButton.click();
  } else {
    // Fallback to keyboard navigation
    const calendar = page.locator('[data-testid="calendar-view"]');
    await calendar.focus();
    await page.keyboard.press(direction === 'next' ? 'ArrowRight' : 'ArrowLeft');
  }
  
  await page.waitForTimeout(300); // Allow time for navigation
}

/**
 * Helper to check calendar event exists
 */
export async function expectEventExists(
  page: Page, 
  eventTitle: string
): Promise<Locator> {
  const event = page.locator(`[data-testid="calendar-event"]`, { hasText: eventTitle });
  await expect(event).toBeVisible();
  return event;
}

/**
 * Helper to measure calendar performance
 */
export async function measureCalendarFPS(
  page: Page, 
  durationMs: number = 2000
): Promise<{ fps: number; frameCount: number }> {
  const result = await page.evaluate((duration) => {
    return new Promise<{ fps: number; frameCount: number }>((resolve) => {
      let frameCount = 0;
      const startTime = performance.now();
      
      function countFrames() {
        frameCount++;
        
        if (performance.now() - startTime < duration) {
          requestAnimationFrame(countFrames);
        } else {
          const fps = frameCount / (duration / 1000);
          resolve({ fps, frameCount });
        }
      }
      
      requestAnimationFrame(countFrames);
    });
  }, durationMs);
  
  return result;
}

/**
 * Helper to check for calendar accessibility violations
 */
export async function checkCalendarAccessibility(page: Page): Promise<void> {
  // Check for proper ARIA roles
  const calendar = page.locator('[role="grid"], [role="application"]').first();
  await expect(calendar).toBeVisible();
  
  // Check for keyboard navigation support
  await calendar.focus();
  await page.keyboard.press('Tab');
  const focusedElement = page.locator(':focus');
  await expect(focusedElement).toBeVisible();
  
  // Check for proper labeling
  const labeledElements = page.locator('[aria-label], [aria-labelledby]');
  const count = await labeledElements.count();
  expect(count).toBeGreaterThan(0);
}

/**
 * Helper to simulate calendar gestures on mobile
 */
export async function simulateCalendarGesture(
  page: Page, 
  gestureType: 'pinch' | 'pan' | 'tap' | 'longpress',
  target?: Locator
): Promise<void> {
  const element = target || page.locator('[data-testid="calendar-view"]');
  
  switch (gestureType) {
    case 'pinch':
      await element.dispatchEvent('touchstart', {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 200 }
        ]
      });
      
      await element.dispatchEvent('touchmove', {
        touches: [
          { clientX: 80, clientY: 80 },
          { clientX: 220, clientY: 220 }
        ]
      });
      
      await element.dispatchEvent('touchend', {});
      break;
      
    case 'pan':
      await element.dispatchEvent('touchstart', {
        touches: [{ clientX: 150, clientY: 150 }]
      });
      
      await element.dispatchEvent('touchmove', {
        touches: [{ clientX: 200, clientY: 150 }]
      });
      
      await element.dispatchEvent('touchend', {});
      break;
      
    case 'tap':
      await element.click();
      break;
      
    case 'longpress':
      await element.dispatchEvent('touchstart', {
        touches: [{ clientX: 150, clientY: 150 }]
      });
      
      await page.waitForTimeout(600); // Long press duration
      
      await element.dispatchEvent('touchend', {});
      break;
  }
  
  await page.waitForTimeout(200); // Allow gesture to complete
}

/**
 * Helper to check calendar stress indicators
 */
export async function expectStressIndicator(
  page: Page, 
  shouldBeVisible: boolean = true
): Promise<void> {
  const stressIndicator = page.locator('[data-testid="stress-indicator"], [class*="stress"], [aria-label*="busy"]');
  
  if (shouldBeVisible) {
    await expect(stressIndicator.first()).toBeVisible({ timeout: 3000 });
  } else {
    await expect(stressIndicator.first()).not.toBeVisible({ timeout: 1000 });
  }
}

/**
 * Helper to check AI suggestions in calendar
 */
export async function checkAISuggestions(page: Page): Promise<boolean> {
  const suggestions = page.locator('[data-testid="ai-suggestion"], [class*="suggestion"]');
  return await suggestions.first().isVisible({ timeout: 2000 });
}

/**
 * Helper to trigger conflict resolution scenario
 */
export async function createConflictScenario(page: Page): Promise<void> {
  // Create overlapping events
  await createCalendarEvent(page, {
    title: 'First meeting',
    startTime: '2pm',
    endTime: '3pm'
  });
  
  await page.waitForTimeout(300);
  
  await createCalendarEvent(page, {
    title: 'Conflicting meeting', 
    startTime: '2:30pm',
    endTime: '3:30pm'
  });
}

/**
 * Helper to check conflict resolution UI
 */
export async function expectConflictResolver(page: Page): Promise<Locator> {
  const resolver = page.locator('[data-testid="conflict-resolver"], [role="dialog"]');
  await expect(resolver).toBeVisible({ timeout: 2000 });
  return resolver;
}

/**
 * Helper to verify calendar performance metrics in dev dashboard
 */
export async function checkPerformanceMetrics(page: Page): Promise<void> {
  await page.goto('/dev/perf-calendar');
  await page.waitForSelector('[data-testid="calendar-performance"]');
  
  // Check for key performance indicators
  const fpsDisplay = page.locator('[data-testid="current-fps"]');
  const lodLevel = page.locator('[data-testid="lod-level"]');
  const memoryUsage = page.locator('[data-testid="memory-usage"]');
  
  // At least one metric should be visible
  const metricsVisible = await Promise.all([
    fpsDisplay.isVisible(),
    lodLevel.isVisible(), 
    memoryUsage.isVisible()
  ]);
  
  expect(metricsVisible.some(visible => visible)).toBe(true);
}