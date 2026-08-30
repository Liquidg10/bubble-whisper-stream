import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCalendarSyncLock } from '../calendarSyncCoordinator';

const owner = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllGlobals());
describe('calendar cross-instance coordination', () => {
  it('fails closed without Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    const run = vi.fn();
    await expect(withCalendarSyncLock(owner, run)).rejects.toThrow('unavailable');
    expect(run).not.toHaveBeenCalled();
  });
  it('does not run when another tab holds the lock', async () => {
    const request = vi.fn(async (_name, _options, callback) => callback(null));
    vi.stubGlobal('navigator', { locks: { request } });
    const run = vi.fn();
    await expect(withCalendarSyncLock(owner, run)).rejects.toThrow('still running');
    expect(run).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(`mind-manual:calendar-sync:v1:${owner}`, { mode: 'exclusive', ifAvailable: true }, expect.any(Function));
  });
  it('retains the lock callback until the admitted work settles', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let held = false;
    const request = vi.fn(async (_name, _options, callback) => {
      held = true;
      try { return await callback({}); } finally { held = false; }
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const result = withCalendarSyncLock(owner, async () => { await pending; return 'receipt'; });
    await Promise.resolve();
    expect(held).toBe(true);
    finish();
    await expect(result).resolves.toBe('receipt');
    expect(held).toBe(false);
  });
  it.each(['', 'not-owner', '00000000-0000-0000-0000-000000000000'])('rejects an invalid owner %s before requesting a lock', async invalid => {
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    await expect(withCalendarSyncLock(invalid, vi.fn())).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('propagates rejected work without pretending completion', async () => {
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<unknown>) => callback({}) } });
    await expect(withCalendarSyncLock(owner, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  });
});
