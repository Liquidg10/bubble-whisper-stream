/**
 * P18 - Assistant Cohesion Testing
 * Verifies no persona names leak to UI and maintains single assistant voice
 */

import { test, expect } from '@playwright/test';

test.describe('P18: Assistant Cohesion @cohesion', () => {
  const PERSONA_NAMES = ['Friend', 'Coach', 'Scientist', 'Future You'];
  
  test('should not expose persona names in UI text', async ({ page }) => {
    const views = ['/', '/list', '/kanban', '/matrix', '/bubble'];
    
    for (const view of views) {
      await page.goto(view);
      
      // Get all visible text content
      const textElements = await page.locator('text=*').all();
      
      for (const element of textElements) {
        const text = await element.textContent();
        if (text) {
          for (const persona of PERSONA_NAMES) {
            expect(text).not.toContain(persona);
            expect(text).not.toContain(persona.toLowerCase());
            expect(text).not.toContain(persona.toUpperCase());
          }
        }
      }
    }
  });
  
  test('should not expose persona switching patterns', async ({ page }) => {
    await page.goto('/');
    
    // Trigger various actions that might show AI suggestions
    await page.locator('[data-testid="quick-add"]').fill('Complex project task');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Wait for potential AI suggestions
    await page.waitForTimeout(2000);
    
    // Check for persona switching patterns in any toast or popup
    const toasts = page.locator('[data-sonner-toast]');
    const toastCount = await toasts.count();
    
    for (let i = 0; i < toastCount; i++) {
      const toastText = await toasts.nth(i).textContent();
      if (toastText) {
        expect(toastText).not.toMatch(/speaking as a/i);
        expect(toastText).not.toMatch(/your (friend|coach|scientist)/i);
        expect(toastText).not.toMatch(/switching to/i);
        expect(toastText).not.toMatch(/as your (friend|coach|scientist)/i);
      }
    }
  });
  
  test('should maintain consistent assistant voice in celebrations', async ({ page }) => {
    await page.goto('/list');
    
    // Complete several tasks to trigger celebrations
    await page.locator('[data-testid="quick-add"]').fill('Task 1');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    await page.locator('[data-testid="quick-add"]').fill('Task 2');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    await page.locator('[data-testid="quick-add"]').fill('Task 3');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Mark tasks as complete
    const checkboxes = page.locator('[data-testid="task-checkbox"]');
    const count = await checkboxes.count();
    
    for (let i = 0; i < Math.min(count, 3); i++) {
      await checkboxes.nth(i).click();
      await page.waitForTimeout(1000); // Allow for celebration triggers
    }
    
    // Check any celebration toasts
    const celebrationToasts = page.locator('[class*="celebration-toast"]');
    const celebrationCount = await celebrationToasts.count();
    
    for (let i = 0; i < celebrationCount; i++) {
      const toastText = await celebrationToasts.nth(i).textContent();
      if (toastText) {
        // Should not contain persona names
        for (const persona of PERSONA_NAMES) {
          expect(toastText).not.toContain(persona);
        }
        
        // Should use neutral encouraging language
        expect(toastText).not.toMatch(/your friend says/i);
        expect(toastText).not.toMatch(/coach mode/i);
        expect(toastText).not.toMatch(/scientist analysis/i);
      }
    }
  });
  
  test('should use consistent voice in planning mode', async ({ page }) => {
    await page.goto('/list');
    
    // Add a task that might trigger planning suggestions
    await page.locator('[data-testid="quick-add"]').fill('Big complex project with many steps');
    await page.locator('[data-testid="quick-add"]').press('Enter');
    
    // Click on the task to open details
    await page.locator('[data-testid="task-item"]').first().click();
    
    // Look for planning mode suggestions
    const planningElements = page.locator('[data-testid*="planning"], [class*="planning"]');
    const planningCount = await planningElements.count();
    
    for (let i = 0; i < planningCount; i++) {
      const planningText = await planningElements.nth(i).textContent();
      if (planningText) {
        // Should not mention personas
        for (const persona of PERSONA_NAMES) {
          expect(planningText).not.toContain(persona);
        }
        
        // Should use consistent assistant voice
        expect(planningText).not.toMatch(/let me switch/i);
        expect(planningText).not.toMatch(/speaking as/i);
      }
    }
  });
});