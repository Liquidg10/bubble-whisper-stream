/**
 * Shared bubbleStore test mock.
 *
 * WHY THIS EXISTS
 * ---------------
 * Many suites did `vi.mock('@/stores/bubbleStore')` (bare auto-mock). That makes
 * `useBubbleStore.getState()` return `undefined`, so any code that reads
 * `useBubbleStore.getState().settings.<x>` crashes with:
 *     TypeError: Cannot read properties of undefined (reading 'settings')
 * This was the single most common test-harness failure signature in the suite
 * (the "class-B" bucket in the REVIVE taxonomy): incomplete store mock, NOT a
 * product bug — the real store ships a complete `settings` object.
 *
 * This helper provides ONE faithful, reusable mock so suites stop hand-rolling
 * (and mis-rolling) their own. Zero product-code change.
 *
 * USAGE (async factory avoids vi.mock hoisting problems):
 *
 *   vi.mock('@/stores/bubbleStore', async () => {
 *     const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
 *     return makeBubbleStoreMockModule();
 *   });
 *
 *   import { resetMockBubbleStore, setMockSettings } from '@/test/helpers/mockBubbleStore';
 *   beforeEach(() => resetMockBubbleStore());
 *   // vary per-test:
 *   setMockSettings({ cbtSettings: { cbtAssistEnabled: true, assistLevel: 'standard' } });
 */
import { vi } from 'vitest';

/**
 * Mirrors the shape of `defaultSettings` in src/stores/bubbleStore.ts closely
 * enough for consumers, plus the sub-objects tests commonly read
 * (`cbtSettings`, `progressiveOnboarding`, `viewMode`). Kept intentionally
 * hand-authored (not imported) so the mock never drags in the real store's
 * zustand/persist middleware. Top-level keys in `overrides` replace wholesale.
 */
export function createMockSettings(overrides: Record<string, unknown> = {}) {
  return {
    ttsEnabled: true,
    reducedMotion: false,
    highContrast: false,
    bubbleDensity: 'medium',
    intelligenceEnabled: true,
    glimmersEnabled: true,
    adaptiveRemindersEnabled: true,
    viewMode: 'bubble',
    selfModelLayers: { surface: true, context: false, deep: false },
    globalVoice: 'nova',
    voiceVolume: 0.8,
    // Read by cbtConversationIntegration.performCBTAnalysis()
    cbtSettings: {
      cbtAssistEnabled: false,
      assistLevel: 'off',
      privacyLayer: 'context',
      autoLogMode: 'ask',
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
      topicExclusions: [],
      neverInterveneOn: [],
    },
    // Read by the e2e/production-workflow suites
    progressiveOnboarding: {
      completed: false,
      currentStep: 0,
      dismissed: false,
    },
    ...overrides,
  };
}

export function createMockBubbleState(overrides: Record<string, unknown> = {}) {
  return {
    bubbles: [],
    tasks: [],
    settings: createMockSettings(),
    ...overrides,
  };
}

// Module-level state so a suite and the vi.mock factory (which dynamically
// imports THIS module) share one instance and can mutate it per-test.
let currentState: Record<string, unknown> = createMockBubbleState();

export function resetMockBubbleStore() {
  currentState = createMockBubbleState();
}

/** Replace top-level state keys (e.g. bubbles, tasks). */
export function setMockBubbleState(partial: Record<string, unknown>) {
  currentState = { ...currentState, ...partial };
}

/** Merge into settings (top-level setting keys replace wholesale). */
export function setMockSettings(partial: Record<string, unknown>) {
  currentState = {
    ...currentState,
    settings: { ...(currentState.settings as Record<string, unknown>), ...partial },
  };
}

// Callable hook + getState/setState/subscribe — the parts of the real zustand
// store that tests touch.
export const mockUseBubbleStore = vi.fn(() => currentState) as unknown as {
  (): Record<string, unknown>;
  getState: () => Record<string, unknown>;
  setState: (p: unknown) => void;
  subscribe: () => () => void;
  getInitialState: () => Record<string, unknown>;
};
mockUseBubbleStore.getState = vi.fn(() => currentState);
mockUseBubbleStore.setState = vi.fn((p: unknown) => {
  const partial = typeof p === 'function' ? (p as (s: unknown) => Record<string, unknown>)(currentState) : (p as Record<string, unknown>);
  setMockBubbleState(partial);
});
mockUseBubbleStore.subscribe = vi.fn(() => () => {});
mockUseBubbleStore.getInitialState = vi.fn(() => currentState);

/** Return value for a `vi.mock('@/stores/bubbleStore', ...)` factory. */
export function makeBubbleStoreMockModule() {
  return { useBubbleStore: mockUseBubbleStore };
}
