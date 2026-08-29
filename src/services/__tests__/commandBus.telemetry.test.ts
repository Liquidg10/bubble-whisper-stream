import { beforeEach, describe, expect, it, vi } from 'vitest';

import { commandBus } from '../commandBus';
import {
  decisionTraceService,
  isAcceptanceTelemetryTrace
} from '../decisionTraceService';

describe('commandBus telemetry classification', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
  });

  it('keeps command execution and undo out of acceptance calibration', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const undo = vi.fn().mockResolvedValue(true);
    commandBus.registerHandler('Complete', {
      execute,
      undo,
      canUndo: () => true
    });

    const result = await commandBus.execute({
      type: 'Complete',
      payload: { taskId: 'task-1' }
    });
    expect(result.success).toBe(true);
    expect(await commandBus.undo(result.undoId!)).toBe(true);

    const trace = decisionTraceService.getTrace(result.traceId!)!;
    expect(trace.metadata.telemetryKind).toBe('operational');
    expect(isAcceptanceTelemetryTrace(trace)).toBe(false);
  });
});
