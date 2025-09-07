import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cbtCopyService } from '../cbtCopyService';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('CBTCopyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('getChipCopy', () => {
    it('returns variant A copy', () => {
      const copy = cbtCopyService.getChipCopy('AllOrNothing', 'A');

      expect(copy).toMatchObject({
        promptText: expect.stringContaining('moment to explore'),
        primaryAction: 'Yes, please',
        dismissAction: 'Maybe later',
        explainability: expect.stringContaining('absolute language')
      });
    });

    it('returns variant B copy', () => {
      const copy = cbtCopyService.getChipCopy('Catastrophizing', 'B');

      expect(copy).toMatchObject({
        promptText: expect.stringContaining('look at this together'),
        primaryAction: "I'm ready",
        dismissAction: 'Not right now',
        explainability: expect.stringContaining('worst-case')
      });
    });

    it('returns variant C copy', () => {
      const copy = cbtCopyService.getChipCopy('EmotionalReasoning', 'C');

      expect(copy).toMatchObject({
        promptText: expect.stringContaining('check something'),
        primaryAction: 'Sure',
        dismissAction: 'Another time',
        explainability: expect.stringContaining('feelings as facts')
      });
    });

    it('falls back to default variant for unknown types', () => {
      const copy = cbtCopyService.getChipCopy('UnknownType' as any, 'A');

      expect(copy).toMatchObject({
        promptText: 'Want to explore this together?',
        primaryAction: 'Yes, please',
        dismissAction: 'Maybe later',
        explainability: 'because I noticed a thinking pattern'
      });
    });
  });

  describe('getRandomVariant', () => {
    it('returns one of the valid variants', () => {
      const variant = cbtCopyService.getRandomVariant();
      expect(['A', 'B', 'C']).toContain(variant);
    });

    it('maintains consistency for same user session', () => {
      const variant1 = cbtCopyService.getRandomVariant();
      const variant2 = cbtCopyService.getRandomVariant();
      expect(variant1).toBe(variant2);
    });
  });

  describe('getActiveVariant', () => {
    it('retrieves stored variant from localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('B');
      
      const variant = cbtCopyService.getActiveVariant();
      expect(variant).toBe('B');
    });

    it('generates new variant when none stored', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      const variant = cbtCopyService.getActiveVariant();
      expect(['A', 'B', 'C']).toContain(variant);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'cbt_copy_variant',
        variant
      );
    });
  });

  describe('recordVariantInteraction', () => {
    it('records engagement interaction', () => {
      cbtCopyService.recordVariantInteraction('B', 'engaged', 'trace-123');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'cbt_copy_metrics',
        expect.stringContaining('"variant":"B"')
      );
    });

    it('records dismissal interaction', () => {
      cbtCopyService.recordVariantInteraction('A', 'dismissed', 'trace-456');

      const metricsCall = mockLocalStorage.setItem.mock.calls.find(
        call => call[0] === 'cbt_copy_metrics'
      );
      const metricsData = JSON.parse(metricsCall[1]);
      
      expect(metricsData).toMatchObject({
        variant: 'A',
        action: 'dismissed',
        traceId: 'trace-456',
        timestamp: expect.any(Number)
      });
    });

    it('appends to existing metrics', () => {
      const existingMetrics = [
        { variant: 'A', action: 'engaged', traceId: 'trace-1', timestamp: 123 }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingMetrics));

      cbtCopyService.recordVariantInteraction('B', 'dismissed', 'trace-2');

      const metricsCall = mockLocalStorage.setItem.mock.calls.find(
        call => call[0] === 'cbt_copy_metrics'
      );
      const metricsData = JSON.parse(metricsCall[1]);
      
      expect(metricsData).toHaveLength(2);
      expect(metricsData[1]).toMatchObject({
        variant: 'B',
        action: 'dismissed',
        traceId: 'trace-2'
      });
    });
  });

  describe('getCopyMetrics', () => {
    it('returns empty metrics when none stored', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      const metrics = cbtCopyService.getCopyMetrics();
      
      expect(metrics).toEqual({
        variantA: { engagements: 0, dismissals: 0, engagementRate: 0 },
        variantB: { engagements: 0, dismissals: 0, engagementRate: 0 },
        variantC: { engagements: 0, dismissals: 0, engagementRate: 0 }
      });
    });

    it('calculates metrics from stored interactions', () => {
      const interactions = [
        { variant: 'A', action: 'engaged', traceId: 'trace-1', timestamp: 123 },
        { variant: 'A', action: 'engaged', traceId: 'trace-2', timestamp: 124 },
        { variant: 'A', action: 'dismissed', traceId: 'trace-3', timestamp: 125 },
        { variant: 'B', action: 'engaged', traceId: 'trace-4', timestamp: 126 },
        { variant: 'B', action: 'dismissed', traceId: 'trace-5', timestamp: 127 },
        { variant: 'B', action: 'dismissed', traceId: 'trace-6', timestamp: 128 }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(interactions));

      const metrics = cbtCopyService.getCopyMetrics();

      expect(metrics).toEqual({
        variantA: { 
          engagements: 2, 
          dismissals: 1, 
          engagementRate: 2/3 
        },
        variantB: { 
          engagements: 1, 
          dismissals: 2, 
          engagementRate: 1/3 
        },
        variantC: { 
          engagements: 0, 
          dismissals: 0, 
          engagementRate: 0 
        }
      });
    });
  });

  describe('clearCopyData', () => {
    it('removes all copy-related data from localStorage', () => {
      cbtCopyService.clearCopyData();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('cbt_copy_variant');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('cbt_copy_metrics');
    });
  });

  describe('integration with polishCopy', () => {
    it('applies copy polish to all text variants', () => {
      // Mock polishCopy to replace CBT terms
      vi.mock('@/utils/copyPolish', () => ({
        polishCopy: vi.fn((text) => text.replace(/CBT/g, 'check-in'))
      }));

      const copy = cbtCopyService.getChipCopy('AllOrNothing', 'A');

      expect(copy.promptText).not.toContain('CBT');
      expect(copy.explainability).not.toContain('CBT');
    });
  });
});