/**
 * CBT Integration Tests - AI conversation enhancement validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cbtAIIntegration } from '../integration';
import type { CBTIntegrationResult } from '../integration';
import { cbtGuardService } from '@/services/cbtGuardService';
import { isFeatureEnabled } from '@/config/flags';
import { useBubbleStore } from '@/stores/bubbleStore';

// Mock the CBT guard service
vi.mock('@/services/cbtGuardService', () => ({
  cbtGuardService: {
    canIntervene: vi.fn(() => ({ allowed: true })),
    isFeatureAllowed: vi.fn(() => true),
    // trace.ts's persist() calls this on every processCBTMessage() run to
    // mint a telemetry-safe pseudonymous id; without a stub here it throws
    // ("generatePseudonymousId is not a function"), which analyzeForConversation's
    // try/catch silently swallows -- turning a real crisis-path success into
    // a false-looking `shouldShowCBTResponse: false`. Verified real signature:
    // src/services/cbtGuardService.ts:160, generatePseudonymousId(userId: string): string.
    generatePseudonymousId: vi.fn((userId: string) => `pseudo-${userId}`)
  }
}));

// Mock the feature flags
vi.mock('@/config/flags', () => ({
  isFeatureEnabled: vi.fn(() => true)
}));

// Mock the bubble store
vi.mock('@/stores/bubbleStore', () => ({
  useBubbleStore: {
    getState: vi.fn(() => ({
      settings: {
        cbtSettings: {
          assistLevel: 'subtle',
          privacyLayer: 'context',
          autoLogMode: 'ask',
          quietHours: { enabled: false, start: '22:00', end: '07:00' },
          topicExclusions: [],
          neverInterveneOn: []
        }
      }
    }))
  }
}));

describe('CBT AI Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // vi.clearAllMocks() only clears call history (mock.calls/mock.results),
    // it does NOT reset implementations set via .mockReturnValue() in
    // earlier tests. Several tests below override canIntervene/getState to
    // exercise a specific branch; without restoring defaults here, those
    // overrides silently leak into every later test in the file (confirmed
    // root cause of 3 of this file's 6 failures via a source-verified run,
    // REVIVE run 2026-07-16). Restore exactly what the vi.mock() factories
    // above establish as the baseline.
    vi.mocked(cbtGuardService.canIntervene).mockReturnValue({ allowed: true });
    vi.mocked(cbtGuardService.isFeatureAllowed).mockReturnValue(true);
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    vi.mocked(useBubbleStore.getState).mockReturnValue({
      settings: {
        cbtSettings: {
          assistLevel: 'subtle',
          privacyLayer: 'context',
          autoLogMode: 'ask',
          quietHours: { enabled: false, start: '22:00', end: '07:00' },
          topicExclusions: [],
          neverInterveneOn: []
        }
      }
    } as ReturnType<typeof useBubbleStore.getState>);
  });

  describe('Conversation Analysis', () => {
    it('should detect distortions and provide AI guidance', async () => {
      const message = "I always mess everything up. This project is going to be a disaster.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-1',
        'user-123',
        {
          messageCount: 5,
          averageSentiment: -0.5
        }
      );

      expect(result.shouldShowCBTResponse).toBe(false); // Subtle mode
      expect(result.enhancedPrompt).toBeDefined();
      expect(result.enhancedPrompt).toContain('thinking in absolute terms');
      expect(result.enhancedPrompt).toContain('worst-case scenarios');
    });

    it('should escalate to explicit CBT for standard assist level', async () => {
      // Mock standard assist level
      vi.mocked(useBubbleStore.getState).mockReturnValue({
        settings: {
          cbtSettings: {
            cbtAssistEnabled: true,
            assistLevel: 'standard',
            privacyLayer: 'context',
            autoLogMode: 'ask',
            quietHours: { enabled: false, start: '22:00', end: '07:00' },
            topicExclusions: [],
            neverInterveneOn: []
          }
        }
      } as ReturnType<typeof useBubbleStore.getState>);

      const message = "I never do anything right. Everyone thinks I'm incompetent.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-2',
        'user-123'
      );

      expect(result.shouldShowCBTResponse).toBe(true);
      expect(result.cbtAction).toBeDefined();
      expect(result.traceId).toBeDefined();
      expect(result.conversationGuidance?.tone).toBe('supportive');
    });

    it('should handle crisis situations with priority', async () => {
      const message = "I can't take this anymore. I want to hurt myself.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-3',
        'user-123'
      );

      expect(result.shouldShowCBTResponse).toBe(true);
      expect(result.cbtAction?.type).toBe('crisis_support');
      expect(result.conversationGuidance?.tone).toBe('crisis');
      expect(result.conversationGuidance?.focus).toContain('immediate_support');
    });

    it('should respect user settings and constraints', async () => {
      // Mock disabled CBT
      const mockGuard = vi.mocked(cbtGuardService);
      mockGuard.canIntervene.mockReturnValue({ 
        allowed: false, 
        reason: 'User has disabled assistance' 
      });

      const message = "Everything is falling apart.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-4',
        'user-123'
      );

      expect(result.shouldShowCBTResponse).toBe(false);
      expect(result.enhancedPrompt).toContain('empathy and support');
    });
  });

  describe('AI Prompt Enhancement', () => {
    it('should create specific guidance for different distortion types', async () => {
      const testCases = [
        {
          message: "I always fail at everything.",
          expectedGuidance: ['absolute terms', 'middle ground']
        },
        {
          message: "This is going to be a complete disaster.",
          expectedGuidance: ['worst-case scenarios', 'realistic outcomes']
        },
        {
          message: "Everyone thinks I'm stupid.",
          expectedGuidance: ['broad generalizations', 'specific situations']
        }
      ];

      for (const testCase of testCases) {
        const result = await cbtAIIntegration.analyzeForConversation(
          testCase.message,
          `msg-${Date.now()}`,
          'user-123'
        );

        expect(result.enhancedPrompt).toBeDefined();
        testCase.expectedGuidance.forEach(guidance => {
          expect(result.enhancedPrompt).toContain(guidance);
        });
      }
    });

    it('should provide empathetic guidance for negative sentiment', async () => {
      const message = "I'm feeling really down today. Nothing seems to be going right.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-5',
        'user-123',
        {
          messageCount: 3,
          averageSentiment: -0.8,
          recentMood: 'sad'
        }
      );

      expect(result.enhancedPrompt).toContain('extra empathy');
      expect(result.enhancedPrompt).toContain('emotional support');
    });
  });

  describe('Silent vs Explicit Interventions', () => {
    it('should provide silent guidance when intervention is blocked', async () => {
      const mockGuard = vi.mocked(cbtGuardService);
      mockGuard.canIntervene.mockReturnValue({ 
        allowed: false, 
        reason: 'Quiet hours active' 
      });

      const message = "I can't do anything right.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-6',
        'user-123'
      );

      expect(result.shouldShowCBTResponse).toBe(false);
      expect(result.enhancedPrompt).toContain('difficult thoughts');
      expect(result.enhancedPrompt).toContain('natural and supportive');
    });

    it('should balance explicit vs silent guidance based on settings', async () => {
      const message = "Everything is going wrong today.";
      
      // Test subtle mode
      const subtleResult = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-7a',
        'user-123'
      );
      
      expect(subtleResult.shouldShowCBTResponse).toBe(false);
      expect(subtleResult.enhancedPrompt).toBeDefined();

      // Test standard mode
      vi.mocked(useBubbleStore.getState).mockReturnValue({
        settings: {
          cbtSettings: {
            cbtAssistEnabled: true,
            assistLevel: 'standard',
            privacyLayer: 'context',
            autoLogMode: 'ask',
            quietHours: { enabled: false, start: '22:00', end: '07:00' },
            topicExclusions: [],
            neverInterveneOn: []
          }
        }
      } as ReturnType<typeof useBubbleStore.getState>);

      const standardResult = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-7b',
        'user-123'
      );

      expect(standardResult.shouldShowCBTResponse).toBe(true);
    });
  });

  describe('Context Integration', () => {
    it('should incorporate conversation context into analysis', async () => {
      const message = "I'm struggling with this task.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-8',
        'user-123',
        {
          messageCount: 10,
          averageSentiment: -0.6,
          recentMood: 'overwhelmed'
        }
      );

      // Should detect context and provide appropriate guidance
      expect(result.enhancedPrompt || result.conversationGuidance).toBeDefined();
    });

    it('should handle missing context gracefully', async () => {
      const message = "Having a tough day.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-9',
        'user-123'
        // No context provided
      );

      expect(result).toBeDefined();
      expect(typeof result.shouldShowCBTResponse).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should handle CBT processing errors gracefully', async () => {
      // Mock error in CBT processing
      vi.mocked(require('@/ai/cbt').processCBTMessage).mockRejectedValue(
        new Error('CBT processing failed')
      );

      const message = "Test message";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-10',
        'user-123'
      );

      expect(result.shouldShowCBTResponse).toBe(false);
      expect(result.enhancedPrompt).toBeUndefined();
    });

    it('should handle disabled features gracefully', async () => {
      const mockFlags = vi.mocked(isFeatureEnabled);
      mockFlags.mockReturnValue(false);

      const message = "I always fail.";
      
      const result = await cbtAIIntegration.analyzeForConversation(
        message,
        'msg-11',
        'user-123'
      );

      expect(result.shouldShowCBTResponse).toBe(false);
    });
  });
});