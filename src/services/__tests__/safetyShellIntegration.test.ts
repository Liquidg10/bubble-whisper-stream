import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFeatureEnabled, toggleFeatureFlag, isKillSwitchActive, isAutoWriteFeature } from '@/config/flags';
import { decisionTraceService } from '../decisionTraceService';
import { crossViewUndoService } from '../crossViewUndoService';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Safety Shell Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    decisionTraceService.clear();
    crossViewUndoService.clear();
  });

  describe('Kill Switch Functionality', () => {
    it('should disable all auto-write features when kill switch is active', () => {
      // Enable kill switch
      toggleFeatureFlag('autoWriteKillSwitch', true);
      
      // Try to enable an auto-write feature
      toggleFeatureFlag('autoWriteCalendar', true);
      
      // Feature should be disabled due to kill switch
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
      localStorageMock.getItem.mockReturnValue(null);
      
      // autoWriteCalendar defaults to false
      expect(isFeatureEnabled('autoWriteCalendar')).toBe(false);
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