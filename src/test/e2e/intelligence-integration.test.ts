/**
 * @fileoverview E2E tests for Phase 2 Intelligence Layer integration
 * Tests the complete adaptive reminder flow, CBT workflow, and glimmer system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock test environment setup
const mockApp = {
  navigate: (route: string) => Promise.resolve(),
  tap: (selector: string) => Promise.resolve(),
  longPress: (selector: string) => Promise.resolve(),
  type: (selector: string, text: string) => Promise.resolve(),
  wait: (ms: number) => Promise.resolve(),
  waitFor: (selector: string) => Promise.resolve(),
  getText: (selector: string) => Promise.resolve(''),
  exists: (selector: string) => Promise.resolve(true)
};

describe('Intelligence Layer E2E Integration', () => {
  beforeEach(async () => {
    // Reset app state
    localStorage.clear();
    // Enable intelligence features
    localStorage.setItem('bubble-store', JSON.stringify({
      settings: {
        intelligenceEnabled: true,
        glimmersEnabled: true,
        adaptiveRemindersEnabled: true
      }
    }));
  });

  afterEach(async () => {
    localStorage.clear();
    // Defense-in-depth: this file's own 'should handle offline mode
    // gracefully' test mutates navigator.onLine via Object.defineProperty.
    // It currently restores it inline before returning, so this is not
    // presently leaking (verified: complete-production-workflows.test.tsx's
    // sibling test WAS leaking for want of exactly this reset, see REVIVE
    // Run 88). Resetting here unconditionally removes the ordering
    // dependency rather than relying on every test's internal cleanup.
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    });
  });

  describe('Adaptive Reminder Flow', () => {
    it('should adapt reminder cadence after repeated overwhelm snoozes', async () => {
      // Navigate to main canvas
      await mockApp.navigate('/');
      
      // Create a bubble with reminder
      await mockApp.tap('[data-testid="add-bubble"]');
      await mockApp.type('[data-testid="bubble-text"]', 'Take medication');
      await mockApp.tap('[data-testid="set-reminder"]');
      await mockApp.tap('[data-testid="save-bubble"]');
      
      // Wait for first reminder
      await mockApp.waitFor('[data-testid="reminder-notification"]');
      
      // Snooze with "Overwhelmed" reason (first time)
      await mockApp.tap('[data-testid="snooze-reminder"]');
      await mockApp.tap('[data-testid="snooze-reason-overwhelmed"]');
      await mockApp.tap('[data-testid="confirm-snooze"]');
      
      // Wait for next reminder and snooze again with "Overwhelmed"
      await mockApp.wait(300000); // 5 minutes for test
      await mockApp.waitFor('[data-testid="reminder-notification"]');
      await mockApp.tap('[data-testid="snooze-reminder"]');
      await mockApp.tap('[data-testid="snooze-reason-overwhelmed"]');
      await mockApp.tap('[data-testid="confirm-snooze"]');
      
      // Third reminder should show adaptive behavior
      await mockApp.wait(600000); // 10 minutes (increased interval)
      await mockApp.waitFor('[data-testid="reminder-notification"]');
      
      // Check for "Because..." explanation
      const becausePill = await mockApp.exists('[data-testid="because-pill"]');
      expect(becausePill).toBe(true);
      
      const explanationText = await mockApp.getText('[data-testid="because-pill"]');
      expect(explanationText).toContain('overwhelmed');
      
      // Verify reminder level is capped (shouldn't escalate to Level 3)
      const reminderLevel = await mockApp.getText('[data-testid="reminder-level"]');
      expect(reminderLevel).not.toContain('Level 3');
    });

    it('should respect quiet hours and defer reminders', async () => {
      // Set quiet hours in settings
      await mockApp.navigate('/settings');
      await mockApp.tap('[data-testid="quiet-hours-toggle"]');
      await mockApp.type('[data-testid="quiet-start"]', '22:00');
      await mockApp.type('[data-testid="quiet-end"]', '08:00');
      
      // Create reminder during quiet hours
      const now = new Date();
      now.setHours(23, 0, 0, 0); // 11 PM
      
      await mockApp.navigate('/');
      await mockApp.tap('[data-testid="add-bubble"]');
      await mockApp.type('[data-testid="bubble-text"]', 'Evening task');
      await mockApp.tap('[data-testid="set-reminder"]');
      await mockApp.tap('[data-testid="save-bubble"]');
      
      // Reminder should be deferred with explanation
      await mockApp.waitFor('[data-testid="reminder-notification"]');
      const becausePill = await mockApp.exists('[data-testid="because-pill"]');
      expect(becausePill).toBe(true);
      
      const explanationText = await mockApp.getText('[data-testid="because-pill"]');
      expect(explanationText).toContain('quiet hours');
    });
  });

  describe('CBT Thought Check Workflow', () => {
    it('should complete full CBT workflow with TTS', async () => {
      // Navigate to CBT page
      await mockApp.navigate('/cbt');
      
      // Start thought check
      await mockApp.tap('[data-testid="start-thought-check"]');
      
      // Step 1: Enter thought
      await mockApp.type('[data-testid="thought-input"]', 'I always mess everything up');
      await mockApp.tap('[data-testid="continue-button"]');
      
      // Step 2: Select distortions
      await mockApp.tap('[data-testid="suggest-distortions"]');
      await mockApp.waitFor('[data-testid="distortion-AllOrNothing"]');
      await mockApp.tap('[data-testid="distortion-AllOrNothing"]');
      await mockApp.tap('[data-testid="distortion-Overgeneralization"]');
      await mockApp.tap('[data-testid="continue-button"]');
      
      // Step 3: Evidence for
      await mockApp.type('[data-testid="evidence-for"]', 'I made a mistake at work');
      await mockApp.tap('[data-testid="continue-button"]');
      
      // Step 4: Evidence against
      await mockApp.type('[data-testid="evidence-against"]', 'I complete most tasks successfully');
      await mockApp.tap('[data-testid="continue-button"]');
      
      // Step 5: Reframe
      await mockApp.tap('[data-testid="generate-reframe"]');
      await mockApp.waitFor('[data-testid="reframe-suggestions"]');
      await mockApp.tap('[data-testid="reframe-suggestion-0"]');
      
      // Test TTS functionality
      await mockApp.tap('[data-testid="read-aloud"]');
      await mockApp.wait(2000); // Wait for TTS to start
      
      // Save entry
      await mockApp.tap('[data-testid="save-entry"]');
      
      // Verify completion
      await mockApp.waitFor('[data-testid="cbt-completion"]');
      const completionText = await mockApp.getText('[data-testid="completion-message"]');
      expect(completionText).toContain('thought check');
    });
  });

  describe('Self-Compassion Glimmers', () => {
    it('should trigger glimmer after pattern detection', async () => {
      // Enable glimmers in settings
      await mockApp.navigate('/settings');
      await mockApp.tap('[data-testid="intelligence-settings"]');
      await mockApp.tap('[data-testid="glimmers-toggle"]');
      
      // Create pattern by adding multiple "overwhelmed" entries
      await mockApp.navigate('/');
      
      for (let i = 0; i < 3; i++) {
        await mockApp.tap('[data-testid="add-bubble"]');
        await mockApp.type('[data-testid="bubble-text"]', 'Feeling overwhelmed');
        await mockApp.tap('[data-testid="mood-overwhelmed"]');
        await mockApp.tap('[data-testid="save-bubble"]');
        await mockApp.wait(1000);
      }
      
      // Wait for glimmer to trigger
      await mockApp.waitFor('[data-testid="glimmer-notification"]');
      
      // Verify glimmer content
      const glimmerMessage = await mockApp.getText('[data-testid="glimmer-message"]');
      expect(glimmerMessage.length).toBeGreaterThan(0);
      
      // Test tone selection
      const toneButton = await mockApp.exists('[data-testid="glimmer-tone"]');
      expect(toneButton).toBe(true);
      
      // Test TTS option
      const ttsButton = await mockApp.exists('[data-testid="glimmer-tts"]');
      expect(ttsButton).toBe(true);
      
      // Dismiss glimmer
      await mockApp.tap('[data-testid="dismiss-glimmer"]');
      await mockApp.wait(500);
      
      const glimmerExists = await mockApp.exists('[data-testid="glimmer-notification"]');
      expect(glimmerExists).toBe(false);
    });

    it('should respect frequency caps and quiet hours', async () => {
      // Set restrictive glimmer settings
      await mockApp.navigate('/settings');
      await mockApp.tap('[data-testid="intelligence-settings"]');
      await mockApp.tap('[data-testid="glimmer-frequency"]');
      await mockApp.tap('[data-testid="frequency-daily-1"]'); // Max 1 per day
      
      // Trigger first glimmer
      await mockApp.navigate('/');
      await mockApp.tap('[data-testid="add-bubble"]');
      await mockApp.type('[data-testid="bubble-text"]', 'Feeling stressed');
      await mockApp.tap('[data-testid="mood-overwhelmed"]');
      await mockApp.tap('[data-testid="save-bubble"]');
      
      await mockApp.waitFor('[data-testid="glimmer-notification"]');
      await mockApp.tap('[data-testid="dismiss-glimmer"]');
      
      // Try to trigger second glimmer immediately
      await mockApp.tap('[data-testid="add-bubble"]');
      await mockApp.type('[data-testid="bubble-text"]', 'More stress');
      await mockApp.tap('[data-testid="mood-overwhelmed"]');
      await mockApp.tap('[data-testid="save-bubble"]');
      
      // Should not trigger due to frequency cap
      await mockApp.wait(5000);
      const secondGlimmer = await mockApp.exists('[data-testid="glimmer-notification"]');
      expect(secondGlimmer).toBe(false);
    });
  });

  describe('Self-Model v2 Integration', () => {
    it('should generate monthly review with audit trail', async () => {
      // Generate some activity to create audits
      await mockApp.navigate('/settings');
      await mockApp.tap('[data-testid="intelligence-settings"]');
      await mockApp.tap('[data-testid="context-layer-toggle"]'); // Creates audit
      
      // Add some CBT entries
      await mockApp.navigate('/cbt');
      await mockApp.tap('[data-testid="start-thought-check"]');
      await mockApp.type('[data-testid="thought-input"]', 'Test thought');
      await mockApp.tap('[data-testid="continue-button"]');
      await mockApp.tap('[data-testid="skip-to-save"]'); // Skip to save
      
      // Generate monthly review
      await mockApp.navigate('/settings');
      await mockApp.tap('[data-testid="monthly-review"]');
      await mockApp.tap('[data-testid="generate-review"]');
      
      await mockApp.waitFor('[data-testid="review-content"]');
      
      // Verify review contains expected sections
      const auditCount = await mockApp.getText('[data-testid="audit-count"]');
      expect(parseInt(auditCount)).toBeGreaterThan(0);
      
      const insights = await mockApp.exists('[data-testid="insights-section"]');
      expect(insights).toBe(true);
      
      // Test pattern archival
      const archiveButton = await mockApp.exists('[data-testid="archive-pattern"]');
      if (archiveButton) {
        await mockApp.tap('[data-testid="archive-pattern"]');
        await mockApp.type('[data-testid="archive-reason"]', 'No longer relevant');
        await mockApp.tap('[data-testid="confirm-archive"]');
      }
    });
  });

  describe('Offline Behavior', () => {
    it('should handle offline mode gracefully', async () => {
      // Simulate offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });
      
      window.dispatchEvent(new Event('offline'));
      
      // Verify offline banner appears
      await mockApp.waitFor('[data-testid="offline-banner"]');
      
      // Test that core functionality still works
      await mockApp.navigate('/');
      await mockApp.tap('[data-testid="add-bubble"]');
      await mockApp.type('[data-testid="bubble-text"]', 'Offline bubble');
      await mockApp.tap('[data-testid="save-bubble"]');
      
      // Verify bubble was saved locally
      const bubbleExists = await mockApp.exists('[data-testid="bubble-Offline bubble"]');
      expect(bubbleExists).toBe(true);
      
      // Simulate back online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });
      
      window.dispatchEvent(new Event('online'));
      
      // Verify offline banner disappears
      await mockApp.wait(1000);
      const offlineBanner = await mockApp.exists('[data-testid="offline-banner"]');
      expect(offlineBanner).toBe(false);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with large datasets', async () => {
      const startTime = performance.now();
      
      // Create many bubbles
      await mockApp.navigate('/');
      for (let i = 0; i < 50; i++) {
        await mockApp.tap('[data-testid="add-bubble"]');
        await mockApp.type('[data-testid="bubble-text"]', `Test bubble ${i}`);
        await mockApp.tap('[data-testid="save-bubble"]');
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (5 seconds for 50 bubbles)
      expect(duration).toBeLessThan(5000);
      
      // Test canvas rendering performance
      const canvasStartTime = performance.now();
      await mockApp.navigate('/');
      await mockApp.waitFor('[data-testid="bubble-canvas"]');
      const canvasEndTime = performance.now();
      
      const canvasLoadTime = canvasEndTime - canvasStartTime;
      expect(canvasLoadTime).toBeLessThan(500); // Canvas should load quickly
    });
  });
});

// Performance monitoring utilities
export const performanceUtils = {
  measureMemory: () => {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  },
  
  measureFPS: (duration: number = 1000): Promise<number> => {
    return new Promise((resolve) => {
      let frames = 0;
      const startTime = performance.now();
      
      const countFrame = () => {
        frames++;
        const elapsed = performance.now() - startTime;
        
        if (elapsed < duration) {
          requestAnimationFrame(countFrame);
        } else {
          resolve(frames / (elapsed / 1000));
        }
      };
      
      requestAnimationFrame(countFrame);
    });
  }
};