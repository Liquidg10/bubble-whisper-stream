/**
 * Context Engine Service Tests
 * Tests for deterministic scoring and "Because..." generation
 */

import { describe, it, expect } from 'vitest';
import { contextEngineService, ContextInput, ContextScore } from '../contextEngineService';

// Test fixtures for different confidence scenarios
const HIGH_CONFIDENCE_FIXTURE: ContextInput = {
  content: "Meeting with John at 3:00 PM tomorrow at Conference Room A to finalize the Q4 budget",
  sender: "john@company.com",
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  eventType: 'calendar',
  currentTime: new Date('2024-01-15T14:00:00Z')
};

const MEDIUM_CONFIDENCE_FIXTURE: ContextInput = {
  content: "Maybe we could meet sometime next week to discuss the project",
  sender: "colleague@gmail.com",
  eventType: 'email',
  currentTime: new Date('2024-01-15T10:00:00Z')
};

const LOW_CONFIDENCE_FIXTURE: ContextInput = {
  content: "Not sure when we can connect, possibly sometime or maybe later",
  sender: "unknown@randomdomain.com",
  eventType: 'email',
  currentTime: new Date('2024-01-15T23:00:00Z') // Quiet hours
};

const URGENT_FIXTURE: ContextInput = {
  content: "URGENT: Need to schedule emergency meeting ASAP about critical issue",
  sender: "ceo@company.com",
  deadline: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
  eventType: 'calendar',
  currentTime: new Date('2024-01-15T09:00:00Z')
};

const AMBIGUOUS_FIXTURE: ContextInput = {
  content: "We could meet either Monday or Tuesday, maybe at 2 PM or 3 PM, possibly in Room A or B",
  sender: "team@company.com",
  eventType: 'calendar',
  currentTime: new Date('2024-01-15T11:00:00Z')
};

describe('ContextEngineService', () => {
  describe('Deterministic Scoring', () => {
    it('should produce identical scores for identical inputs', async () => {
      const score1 = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      const score2 = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      expect(score1.score).toBe(score2.score);
      expect(score1.metadata.deterministic).toBe(true);
      expect(score2.metadata.deterministic).toBe(true);
    });

    it('should produce different scores for different inputs', async () => {
      const highScore = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      const lowScore = await contextEngineService.generateScore(LOW_CONFIDENCE_FIXTURE);
      
      expect(highScore.score).toBeGreaterThan(lowScore.score);
    });

    it('should maintain score consistency across multiple calls', async () => {
      const scores = await Promise.all([
        contextEngineService.generateScore(MEDIUM_CONFIDENCE_FIXTURE),
        contextEngineService.generateScore(MEDIUM_CONFIDENCE_FIXTURE),
        contextEngineService.generateScore(MEDIUM_CONFIDENCE_FIXTURE)
      ]);
      
      const [first, second, third] = scores;
      expect(first.score).toBe(second.score);
      expect(second.score).toBe(third.score);
    });
  });

  describe('High Confidence Scenarios', () => {
    it('should score high confidence scenarios correctly', async () => {
      const score = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      expect(score.score).toBeGreaterThan(0.7);
      expect(score.signals.length).toBeGreaterThan(0);
      expect(score.because.length).toBeGreaterThan(0);
      
      // Should include time pressure signal
      const timePressureSignal = score.signals.find(s => s.type === 'time_pressure');
      expect(timePressureSignal).toBeDefined();
      
      // Should include sender trust signal  
      const senderTrustSignal = score.signals.find(s => s.type === 'sender_trust');
      expect(senderTrustSignal).toBeDefined();
      expect(senderTrustSignal?.value).toBeGreaterThan(0.5); // Company email should be trusted
      
      // Should include content certainty signal
      const contentCertaintySignal = score.signals.find(s => s.type === 'content_certainty');
      expect(contentCertaintySignal).toBeDefined();
      expect(contentCertaintySignal?.value).toBeGreaterThan(0.6); // Has time and location
    });

    it('should generate appropriate "because" explanations for high confidence', async () => {
      const score = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      // Item 2 (2026-07-03): `.toContain()` doesn't support asymmetric matchers in this
      // vitest version (always fails regardless of array contents) — `.toContainEqual()`
      // is the correct API for an array-membership check against expect.stringMatching().
      expect(score.because).toContainEqual(expect.stringMatching(/deadline|24 hours|today/i));
      expect(score.because.some(reason => reason.includes('trusted') || reason.includes('company'))).toBe(true);
      expect(score.because.some(reason => reason.includes('date') || reason.includes('location'))).toBe(true);
    });
  });

  describe('Medium Confidence Scenarios', () => {
    it('should score medium confidence scenarios correctly', async () => {
      const score = await contextEngineService.generateScore(MEDIUM_CONFIDENCE_FIXTURE);
      
      expect(score.score).toBeGreaterThan(0.3);
      expect(score.score).toBeLessThan(0.8);
      
      // Should have ambiguity signal due to "maybe" and "sometime"
      const ambiguitySignal = score.signals.find(s => s.type === 'ambiguity');
      expect(ambiguitySignal).toBeDefined();
      
      // Should have sender trust signal with medium trust (Gmail)
      const senderTrustSignal = score.signals.find(s => s.type === 'sender_trust');
      expect(senderTrustSignal?.value).toBeGreaterThan(0.4);
      expect(senderTrustSignal?.value).toBeLessThan(0.8);
    });

    it('should generate appropriate "because" explanations for medium confidence', async () => {
      const score = await contextEngineService.generateScore(MEDIUM_CONFIDENCE_FIXTURE);
      
      expect(score.because.some(reason => reason.includes('uncertain') || reason.includes('ambiguity'))).toBe(true);
      expect(score.because.some(reason => reason.includes('Regular') || reason.includes('contact'))).toBe(true);
    });
  });

  describe('Low Confidence Scenarios', () => {
    it('should score low confidence scenarios correctly', async () => {
      const score = await contextEngineService.generateScore(LOW_CONFIDENCE_FIXTURE);
      
      expect(score.score).toBeLessThan(0.5);
      
      // Should have quiet hours signal
      const quietHoursSignal = score.signals.find(s => s.type === 'quiet_hours');
      expect(quietHoursSignal).toBeDefined();
      expect(quietHoursSignal?.value).toBeLessThan(0.3);
      
      // Should have low sender trust
      const senderTrustSignal = score.signals.find(s => s.type === 'sender_trust');
      expect(senderTrustSignal?.value).toBeLessThan(0.5);
      
      // Should detect high ambiguity
      const ambiguitySignal = score.signals.find(s => s.type === 'ambiguity');
      expect(ambiguitySignal).toBeDefined();
      expect(ambiguitySignal?.value).toBeLessThan(0.7); // Low confidence due to high ambiguity
    });

    it('should generate appropriate "because" explanations for low confidence', async () => {
      const score = await contextEngineService.generateScore(LOW_CONFIDENCE_FIXTURE);
      
      expect(score.because.some(reason => reason.includes('quiet hours'))).toBe(true);
      expect(score.because.some(reason => reason.includes('uncertain') || reason.includes('conflicting'))).toBe(true);
      expect(score.because.some(reason => reason.includes('Infrequent') || reason.includes('new contact'))).toBe(true);
    });
  });

  describe('Urgent Scenarios', () => {
    it('should handle urgent scenarios with high time pressure', async () => {
      const score = await contextEngineService.generateScore(URGENT_FIXTURE);
      
      expect(score.score).toBeGreaterThan(0.8);
      
      // Should have high time pressure signals
      const timePressureSignals = score.signals.filter(s => s.type === 'time_pressure');
      expect(timePressureSignals.length).toBeGreaterThan(0);
      
      // At least one signal should have high value due to deadline proximity
      const hasHighPressure = timePressureSignals.some(s => s.value > 0.8);
      expect(hasHighPressure).toBe(true);
      
      // Should also detect urgency keywords
      const hasUrgencyKeywords = timePressureSignals.some(s => 
        s.reason.includes('urgency keyword')
      );
      expect(hasUrgencyKeywords).toBe(true);
    });
  });

  describe('Ambiguous Scenarios', () => {
    it('should detect and penalize ambiguous content', async () => {
      const score = await contextEngineService.generateScore(AMBIGUOUS_FIXTURE);
      
      const ambiguitySignal = score.signals.find(s => s.type === 'ambiguity');
      expect(ambiguitySignal).toBeDefined();
      expect(ambiguitySignal?.value).toBeLessThan(0.6); // Should be penalized for ambiguity
      
      expect(ambiguitySignal?.reason).toMatch(/uncertain|conflicting/i);
    });
  });

  describe('Signal Processing', () => {
    it('should process all relevant signal types', async () => {
      const score = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      // Should have multiple signal types
      const signalTypes = new Set(score.signals.map(s => s.type));
      expect(signalTypes.size).toBeGreaterThan(3);
      
      // Each signal should have required properties
      score.signals.forEach(signal => {
        expect(signal.value).toBeGreaterThanOrEqual(0);
        expect(signal.value).toBeLessThanOrEqual(1);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
        expect(signal.weight).toBeGreaterThan(0);
        expect(signal.reason).toBeTruthy();
      });
    });

    it('should respect signal weights in scoring', async () => {
      // Test with default weights
      const originalScore = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      // Modify weights to emphasize time pressure
      const originalWeights = contextEngineService.getSignalWeights();
      contextEngineService.updateSignalWeights(new Map([
        ['time_pressure', 0.8],
        ['sender_trust', 0.1],
        ['content_certainty', 0.1]
      ]));
      
      const modifiedScore = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      // Reset weights
      contextEngineService.updateSignalWeights(originalWeights);
      
      // Scores should be different due to weight changes
      expect(modifiedScore.score).not.toBe(originalScore.score);
    });
  });

  describe('Metadata and Traceability', () => {
    it('should include comprehensive metadata', async () => {
      const score = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      expect(score.metadata.signalCount).toBe(score.signals.length);
      expect(score.metadata.totalWeight).toBeGreaterThan(0);
      expect(score.metadata.deterministic).toBe(true);
      expect(score.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should limit "because" explanations to reasonable number', async () => {
      const score = await contextEngineService.generateScore(HIGH_CONFIDENCE_FIXTURE);
      
      expect(score.because.length).toBeLessThanOrEqual(5);
      expect(score.because.every(reason => typeof reason === 'string')).toBe(true);
      expect(score.because.every(reason => reason.length > 0)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const emptyInput: ContextInput = { content: '', eventType: 'email' };
      const score = await contextEngineService.generateScore(emptyInput);
      
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
      expect(score.signals).toBeDefined();
      expect(score.because).toBeDefined();
    });

    it('should handle past deadlines correctly', async () => {
      const pastDeadlineInput: ContextInput = {
        ...HIGH_CONFIDENCE_FIXTURE,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        currentTime: new Date()
      };
      
      const score = await contextEngineService.generateScore(pastDeadlineInput);
      
      // Should still process but with different time pressure
      const timePressureSignal = score.signals.find(s => s.type === 'time_pressure');
      expect(timePressureSignal).toBeDefined();
    });
  });
});