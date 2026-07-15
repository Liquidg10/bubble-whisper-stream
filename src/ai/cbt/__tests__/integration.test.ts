/**
 * CBT Integration Tests - End-to-end pipeline validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { processCBTMessage, confirmAndPersist, recordCBTEngagement, getCBTStats, deleteCBTData } from '../index';
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
      
      // Run 16 (observer.ts): annotate() sentinel returns null outright for messages
      // with no distortions, no crisis flags, and no strong/mixed sentiment -- an
      // intentional perf optimization to skip trace/policy work entirely on truly
      // neutral input. index.ts's processCBTMessage propagates that null straight
      // through (annotation: null, decision: null, action: null) rather than
      // fabricating an empty-but-non-null annotation. Every real caller (index.ts,
      // DevCBTObserver.tsx, cbtDevHarness.ts) already null-checks correctly -- this
      // test was the one place still asserting the pre-Run-16 contract.
      expect(result.annotation).toBeNull();
      expect(result.decision).toBeNull();
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
      // Item 6 (2026-07-03): daily limit is now 2/day (down from 3), and is
      // topic-scoped — different-topic messages on the same day don't cool each
      // other down, they just count against the shared daily cap. Three distinct
      // distortion topics here so the topic-cooldown rule doesn't also fire.
      const allOrNothingMsg = "I always fail at everything I try.";
      const mindReadingMsg = "They probably think I'm worthless.";
      const shouldStatementMsg = "I must be a better person by now.";

      const first = await processCBTMessage(allOrNothingMsg, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      expect(first.decision.shouldIntervene).toBe(true);

      const second = await processCBTMessage(mindReadingMsg, 'msg-2', userId, {
        userSettings: defaultUserSettings
      });
      expect(second.decision.shouldIntervene).toBe(true);

      // Third intervention (yet another topic) should be blocked by the daily limit (2/day)
      const blockedResult = await processCBTMessage(shouldStatementMsg, 'msg-3', userId, {
        userSettings: defaultUserSettings
      });

      expect(blockedResult.decision.shouldIntervene).toBe(false);
      expect(blockedResult.decision.reason).toBe('Daily intervention limit reached (2/day)');
    });

    it('should enforce cooldown periods between interventions', async () => {
      const message = "Everything is going to be a disaster.";

      // First intervention
      const first = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });
      expect(first.decision.shouldIntervene).toBe(true);

      // Item 6 (2026-07-03): the old blanket cross-topic 30min cooldown was removed;
      // an immediate repeat of the SAME topic is now blocked by the topic-scoped
      // 30min cooldown instead (a different topic would not be blocked here).
      const second = await processCBTMessage(message, 'msg-2', userId, {
        userSettings: defaultUserSettings
      });
      expect(second.decision.shouldIntervene).toBe(false);
      expect(second.decision.reason).toBe('Topic cooldown active (30min)');
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

    /**
     * NOT FIXED as part of the 2026-07-03 punch list (Item 5) — flagged for Mark, not
     * silently resolved. This test's expectation (assistLevel:'standard' -> interventionType
     * 'direct') directly contradicts policy-prompt3.test.ts's "Decision Simplification
     * (chip|none only)" suite, which is the current, non-skipped, deliberately-designed
     * spec from the 2026-07-01 consolidation and explicitly asserts the opposite:
     * "should never return silent, gentle, or direct intervention types" / "should only
     * return chip or none intervention types" (both passing on main today). CBTDecision's
     * interventionType is also typed as 'none' | 'chip' only — 'direct' isn't a valid value
     * in the current design at all. Implementing Item 5 literally (adding 'direct' and
     * assist-level branching) would break those two currently-passing tests. This needs
     * Mark's call: (A) restore assist-level branching and update/remove the two
     * policy-prompt3.test.ts tests that forbid it, or (B) keep the chip/none-only
     * simplification and retire this test the same way policy.test.ts / fatigue.test.ts /
     * observer.test.ts were already retired for the same kind of pre-simplification drift.
     */
    it.skip('should escalate intervention level for standard assist', async () => {
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
    // Item 4 (2026-07-03): defaultUserSettings uses autoLogMode: 'ask', which no longer
    // auto-persists (that was dead code before this fix — see Item 4 in the punch list).
    // These tests now simulate the user answering "yes" to the consent prompt via
    // confirmAndPersist(), which is what a real UI would call once the user responds.
    it('should record user engagement with interventions', async () => {
      const message = "I always mess everything up.";

      const result = await processCBTMessage(message, 'msg-1', userId, {
        userSettings: defaultUserSettings
      });

      expect(result.traceCandidate).toBeDefined();
      const traceId = await confirmAndPersist(result.traceCandidate!, true);
      expect(traceId).toBeDefined();

      // Record positive engagement
      const recorded = await recordCBTEngagement(
        traceId!,
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

        if (result.traceCandidate) {
          const traceId = await confirmAndPersist(result.traceCandidate, true);
          if (traceId) {
            await recordCBTEngagement(traceId, true, 3 + i);
          }
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

      // Create data for both users (Item 4: 'ask' mode requires confirming consent
      // before anything is persisted — see confirmAndPersist()).
      const result1 = await processCBTMessage("I always fail.", 'msg-1', user1, {
        userSettings: defaultUserSettings
      });
      await confirmAndPersist(result1.traceCandidate!, true);

      const result2 = await processCBTMessage("Everything is terrible.", 'msg-2', user2, {
        userSettings: defaultUserSettings
      });
      await confirmAndPersist(result2.traceCandidate!, true);

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
      
      // Run 16 sentinel (see note above): an empty string has no distortions, no
      // crisis flags, and no sentiment signal, so annotate() returns null and
      // processCBTMessage short-circuits to { annotation: null, decision: null,
      // action: null } rather than throwing. "Graceful" here means no throw / no
      // crash, not a populated-but-empty annotation.
      expect(result.annotation).toBeNull();
      expect(result.decision).toBeNull();
      expect(result.action).toBeNull();
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