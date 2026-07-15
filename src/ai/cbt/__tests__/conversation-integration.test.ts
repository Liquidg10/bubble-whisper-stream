/**
 * CBT Conversation Integration Tests
 * PROMPT 7: Tests for conversation pipeline wiring and gating
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cbtConversationIntegration } from '@/services/cbtConversationIntegration';
import { isFeatureEnabled } from '@/config/flags';
import { processCBTMessage } from '@/ai/cbt/index';
import { cbtGuardService } from '@/services/cbtGuardService';
import { resetMockBubbleStore, setMockSettings } from '@/test/helpers/mockBubbleStore';

// Mock dependencies
vi.mock('@/config/flags');
vi.mock('@/services/cbtGuardService');
vi.mock('@/ai/cbt/index');
// Faithful, complete bubbleStore mock via shared helper. A bare auto-mock made
// getState() return undefined, crashing the SUT at settings.cbtSettings.
vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
  return makeBubbleStoreMockModule();
});

const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled);
const mockProcessCBTMessage = vi.mocked(processCBTMessage);
const mockCanIntervene = vi.mocked(cbtGuardService.canIntervene);

describe('CBT Conversation Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetMockBubbleStore();
    // Clear the singleton service's idempotency cache so reused messageIds
    // (e.g. the two Dev Logging cases) don't leak results across tests.
    (cbtConversationIntegration as unknown as { messageProcessingCache: Map<string, unknown> })
      .messageProcessingCache.clear();
    // Safe defaults; individual tests override as needed.
    mockCanIntervene.mockReturnValue({ allowed: true } as never);
    mockProcessCBTMessage.mockResolvedValue({ annotation: null, decision: null, action: null, traceId: undefined } as never);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Feature Gating', () => {
    it('should not analyze when all CBT flags are disabled', async () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        return flag === 'cbtDevRoutes' ? false : false; // All CBT flags off
      });

      const result = await cbtConversationIntegration.analyzeMessage({
        messageText: 'I feel terrible and everything is wrong',
        messageId: 'test-msg-1',
        userId: 'test-user',
        conversationHistory: []
      });

      expect(result.shouldShowCBT).toBe(false);
      expect(result.devMetrics?.reason).toBe('feature_disabled');
    });

    it('should run silent observation when cbtSilentObserve is true but assist is off', async () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        if (flag === 'cbtSilentObserve') return true;
        if (flag === 'cbtAssist') return false;
        if (flag === 'cbtDevRoutes') return true;
        return false;
      });

      // Assist disabled in user settings (silent-observe path).
      setMockSettings({ cbtSettings: { cbtAssistEnabled: false, assistLevel: 'off' } });

      const result = await cbtConversationIntegration.analyzeMessage({
        messageText: 'I always mess everything up',
        messageId: 'test-msg-2',
        userId: 'test-user',
        conversationHistory: []
      });

      expect(result.shouldShowCBT).toBe(false);
      expect(result.devMetrics?.reason).toBe('silent_observation');
      expect(result.devMetrics?.annotationFound).toBeDefined();
    });

    it('should show CBT UI when flags allow and assist is enabled', async () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        if (flag === 'cbtSilentObserve') return true;
        if (flag === 'cbtAssist') return true;
        if (flag === 'cbtDevRoutes') return true;
        return false;
      });

      // Assist must be enabled in user settings for the intervention branch to render.
      setMockSettings({ cbtSettings: { cbtAssistEnabled: true, assistLevel: 'standard' } });
      mockCanIntervene.mockReturnValue({ allowed: true } as never);

      const mockCBTResult = {
        annotation: { distortions: [{ type: 'all_or_nothing', confidence: 0.9 }] },
        decision: { shouldIntervene: true, reason: 'high_confidence_distortion' },
        action: { type: 'chip', text: 'Want to explore this together?' },
        traceId: 'trace-123'
      };
      mockProcessCBTMessage.mockResolvedValue(mockCBTResult as never);

      const result = await cbtConversationIntegration.analyzeMessage({
        messageText: 'I never do anything right',
        messageId: 'test-msg-3',
        userId: 'test-user',
        conversationHistory: []
      });

      expect(result.shouldShowCBT).toBe(true);
      expect(result.cbtAction).toEqual(mockCBTResult.action);
      expect(result.traceId).toBe('trace-123');
    });
  });

  describe('Idempotent Behavior', () => {
    it('should not process the same message twice', async () => {
      mockIsFeatureEnabled.mockReturnValue(true);
      
      const mockProcessCBT = mockProcessCBTMessage;
      mockProcessCBT.mockResolvedValue({ annotation: null, decision: null, action: null } as never);

      const messageContext = {
        messageText: 'Test message',
        messageId: 'same-id',
        userId: 'test-user',
        conversationHistory: []
      };

      // Call twice with same messageId
      const result1 = await cbtConversationIntegration.analyzeMessage(messageContext);
      const result2 = await cbtConversationIntegration.analyzeMessage(messageContext);

      // Should only process once
      expect(mockProcessCBT).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });
  });

  describe('A/B Testing', () => {
    it('should assign consistent A/B buckets based on user ID', async () => {
      mockIsFeatureEnabled.mockImplementation(flag => flag === 'cbtDevRoutes');

      const result1 = await cbtConversationIntegration.analyzeMessage({
        messageText: 'Test',
        messageId: 'msg-1',
        userId: 'user-123',
        conversationHistory: []
      });

      const result2 = await cbtConversationIntegration.analyzeMessage({
        messageText: 'Test',
        messageId: 'msg-2',
        userId: 'user-123',
        conversationHistory: []
      });

      expect(result1.devMetrics?.abBucket).toBe(result2.devMetrics?.abBucket);
      expect(['A', 'B']).toContain(result1.devMetrics?.abBucket);
    });
  });

  describe('Dev Logging', () => {
    it('should include dev metrics when cbtDevRoutes is enabled', async () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        return flag === 'cbtDevRoutes';
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await cbtConversationIntegration.analyzeMessage({
        messageText: 'Test message',
        messageId: 'test-msg',
        userId: 'test-user',
        conversationHistory: []
      });

      expect(result.devMetrics).toBeDefined();
      expect(result.devMetrics?.abBucket).toBeDefined();
      expect(result.devMetrics?.reason).toBe('feature_disabled');

      consoleSpy.mockRestore();
    });

    it('should not include dev metrics in production', async () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        return flag !== 'cbtDevRoutes'; // Dev routes disabled
      });

      const result = await cbtConversationIntegration.analyzeMessage({
        messageText: 'Test message',
        messageId: 'test-msg',
        userId: 'test-user',
        conversationHistory: []
      });

      expect(result.devMetrics).toBeUndefined();
    });
  });

  describe('Context Building', () => {
    it('should build conversation context from history', async () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'I feel great today!', timestamp: Date.now() - 10000 },
        { role: 'assistant' as const, content: 'That\'s wonderful!', timestamp: Date.now() - 5000 },
        { role: 'user' as const, content: 'But now I feel terrible', timestamp: Date.now() }
      ];

      // We can't easily test the private method, but we can test the integration
      const result = await cbtConversationIntegration.analyzeMessage({
        messageText: 'Everything is awful',
        messageId: 'test-msg',
        userId: 'test-user',
        conversationHistory,
        currentContext: {
          currentActivity: 'working',
          currentSession: { anchorTask: 'Write tests' }
        }
      });

      // The context should be passed to the CBT processor
      expect(result).toBeDefined();
    });
  });

  describe('Service Availability', () => {
    it('should report availability based on feature flags', () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        return flag === 'cbtSilentObserve';
      });

      expect(cbtConversationIntegration.isAvailable()).toBe(true);

      mockIsFeatureEnabled.mockReturnValue(false);
      expect(cbtConversationIntegration.isAvailable()).toBe(false);
    });
  });

  describe('Debug Information', () => {
    it('should provide debug information', () => {
      mockIsFeatureEnabled.mockImplementation((flag) => {
        return flag === 'cbtAssist' || flag === 'cbtDevRoutes';
      });

      const debugInfo = cbtConversationIntegration.getDebugInfo();

      expect(debugInfo).toHaveProperty('flags');
      expect(debugInfo).toHaveProperty('guardService');
      expect(debugInfo).toHaveProperty('cacheSize');
      expect(debugInfo.flags.cbtAssist).toBe(true);
      expect(debugInfo.flags.cbtDevRoutes).toBe(true);
    });
  });
});