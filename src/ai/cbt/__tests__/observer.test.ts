/**
 * CBT Observer Tests - Contract tests for message analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { annotate, resetConversationHistory } from '../observer';

describe('CBT Observer', () => {
  beforeEach(() => {
    resetConversationHistory();
    // Mock localStorage for feature flags
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    } as any;
  });
  const mockContext = {
    messageId: 'test-message-1',
    timestamp: Date.now(),
    conversationDepth: 1
  };

  describe('Distortion Detection', () => {
    it('should detect all-or-nothing thinking', () => {
      const message = "I always mess everything up. I'm completely useless.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.distortions.length).toBeGreaterThanOrEqual(1);
        expect(result.distortions[0].type).toBe('all_or_nothing');
        expect(result.distortions[0].confidence).toBeGreaterThan(0.5);
        expect(result.distortions[0].keywords).toContain('always');
      }
    });

    it('should detect catastrophizing', () => {
      const message = "This is going to be a complete disaster. Everything will fall apart.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.distortions.some(d => d.type === 'catastrophizing')).toBe(true);
        const catastrophizing = result.distortions.find(d => d.type === 'catastrophizing');
        expect(catastrophizing?.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect overgeneralization', () => {
      const message = "Nobody likes me. This always happens to me.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.distortions.some(d => d.type === 'overgeneralization')).toBe(true);
      }
    });

    it('should detect should statements', () => {
      const message = "I should be perfect at this. I must never make mistakes.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.distortions.some(d => d.type === 'should_statements')).toBe(true);
      }
    });

    it('should detect mind reading', () => {
      const message = "She probably thinks I'm stupid. He must think I'm incompetent.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.distortions.some(d => d.type === 'mind_reading')).toBe(true);
      }
    });

    it('should not detect distortions in neutral messages', () => {
      const message = "I went to the store today and bought some groceries.";
      const result = annotate(message, mockContext);
      
      // Should return null for neutral messages with no significant findings
      expect(result).toBeNull();
    });
  });

  describe('Sentiment Analysis', () => {
    it('should detect positive sentiment', () => {
      const message = "I'm feeling great today! This is wonderful and amazing.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.sentiment.score).toBeGreaterThan(0);
        expect(result.sentiment.magnitude).toBeGreaterThan(0);
      }
    });

    it('should detect negative sentiment', () => {
      const message = "I hate this terrible situation. Everything is awful and bad.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.sentiment.score).toBeLessThan(0);
        expect(result.sentiment.magnitude).toBeGreaterThan(0);
      }
    });

    it('should handle neutral sentiment', () => {
      const message = "The weather is cloudy today.";
      const result = annotate(message, mockContext);
      
      // Neutral messages may return null due to high precision threshold
      if (result) {
        expect(Math.abs(result.sentiment.score)).toBeLessThan(0.3);
      } else {
        expect(result).toBeNull();
      }
    });
  });

  describe('Crisis Detection', () => {
    it('should detect self-harm indicators', () => {
      const message = "I want to hurt myself. I can't take this pain anymore.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.crisisFlags.length).toBeGreaterThanOrEqual(1);
        expect(result.crisisFlags[0].type).toBe('self_harm');
        expect(result.crisisFlags[0].severity).toBe('high');
      }
    });

    it('should detect suicide indicators', () => {
      const message = "I want to end it all. Life isn't worth living anymore.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.crisisFlags.some(f => f.type === 'suicide')).toBe(true);
        const suicideFlag = result.crisisFlags.find(f => f.type === 'suicide');
        expect(suicideFlag?.severity).toBe('critical');
      }
    });

    it('should detect severe distress', () => {
      const message = "I can't take it anymore. I'm completely overwhelmed and falling apart.";
      const result = annotate(message, mockContext);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.crisisFlags.some(f => f.type === 'severe_distress')).toBe(true);
      }
    });
  });

  describe('Context Handling', () => {
    it('should include provided context', () => {
      const contextWithMood = {
        ...mockContext,
        recentMood: 'anxious'
      };
      
      const result = annotate("I'm worried about tomorrow.", contextWithMood);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.context.recentMood).toBe('anxious');
        expect(result.context.conversationDepth).toBe(1);
        expect(result.context.timeOfDay).toBeGreaterThanOrEqual(0);
        expect(result.context.timeOfDay).toBeLessThan(24);
      }
    });

    it('should handle missing optional context', () => {
      const minimalContext = {
        messageId: 'test',
        timestamp: Date.now()
      };
      
      const result = annotate("Test message", minimalContext);
      
      // May return null for minimal neutral content
      if (result) {
        expect(result.context.recentMood).toBeUndefined();
        expect(result.context.conversationDepth).toBe(0);
      }
    });
  });
});

// Golden samples for comprehensive testing
describe('CBT Observer - Golden Samples', () => {
  const goldenSamples = [
    {
      message: "I always fail at everything I try. Nothing ever works out for me.",
      expectedDistortions: ['all_or_nothing', 'overgeneralization'],
      expectedSentiment: 'negative'
    },
    {
      message: "This presentation is going to be a disaster. Everyone will think I'm incompetent.",
      expectedDistortions: ['catastrophizing', 'mind_reading'],
      expectedSentiment: 'negative'
    },
    {
      message: "I should be able to handle this perfectly. I must never show weakness.",
      expectedDistortions: ['should_statements', 'all_or_nothing'],
      expectedSentiment: 'neutral'
    },
    {
      message: "Nobody understands me. People always judge me unfairly.",
      expectedDistortions: ['overgeneralization', 'mind_reading'],
      expectedSentiment: 'negative'
    },
    {
      message: "I had a good day at work. My colleague complimented my project.",
      expectedDistortions: [],
      expectedSentiment: 'positive'
    },
    {
      message: "I'm thinking about hurting myself. I can't see any way out.",
      expectedDistortions: [],
      expectedCrisis: ['self_harm'],
      expectedSentiment: 'negative'
    }
  ];

  goldenSamples.forEach((sample, index) => {
    it(`should correctly analyze golden sample ${index + 1}`, () => {
      const result = annotate(sample.message, {
        messageId: `golden-${index}`,
        timestamp: Date.now()
      });

      if (sample.expectedDistortions.length > 0 || sample.expectedCrisis) {
        expect(result).not.toBeNull();
        
        if (result) {
          // Check distortions
          sample.expectedDistortions.forEach(expectedType => {
            expect(result.distortions.some(d => d.type === expectedType)).toBe(true);
          });

          // Check sentiment direction
          if (sample.expectedSentiment === 'positive') {
            expect(result.sentiment.score).toBeGreaterThan(0);
          } else if (sample.expectedSentiment === 'negative') {
            expect(result.sentiment.score).toBeLessThan(0);
          }

          // Check crisis flags
          if (sample.expectedCrisis) {
            sample.expectedCrisis.forEach(expectedCrisis => {
              expect(result.crisisFlags.some(f => f.type === expectedCrisis)).toBe(true);
            });
          }
        }
      } else {
        // For samples with no expected issues, result may be null due to high precision
        if (result) {
          expect(result.distortions).toHaveLength(0);
          if (sample.expectedSentiment === 'positive') {
            expect(result.sentiment.score).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});