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
        'catastrophizing',
        'overgeneralization',
        'should_statements',
        'mind_reading'
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
        messageId: 'msg-123',
        timestamp: Date.now(),
        distortions: [{
          type: 'all_or_nothing',
          confidence: 0.8,
          evidence: ['never', 'always'],
          keywords: ['never', 'always']
        }],
        sentiment: {
          score: -0.3,
          magnitude: 0.7
        },
        crisisFlags: [],
        context: {
          timeOfDay: 14,
          messageLength: 50,
          conversationDepth: 5
        }
      };

      expect(annotation.distortions).toBeInstanceOf(Array);
      expect(annotation.crisisFlags).toBeInstanceOf(Array);
      expect(typeof annotation.timestamp).toBe('number');
      expect(annotation.distortions[0]).toHaveProperty('keywords');
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
        interventionType: 'chip',
        reason: 'All-or-nothing thinking detected',
        targetDistortions: ['all_or_nothing'],
        priority: 'medium',
        cooldownMinutes: 30,
        metadata: {
          fatigueScore: 0.3,
          policyMatch: 'distortion_intervention',
          confidence: 0.85
        }
      };

      expect(typeof decision.shouldIntervene).toBe('boolean');
      expect(typeof decision.reason).toBe('string');
      expect(['low', 'medium', 'high', 'crisis'].includes(decision.priority)).toBe(true);
      expect(decision.targetDistortions).toBeInstanceOf(Array);
      expect(['none', 'chip'].includes(decision.interventionType)).toBe(true);
    });
  });

  describe('CBTAction', () => {
    it('has valid action structure for chips', () => {
      const action: CBTAction = {
        type: 'chip',
        text: 'Want to explore another perspective?',
        data: {
          distortionType: 'all_or_nothing',
          reframes: ['Maybe there\'s a middle ground here?'],
          explainability: 'I noticed some black-and-white thinking'
        }
      };

      expect(action.type).toBe('chip');
      expect(action.text).toBe('Want to explore another perspective?');
      expect(action.data?.distortionType).toBe('all_or_nothing');
    });

    it('has valid action structure for crisis support', () => {
      const crisisAction: CBTAction = {
        type: 'crisis_support',
        text: 'I see you\'re going through something difficult',
        data: {
          resources: ['crisis_hotline', 'emergency_contacts'],
          followUpQuestions: ['How can I help you stay safe?']
        }
      };

      expect(crisisAction.type).toBe('crisis_support');
      expect(crisisAction.data?.resources).toContain('crisis_hotline');
      expect(crisisAction.text).toBe('I see you\'re going through something difficult');
    });
  });

  describe('CBTPolicyContext', () => {
    it('has valid policy context structure', () => {
      const context: CBTPolicyContext = {
        userSettings: {
          assistLevel: 'standard',
          privacyLayer: 'context',
          autoLogMode: 'ask',
          topicExclusions: ['work'],
          neverInterveneOn: ['work_stress']
        },
        fatigueState: {
          globalInterventions: 3,
          topicCooldowns: { 'all_or_nothing': Date.now() },
          lastIntervention: Date.now() - 3600000,
          dailyCount: 5,
          topicDeclines: {}
        },
        conversationContext: {
          messageCount: 15,
          averageSentiment: -0.2,
          recentTopics: ['work', 'stress'],
          timeSpan: 120
        }
      };

      expect(['off', 'subtle', 'standard'].includes(context.userSettings.assistLevel)).toBe(true);
      expect(['ask', 'off', 'on'].includes(context.userSettings.autoLogMode)).toBe(true);
      expect(['surface', 'context', 'deep'].includes(context.userSettings.privacyLayer)).toBe(true);
      expect(typeof context.fatigueState.globalInterventions).toBe('number');
      expect(context.conversationContext.timeSpan).toBe(120);
    });
  });

  describe('CrisisFlag', () => {
    it('validates CrisisFlag structure', () => {
      const crisisFlags: CrisisFlag[] = [
        {
          type: 'suicide',
          confidence: 0.9,
          keywords: ['ending it all'],
          severity: 'critical'
        },
        {
          type: 'self_harm',
          confidence: 0.7,
          keywords: ['hurt myself'],
          severity: 'high'
        }
      ];

      expect(crisisFlags).toHaveLength(2);
      expect(crisisFlags[0].type).toBe('suicide');
      expect(crisisFlags[0].severity).toBe('critical');
    });
  });

  describe('FatigueRule', () => {
    it('validates FatigueRule structure', () => {
      const rule: FatigueRule = {
        name: 'daily_limit',
        condition: () => true,
        cooldownMinutes: 60,
        maxDailyInterventions: 5,
        topicSpecific: 'all_or_nothing'
      };

      expect(rule.name).toBe('daily_limit');
      expect(typeof rule.condition).toBe('function');
      expect(typeof rule.cooldownMinutes).toBe('number');
      expect(typeof rule.maxDailyInterventions).toBe('number');
    });
  });
});