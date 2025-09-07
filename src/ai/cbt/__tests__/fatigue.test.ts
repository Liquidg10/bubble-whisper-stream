/**
 * CBT Fatigue Tests - Rate limiting and cooldown validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CBTFatigueService, getHourlyLimit, getDailyLimit } from '../fatigue';
import type { CBTPolicyContext, DistortionType } from '../types';

describe('CBT Fatigue Service', () => {
  let fatigueService: CBTFatigueService;

  const mockUserSettings: CBTPolicyContext['userSettings'] = {
    assistLevel: 'subtle',
    privacyLayer: 'context',
    autoLogMode: 'ask',
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    topicExclusions: [],
    neverInterveneOn: []
  };

  const mockFatigueState: CBTPolicyContext['fatigueState'] = {
    globalInterventions: 0,
    topicCooldowns: {} as Partial<Record<DistortionType, number>>,
    lastIntervention: 0,
    dailyCount: 0,
    topicDeclines: {} as Partial<Record<DistortionType, number>>
  };

  const mockConversationContext: CBTPolicyContext['conversationContext'] = {
    messageCount: 5,
    averageSentiment: -0.3,
    recentTopics: ['work', 'stress'],
    timeSpan: 30
  };

  beforeEach(() => {
    fatigueService = new CBTFatigueService();
  });

  describe('Basic Fatigue Checks', () => {
    it('should allow intervention when no fatigue constraints exist', () => {
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: mockFatigueState,
        conversationContext: mockConversationContext
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.allowed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
      expect(result.fatigueScore).toBeLessThan(0.5);
    });

    it('should block intervention when daily limit exceeded', () => {
      const fatiguedState = {
        ...mockFatigueState,
        dailyCount: 5 // Exceeds subtle mode limit of 3
      };
      
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: fatiguedState,
        conversationContext: mockConversationContext
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('daily_limit');
      expect(result.cooldownMinutes).toBeGreaterThan(0);
    });

    it('should block intervention during cooldown period', () => {
      const recentState = {
        ...mockFatigueState,
        lastIntervention: Date.now() - (30 * 60 * 1000) // 30 minutes ago
      };
      
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: recentState,
        conversationContext: mockConversationContext
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('recent_intervention');
    });
  });

  describe('Assist Level Differences', () => {
    it('should have different limits for standard assist level', () => {
      const standardSettings = { ...mockUserSettings, assistLevel: 'standard' as const };
      
      expect(getHourlyLimit({ userSettings: standardSettings } as CBTPolicyContext)).toBe(3);
      expect(getDailyLimit({ userSettings: standardSettings } as CBTPolicyContext)).toBe(8);
      
      expect(getHourlyLimit({ userSettings: mockUserSettings } as CBTPolicyContext)).toBe(1);
      expect(getDailyLimit({ userSettings: mockUserSettings } as CBTPolicyContext)).toBe(3);
    });

    it('should allow more interventions in standard mode', () => {
      const standardSettings = { ...mockUserSettings, assistLevel: 'standard' as const };
      const highActivityState = {
        ...mockFatigueState,
        dailyCount: 5 // Would exceed subtle limit but not standard
      };
      
      const context: CBTPolicyContext = {
        userSettings: standardSettings,
        fatigueState: highActivityState,
        conversationContext: mockConversationContext
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('Topic-Specific Cooldowns', () => {
    it('should track topic-specific cooldowns', () => {
      const now = Date.now();
      const state = fatigueService.recordIntervention(
        mockFatigueState,
        ['all_or_nothing', 'catastrophizing']
      );
      
      expect(state.topicCooldowns.all_or_nothing).toBeGreaterThan(now);
      expect(state.topicCooldowns.catastrophizing).toBeGreaterThan(now);
    });

    it('should block intervention when topic is in cooldown', () => {
      const now = Date.now();
      const cooldownState = {
        ...mockFatigueState,
        topicCooldowns: {
          all_or_nothing: now + (60 * 60 * 1000) // 1 hour from now
        } as Partial<Record<DistortionType, number>>
      };
      
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: cooldownState,
        conversationContext: mockConversationContext
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('topic_specific_cooldown');
    });
  });

  describe('Fatigue Score Calculation', () => {
    it('should calculate higher fatigue score for frequent interventions', () => {
      const highActivityState = {
        ...mockFatigueState,
        dailyCount: 2,
        lastIntervention: Date.now() - (30 * 60 * 1000) // 30 minutes ago
      };
      
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: highActivityState,
        conversationContext: {
          ...mockConversationContext,
          messageCount: 15 // High conversation activity
        }
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.fatigueScore).toBeGreaterThan(0.5);
    });

    it('should calculate lower fatigue score after recovery time', () => {
      const recoveredState = {
        ...mockFatigueState,
        lastIntervention: Date.now() - (5 * 60 * 60 * 1000) // 5 hours ago
      };
      
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: recoveredState,
        conversationContext: mockConversationContext
      };
      
      const result = fatigueService.canIntervene(context);
      
      expect(result.fatigueScore).toBeLessThan(0.3);
    });
  });

  describe('Intervention Recording', () => {
    it('should update intervention counts correctly', () => {
      const state = fatigueService.recordIntervention(
        mockFatigueState,
        ['all_or_nothing']
      );
      
      expect(state.globalInterventions).toBe(1);
      expect(state.dailyCount).toBe(1);
      expect(state.lastIntervention).toBeGreaterThan(0);
    });

    it('should reset daily count on new day', () => {
      const yesterdayTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const oldState = {
        ...mockFatigueState,
        dailyCount: 3,
        lastIntervention: yesterdayTimestamp
      };
      
      const state = fatigueService.recordIntervention(oldState, ['catastrophizing']);
      
      expect(state.dailyCount).toBe(1); // Reset because it's a new day
    });

    it('should increment daily count on same day', () => {
      const sameDay = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      const oldState = {
        ...mockFatigueState,
        dailyCount: 2,
        lastIntervention: sameDay
      };
      
      const state = fatigueService.recordIntervention(oldState, ['overgeneralization']);
      
      expect(state.dailyCount).toBe(3); // Incremented
    });
  });

  describe('Next Available Time', () => {
    it('should return current time when intervention allowed', () => {
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: mockFatigueState,
        conversationContext: mockConversationContext
      };
      
      const nextTime = fatigueService.getNextAvailableTime(context);
      
      expect(nextTime).toBeLessThanOrEqual(Date.now() + 1000); // Within 1 second
    });

    it('should return future time when intervention blocked', () => {
      const blockedState = {
        ...mockFatigueState,
        lastIntervention: Date.now() - (30 * 60 * 1000) // 30 minutes ago
      };
      
      const context: CBTPolicyContext = {
        userSettings: mockUserSettings,
        fatigueState: blockedState,
        conversationContext: mockConversationContext
      };
      
      const nextTime = fatigueService.getNextAvailableTime(context);
      
      expect(nextTime).toBeGreaterThan(Date.now());
    });
  });

  describe('Custom Rules', () => {
    it('should allow adding custom fatigue rules', () => {
      const customRule = {
        name: 'test_rule',
        condition: () => true,
        cooldownMinutes: 15
      };
      
      fatigueService.addRule(customRule);
      
      const rules = fatigueService.getRules();
      expect(rules.some(rule => rule.name === 'test_rule')).toBe(true);
    });

    it('should allow removing custom fatigue rules', () => {
      const customRule = {
        name: 'removable_rule',
        condition: () => false,
        cooldownMinutes: 10
      };
      
      fatigueService.addRule(customRule);
      const removed = fatigueService.removeRule('removable_rule');
      
      expect(removed).toBe(true);
      
      const rules = fatigueService.getRules();
      expect(rules.some(rule => rule.name === 'removable_rule')).toBe(false);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset fatigue state to default', () => {
      const resetState = fatigueService.resetFatigue();
      
      expect(resetState.globalInterventions).toBe(0);
      expect(resetState.dailyCount).toBe(0);
      expect(resetState.lastIntervention).toBe(0);
      expect(Object.keys(resetState.topicCooldowns)).toHaveLength(0);
    });
  });
});