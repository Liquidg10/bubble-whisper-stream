import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@/hooks/use-toast', () => ({ toast }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } }
}));

import { usePrecisionGateUndo } from '../usePrecisionGateUndo';
import { decisionTraceService, getDecisionUserAction } from '@/services/decisionTraceService';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('usePrecisionGateUndo', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
    invoke.mockReset();
    toast.mockReset();
  });

  it('runs the registered compensation once and records undo only after success', async () => {
    const traceId = decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [],
      confidenceThreshold: 0.6,
      finalConfidence: 0.9,
      decision: 'auto-write',
      action: 'Create event',
      becauseText: 'Test',
      metadata: { telemetryKind: 'acceptance' },
      undoable: true
    });
    const compensation = deferred();
    const undoHandler = vi.fn(() => compensation.promise);
    const { result } = renderHook(() => usePrecisionGateUndo());

    act(() => {
      result.current.showUndoToast({
        traceId,
        feature: 'calendar',
        action: 'Created event',
        undoHandler
      });
    });

    const toastAction = toast.mock.calls[0][0].action;
    act(() => {
      toastAction.props.onClick();
      toastAction.props.onClick();
    });

    expect(undoHandler).toHaveBeenCalledOnce();
    expect(getDecisionUserAction(decisionTraceService.getTrace(traceId)!)).toBeNull();

    await act(async () => {
      compensation.resolve();
      await compensation.promise;
    });

    expect(getDecisionUserAction(decisionTraceService.getTrace(traceId)!)).toBe('undo');
  });

  it('uses the deployed calendar-sync delete contract for calendar undo', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderHook(() => usePrecisionGateUndo());
    const undo = result.current.createCalendarUndo({
      traceId: 'calendar-trace',
      eventId: 'google-event-123',
      calendarAccountId: 'calendar-account-456',
      title: 'Deep work'
    });

    await undo.undoHandler();

    expect(invoke).toHaveBeenCalledWith('calendar-sync', {
      body: {
        action: 'delete_event',
        calendarAccountId: 'calendar-account-456',
        eventId: 'google-event-123'
      }
    });
  });
});
