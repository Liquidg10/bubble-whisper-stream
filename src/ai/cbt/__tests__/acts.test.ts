/**
 * CBT Acts Tests - Action rendering validation
 */

import { describe, it, expect } from 'vitest';
import { render, formatActionForDisplay } from '../acts';
import type { CBTDecision } from '../types';

describe('CBT Actions', () => {
  describe('Action Rendering', () => {
    it('should return null for no intervention decision', () => {
      const noInterventionDecision: CBTDecision = {
        shouldIntervene: false,
        interventionType: 'none',
        reason: 'No distortions detected',
        targetDistortions: [],
        priority: 'low',
        cooldownMinutes: 0,
        metadata: {
          fatigueScore: 0,
          policyMatch: 'none',
          confidence: 1.0
        }
      };
      
      const result = render(noInterventionDecision);
      expect(result).toBeNull();
    });

    it('should render crisis support action', () => {
      const crisisDecision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'Crisis intervention needed',
        targetDistortions: [],
        priority: 'crisis',
        cooldownMinutes: 0,
        metadata: {
          fatigueScore: 0,
          policyMatch: 'crisis',
          confidence: 1.0
        }
      };
      
      const result = render(crisisDecision);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('crisis_support');
      expect(result!.text).toContain('here with you');
      expect(result!.data?.resources).toBeDefined();
      expect(result!.data?.followUpQuestions).toBeDefined();
    });

    it('should render chip action for silent intervention', () => {
      const silentDecision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'Distortion detected',
        targetDistortions: ['all_or_nothing'],
        priority: 'low',
        cooldownMinutes: 120,
        metadata: {
          fatigueScore: 0.3,
          policyMatch: 'distortion_detected',
          confidence: 0.7
        }
      };
      
      const result = render(silentDecision);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('chip');
      expect(result!.data?.distortionType).toBe('all_or_nothing');
    });

    it('should render acknowledgment for gentle intervention', () => {
      const gentleDecision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'Multiple distortions detected',
        targetDistortions: ['catastrophizing'],
        priority: 'medium',
        cooldownMinutes: 60,
        metadata: {
          fatigueScore: 0.5,
          policyMatch: 'multiple_distortions',
          confidence: 0.8
        }
      };
      
      const result = render(gentleDecision);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('ack');
      expect(result!.data?.distortionType).toBe('catastrophizing');
      expect(result!.data?.reframes).toBeDefined();
    });

    it('should render question for direct intervention', () => {
      const directDecision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'High confidence distortion',
        targetDistortions: ['should_statements'],
        priority: 'high',
        cooldownMinutes: 30,
        metadata: {
          fatigueScore: 0.2,
          policyMatch: 'high_confidence',
          confidence: 0.9
        }
      };
      
      const result = render(directDecision);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('question');
      expect(result!.data?.distortionType).toBe('should_statements');
    });
  });

  describe('Distortion-Specific Responses', () => {
    it('should provide appropriate responses for all-or-nothing thinking', () => {
      const decision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'All-or-nothing detected',
        targetDistortions: ['all_or_nothing'],
        priority: 'medium',
        cooldownMinutes: 60,
        metadata: { fatigueScore: 0, policyMatch: 'test', confidence: 0.8 }
      };
      
      const result = render(decision);
      
      expect(result!.data?.distortionType).toBe('all_or_nothing');
      expect(result!.text).toMatch(/absolute|black and white|all or nothing/i);
    });

    it('should provide appropriate responses for catastrophizing', () => {
      const decision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'Catastrophizing detected',
        targetDistortions: ['catastrophizing'],
        priority: 'medium',
        cooldownMinutes: 60,
        metadata: { fatigueScore: 0, policyMatch: 'test', confidence: 0.8 }
      };
      
      const result = render(decision);
      
      expect(result!.data?.distortionType).toBe('catastrophizing');
      expect(result!.text).toMatch(/overwhelming|scary|worst-case/i);
    });

    it('should provide appropriate responses for overgeneralization', () => {
      const decision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'Overgeneralization detected',
        targetDistortions: ['overgeneralization'],
        priority: 'medium',
        cooldownMinutes: 60,
        metadata: { fatigueScore: 0, policyMatch: 'test', confidence: 0.8 }
      };
      
      const result = render(decision);
      
      expect(result!.data?.distortionType).toBe('overgeneralization');
      // Should ask about exceptions or specific situations
      expect(result!.text).toMatch(/exception|time when|specific|pattern/i);
    });
  });

  describe('Action Display Formatting', () => {
    it('should format chip actions correctly', () => {
      const chipAction = {
        type: 'chip' as const,
        text: 'Consider the middle ground',
        data: {
          distortionType: 'all_or_nothing' as const,
          followUpQuestions: ['What would be more balanced?']
        }
      };
      
      const formatted = formatActionForDisplay(chipAction);
      
      expect(formatted.primary).toBe('Consider the middle ground');
      expect(formatted.interactive).toBe(true);
    });

    it('should format acknowledgment actions correctly', () => {
      const ackAction = {
        type: 'ack' as const,
        text: 'This sounds really overwhelming right now.',
        data: {
          followUpQuestions: ['What would help in this moment?']
        }
      };
      
      const formatted = formatActionForDisplay(ackAction);
      
      expect(formatted.primary).toBe('This sounds really overwhelming right now.');
      expect(formatted.secondary).toBe('What would help in this moment?');
      expect(formatted.interactive).toBe(true);
    });

    it('should format question actions correctly', () => {
      const questionAction = {
        type: 'question' as const,
        text: 'What evidence supports this thought?',
        data: {
          reframes: ['Consider alternative perspectives']
        }
      };
      
      const formatted = formatActionForDisplay(questionAction);
      
      expect(formatted.primary).toBe('What evidence supports this thought?');
      expect(formatted.secondary).toBe('Tap to explore this together');
      expect(formatted.interactive).toBe(true);
    });

    it('should format crisis support actions correctly', () => {
      const crisisAction = {
        type: 'crisis_support' as const,
        text: 'I\'m here with you. You don\'t have to go through this alone. 💙',
        data: {
          resources: ['Crisis Text Line: Text HOME to 741741']
        }
      };
      
      const formatted = formatActionForDisplay(crisisAction);
      
      expect(formatted.primary).toContain('here with you');
      expect(formatted.secondary).toBe('Immediate support available');
      expect(formatted.interactive).toBe(true);
    });
  });

  describe('Fallback Responses', () => {
    it('should provide generic response for unknown distortion type', () => {
      const unknownDecision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'chip',
        reason: 'Unknown distortion',
        targetDistortions: [],
        priority: 'medium',
        cooldownMinutes: 60,
        metadata: { fatigueScore: 0, policyMatch: 'test', confidence: 0.8 }
      };
      
      const result = render(unknownDecision);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('ack');
      expect(result!.text).toContain('difficult');
    });

    it('should handle invalid intervention types gracefully', () => {
      const invalidDecision: CBTDecision = {
        shouldIntervene: true,
        interventionType: 'invalid' as any,
        reason: 'Test',
        targetDistortions: ['all_or_nothing'],
        priority: 'medium',
        cooldownMinutes: 60,
        metadata: { fatigueScore: 0, policyMatch: 'test', confidence: 0.8 }
      };
      
      const result = render(invalidDecision);
      
      expect(result).not.toBeNull();
      expect(result!.text).toContain('support');
    });
  });
});