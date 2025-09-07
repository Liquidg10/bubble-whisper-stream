/**
 * CBT Policy Tests - Decision making logic validation
 */

import { describe, it, expect } from 'vitest';
import { decide } from '../policy';
import type { CBTAnnotation, CBTPolicyContext } from '../types';

describe('CBT Policy Engine', () => {
  const mockAnnotation: CBTAnnotation = {
    messageId: 'test-1',
    timestamp: Date.now(),
    distortions: [
      {
        type: 'all_or_nothing',
        confidence: 0.8,
        evidence: ['always', 'never'],
        keywords: ['always', 'never']
      }
    ],
    sentiment: { score: -0.6, magnitude: 0.7 },
    crisisFlags: [],
    context: {
      timeOfDay: 14,
      messageLength: 50,
      conversationDepth: 3
    }
  };

  const defaultUserSettings: CBTPolicyContext['userSettings'] = {
    assistLevel: 'subtle',
    privacyLayer: 'context',
    autoLogMode: 'ask',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00'
    },
    topicExclusions: [],
    neverInterveneOn: []
  };

  const defaultFatigueState: CBTPolicyContext['fatigueState'] = {
    globalInterventions: 0,
    topicCooldowns: {},
    lastIntervention: 0,
    dailyCount: 0
  };

  describe('Basic Decision Making', () => {
    it('should allow intervention for high-confidence distortion', () => {
      const result = decide([mockAnnotation], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(true);
      expect(result.targetDistortions).toContain('all_or_nothing');
      expect(result.interventionType).toBe('silent');
    });

    it('should not intervene when assistance is disabled', () => {
      const disabledSettings = { ...defaultUserSettings, assistLevel: 'off' as const };
      const result = decide([mockAnnotation], disabledSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('User has disabled CBT assistance');
    });

    it('should not intervene for low-confidence distortions', () => {
      const lowConfidenceAnnotation = {
        ...mockAnnotation,
        distortions: [{
          type: 'all_or_nothing' as const,
          confidence: 0.3,
          evidence: ['maybe'],
          keywords: ['maybe']
        }]
      };
      
      const result = decide([lowConfidenceAnnotation], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('Distortions below confidence threshold');
    });
  });

  describe('Crisis Intervention', () => {
    it('should prioritize crisis intervention', () => {
      const crisisAnnotation = {
        ...mockAnnotation,
        crisisFlags: [
          {
            type: 'suicide' as const,
            confidence: 0.9,
            keywords: ['kill myself'],
            severity: 'critical' as const
          }
        ]
      };
      
      const result = decide([crisisAnnotation], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(true);
      expect(result.priority).toBe('crisis');
      expect(result.interventionType).toBe('direct');
    });

    it('should handle medium severity crisis with gentle intervention', () => {
      const mediumCrisisAnnotation = {
        ...mockAnnotation,
        crisisFlags: [
          {
            type: 'severe_distress' as const,
            confidence: 0.7,
            keywords: ['overwhelming'],
            severity: 'medium' as const
          }
        ]
      };
      
      const result = decide([mediumCrisisAnnotation], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(true);
      expect(result.priority).toBe('high');
      expect(result.interventionType).toBe('gentle');
    });
  });

  describe('Fatigue Management', () => {
    it('should respect daily intervention limits', () => {
      const fatiguedState = {
        ...defaultFatigueState,
        dailyCount: 5 // Exceeds subtle mode limit
      };
      
      const result = decide([mockAnnotation], defaultUserSettings, fatiguedState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('Daily intervention limit reached');
    });

    it('should enforce cooldown periods', () => {
      const recentInterventionState = {
        ...defaultFatigueState,
        lastIntervention: Date.now() - (30 * 60 * 1000) // 30 minutes ago
      };
      
      const result = decide([mockAnnotation], defaultUserSettings, recentInterventionState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('Recent intervention cooldown active');
    });
  });

  describe('User Preferences', () => {
    it('should respect quiet hours', () => {
      const quietHoursSettings = {
        ...defaultUserSettings,
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00'
        }
      };
      
      // Mock current time to be in quiet hours
      const originalDate = Date;
      global.Date = class extends Date {
        constructor() {
          super();
          return new originalDate('2024-01-01T23:30:00Z'); // 11:30 PM
        }
      } as any;
      
      const result = decide([mockAnnotation], quietHoursSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('Quiet hours active');
      
      global.Date = originalDate;
    });

    it('should respect topic exclusions', () => {
      const excludedTopicsSettings = {
        ...defaultUserSettings,
        topicExclusions: ['work', 'always']
      };
      
      const result = decide([mockAnnotation], excludedTopicsSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('Message contains excluded topic');
    });

    it('should respect never intervene list', () => {
      const neverInterveneSettings = {
        ...defaultUserSettings,
        neverInterveneOn: ['always', 'never']
      };
      
      const result = decide([mockAnnotation], neverInterveneSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('Message contains excluded topic');
    });
  });

  describe('Intervention Escalation', () => {
    it('should escalate to direct intervention for standard assist level', () => {
      const standardSettings = { ...defaultUserSettings, assistLevel: 'standard' as const };
      const highConfidenceAnnotation = {
        ...mockAnnotation,
        distortions: [{
          type: 'catastrophizing' as const,
          confidence: 0.9,
          evidence: ['disaster', 'terrible'],
          keywords: ['disaster', 'terrible']
        }]
      };
      
      const result = decide([highConfidenceAnnotation], standardSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(true);
      expect(result.interventionType).toBe('direct');
    });

    it('should use gentle intervention for multiple distortions', () => {
      const multipleDistortionsAnnotation = {
        ...mockAnnotation,
        distortions: [
          {
            type: 'all_or_nothing' as const,
            confidence: 0.7,
            evidence: ['always'],
            keywords: ['always']
          },
          {
            type: 'catastrophizing' as const,
            confidence: 0.6,
            evidence: ['disaster'],
            keywords: ['disaster']
          }
        ]
      };
      
      const result = decide([multipleDistortionsAnnotation], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(true);
      expect(result.interventionType).toBe('gentle');
      expect(result.targetDistortions).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty annotations array', () => {
      const result = decide([], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('No annotations to process');
    });

    it('should handle annotation without distortions', () => {
      const neutralAnnotation = {
        ...mockAnnotation,
        distortions: []
      };
      
      const result = decide([neutralAnnotation], defaultUserSettings, defaultFatigueState);
      
      expect(result.shouldIntervene).toBe(false);
      expect(result.reason).toBe('No distortions detected');
    });
  });
});