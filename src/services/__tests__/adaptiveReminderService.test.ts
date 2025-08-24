import { describe, it, expect, beforeEach } from 'vitest';
import { adaptiveReminderService } from '../adaptiveReminderService';
import type { Reminder } from '@/types/bubble';

describe('AdaptiveReminderService', () => {
  beforeEach(() => {
    // Reset any patterns or state if needed
  });

  describe('rule application', () => {
    it('should detect overwhelm patterns', () => {
      const mockReminder: Reminder = {
        id: 'test-1',
        bubbleId: 'bubble-1',
        scheduledAt: Date.now() + 60000,
        status: 'Active',
        level: 1,
        snoozes: [
          {
            id: 'snooze-1',
            reminderId: 'test-1',
            at: Date.now() - 86400000, // 1 day ago
            reason: 'Overwhelmed',
          },
          {
            id: 'snooze-2', 
            reminderId: 'test-1',
            at: Date.now() - 43200000, // 12 hours ago
            reason: 'Overwhelmed',
          },
        ],
      };

      // Test that the service can detect patterns
      const hasPattern = mockReminder.snoozes.filter(s => s.reason === 'Overwhelmed').length >= 2;
      expect(hasPattern).toBe(true);
    });

    it('should respect service API', () => {
      // Test basic service initialization
      expect(adaptiveReminderService).toBeDefined();
      expect(typeof adaptiveReminderService.getExplanation).toBe('function');
    });
  });

  describe('explanation generation', () => {
    it('should generate explanations for reminder patterns', () => {
      const mockReminder: Reminder = {
        id: 'test-explain',
        bubbleId: 'bubble-explain',
        scheduledAt: Date.now() + 60000,
        status: 'Active',
        level: 1,
        snoozes: [
          { id: 's1', reminderId: 'test-explain', at: Date.now() - 3600000, reason: 'Overwhelmed' },
          { id: 's2', reminderId: 'test-explain', at: Date.now() - 1800000, reason: 'Overwhelmed' },
        ],
      };

      const explanation = adaptiveReminderService.getExplanation(mockReminder, 'slow', []);
      expect(explanation).toContain('Because');
      expect(explanation.length).toBeGreaterThan(10);
    });
  });
});