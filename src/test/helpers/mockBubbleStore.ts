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

/**
 * Full BubbleStore surface (src/stores/bubbleStore.ts `interface BubbleStore`,
 * verified against 65762fe), extended 2026-07-14 (REVIVE Run 78) from the
 * original bubbles/tasks/settings-only default.
 *
 * WHY THE EXPANSION: `complete-production-workflows.test.tsx` renders the
 * full <App/> tree (not one isolated component), which mounts many
 * `useBubbleStore()` consumers transitively (AppShell, Index and everything
 * Index imports -- GlimmerNotifications, NotificationSystem, ViewModeToggle,
 * BehavioralScienceIntegration, etc.). Each one destructures a different
 * slice of the store; a minimal mock plays whack-a-mole, one newly-exposed
 * "reading 'x' of undefined" crash per missing field. This default now
 * covers every field/action in the real interface once, so any suite
 * rendering substantial app surface gets a complete, crash-safe baseline
 * "for free" -- individual tests still override only the handful of fields
 * they actually assert on via `setMockBubbleState({...})`.
 *
 * Collections default empty, actions default to no-op `vi.fn()` (async ones
 * resolved), so a component that destructures an action it never calls
 * during a given test gets a callable stub instead of `undefined` -- the
 * "X is not a function" class-B crash shape. Purely additive vs. the prior
 * default: existing consumers that only read bubbles/tasks/settings are
 * unaffected; nothing here changes those three fields' values.
 */
export function createMockBubbleState(overrides: Record<string, unknown> = {}) {
  return {
    // Core collections
    bubbles: [],
    tasks: [],
    reminders: [],
    tags: [],
    cbtEntries: [],
    glimmers: [],
    patternHints: [],
    settings: createMockSettings(),
    selfModel: { id: 'self', routines: [], medicationTimes: [], preferences: {}, triggers: [] },
    isLoading: false,
    selectedBubbles: new Set<string>(),
    mergeCandidate: null,
    lastOperation: null,

    // Actions (every BubbleStore action as a no-op stub; async ones resolved)
    initializeStore: vi.fn(() => Promise.resolve()),
    toggleSelection: vi.fn(),
    clearSelection: vi.fn(),
    selectAll: vi.fn(),
    isSelected: vi.fn(() => false),
    setMergeCandidate: vi.fn(),
    clearMergeCandidate: vi.fn(),
    mergeBubbles: vi.fn(),
    undoLastMerge: vi.fn(),
    addBubble: vi.fn(() => Promise.resolve()),
    updateBubble: vi.fn(() => Promise.resolve()),
    deleteBubble: vi.fn(() => Promise.resolve()),
    clearAllBubbles: vi.fn(() => Promise.resolve()),
    addReminder: vi.fn(() => Promise.resolve()),
    updateReminder: vi.fn(() => Promise.resolve()),
    snoozeReminder: vi.fn(() => Promise.resolve()),
    completeReminder: vi.fn(() => Promise.resolve()),
    addTag: vi.fn(() => Promise.resolve()),
    updateSettings: vi.fn(() => Promise.resolve()),
    updateSelfModel: vi.fn(() => Promise.resolve()),
    addCBTEntry: vi.fn(() => Promise.resolve()),
    getCBTEntries: vi.fn(() => []),
    addGlimmer: vi.fn(() => Promise.resolve()),
    dismissGlimmer: vi.fn(() => Promise.resolve()),
    addPatternHint: vi.fn(() => Promise.resolve()),
    updatePatternHint: vi.fn(() => Promise.resolve()),
    getAdaptiveExplanation: vi.fn(() => null),
    toggleIntelligence: vi.fn(),
    moveBubbleToHorizon: vi.fn(),
    setViewMode: vi.fn(),

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
//
// SELECTOR-AWARE (fixed 2026-07-14, REVIVE Run 78): the real zustand
// `useBubbleStore(selector?)` applies `selector` to the state and returns
// just that slice when one is passed (e.g.
// `useBubbleStore(state => state.initializeStore)` in src/App.tsx:110), and
// returns the whole state when called with no argument (the dominant call
// style -- ~100 no-selector call sites vs. 4 selector call sites repo-wide
// as of 65762fe: App.tsx, BreathPromptCard.tsx, ProgressiveDisclosure.tsx
// x2). Before this fix the mock ignored any selector argument and always
// returned the full state object, so
// `useBubbleStore(state => state.initializeStore)` resolved to the *entire
// state object* instead of the `initializeStore` function -- App.tsx's
// `initializeStore()` call in its mount effect then threw "initializeStore
// is not a function", which is what crashed every suite rendering the full
// <App/> tree (src/test/e2e/complete-production-workflows.test.tsx:
// `TypeError: Cannot read properties of undefined (reading
// 'progressiveOnboarding')` one level up, in ProgressiveOnboardingProvider,
// once the earlier throw is worked around -- same root defect).
// ADDITIVE, not a behavior change for existing consumers: no-selector
// callers get byte-identical output (selector undefined -> returns
// currentState, exactly as before); only the previously-broken selector
// path changes, and only from "wrong" to "correct" -- it cannot regress a
// passing no-selector test.
export const mockUseBubbleStore = vi.fn(
  (selector?: (state: Record<string, unknown>) => unknown) =>
    typeof selector === 'function' ? selector(currentState) : currentState
) as unknown as {
  (): Record<string, unknown>;
  (selector: (state: Record<string, unknown>) => unknown): unknown;
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
