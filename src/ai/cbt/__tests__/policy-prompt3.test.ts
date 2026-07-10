/**
 * PROMPT 3 Policy Tests - Rate limits, Quiet Hours, Consent
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { decide } from '../policy';
import type { CBTAnnotation, CBTPolicyContext, DistortionType } from '../types';

// Test data factories
const createAnnotation = (
  distortions: { type: DistortionType; confidence: number }[] = [],
  crisisFlags: any[] = []
): CBTAnnotation => ({
  messageId: 'test-msg',
  timestamp: Date.now(),
  distortions: distortions.map(d => ({
    type: d.type,
    confidence: d.confidence,
    evidence: ['test evidence'],
    keywords: ['test']
  })),
  sentiment: { score: -0.3, magnitude: 0.7 },
  crisisFlags,
  context: {
    timeOfDay: 14,
    messageLength: 100,
    conversationDepth: 1
  }
});

const createUserSettings = (overrides: Partial<CBTPolicyContext['userSettings']> = {}): CBTPolicyContext['userSettings'] => ({
  assistLevel: 'standard',
  privacyLayer: 'context',
  autoLogMode: 'ask',
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  topicExclusions: [],
  neverInterveneOn: [],
  ...overrides
});

const createFatigueState = (overrides: Partial<CBTPolicyContext['fatigueState']> = {}): CBTPolicyContext['fatigueState'] => ({
  globalInterventions: 0,
  topicCooldowns: {},
  lastIntervention: 0,
  dailyCount: 0,
  topicDeclines: {},
  ...overrides
});

describe('PROMPT 3 Policy Engine', () => {
  let userSettings: CBTPolicyContext['userSettings'];
  let fatigueState: CBTPolicyContext['fatigueState'];

  beforeEach(() => {
    userSettings = createUserSettings();
    fatigueState = createFatigueState();
  });

  describe('Rate Limits (Max 2/day)', () => {
    test('should allow intervention when under daily limit', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      fatigueState.dailyCount = 1; // Under limit

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
      expect(decision.reason).toBe('High-confidence distortion detected');
    });

    test('should block intervention when daily limit reached (2/day)', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      fatigueState.dailyCount = 2; // At limit

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.shouldIntervene).toBe(false);
      expect(decision.reason).toBe('Daily intervention limit reached (2/day)');
      expect(decision.cooldownMinutes).toBeGreaterThan(0);
    });

    test('should enforce 2/day limit regardless of assist level', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      fatigueState.dailyCount = 2;
      
      // Test with subtle level
      userSettings.assistLevel = 'subtle';
      let decision = decide([annotation], userSettings, fatigueState);
      expect(decision.interventionType).toBe('none');
      
      // Test with standard level
      userSettings.assistLevel = 'standard';
      decision = decide([annotation], userSettings, fatigueState);
      expect(decision.interventionType).toBe('none');
    });
  });

  describe('30-minute Topic Cooldown', () => {
    test('should block intervention during topic cooldown', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      const now = Date.now();
      fatigueState.topicCooldowns = {
        'all_or_nothing': now + (20 * 60 * 1000) // 20 min remaining
      };

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('Topic cooldown active (30min)');
      expect(decision.cooldownMinutes).toBeCloseTo(20, 0);
    });

    test('should allow intervention after topic cooldown expires', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      const now = Date.now();
      fatigueState.topicCooldowns = {
        'all_or_nothing': now - (5 * 60 * 1000) // Expired 5 min ago
      };

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
    });

    test('should allow intervention on different topic during cooldown', () => {
      const annotation = createAnnotation([{ type: 'catastrophizing', confidence: 0.9 }]);
      const now = Date.now();
      fatigueState.topicCooldowns = {
        'all_or_nothing': now + (20 * 60 * 1000) // Different topic on cooldown
      };

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
    });
  });

  describe('24-hour Topic Decline Auto-Snooze', () => {
    test('should block intervention during decline snooze', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      const now = Date.now();
      fatigueState.topicDeclines = {
        'all_or_nothing': now + (12 * 60 * 60 * 1000) // 12 hours remaining
      };

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('Topic decline auto-snooze active (24h)');
      expect(decision.cooldownMinutes).toBeCloseTo(12 * 60, 10);
    });

    test('should allow intervention after decline snooze expires', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      const now = Date.now();
      fatigueState.topicDeclines = {
        'all_or_nothing': now - (60 * 1000) // Expired 1 min ago
      };

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
    });
  });

  describe('Confidence Threshold ≥ 0.85', () => {
    test('should intervene when confidence ≥ 0.85', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.85 }]);

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
    });

    test('should NOT intervene when confidence < 0.85', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.84 }]);

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('Distortions below confidence threshold (0.85)');
    });

    test('should handle multiple distortions with mixed confidence', () => {
      const annotation = createAnnotation([
        { type: 'all_or_nothing', confidence: 0.7 }, // Below threshold
        { type: 'catastrophizing', confidence: 0.9 }  // Above threshold
      ]);

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.targetDistortions).toEqual(['catastrophizing']);
    });
  });

  describe('Crisis Routing', () => {
    test('should return action=none with crisis flag for crisis detection', () => {
      const annotation = createAnnotation([], [
        { type: 'self_harm', confidence: 0.9, keywords: ['hurt'], severity: 'critical' }
      ]);

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('crisis');
      expect(decision.metadata.isCrisis).toBe(true);
      expect(decision.priority).toBe('crisis');
    });

    test('should route all crisis severities to external system', () => {
      const severities = ['low', 'medium', 'high', 'critical'] as const;
      
      for (const severity of severities) {
        const annotation = createAnnotation([], [
          { type: 'severe_distress', confidence: 0.8, keywords: ['overwhelmed'], severity }
        ]);

        const decision = decide([annotation], userSettings, fatigueState);

        expect(decision.interventionType).toBe('none');
        expect(decision.reason).toBe('crisis');
        expect(decision.metadata.isCrisis).toBe(true);
      }
    });
  });

  describe('Quiet Hours', () => {
    test('should respect quiet hours', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      
      // Mock current time during quiet hours (23:30)
      const mockDate = new Date();
      mockDate.setHours(23, 30, 0, 0);
      
      userSettings.quietHours = {
        enabled: true,
        start: '22:00',
        end: '08:00'
      };

      // Override Date in a simple way for this test
      const originalDate = global.Date;
      global.Date = class extends Date {
        constructor() {
          super();
          return mockDate;
        }
        static now() {
          return mockDate.getTime();
        }
      } as any;

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('Quiet hours active');

      // Restore Date
      global.Date = originalDate;
    });

    test('should allow intervention outside quiet hours', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      
      userSettings.quietHours = {
        enabled: true,
        start: '22:00',
        end: '08:00'
      };

      // During normal hours, should allow intervention
      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
    });
  });

  describe('Topic Exclusions', () => {
    // Item 1 (2026-07-03): topic exclusions now match against the actual message text
    // (via decide()'s new optional `message` param), not the distortion's static keyword
    // list — a real user message containing the excluded term is required to exercise this.
    test('should respect topic exclusions', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      userSettings.topicExclusions = ['work'];

      const decision = decide([annotation], userSettings, fatigueState, undefined, 'I always mess up work projects');

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('Message contains excluded topic');
    });

    test('should respect never intervene list', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      userSettings.neverInterveneOn = ['work'];

      const decision = decide([annotation], userSettings, fatigueState, undefined, 'I always mess up work projects');

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('Message contains excluded topic');
    });
  });

  describe('Decision Simplification (chip|none only)', () => {
    test('should only return chip or none intervention types', () => {
      const testCases = [
        { confidence: 0.5, expected: 'none' },
        { confidence: 0.85, expected: 'chip' },
        { confidence: 0.95, expected: 'chip' }
      ];

      testCases.forEach(({ confidence, expected }) => {
        const annotation = createAnnotation([{ type: 'all_or_nothing', confidence }]);
        const decision = decide([annotation], userSettings, fatigueState);
        
        expect(['chip', 'none']).toContain(decision.interventionType);
        expect(decision.interventionType).toBe(expected);
      });
    });

    test('should never return silent, gentle, or direct intervention types', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).not.toBe('silent');
      expect(decision.interventionType).not.toBe('gentle');
      expect(decision.interventionType).not.toBe('direct');
    });
  });

  describe('User Settings Integration', () => {
    test('should respect assistance level off', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      userSettings.assistLevel = 'off';

      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('User has disabled CBT assistance');
    });

    test('should handle empty annotations array', () => {
      const decision = decide([], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('No annotations to process');
    });

    test('should handle annotations with no distortions', () => {
      const annotation = createAnnotation([]);
      const decision = decide([annotation], userSettings, fatigueState);

      expect(decision.interventionType).toBe('none');
      expect(decision.reason).toBe('No distortions detected');
    });
  });

  describe('PROMPT 3 Compliance', () => {
    test('should meet all PROMPT 3 requirements simultaneously', () => {
      // High confidence distortion, under rate limits, not in quiet hours, no exclusions
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      fatigueState.dailyCount = 0; // Under limit
      userSettings.quietHours = { enabled: false, start: '22:00', end: '08:00' };
      userSettings.topicExclusions = [];
      userSettings.neverInterveneOn = [];

      const decision = decide([annotation], userSettings, fatigueState);

      // Should result in chip intervention
      expect(decision.interventionType).toBe('chip');
      expect(decision.shouldIntervene).toBe(true);
      expect(decision.reason).toBe('High-confidence distortion detected');
      expect(decision.priority).toBe('medium');
    });

    test('should enforce all guards in sequence', () => {
      const annotation = createAnnotation([{ type: 'all_or_nothing', confidence: 0.9 }]);
      
      // Test daily limit first
      fatigueState.dailyCount = 2;
      let decision = decide([annotation], userSettings, fatigueState);
      expect(decision.reason).toBe('Daily intervention limit reached (2/day)');
      
      // Reset daily limit, test topic cooldown
      fatigueState.dailyCount = 0;
      fatigueState.topicCooldowns = { 'all_or_nothing': Date.now() + 1000000 };
      decision = decide([annotation], userSettings, fatigueState);
      expect(decision.reason).toBe('Topic cooldown active (30min)');
      
      // Reset cooldown, test topic decline
      fatigueState.topicCooldowns = {};
      fatigueState.topicDeclines = { 'all_or_nothing': Date.now() + 1000000 };
      decision = decide([annotation], userSettings, fatigueState);
      expect(decision.reason).toBe('Topic decline auto-snooze active (24h)');
    });
  });
});