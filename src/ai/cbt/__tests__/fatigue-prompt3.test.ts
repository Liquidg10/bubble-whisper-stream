/**
 * PROMPT 3 Fatigue Service Tests - Rate limits and cooldowns
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CBTFatigueService } from '../fatigue';
import type { CBTPolicyContext } from '../types';

// Test data factories
const createContext = (
  overrides: Partial<CBTPolicyContext> = {}
): CBTPolicyContext => ({
  userSettings: {
    assistLevel: 'standard',
    privacyLayer: 'context',
    autoLogMode: 'ask',
    quietHours: { enabled: false, start: '22:00', end: '08:00' },
    topicExclusions: [],
    neverInterveneOn: []
  },
  fatigueState: {
    globalInterventions: 0,
    topicCooldowns: {},
    lastIntervention: 0,
    dailyCount: 0,
    topicDeclines: {}
  },
  conversationContext: {
    messageCount: 5,
    averageSentiment: -0.3,
    recentTopics: ['work', 'stress'],
    timeSpan: 30
  },
  ...overrides
});

describe('PROMPT 3 Fatigue Service', () => {
  let fatigueService: CBTFatigueService;

  beforeEach(() => {
    fatigueService = new CBTFatigueService();
  });

  describe('Daily Limit (2/day max)', () => {
    test('should allow intervention when under daily limit', () => {
      const context = createContext({
        fatigueState: { ...createContext().fatigueState, dailyCount: 1 }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    test('should block intervention when daily limit reached', () => {
      const context = createContext({
        fatigueState: { ...createContext().fatigueState, dailyCount: 2 }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('daily_limit_prompt3');
      expect(result.cooldownMinutes).toBeGreaterThan(0);
    });

    test('should enforce 2/day limit regardless of assist level', () => {
      const baseContext = createContext({
        fatigueState: { ...createContext().fatigueState, dailyCount: 2 }
      });

      // Test with subtle level
      const subtleContext = { ...baseContext, userSettings: { ...baseContext.userSettings, assistLevel: 'subtle' as const } };
      let result = fatigueService.canIntervene(subtleContext);
      expect(result.allowed).toBe(false);

      // Test with standard level
      const standardContext = { ...baseContext, userSettings: { ...baseContext.userSettings, assistLevel: 'standard' as const } };
      result = fatigueService.canIntervene(standardContext);
      expect(result.allowed).toBe(false);
    });

    test('should allow unlimited when assist level is off', () => {
      const context = createContext({
        userSettings: { ...createContext().userSettings, assistLevel: 'off' },
        fatigueState: { ...createContext().fatigueState, dailyCount: 5 }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(true); // Should allow because assist level is off
    });
  });

  describe('30-minute Topic Cooldown', () => {
    test('should block intervention during topic cooldown', () => {
      const now = Date.now();
      const context = createContext({
        fatigueState: {
          ...createContext().fatigueState,
          topicCooldowns: { 'all_or_nothing': now + (20 * 60 * 1000) } // 20 min remaining
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('topic_cooldown_prompt3');
      expect(result.cooldownMinutes).toBeCloseTo(30, 0);
    });

    test('should allow intervention after topic cooldown expires', () => {
      const now = Date.now();
      const context = createContext({
        fatigueState: {
          ...createContext().fatigueState,
          topicCooldowns: { 'all_or_nothing': now - (5 * 60 * 1000) } // Expired 5 min ago
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(true);
    });

    test('should record 30-minute topic cooldown after intervention', () => {
      const fatigueState = createContext().fatigueState;
      const now = Date.now();

      const newState = fatigueService.recordIntervention(fatigueState, ['all_or_nothing']);

      expect(newState.topicCooldowns['all_or_nothing']).toBeCloseTo(now + (30 * 60 * 1000), 1000);
    });
  });

  describe('24-hour Topic Decline Snooze', () => {
    test('should block intervention during decline snooze', () => {
      const now = Date.now();
      const context = createContext({
        fatigueState: {
          ...createContext().fatigueState,
          topicDeclines: { 'catastrophizing': now + (12 * 60 * 60 * 1000) } // 12 hours remaining
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('topic_decline_snooze');
      expect(result.cooldownMinutes).toBeCloseTo(24 * 60, 60); // Within 1 hour of 24h
    });

    test('should allow intervention after decline snooze expires', () => {
      const now = Date.now();
      const context = createContext({
        fatigueState: {
          ...createContext().fatigueState,
          topicDeclines: { 'catastrophizing': now - (60 * 1000) } // Expired 1 min ago
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(true);
    });

    test('should record topic decline with 24h snooze', () => {
      const fatigueState = createContext().fatigueState;
      const now = Date.now();

      const newState = fatigueService.recordTopicDecline(fatigueState, ['mind_reading']);

      expect(newState.topicDeclines['mind_reading']).toBeCloseTo(now + (24 * 60 * 60 * 1000), 1000);
    });
  });

  describe('Multiple Rule Enforcement', () => {
    test('should block if any rule fails', () => {
      const now = Date.now();
      const context = createContext({
        fatigueState: {
          globalInterventions: 10,
          topicCooldowns: { 'all_or_nothing': now + (15 * 60 * 1000) }, // 15 min cooldown
          lastIntervention: now - (5 * 60 * 1000), // 5 min ago
          dailyCount: 1, // Under daily limit
          topicDeclines: {}
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('topic_cooldown_prompt3');
    });

    test('should allow if all rules pass', () => {
      const context = createContext({
        fatigueState: {
          globalInterventions: 5,
          topicCooldowns: {},
          lastIntervention: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
          dailyCount: 0,
          topicDeclines: {}
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    test('should return maximum cooldown when multiple rules block', () => {
      const now = Date.now();
      const context = createContext({
        fatigueState: {
          globalInterventions: 10,
          topicCooldowns: { 'all_or_nothing': now + (15 * 60 * 1000) }, // 30 min rule
          lastIntervention: now,
          dailyCount: 2, // Daily limit rule (24 * 60 min)
          topicDeclines: { 'catastrophizing': now + (12 * 60 * 60 * 1000) } // 24h rule
        }
      });

      const result = fatigueService.canIntervene(context);

      expect(result.allowed).toBe(false);
      expect(result.cooldownMinutes).toBe(24 * 60); // Should be the maximum (daily limit)
    });
  });

  describe('Fatigue Score Calculation', () => {
    test('should calculate fatigue score based on daily usage', () => {
      const context = createContext({
        fatigueState: { ...createContext().fatigueState, dailyCount: 1 } // 50% of daily limit
      });

      const result = fatigueService.canIntervene(context);

      expect(result.fatigueScore).toBeGreaterThan(0);
      expect(result.fatigueScore).toBeLessThan(1);
    });

    test('should have higher fatigue score when approaching limits', () => {
      const lowUsageContext = createContext({
        fatigueState: { ...createContext().fatigueState, dailyCount: 0 }
      });
      const highUsageContext = createContext({
        fatigueState: { ...createContext().fatigueState, dailyCount: 1 }
      });

      const lowResult = fatigueService.canIntervene(lowUsageContext);
      const highResult = fatigueService.canIntervene(highUsageContext);

      expect(highResult.fatigueScore).toBeGreaterThan(lowResult.fatigueScore);
    });
  });

  describe('State Management', () => {
    test('should increment daily count on intervention', () => {
      const fatigueState = createContext().fatigueState;

      const newState = fatigueService.recordIntervention(fatigueState, ['overgeneralization']);

      expect(newState.dailyCount).toBe(1);
      expect(newState.globalInterventions).toBe(1);
      expect(newState.lastIntervention).toBeGreaterThan(0);
    });

    test('should reset daily count on new day', () => {
      const yesterday = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const fatigueState = {
        ...createContext().fatigueState,
        dailyCount: 2,
        lastIntervention: yesterday
      };

      const newState = fatigueService.recordIntervention(fatigueState, ['should_statements']);

      expect(newState.dailyCount).toBe(1); // Should reset to 1 for new day
    });

    test('should preserve existing topic declines when recording intervention', () => {
      const fatigueState = {
        ...createContext().fatigueState,
        topicDeclines: { 'mind_reading': Date.now() + 1000000 }
      };

      const newState = fatigueService.recordIntervention(fatigueState, ['all_or_nothing']);

      expect(newState.topicDeclines['mind_reading']).toBe(fatigueState.topicDeclines['mind_reading']);
      expect(newState.topicCooldowns['all_or_nothing']).toBeGreaterThan(0);
    });
  });

  describe('Service Configuration', () => {
    test('should allow adding custom rules', () => {
      fatigueService.addRule({
        name: 'test_custom_rule',
        condition: () => true,
        cooldownMinutes: 15
      });

      const rules = fatigueService.getRules();
      expect(rules.some(rule => rule.name === 'test_custom_rule')).toBe(true);
    });

    test('should allow removing rules', () => {
      const removed = fatigueService.removeRule('daily_limit_prompt3');
      expect(removed).toBe(true);

      const rules = fatigueService.getRules();
      expect(rules.some(rule => rule.name === 'daily_limit_prompt3')).toBe(false);
    });

    test('should reset fatigue state', () => {
      const resetState = fatigueService.resetFatigue();

      expect(resetState.dailyCount).toBe(0);
      expect(resetState.globalInterventions).toBe(0);
      expect(resetState.lastIntervention).toBe(0);
      expect(Object.keys(resetState.topicCooldowns)).toHaveLength(0);
      expect(Object.keys(resetState.topicDeclines)).toHaveLength(0);
    });
  });
});