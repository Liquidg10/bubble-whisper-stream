/**
 * A11Y P6: Calendar-Specific Accessibility
 * Tests calendar ARIA patterns, keyboard navigation, and screen reader support
 */

import { test, expect } from '@playwright/test';

test.describe('A11Y P6: Calendar Accessibility @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have proper calendar ARIA structure', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Check calendar container has proper role
    const calendar = page.locator('[data-testid="calendar-view"], [role="grid"]').first();
    await expect(calendar).toHaveAttribute('role', 'grid');
    
    // Check for proper labeling
    const calendarLabel = page.locator('[aria-label*="calendar"], [aria-labelledby]').first();
    await expect(calendarLabel).toBeVisible();
    
    // Verify calendar cells have proper structure
    const calendarCells = await page.locator('[role="gridcell"]').all();
    expect(calendarCells.length).toBeGreaterThan(0);
    
    for (const cell of calendarCells.slice(0, 5)) {
      await expect(cell).toHaveAttribute('role', 'gridcell');
    }
  });

  test('should support keyboard navigation in calendar grid', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Focus calendar
    const calendar = page.locator('[role="grid"]').first();
    await calendar.focus();
    
    // Test arrow key navigation
    await page.keyboard.press('ArrowRight');
    let focusedCell = page.locator(':focus');
    await expect(focusedCell).toBeVisible();
    
    await page.keyboard.press('ArrowDown');
    focusedCell = page.locator(':focus');
    await expect(focusedCell).toBeVisible();
    
    await page.keyboard.press('ArrowLeft');
    focusedCell = page.locator(':focus');
    await expect(focusedCell).toBeVisible();
    
    await page.keyboard.press('ArrowUp');
    focusedCell = page.locator(':focus');
    await expect(focusedCell).toBeVisible();
  });

  test('should have accessible event creation', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Test quick add accessibility
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await expect(quickAdd).toHaveAttribute('aria-label');
    await expect(quickAdd).toBeVisible();
    
    // Test keyboard event creation
    await quickAdd.focus();
    await quickAdd.fill('Accessible event test');
    await page.keyboard.press('Enter');
    
    // Verify event appears with proper accessibility
    const newEvent = page.locator('[data-testid="calendar-event"]').last();
    await expect(newEvent).toBeVisible();
    await expect(newEvent).toHaveAttribute('role', 'button');
    await expect(newEvent).toHaveAttribute('aria-label');
  });

  test('should have proper focus indicators for calendar elements', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Test calendar navigation focus
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    
    const styles = await focusedElement.evaluate(el => {
      const computed = getComputedStyle(el);
      return {
        outline: computed.outline,
        outlineWidth: computed.outlineWidth,
        boxShadow: computed.boxShadow
      };
    });
    
    // Should have visible focus indicator
    expect(
      styles.outline !== 'none' || 
      styles.outlineWidth !== '0px' || 
      styles.boxShadow !== 'none'
    ).toBe(true);
  });

  test('should support screen reader announcements for calendar changes', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Check for live regions
    const liveRegion = page.locator('[aria-live], [aria-atomic]').first();
    
    if (await liveRegion.isVisible()) {
      await expect(liveRegion).toHaveAttribute('aria-live');
    }
    
    // Create event and check for announcements
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Screen reader test event');
    await quickAdd.press('Enter');
    
    // Look for success announcements
    const announcements = page.locator('[role="status"], [aria-live="polite"]');
    if (await announcements.first().isVisible({ timeout: 2000 })) {
      const announcementText = await announcements.first().textContent();
      expect(announcementText).toBeTruthy();
    }
  });

  test('should have accessible time picker controls', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Try to open event creation dialog
    const calendar = page.locator('[role="grid"]').first();
    await calendar.click();
    
    // Look for time picker controls
    const timePicker = page.locator('[data-testid="time-picker"], [role="spinbutton"]');
    
    if (await timePicker.first().isVisible({ timeout: 2000 })) {
      // Test keyboard time selection
      await timePicker.first().focus();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowDown');
      
      // Verify proper labeling
      await expect(timePicker.first()).toHaveAttribute('aria-label');
    }
  });

  test('should handle high contrast mode properly', async ({ page }) => {
    // Simulate high contrast mode
    await page.addStyleTag({
      content: `
        @media (prefers-contrast: high) {
          * {
            background: white !important;
            color: black !important;
            border-color: black !important;
          }
        }
      `
    });
    
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Verify elements are still visible and accessible
    const calendarEvents = await page.locator('[data-testid="calendar-event"]').all();
    
    for (const event of calendarEvents.slice(0, 3)) {
      await expect(event).toBeVisible();
      
      // Check contrast is sufficient
      const styles = await event.evaluate(el => {
        const computed = getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor
        };
      });
      
      // In high contrast, should have defined colors
      expect(styles.color).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('should support reduced motion in calendar animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Create event to trigger animations
    const quickAdd = page.locator('[data-testid="quick-add"]');
    await quickAdd.fill('Reduced motion test');
    await quickAdd.press('Enter');
    
    // Check that calendar animations respect reduced motion
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

  test('should have accessible calendar month navigation', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForSelector('[data-testid="calendar-view"]');
    
    // Find month navigation buttons
    const prevMonth = page.locator('[data-testid="prev-month"], [aria-label*="previous month"]');
    const nextMonth = page.locator('[data-testid="next-month"], [aria-label*="next month"]');
    
    if (await prevMonth.isVisible()) {
      await expect(prevMonth).toHaveAttribute('aria-label');
      await expect(prevMonth).toHaveAttribute('role', 'button');
      
      // Test keyboard activation
      await prevMonth.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
    
    if (await nextMonth.isVisible()) {
      await expect(nextMonth).toHaveAttribute('aria-label');
      await expect(nextMonth).toHaveAttribute('role', 'button');
      
      // Test keyboard activation
      await nextMonth.focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
  });
});