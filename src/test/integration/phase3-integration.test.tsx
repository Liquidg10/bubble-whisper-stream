import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useBubbleStore } from '@/stores/bubbleStore';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import NarrativeSearch from '@/components/NarrativeSearch';
import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';
import { cbtGuardService } from '@/services/cbtGuardService';
import {
  resetMockBubbleStore,
  setMockBubbleState,
} from '@/test/helpers/mockBubbleStore';

// Mock services
vi.mock('@/services/crossDeviceSyncService');
vi.mock('@/services/advancedAIService');
vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule: makeMockModule } = await import(
    '@/test/helpers/mockBubbleStore'
  );
  return makeMockModule();
});
// NOTE: cbtGuardService is deliberately NOT mocked -- the privacy tests below
// exercise the real redaction implementation (see "Privacy & Security Tests").

describe('Bubble Universe Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockBubbleStore();

    // Mock store.
    // `settings` must carry the accessibility keys and `updateSettings` must be
    // callable: `renderWithProviders` mounts `AccessibilityProvider`, which
    // destructures `{ settings, updateSettings }` from this store and calls
    // `updateSettings` from an effect. Without them the provider throws before
    // the component under test ever renders.
    setMockBubbleState({
      bubbles: [
        {
          id: 'test-1',
          type: 'Thought',
          content: 'Test bubble content',
          x: 0,
          y: 0,
          size: 1,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      selectedBubbles: new Set(),
      addBubble: vi.fn(),
      updateBubble: vi.fn(),
      deleteBubble: vi.fn(),
      updateSettings: vi.fn(),
      settings: {
        intelligenceEnabled: true,
        highContrast: false,
        reducedMotion: false
      }
    });
  });

  describe('Cross-Device Sync Integration', () => {
    it('does not advertise the prototype local outbox as bubble replication', async () => {
      const { CROSS_DEVICE_SYNC_CAPABILITIES } = await vi.importActual<
        typeof import('@/services/crossDeviceSyncService')
      >('@/services/crossDeviceSyncService');

      expect(CROSS_DEVICE_SYNC_CAPABILITIES).toMatchObject({
        status: 'prototype',
        bubbleReplication: false,
        durableRemoteReceipts: false,
        sharedKeyExchange: false
      });
    });

    /**
     * TAUTOLOGY (documented, deliberately left as-is).
     * This configures a mock and then asserts the mock returned what it was
     * told to return. It passes with the entire product deleted -- proven by
     * probe. Kept because deleting coverage is Mark's call, not a cleanup.
     */
    it('should handle sync conflicts properly', async () => {
      const mockGetSyncStatus = vi.mocked(crossDeviceSyncService.getSyncStatus);
      mockGetSyncStatus.mockReturnValue({
        isOnline: true,
        lastSync: null,
        pendingUploads: 0,
        pendingDownloads: 0,
        syncMode: 'full',
        conflicts: [
          {
            id: 'conflict-1',
            entityType: 'bubble',
            entityId: 'test-1',
            localVersion: { content: 'Local version' },
            remoteVersion: { content: 'Remote version' },
            timestamp: new Date().toISOString(),
          }
        ]
      });

      const status = mockGetSyncStatus();
      expect(status.conflicts).toHaveLength(1);
    });
  });

  describe('AI Integration Tests', () => {
    /**
     * REWRITTEN. These two tests previously called
     * `advancedAIService.generateGlimmer` / `.generateCBTReframe` and asserted
     * on the values they had just handed the mock. Both threw
     * "Cannot read properties of undefined" because NEITHER METHOD EXISTS on
     * `AdvancedAIService` -- its real surface is transcribeVoice,
     * analyzePatterns, analyzeSentiment, categorizeContent, findSimilarThemes,
     * startVoiceRecording, stopVoiceRecording, isAIAvailable, clearCache.
     *
     * `generateGlimmer` lives on `glimmerService` (and `aiService`);
     * `generateCBTReframe` exists nowhere in the codebase -- the real reframe
     * entry points are `aiService.getCBTReframe` and
     * `cbtService.generateReframeSuggestions`.
     *
     * Restoring the old shape would only have asserted that a `vi.fn()`
     * returns its own configured value. These are now module-surface contract
     * tests against the REAL (unmocked) modules, so they fail if the API is
     * renamed or moved -- which is the bug the originals were pointed at.
     */
    it('exposes glimmer generation on glimmerService, not advancedAIService', async () => {
      const { glimmerService } = await vi.importActual<
        typeof import('@/services/glimmerService')
      >('@/services/glimmerService');
      const { advancedAIService: realAdvancedAI } = await vi.importActual<
        typeof import('@/services/advancedAIService')
      >('@/services/advancedAIService');

      expect(typeof glimmerService.generateGlimmer).toBe('function');
      expect((realAdvancedAI as unknown as Record<string, unknown>).generateGlimmer).toBeUndefined();
      // Guard the surface the app actually consumes.
      expect(typeof realAdvancedAI.analyzePatterns).toBe('function');
      expect(typeof realAdvancedAI.isAIAvailable).toBe('function');
    });

    it('exposes CBT reframing on aiService/cbtService, not advancedAIService', async () => {
      const { aiService } = await vi.importActual<
        typeof import('@/services/aiService')
      >('@/services/aiService');
      const { cbtService } = await vi.importActual<
        typeof import('@/services/cbtService')
      >('@/services/cbtService');
      const { advancedAIService: realAdvancedAI } = await vi.importActual<
        typeof import('@/services/advancedAIService')
      >('@/services/advancedAIService');

      expect(typeof aiService.getCBTReframe).toBe('function');
      expect(typeof cbtService.generateReframeSuggestions).toBe('function');
      expect((realAdvancedAI as unknown as Record<string, unknown>).generateCBTReframe)
        .toBeUndefined();
    });
  });

  describe('Vector Search Integration', () => {
    it('should perform semantic search with explanations', async () => {
      renderWithProviders(<NarrativeSearch />);

      const searchInput = screen.getByPlaceholderText(/search your thoughts/i);
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Performance Tests', () => {
    /**
     * TAUTOLOGY (documented). The 50-iteration loop calls a `vi.fn()`, so the
     * measured duration reflects the mock, not the product. Proven by probe:
     * this test passes with `BubbleCanvas` replaced by `() => null`. Its only
     * real content is now that `<BubbleCanvas />` mounts without throwing.
     */
    it('should maintain target FPS during bubble interactions', async () => {
      renderWithProviders(<BubbleCanvas />);

      const store = useBubbleStore();
      const startTime = performance.now();

      for (let i = 0; i < 50; i++) {
        await store.addBubble({
          id: `perf-test-${i}`,
          type: 'Thought',
          content: `Performance test ${i}`,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          size: 1,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should limit memory usage', () => {
      const { unmount } = renderWithProviders(<BubbleCanvas />);
      unmount();

      expect(screen.queryByTestId('bubble-canvas')).not.toBeInTheDocument();
    });
  });

  describe('Plugin System Integration', () => {
    /**
     * TAUTOLOGY (documented). Builds an object literal and asserts the literal
     * contains what was just put in it; passes with the product deleted.
     */
    it('should load and execute plugins safely', async () => {
      const mockPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        capabilities: ['read:bubbles'],
        execute: vi.fn()
      };

      expect(mockPlugin.capabilities).toContain('read:bubbles');
    });
  });

  describe('Privacy & Security Tests', () => {
    /**
     * TAUTOLOGY (documented). `btoa(JSON.stringify(x))` never contains the
     * plaintext, so this asserts a property of base64, not of any encryption
     * the product performs. Passes with the product deleted.
     */
    it('should encrypt sensitive data before storage', () => {
      const sensitiveData = { content: 'Private thought' };

      const encrypted = btoa(JSON.stringify(sensitiveData));
      expect(encrypted).not.toContain('Private thought');
    });

    /**
     * REWRITTEN to call the REAL implementation.
     *
     * The original inlined a copy of two of the four regexes from
     * `cbtGuardService.sanitizeMessage` (`cbtGuardService.ts:243-247`) and
     * asserted against its own copy -- so it consulted no product code at all
     * and could never have caught a redaction bug. It now goes through the
     * public entry point, `filterForNetworkTransmission`, which is live
     * (`cbtGuardService.ts:182`).
     */
    it('strips PII from data bound for the network', () => {
      const filtered = cbtGuardService.filterForNetworkTransmission({
        userId: 'user-123',
        email: 'direct@example.com',
        phone: '555-555-5555',
        location: 'Honolulu',
        messageContent:
          'Reach me at john@example.com or 555-867-5309, card 4111 1111 1111 1111, SSN 123-45-6789'
      });

      // Direct identifier fields are dropped outright.
      expect(filtered.userId).toBeUndefined();
      expect(filtered.email).toBeUndefined();
      expect(filtered.phone).toBeUndefined();
      expect(filtered.location).toBeUndefined();

      // Inline patterns are redacted by sanitizeMessage's four rules.
      expect(filtered.messageContent).toContain('[EMAIL]');
      expect(filtered.messageContent).toContain('[PHONE]');
      expect(filtered.messageContent).toContain('[CARD]');
      expect(filtered.messageContent).toContain('[SSN]');
      expect(filtered.messageContent).not.toContain('john@example.com');
      expect(filtered.messageContent).not.toContain('555-867-5309');
      expect(filtered.messageContent).not.toContain('4111 1111 1111 1111');
      expect(filtered.messageContent).not.toContain('123-45-6789');
    });

    /**
     * HONEST FAILURE -- a real redaction gap, not a harness problem.
     *
     * `sanitizeMessage`'s phone rule is `/\b\d{3}-?\d{3}-?\d{4}\b/g`, which
     * requires TEN digits. Seven-digit local numbers ("555-1234") are passed
     * through to the network untouched. The original version of this test
     * asserted exactly this behaviour and was recorded as a broken test --
     * it was right about the requirement and wrong only about which code to
     * ask. Kept failing rather than relaxed, per the standing rule that a
     * genuine product gap is Mark's decision.
     *
     * Mark's call: widen the phone rule to cover 7-digit local formats
     * (mind the interaction with the 9-digit SSN rule, which runs after it),
     * or accept 7-digit numbers as out of scope and delete this test.
     */
    it('strips seven-digit local phone numbers too', () => {
      const filtered = cbtGuardService.filterForNetworkTransmission({
        messageContent: 'My email is john@example.com and phone is 555-1234'
      });

      expect(filtered.messageContent).toBe(
        'My email is [EMAIL] and phone is [PHONE]'
      );
    });
  });
});
