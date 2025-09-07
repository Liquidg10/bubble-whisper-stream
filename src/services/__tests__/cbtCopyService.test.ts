import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getChipCopy, getContextualEncouragement, validateChipCopy } from '../cbtCopyService';
import { polishCopy } from '@/utils/copyPolish';

// Mock polishCopy
vi.mock('@/utils/copyPolish', () => ({
  polishCopy: vi.fn((text) => text.replace(/CBT/g, 'check-in'))
}));

describe('CBTCopyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChipCopy', () => {
    it('returns appropriate copy for user and action type', () => {
      const copy1 = getChipCopy('user-1', 'general');
      const copy2 = getChipCopy('user-2', 'general');

      expect(copy1).toHaveProperty('promptText');
      expect(copy1).toHaveProperty('primaryAction');
      expect(copy1).toHaveProperty('dismissAction');
      expect(copy1).toHaveProperty('explainability');

      // Different users may get different variants
      expect(typeof copy1.promptText).toBe('string');
      expect(typeof copy2.promptText).toBe('string');
    });

    it('applies context-specific copy when provided', () => {
      const copy = getChipCopy('user-1', 'general', 'reframe');
      
      expect(copy).toHaveProperty('promptText');
      expect(typeof copy.promptText).toBe('string');
    });

    it('applies copy polish to all text', () => {
      const copy = getChipCopy('user-1', 'general');
      
      // Verify that polishCopy was called
      expect(polishCopy).toHaveBeenCalled();
      expect(typeof copy.promptText).toBe('string');
      expect(typeof copy.primaryAction).toBe('string');
    });

    it('handles different contexts', () => {
      const breathingCopy = getChipCopy('user-1', 'general', 'breathing');
      const groundingCopy = getChipCopy('user-1', 'general', 'grounding');
      
      expect(typeof breathingCopy.promptText).toBe('string');
      expect(typeof groundingCopy.promptText).toBe('string');
    });
  });

  describe('getContextualEncouragement', () => {
    it('returns appropriate encouragement for context', () => {
      const dismissedMsg = getContextualEncouragement('dismissed');
      const engagedMsg = getContextualEncouragement('engaged');
      const helpfulMsg = getContextualEncouragement('helpful');

      expect(typeof dismissedMsg).toBe('string');
      expect(typeof engagedMsg).toBe('string');
      expect(typeof helpfulMsg).toBe('string');
      
      expect(dismissedMsg.length).toBeGreaterThan(0);
      expect(engagedMsg.length).toBeGreaterThan(0);
      expect(helpfulMsg.length).toBeGreaterThan(0);
    });

    it('applies copy polish to encouragement text', () => {
      getContextualEncouragement('engaged');
      
      expect(polishCopy).toHaveBeenCalled();
    });
  });

  describe('validateChipCopy', () => {
    it('validates copy for clinical and shame language', () => {
      const validText = 'Want to explore this together?';
      const invalidText = 'This cognitive distortion is wrong and terrible';
      
      const validResult = validateChipCopy(validText);
      const invalidResult = validateChipCopy(invalidText);
      
      expect(validResult.isValid).toBe(true);
      expect(validResult.issues).toHaveLength(0);
      
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.issues.length).toBeGreaterThan(0);
      expect(invalidResult.suggestions.length).toBeGreaterThan(0);
    });

    it('identifies clinical terms', () => {
      const textWithClinicalTerms = 'This cognitive distortion needs therapy treatment';
      const result = validateChipCopy(textWithClinicalTerms);
      
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('cognitive distortion'))).toBe(true);
      expect(result.issues.some(issue => issue.includes('therapy'))).toBe(true);
    });

    it('identifies shame language', () => {
      const textWithShameLanguage = 'You are wrong and this is terrible because you should have known better';
      const result = validateChipCopy(textWithShameLanguage);
      
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('wrong'))).toBe(true);
      expect(result.issues.some(issue => issue.includes('terrible'))).toBe(true);
      expect(result.issues.some(issue => issue.includes('should have'))).toBe(true);
    });

    it('provides suggestions for improvement', () => {
      const invalidText = 'This cognitive distortion is wrong';
      const result = validateChipCopy(invalidText);
      
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.every(suggestion => typeof suggestion === 'string')).toBe(true);
    });
  });
});