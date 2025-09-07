/**
 * CBT Integration Tests - End-to-end pipeline validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processCBTMessage, recordCBTEngagement, getCBTStats, deleteCBTData } from '../index';
import type { CBTPolicyContext } from '../types';

describe('CBT Integration Tests', () => {
  const userId = 'test-user-123';
  
  const defaultUserSettings: CBTPolicyContext['userSettings'] = {
    assistLevel: 'subtle',
    privacyLayer: 'context',
    autoLogMode: 'ask',
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    topicExclusions: [],
    neverInterveneOn: []
  };

  beforeEach(() => {
    // Clear all localStorage data before each test
    localStorage.clear();
  });

  describe('End-to-End Processing', () => {
    it('should process message with distortion and create intervention', async () => {
      const message = "I always mess everything up. Nothing ever goes right for me.";
      
      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      
      // Should detect distortions
      expect(result.annotation.distortions.length).toBeGreaterThan(0);
      expect(result.annotation.distortions.some(d => d.type === 'all_or_nothing')).toBe(true);
      
      // Should decide to intervene
      expect(result.decision.shouldIntervene).toBe(true);
      expect(result.decision.targetDistortions).toContain('all_or_nothing');
      
      // Should create appropriate action
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toMatch(/chip|ack|question/);
      
      // Should create trace
      expect(result.traceId).toBeDefined();
    });

    it('should not intervene for neutral messages', async () => {
      const message = "I went to the store today and bought some groceries.";
      
      const result = await processCBTMessage(message, 'msg-2', userId, {
        userSettings: defaultUserSettings
      });
      
      expect(result.annotation.distortions).toHaveLength(0);
      expect(result.decision.shouldIntervene).toBe(false);
      expect(result.action).toBeNull();
      expect(result.traceId).toBeUndefined();
    });

    it('should handle crisis messages with priority', async () => {
      const message = "I can't take this anymore. I want to hurt myself.";
      
      const result = await processCBTMessage(message, 'msg-3', userId, {
        userSettings: defaultUserSettings
      });
      
      expect(result.annotation.crisisFlags.length).toBeGreaterThan(0);
      expect(result.decision.priority).toBe('crisis');
      expect(result.action!.type).toBe('crisis_support');
    });
  });

  describe('Fatigue Management Integration', () => {
    it('should respect daily intervention limits', async () => {
      const message = "I always fail at everything I try.";
      
      // First few interventions should work
      for (let i = 0; i < 3; i++) {
        const result = await processCBTMessage(message, `msg-${i}`, userId, {
          userSettings: defaultUserSettings
        });
        expect(result.decision.shouldIntervene).toBe(true);
      }
      
      // Fourth intervention should be blocked by daily limit (subtle mode = 3/day)
      const blockedResult = await processCBTMessage(message, 'msg-4', userId, {
        userSettings: defaultUserSettings
      });
      
      expect(blockedResult.decision.shouldIntervene).toBe(false);
      expect(blockedResult.decision.reason).toBe('Daily intervention limit reached');
    });

    it('should enforce cooldown periods between interventions', async () => {
      const message = "Everything is going to be a disaster.";
      
      // First intervention
      const first = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      expect(first.decision.shouldIntervene).toBe(true);
      
      // Immediate second intervention should be blocked
      const second = await processCBTMessage(message, 'msg-2', userId, {
        userSettings: defaultUserSettings
      });
      expect(second.decision.shouldIntervene).toBe(false);
      expect(second.decision.reason).toBe('Recent intervention cooldown active');
    });
  });

  describe('User Settings Integration', () => {
    it('should respect disabled assistance setting', async () => {
      const message = "I never do anything right. Everything is terrible.";
      const disabledSettings = { ...defaultUserSettings, assistLevel: 'off' as const };
      
      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: disabledSettings
      });
      
      expect(result.decision.shouldIntervene).toBe(false);
      expect(result.decision.reason).toBe('User has disabled CBT assistance');
    });

    it('should respect topic exclusions', async () => {
      const message = "I always mess up work projects. Nothing goes right.";
      const excludedSettings = { 
        ...defaultUserSettings, 
        topicExclusions: ['work', 'projects'] 
      };
      
      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: excludedSettings
      });
      
      expect(result.decision.shouldIntervene).toBe(false);
      expect(result.decision.reason).toBe('Message contains excluded topic');
    });

    it('should escalate intervention level for standard assist', async () => {
      const message = "This is going to be a complete catastrophe.";
      const standardSettings = { ...defaultUserSettings, assistLevel: 'standard' as const };
      
      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: standardSettings
      });
      
      expect(result.decision.shouldIntervene).toBe(true);
      expect(result.decision.interventionType).toBe('direct');
    });
  });

  describe('Engagement Tracking', () => {
    it('should record user engagement with interventions', async () => {
      const message = "I always mess everything up.";
      
      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      
      expect(result.traceId).toBeDefined();
      
      // Record positive engagement
      const recorded = await recordCBTEngagement(
        result.traceId!,
        true,
        4,
        "That was helpful, thank you"
      );
      
      expect(recorded).toBe(true);
    });

    it('should track statistics over time', async () => {
      // Create multiple interactions
      const messages = [
        "I always fail at everything.",
        "This is going to be terrible.",
        "Nobody likes me."
      ];
      
      for (let i = 0; i < messages.length; i++) {
        const result = await processCBTMessage(messages[i], `msg-${i}`, userId, {
          userSettings: defaultUserSettings
        });
        
        if (result.traceId) {
          await recordCBTEngagement(result.traceId, true, 3 + i);
        }
      }
      
      const stats = getCBTStats(userId);
      
      expect(stats.totalTraces).toBeGreaterThan(0);
      expect(stats.interventions).toBeGreaterThan(0);
      expect(stats.averageHelpfulness).toBeGreaterThan(0);
      expect(stats.distortionBreakdown).toBeDefined();
    });
  });

  describe('Privacy and Data Management', () => {
    it('should allow complete data deletion', async () => {
      // Create some data
      await processCBTMessage("I always fail.", 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      
      // Verify data exists
      const statsBefore = getCBTStats(userId);
      expect(statsBefore.totalTraces).toBeGreaterThan(0);
      
      // Delete all data
      const deletedCount = await deleteCBTData(userId);
      expect(deletedCount).toBeGreaterThan(0);
      
      // Verify data is gone
      const statsAfter = getCBTStats(userId);
      expect(statsAfter.totalTraces).toBe(0);
    });

    it('should isolate data between users', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      
      // Create data for both users
      await processCBTMessage("I always fail.", 'msg-1', user1, {
        userSettings: defaultUserSettings
      });
      
      await processCBTMessage("Everything is terrible.", 'msg-2', user2, {
        userSettings: defaultUserSettings
      });
      
      // Each user should only see their own data
      const stats1 = getCBTStats(user1);
      const stats2 = getCBTStats(user2);
      
      expect(stats1.totalTraces).toBe(1);
      expect(stats2.totalTraces).toBe(1);
      
      // Deleting one user's data shouldn't affect the other
      await deleteCBTData(user1);
      
      const stats1After = getCBTStats(user1);
      const stats2After = getCBTStats(user2);
      
      expect(stats1After.totalTraces).toBe(0);
      expect(stats2After.totalTraces).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed messages gracefully', async () => {
      const malformedMessage = "";
      
      const result = await processCBTMessage(malformedMessage, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      
      expect(result.annotation).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(result.annotation.distortions).toHaveLength(0);
    });

    it('should handle missing context gracefully', async () => {
      const message = "I always fail.";
      
      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: defaultUserSettings
        // No conversationContext provided
      });
      
      expect(result.annotation).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('should handle engagement recording for non-existent traces', async () => {
      const recorded = await recordCBTEngagement(
        'non-existent-trace-id',
        true,
        5
      );
      
      expect(recorded).toBe(false);
    });
  });
});