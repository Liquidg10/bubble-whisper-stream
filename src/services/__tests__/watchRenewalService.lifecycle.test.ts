import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  insert: vi.fn(),
  gmailInventory: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, functions: { invoke: mocks.invoke } },
}));

type DbResult = { data: unknown[] | null; error: unknown | null };
type RenewalService = typeof import('../watchRenewalService')['watchRenewalService'];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function calendarWatch(id = 'calendar-fixture', renewalDelay = -1000) {
  return {
    id,
    user_id: 'owner-fixture',
    watch_resource_id: 'resource-fixture',
    watch_channel_id: 'channel-fixture',
    watch_expires_at: new Date(Date.now() + DAY + renewalDelay).toISOString(),
    calendar_id: 'primary',
  };
}

function gmailWatch(id = 'gmail-fixture', renewalDelay = -1000) {
  return {
    id: `watch-${id}`,
    user_id: 'owner-fixture',
    oauth_account_id: id,
    watch_expires_at: new Date(Date.now() + DAY + renewalDelay).toISOString(),
  };
}

describe('watch renewal browser lifecycle', () => {
  let service: RenewalService;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T09:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.gmailInventory.mockResolvedValue({ data: [], error: null });
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    mocks.insert.mockResolvedValue({ data: null, error: null });
    mocks.from.mockImplementation(() => ({
      select() { return this; },
      eq() { return this; },
      not() { return this; },
      lt() { return mocks.gmailInventory(); },
      insert: mocks.insert,
      then(onFulfilled: (value: DbResult) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    }));
    service = (await import('../watchRenewalService')).watchRenewalService;
  });

  afterEach(() => {
    service.stopWatchRenewal();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces concurrent starts and keeps one hourly scanner', async () => {
    const inventory = deferred<DbResult>();
    mocks.rpc.mockReturnValueOnce(inventory.promise);
    const first = service.startWatchRenewal();
    const second = service.startWatchRenewal();
    expect(second).toBe(first);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    inventory.resolve({ data: [], error: null });
    await Promise.all([first, second]);
    await service.startWatchRenewal();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not overlap hourly scans while inventory is pending', async () => {
    const inventory = deferred<DbResult>();
    mocks.rpc.mockReturnValueOnce(inventory.promise);
    const started = service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    inventory.resolve({ data: [], error: null });
    await started;
  });

  it('never starts a stopped service when another monitor requests a scan', async () => {
    await service.refreshRenewalSchedule();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await service.startWatchRenewal();
    service.stopWatchRenewal();
    await service.refreshRenewalSchedule();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces another monitor with the pending initial scan', async () => {
    const inventory = deferred<DbResult>();
    mocks.rpc.mockReturnValueOnce(inventory.promise);
    const started = service.startWatchRenewal();
    expect(service.refreshRenewalSchedule()).toBe(started);
    expect(service.refreshRenewalSchedule()).toBe(started);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    inventory.resolve({ data: [calendarWatch()], error: null });
    await started;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('coalesces another monitor with a pending hourly scan', async () => {
    await service.startWatchRenewal();
    const inventory = deferred<DbResult>();
    mocks.rpc.mockReturnValueOnce(inventory.promise);
    await vi.advanceTimersByTimeAsync(HOUR);
    const monitored = service.refreshRenewalSchedule();
    expect(service.refreshRenewalSchedule()).toBe(monitored);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    inventory.resolve({ data: [calendarWatch()], error: null });
    await monitored;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('does not retry a held account through another monitor scan', async () => {
    mocks.rpc.mockResolvedValue({ data: [calendarWatch()], error: null });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('uncertain-outcome') });
    await service.startWatchRenewal();
    await service.refreshRenewalSchedule();
    await service.refreshRenewalSchedule();
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect((await service.getWatchRenewalStatus()).unresolvedRenewals).toBe(1);
  });

  it('stops before a pending calendar inventory can read Gmail or dispatch', async () => {
    const inventory = deferred<DbResult>();
    mocks.rpc.mockReturnValueOnce(inventory.promise);
    const started = service.startWatchRenewal();
    service.stopWatchRenewal();
    inventory.resolve({ data: [calendarWatch()], error: null });
    await started;
    await vi.advanceTimersByTimeAsync(2 * DAY);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops before a pending Gmail inventory can schedule either provider', async () => {
    const inventory = deferred<DbResult>();
    mocks.rpc.mockResolvedValue({ data: [calendarWatch()], error: null });
    mocks.gmailInventory.mockReturnValueOnce(inventory.promise);
    const started = service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.gmailInventory).toHaveBeenCalledTimes(1);
    service.stopWatchRenewal();
    inventory.resolve({ data: [gmailWatch()], error: null });
    await started;
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an old inventory clear or revive the restarted generation', async () => {
    const oldInventory = deferred<DbResult>();
    const newInventory = deferred<DbResult>();
    mocks.rpc.mockReturnValueOnce(oldInventory.promise).mockReturnValueOnce(newInventory.promise);
    const oldStart = service.startWatchRenewal();
    service.stopWatchRenewal();
    const newStart = service.startWatchRenewal();
    oldInventory.resolve({ data: [calendarWatch('old-generation')], error: null });
    await oldStart;
    expect(service.startWatchRenewal()).toBe(newStart);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    newInventory.resolve({ data: [calendarWatch('new-generation')], error: null });
    await newStart;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][1].body.calendarAccountId).toBe('new-generation');
  });

  it('clears both the hourly scanner and future per-account renewals on stop', async () => {
    mocks.rpc.mockResolvedValue({ data: [calendarWatch('later-calendar', HOUR / 2)], error: null });
    mocks.gmailInventory.mockResolvedValue({ data: [gmailWatch('later-gmail', HOUR / 3)], error: null });
    await service.startWatchRenewal();
    expect(vi.getTimerCount()).toBe(3);
    expect((await service.getWatchRenewalStatus()).scheduledRenewals).toBe(2);
    service.stopWatchRenewal();
    service.stopWatchRenewal();
    await vi.advanceTimersByTimeAsync(2 * DAY);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(await service.getWatchRenewalStatus()).toMatchObject({
      isRunning: false, scheduledRenewals: 0, inFlightRenewals: 0, unresolvedRenewals: 0,
    });
  });

  it('dispatches a future timer once and removes it from queued status', async () => {
    mocks.gmailInventory.mockResolvedValue({ data: [gmailWatch('later-gmail', 1000)], error: null });
    await service.startWatchRenewal();
    expect(mocks.invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('gmail-watch', {
      body: { action: 'renew', accountId: 'later-gmail' },
    });
    expect((await service.getWatchRenewalStatus()).scheduledRenewals).toBe(0);
  });

  it('reports an admitted renewal after stop without dispatching the next account', async () => {
    const renewal = deferred<{ data: { success: boolean }; error: null }>();
    mocks.rpc.mockResolvedValue({ data: [calendarWatch('first'), calendarWatch('second')], error: null });
    mocks.invoke.mockReturnValueOnce(renewal.promise);
    const started = service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(0);
    service.stopWatchRenewal();
    expect(await service.getWatchRenewalStatus()).toMatchObject({ isRunning: false, inFlightRenewals: 1 });
    renewal.resolve({ data: { success: true }, error: null });
    await started;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect((await service.getWatchRenewalStatus()).inFlightRenewals).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not overlap an admitted request when stop/start selects the same account', async () => {
    const renewal = deferred<{ data: { success: boolean }; error: null }>();
    mocks.rpc.mockResolvedValue({ data: [calendarWatch()], error: null });
    mocks.invoke.mockReturnValueOnce(renewal.promise);
    const oldStart = service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(0);
    service.stopWatchRenewal();
    await service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    renewal.resolve({ data: { success: true }, error: null });
    await oldStart;
    expect((await service.getWatchRenewalStatus()).inFlightRenewals).toBe(0);
  });

  it('holds an uncertain renewal across scans and restarts without retrying', async () => {
    mocks.rpc.mockResolvedValue({ data: [calendarWatch()], error: null });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('private-provider-payload') });
    await service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    service.stopWatchRenewal();
    await service.startWatchRenewal();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect((await service.getWatchRenewalStatus()).unresolvedRenewals).toBe(1);
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain('private-provider-payload');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-provider-payload');
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('calendar-fixture');
  });

  it.each([null, {}, { success: false }])('holds a missing or unsuccessful renewal receipt: %j', async (data) => {
    mocks.gmailInventory.mockResolvedValue({ data: [gmailWatch()], error: null });
    mocks.invoke.mockResolvedValueOnce({ data, error: null });
    await service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect((await service.getWatchRenewalStatus()).unresolvedRenewals).toBe(1);
  });

  it('records uncertainty from an old request without writing a post-stop failure log', async () => {
    const renewal = deferred<{ data: null; error: Error }>();
    mocks.rpc.mockResolvedValue({ data: [calendarWatch()], error: null });
    mocks.invoke.mockReturnValueOnce(renewal.promise);
    const oldStart = service.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(0);
    service.stopWatchRenewal();
    await service.startWatchRenewal();
    renewal.resolve({ data: null, error: new Error('uncertain-provider-outcome') });
    await oldStart;
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect((await service.getWatchRenewalStatus()).unresolvedRenewals).toBe(1);
  });

  it('retains the hold when the secondary uncertainty log fails', async () => {
    mocks.rpc.mockResolvedValue({ data: [calendarWatch()], error: null });
    mocks.invoke.mockRejectedValueOnce(new Error('network-outcome-unknown'));
    mocks.insert.mockRejectedValueOnce(new Error('log-unavailable'));
    await expect(service.startWatchRenewal()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(await service.getWatchRenewalStatus()).toMatchObject({ inFlightRenewals: 0, unresolvedRenewals: 1 });
  });

  it('ignores invalid expiry metadata without creating an immediate timer', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...calendarWatch(), watch_expires_at: 'invalid' }], error: null });
    await service.startWatchRenewal();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });
});
