import { describe, it, expect, beforeEach, vi } from 'vitest';
import { thresholdLadderService, THRESHOLD_LEVELS } from '../thresholdLadderService';
import type { ContextScore } from '../contextEngineService';
import type { PolicyContext } from '../thresholdLadderService';

// Mock the decision trace service
vi.mock('../decisionTraceService', () => ({
  decisionTraceService: {
    addTrace: vi.fn()
  }
}));

describe('ThresholdLadderService', () => {
  const mockContextScore: ContextScore = {
    score: 0.75,
    because: ['High urgency due to approaching deadline', 'Trusted sender'],
    confidence: 0.75,
    priority: 80,
    urgency: 0.8,
    domain: 'General',
    reasoning: ['High urgency due to approaching deadline', 'Trusted sender'],
    signals: [
      {
        type: 'time_pressure',
        value: 0.8,
        confidence: 0.8,
        weight: 0.3,
        reason: 'deadline in 2 hours',
        source: 'context_engine'
      },
      {
        type: 'sender_trust',
        value: 0.9,
        confidence: 0.9,
        weight: 0.2,
        reason: 'frequent positive interactions',
        source: 'context_engine'
      }
    ],
    metadata: {
      timestamp: Date.now(),
      signalCount: 2,
      totalWeight: 0.5,
      deterministic: true
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Base Threshold Logic', () => {
    it('should return auto-write for high confidence scores when enabled', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.9 },
        { userAutoWriteEnabled: true }
      );

      expect(result.decision).toBe('auto-write');
      expect(result.baseThreshold).toBe('HIGH');
      expect(result.appliedOverrides).toHaveLength(0);
    });

    it('should return draft-ask for medium confidence scores', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.7 },
        {}
      );

      expect(result.decision).toBe('draft');
      expect(result.baseThreshold).toBe('MEDIUM');
    });

    it('should return suggestion for low confidence scores', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.4 },
        {}
      );

      expect(result.decision).toBe('suggest');
      expect(result.baseThreshold).toBe('LOW');
    });

    it('should degrade to draft when auto-write is disabled', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.9 },
        { userAutoWriteEnabled: false }
      );

      expect(result.decision).toBe('draft');
      expect(result.appliedOverrides).toContain('auto-write-disabled');
    });
  });

  describe('Meeting Context Override', () => {
    it('should reduce score during meetings', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.8 },
        { isInMeeting: true, userAutoWriteEnabled: true }
      );

      expect(result.score).toBe(0.65); // 0.8 - 0.15
      expect(result.appliedOverrides).toContain('meeting-context');
      expect(result.decision).toBe('draft'); // Degraded from auto-write
    });

    it('should reduce score during high meeting density', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.8 },
        { meetingDensity: 0.8, userAutoWriteEnabled: true }
      );

      expect(result.score).toBe(0.65);
      expect(result.appliedOverrides).toContain('meeting-context');
    });
  });

  describe('Quiet Hours Override', () => {
    it('should significantly reduce score during quiet hours', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.8 },
        { isQuietHours: true }
      );

      expect(result.score).toBe(0.55); // 0.8 - 0.25
      expect(result.appliedOverrides).toContain('quiet-hours');
      expect(result.decision).toBe('suggest'); // Degraded significantly
    });

    it('should not reduce score below zero', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.2 },
        { isQuietHours: true }
      );

      expect(result.score).toBe(0); // Math.max(0, 0.2 - 0.25)
    });
  });

  describe('Location Override', () => {
    it('should reduce score in low productivity locations', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.8 },
        { locationProductivity: 0.2 }
      );

      expect(result.score).toBe(0.7); // 0.8 - 0.1
      expect(result.appliedOverrides).toContain('low-productivity-location');
    });

    it('should not apply location override for neutral productivity', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.8 },
        { locationProductivity: 0.5 }
      );

      expect(result.score).toBe(0.8); // No change
      expect(result.appliedOverrides).not.toContain('low-productivity-location');
    });
  });

  describe('First-Time Recipient Override', () => {
    it('should force draft-ask for first-time recipients', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.9 },
        { isFirstTimeRecipient: true, userAutoWriteEnabled: true }
      );

      expect(result.decision).toBe('draft-ask');
      expect(result.appliedOverrides).toContain('first-time-recipient');
    });

    it('should not affect non-auto-write decisions', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.7 },
        { isFirstTimeRecipient: true }
      );

      expect(result.decision).toBe('draft-ask');
      expect(result.appliedOverrides).not.toContain('first-time-recipient');
    });
  });

  describe('Multiple Overrides', () => {
    it('should apply multiple overrides and compound their effects', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.9 },
        {
          isInMeeting: true,
          isQuietHours: true,
          isFirstTimeRecipient: true,
          userAutoWriteEnabled: true
        }
      );

      expect(result.score).toBe(0.5); // 0.9 - 0.15 - 0.25
      expect(result.appliedOverrides).toContain('meeting-context');
      expect(result.appliedOverrides).toContain('quiet-hours');
      expect(result.appliedOverrides).toContain('first-time-recipient');
      expect(result.decision).toBe('draft-ask'); // Multiple constraints
    });

    it('should reduce confidence with multiple overrides', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.8 },
        {
          isInMeeting: true,
          isQuietHours: true,
          locationProductivity: 0.2
        }
      );

      expect(result.confidence).toBeLessThan(0.8); // Reduced due to overrides
      expect(result.appliedOverrides).toHaveLength(3);
    });
  });

  describe('Reason Generation', () => {
    it('should generate clear reasons for decisions', () => {
      const result = thresholdLadderService.applyThresholds(
        mockContextScore,
        { userAutoWriteEnabled: true }
      );

      expect(result.reason).toContain('Medium confidence');
      expect(result.reason).toContain('requires confirmation');
      expect(result.reason).toContain('deadline in 2 hours');
    });

    it('should include override reasons', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.9 },
        { isQuietHours: true, userAutoWriteEnabled: true }
      );

      expect(result.reason).toContain('quiet hours policy');
    });
  });

  describe('Threshold Configuration', () => {
    it('should use default thresholds when no config is stored', () => {
      const config = thresholdLadderService.getThresholdConfiguration();
      expect(config).toEqual(THRESHOLD_LEVELS);
    });

    it('should allow updating threshold configuration', () => {
      const newConfig = { HIGH: 0.9, MEDIUM: 0.7 };
      thresholdLadderService.updateThresholdConfiguration(newConfig);
      
      const stored = thresholdLadderService.getThresholdConfiguration();
      expect(stored.HIGH).toBe(0.9);
      expect(stored.MEDIUM).toBe(0.7);
      expect(stored.LOW).toBe(THRESHOLD_LEVELS.LOW); // Unchanged
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context gracefully', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.5 },
        {}
      );

      expect(result.decision).toBe('suggest');
      expect(result.appliedOverrides).toHaveLength(0);
    });

    it('should handle perfect scores', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 1.0 },
        { userAutoWriteEnabled: true }
      );

      expect(result.decision).toBe('auto-write');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle zero scores', () => {
      const result = thresholdLadderService.applyThresholds(
        { ...mockContextScore, score: 0.0 },
        {}
      );

      expect(result.decision).toBe('suggest');
      expect(result.score).toBe(0);
    });
  });
});