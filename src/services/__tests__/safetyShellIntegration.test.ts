import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flags, isFeatureEnabled, toggleFeatureFlag, isKillSwitchActive, isAutoWriteFeature } from '@/config/flags';
import { decisionTraceService } from '../decisionTraceService';
import { crossViewUndoService } from '../crossViewUndoService';

// Functional localStorage mock backed by a real store.
//
// The previous stub was `getItem: vi.fn()` with no implementation, which returns
// `undefined` -- not `null`. That matters: isFeatureEnabled() gates the override
// branch on `override !== null`, so `undefined` was treated as a PRESENT override
// and then resolved `undefined === 'true'` -> false. Combined with `setItem` being
// an inert no-op (so toggleFeatureFlag writes were discarded), every toggle-then-read
// assertion in this file resolved to `false` regardless of product behaviour.
//
// That made 'should disable all auto-write features when kill switch is active' a
// VACUOUS pass: verified by probe -- with isKillSwitchActive() hardcoded to `false`
// (kill switch entirely removed) that test still passed. The single most
// safety-critical assertion in the auto-write stack was never exercising the kill
// switch at all.
//
// A real Storage returns `null` for absent keys; this mock does too.
const store = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Re-installed per test. Two tests below deliberately swap in their own
// `getItem` via mockImplementation to exercise the override branch directly;
// vi.clearAllMocks() clears call history but NOT implementations, so without a
// per-test re-install those bespoke implementations would leak forward into
// every subsequent test in the file.
function installFunctionalStorage(): void {
  store.clear();
  localStorageMock.getItem.mockImplementation((key: string) =>
    store.has(key) ? store.get(key)! : null
  );
  localStorageMock.setItem.mockImplementation((key: string, value: string) => {
    store.set(key, String(value));
  });
  localStorageMock.removeItem.mockImplementation((key: string) => {
    store.delete(key);
  });
  localStorageMock.clear.mockImplementation(() => {
    store.clear();
  });
}

describe('Safety Shell Integration', () => {
  beforeEach(() => {
    // Clear call history only -- NOT the implementations above. (vi.clearAllMocks()
    // preserves implementations; vi.resetAllMocks() would not. Kept explicit so a
    // future switch to resetAllMocks doesn't silently reintroduce the inert stub.)
    vi.clearAllMocks();
    installFunctionalStorage();
    decisionTraceService.clear();
    crossViewUndoService.clear();
  });

  describe('Kill Switch Functionality', () => {
    it('should disable all auto-write features when kill switch is active', () => {
      // Enable an auto-write feature FIRST and prove it is actually on. Without this
      // positive control the assertion below passes on any `false`, including a
      // `false` produced by a broken harness rather than by the kill switch.
      toggleFeatureFlag('autoWriteCalendar', true);
      expect(isKillSwitchActive()).toBe(false);
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(true);

      // Now engage the kill switch
      toggleFeatureFlag('autoWriteKillSwitch', true);
      expect(isKillSwitchActive()).toBe(true);

      // Feature should be disabled due to kill switch -- a real on -> off transition
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(false);
    });

    it('should allow auto-write features when kill switch is disabled', () => {
      // Ensure kill switch is off
      toggleFeatureFlag('autoWriteKillSwitch', false);
      
      // Enable an auto-write feature
      toggleFeatureFlag('autoWriteCalendar', true);
      
      // Feature should be enabled
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(true);
    });

    it('should correctly identify auto-write features', () => {
      expect(isAutoWriteFeature('autoWriteCalendar')).toBe(true);
      expect(isAutoWriteFeature('autoWriteEmail')).toBe(true);
      expect(isAutoWriteFeature('autoFinanceRead')).toBe(true);
      expect(isAutoWriteFeature('contextEngine')).toBe(true);
      expect(isAutoWriteFeature('cbtAssist')).toBe(false);
      expect(isAutoWriteFeature('voiceCapture')).toBe(false);
    });
  });

  describe('Decision Trace and Undo Integration', () => {
    it('should create linked trace and undo entries', async () => {
      // Add a decision trace
      const traceId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [
          { type: 'intent', value: 'schedule', confidence: 0.9, source: 'nlp' }
        ],
        confidenceThreshold: 0.8,
        finalConfidence: 0.9,
        decision: 'auto-write',
        action: 'Created meeting with John at 3pm',
        becauseText: 'Because clear intent detected',
        metadata: { eventId: 'cal-123' },
        undoable: true
      });

      // Add corresponding undo entry
      crossViewUndoService.addEntry({
        view: 'integration',
        type: 'calendar-create',
        data: { eventId: 'cal-123' },
        description: 'Created meeting with John at 3pm',
        traceId,
        compensationFn: async () => {
          // Mock calendar delete
          console.log('Deleting calendar event cal-123');
        }
      });

      // Verify trace exists
      const trace = decisionTraceService.getTrace(traceId);
      expect(trace).toBeDefined();
      expect(trace?.undoable).toBe(true);

      // Verify undo entry exists
      const undoEntry = crossViewUndoService.getLastEntry();
      expect(undoEntry).toBeDefined();
      expect(undoEntry?.traceId).toBe(traceId);
      expect(undoEntry?.type).toBe('calendar-create');

      // Test undo flow
      const undonEntry = await crossViewUndoService.undo();
      expect(undonEntry).toBeDefined();
      expect(undonEntry?.traceId).toBe(traceId);
    });

    it('should handle compensation function failures gracefully', async () => {
      const traceId = decisionTraceService.addTrace({
        feature: 'email',
        signals: [],
        confidenceThreshold: 0.8,
        finalConfidence: 0.9,
        decision: 'auto-write',
        action: 'Sent email draft',
        becauseText: 'Because clear intent detected',
        metadata: { draftId: 'draft-456' },
        undoable: true
      });

      crossViewUndoService.addEntry({
        view: 'integration',
        type: 'email-draft',
        data: { draftId: 'draft-456' },
        description: 'Sent email draft',
        traceId,
        compensationFn: async () => {
          throw new Error('Failed to delete draft');
        }
      });

      // Undo should fail and re-add entry to stack
      await expect(crossViewUndoService.undo()).rejects.toThrow('Failed to delete draft');
      
      // Entry should still be in stack
      expect(crossViewUndoService.canUndo()).toBe(true);
    });
  });

  describe('Flag Precedence', () => {
    it('should respect localStorage overrides over defaults', () => {
      // Mock localStorage to return override
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'flags.autoWriteCalendar') return 'true';
        return null;
      });

      expect(isFeatureEnabled('autoWriteCalendar')).toBe(true);
    });

    it('should fall back to defaults when no localStorage override', () => {
      // No overrides written this test -- the backing store is empty from beforeEach,
      // so getItem returns null and isFeatureEnabled must fall through to flags[].
      //
      // The original assertion hardcoded `false` on the comment "autoWriteCalendar
      // defaults to false". That is stale: src/config/flags.ts:78 has
      // `autoWriteCalendar: true` ("ENABLED - P12 Task-aware calendar auto-write
      // with safety gates"). Asserting against the imported constant tests the
      // fall-through contract itself and cannot go stale when a default is retuned.
      expect(isKillSwitchActive()).toBe(false);
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(flags.autoWriteCalendar);

      // Both polarities, so this cannot pass vacuously if the fall-through breaks
      // and starts returning a constant.
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(true);
      expect(isFeatureEnabled('calendarAIBeta')).toBe(flags.calendarAIBeta);
      expect(isFeatureEnabled('calendarAIBeta')).toBe(false);
    });

    it('should prioritize kill switch over localStorage overrides', () => {
      // Mock localStorage to enable feature and kill switch
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'flags.autoWriteCalendar') return 'true';
        if (key === 'flags.autoWriteKillSwitch') return 'true';
        return null;
      });

      expect(isKillSwitchActive()).toBe(true);
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(false);
    });
  });

  describe('End-to-End Safety Flow', () => {
    it('should demonstrate complete safety shell workflow', async () => {
      // 1. Enable auto-write feature
      toggleFeatureFlag('autoWriteCalendar', true);
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(true);

      // 2. Simulate an auto-write decision
      const traceId = decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [
          { type: 'intent', value: 'schedule meeting', confidence: 0.9, source: 'nlp' },
          { type: 'calendar', value: 'available', confidence: 0.8, source: 'google' }
        ],
        confidenceThreshold: 0.8,
        finalConfidence: 0.85,
        decision: 'auto-write',
        action: 'Created "Weekly standup" meeting for Friday 2pm',
        becauseText: 'Because clear intent detected and calendar shows availability',
        metadata: { eventId: 'event-789', calendar: 'primary' },
        undoable: true
      });

      // 3. Add undo capability
      crossViewUndoService.addEntry({
        view: 'integration',
        type: 'calendar-create',
        data: { eventId: 'event-789', calendar: 'primary' },
        description: 'Created "Weekly standup" meeting for Friday 2pm',
        traceId,
        compensationFn: async () => {
          // Mock Google Calendar API delete
          console.log('Deleting calendar event event-789');
        }
      });

      // 4. Verify trace and undo exist
      expect(decisionTraceService.getRecentUndoable()).toHaveLength(1);
      expect(crossViewUndoService.canUndo()).toBe(true);

      // 5. User activates kill switch
      toggleFeatureFlag('autoWriteKillSwitch', true);
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(false);

      // 6. New auto-write attempts should be blocked
      expect(isKillSwitchActive()).toBe(true);

      // 7. User can still undo previous actions
      const undoneEntry = await crossViewUndoService.undo();
      expect(undoneEntry?.traceId).toBe(traceId);

      // 8. Mark trace as undone
      decisionTraceService.markAsUndone(traceId, undoneEntry?.id || '');
      expect(decisionTraceService.getRecentUndoable()).toHaveLength(0);
    });
  });
});