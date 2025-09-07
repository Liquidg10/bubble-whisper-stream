import { describe, it, expect } from 'vitest';
import type { 
  DistortionType, 
  CBTAnnotation, 
  CBTDecision, 
  CBTAction,
  CBTPolicyContext,
  CrisisFlag,
  FatigueRule 
} from '../types';

describe('CBT Types', () => {
  describe('DistortionType', () => {
    it('includes all expected distortion types', () => {
      const validDistortions: DistortionType[] = [
        'all_or_nothing',
        'overgeneralization', 
        'mental_filter',
        'discounting_positive',
        'jumping_to_conclusions',
        'magnification',
        'emotional_reasoning',
        'should_statements',
        'labeling',
        'personalization',
        'catastrophizing',
        'fortune_telling'
      ];

      validDistortions.forEach(distortion => {
        expect(typeof distortion).toBe('string');
        expect(distortion.length).toBeGreaterThan(0);
      });
    });
  });

  describe('CBTAnnotation', () => {
    it('has valid structure for annotation objects', () => {
      const annotation: CBTAnnotation = {
        distortions: [
          { type: 'all_or_nothing', confidence: 0.8, evidence: ['always/never language'] }
        ],
        crisisFlags: [],
        timestamp: Date.now()
      };

      expect(annotation.distortions).toBeInstanceOf(Array);
      expect(annotation.crisisFlags).toBeInstanceOf(Array);
      expect(typeof annotation.timestamp).toBe('number');
    });

    it('validates distortion confidence ranges', () => {
      const validConfidences = [0.0, 0.5, 0.75, 1.0];
      const invalidConfidences = [-0.1, 1.1, 2.0];

      validConfidences.forEach(confidence => {
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      });

      invalidConfidences.forEach(confidence => {
        expect(confidence < 0 || confidence > 1).toBe(true);
      });
    });
  });

  describe('CBTDecision', () => {
    it('has valid intervention decision structure', () => {
      const decision: CBTDecision = {
        shouldIntervene: true,
        reason: 'High confidence distortion detected',
        priority: 'medium',
        targetDistortions: ['AllOrNothing'],
        interventionType: 'gentle_chip'
      };

      expect(typeof decision.shouldIntervene).toBe('boolean');
      expect(typeof decision.reason).toBe('string');
      expect(['low', 'medium', 'high'].includes(decision.priority!)).toBe(true);
      expect(decision.targetDistortions).toBeInstanceOf(Array);
    });
  });

  describe('CBTAction', () => {
    it('has valid action structure for gentle chips', () => {
      const action: CBTAction = {
        type: 'gentle_chip',
        title: 'Another way to see this',
        description: 'Consider that there might be middle ground here.',
        actions: [
          { label: 'Explore this', type: 'primary' },
          { label: 'Not now', type: 'secondary' }
        ],
        explainability: 'because you used absolute language like "always"'
      };

      expect(action.type).toBe('gentle_chip');
      expect(typeof action.title).toBe('string');
      expect(typeof action.description).toBe('string');
      expect(action.actions).toBeInstanceOf(Array);
      expect(action.actions!.length).toBeGreaterThan(0);
    });

    it('has valid action structure for crisis support', () => {
      const action: CBTAction = {
        type: 'crisis_support',
        title: 'You\'re not alone',
        description: 'Here are some resources that can help right now.',
        resources: [
          { name: 'Crisis Text Line', contact: 'Text HOME to 741741', type: 'immediate' }
        ],
        priority: 'immediate'
      };

      expect(action.type).toBe('crisis_support');
      expect(action.resources).toBeInstanceOf(Array);
      expect(action.priority).toBe('immediate');
    });
  });

  describe('CBTPolicyContext', () => {
    it('has valid policy context structure', () => {
      const context: CBTPolicyContext = {
        userSettings: {
          assistLevel: 'standard',
          autoLogMode: 'ask',
          privacyLayer: 'context',
          quietHours: { enabled: false, start: '22:00', end: '08:00' },
          topicExclusions: ['work'],
          neverInterveningPhrases: ['leave me alone']
        },
        fatigueState: {
          dailyCount: 2,
          lastInterventionTime: Date.now() - 1800000, // 30 min ago
          declineStreak: 0,
          topicCooldowns: { 'work': Date.now() - 900000 }, // 15 min ago
          lastResetDate: new Date().toDateString()
        },
        conversationContext: {
          recentMessages: ['Hello', 'How are you?'],
          conversationLength: 2,
          topicContinuity: 0.7
        }
      };

      expect(['off', 'subtle', 'standard'].includes(context.userSettings.assistLevel)).toBe(true);
      expect(['ask', 'off', 'on'].includes(context.userSettings.autoLogMode)).toBe(true);
      expect(['surface', 'context', 'deep'].includes(context.userSettings.privacyLayer)).toBe(true);
      expect(typeof context.fatigueState.dailyCount).toBe('number');
      expect(context.conversationContext?.recentMessages).toBeInstanceOf(Array);
    });
  });

  describe('CrisisFlag', () => {
    it('includes expected crisis types', () => {
      const validCrisisFlags: CrisisFlag[] = [
        'suicide',
        'self_harm',
        'severe_distress',
        'emergency',
        'substance_abuse'
      ];

      validCrisisFlags.forEach(flag => {
        expect(typeof flag).toBe('string');
        expect(flag.length).toBeGreaterThan(0);
      });
    });
  });

  describe('FatigueRule', () => {
    it('has valid fatigue rule structure', () => {
      const fatigueRule: FatigueRule = {
        maxDaily: 3,
        cooldownMinutes: 30,
        declineThreshold: 2,
        snoozeHours: 24
      };

      expect(typeof fatigueRule.maxDaily).toBe('number');
      expect(typeof fatigueRule.cooldownMinutes).toBe('number');
      expect(typeof fatigueRule.declineThreshold).toBe('number');
      expect(typeof fatigueRule.snoozeHours).toBe('number');
    });
  });
});