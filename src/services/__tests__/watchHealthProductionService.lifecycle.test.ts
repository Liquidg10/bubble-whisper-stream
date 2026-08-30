import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchHealthProductionService, type ProductionWatchHealth } from '../watchHealthProductionService';

const mock = vi.hoisted(() => ({
  startRenewal: vi.fn(), stopRenewal: vi.fn(), refreshRenewal: vi.fn(), renewalStatus: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  calendarMetrics: vi.fn(), calendarAccounts: vi.fn(), calendarRenew: vi.fn(), calendarBulkRenew: vi.fn(),
  calendarSync: vi.fn(), calendarSetup: vi.fn(), gmailMetrics: vi.fn(), gmailAccounts: vi.fn(),
  gmailRenew: vi.fn(), gmailSync: vi.fn(), gmailSetup: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
vi.mock('@/services/watchRenewalService', () => ({ watchRenewalService: {
  startWatchRenewal: mock.startRenewal, stopWatchRenewal: mock.stopRenewal, getWatchRenewalStatus: mock.renewalStatus,
  refreshRenewalSchedule: mock.refreshRenewal,
} }));
vi.mock('@/services/calendarHealthService', () => ({ calendarHealthService: {
  getHealthMetrics: mock.calendarMetrics, getAccountHealthStatus: mock.calendarAccounts,
  renewWatchChannel: mock.calendarRenew, renewAllExpiringChannels: mock.calendarBulkRenew,
  triggerBoundedSync: mock.calendarSync, setupWatchChannel: mock.calendarSetup,
} }));
vi.mock('@/services/gmailHealthService', () => ({ gmailHealthService: {
  getHealthMetrics: mock.gmailMetrics, getAccountHealthStatus: mock.gmailAccounts,
  renewWatchChannel: mock.gmailRenew, triggerSyncWithRecovery: mock.gmailSync, setupWatchChannel: mock.gmailSetup,
} }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type QueryResult = { data: Record<string, unknown>[] | null; error: Error | null };
const empty = (): QueryResult => ({ data: [], error: null });
function query(result: QueryResult | Promise<QueryResult> = empty()) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const healthy = (): ProductionWatchHealth => ({
  calendar: { totalAccounts: 0, activeWatches: 0, expiringIn24h: 0, failed410Recovery: 0, lastRenewalCheck: 0 },
  gmail: { totalAccounts: 0, activeWatches: 0, expiringIn24h: 0, failed410Recovery: 0, lastSyncError: 0 },
  renewal: { scheduledRenewals: 0, successfulRenewals24h: 0, failedRenewals24h: 0 },
});
const hour = 60 * 60 * 1000;

describe('production watch health lifecycle', () => {
  let service: WatchHealthProductionService;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    service = new WatchHealthProductionService();
    mock.startRenewal.mockResolvedValue(undefined);
    mock.refreshRenewal.mockResolvedValue(undefined);
    mock.renewalStatus.mockResolvedValue({ scheduledRenewals: 0 });
    mock.from.mockImplementation(() => query());
    mock.rpc.mockResolvedValue(empty());
    mock.calendarMetrics.mockResolvedValue({ totalAccounts: 0, activeWatches: 0 });
    mock.gmailMetrics.mockResolvedValue({ totalAccounts: 0, activeWatches: 0 });
    mock.calendarAccounts.mockResolvedValue([]);
    mock.gmailAccounts.mockResolvedValue([]);
    for (const fn of [mock.calendarRenew, mock.calendarSync, mock.calendarSetup, mock.gmailRenew, mock.gmailSync, mock.gmailSetup]) {
      fn.mockResolvedValue(undefined);
    }
  });
  afterEach(() => {
    service.stopProductionMonitoring();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('coalesces concurrent starts and installs exactly two tracked intervals', async () => {
    const start = deferred<void>();
    mock.startRenewal.mockReturnValue(start.promise);
    const health = vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    const first = service.startProductionMonitoring();
    expect(service.startProductionMonitoring()).toBe(first);
    expect(mock.startRenewal).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    start.resolve();
    await first;
    await service.startProductionMonitoring();
    expect(mock.startRenewal).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(2);
  });

  it('does not resurrect timers or initial health work after stop during startup', async () => {
    const start = deferred<void>();
    mock.startRenewal.mockReturnValue(start.promise);
    const health = vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    const pending = service.startProductionMonitoring();
    service.stopProductionMonitoring();
    start.resolve();
    await pending;
    await vi.advanceTimersByTimeAsync(3 * hour);
    expect(health).not.toHaveBeenCalled();
    expect(mock.refreshRenewal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(mock.stopRenewal).toHaveBeenCalledTimes(1);
  });

  it('stale startup completion cannot replace the restarted generation', async () => {
    const old = deferred<void>();
    mock.startRenewal.mockReturnValueOnce(old.promise);
    const health = vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    const stale = service.startProductionMonitoring();
    service.stopProductionMonitoring();
    await service.startProductionMonitoring();
    old.resolve();
    await stale;
    expect(vi.getTimerCount()).toBe(2);
    expect(health).toHaveBeenCalledTimes(1);
    await service.startProductionMonitoring();
    expect(mock.startRenewal).toHaveBeenCalledTimes(2);
  });

  it('current startup failure clears monitoring and permits a fresh start', async () => {
    mock.startRenewal.mockRejectedValueOnce(new Error('startup failed'));
    await expect(service.startProductionMonitoring()).rejects.toThrow('startup failed');
    expect(mock.stopRenewal).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await service.startProductionMonitoring();
    expect(vi.getTimerCount()).toBe(2);
  });

  it('stale startup rejection cannot stop the new generation', async () => {
    const old = deferred<void>();
    mock.startRenewal.mockReturnValueOnce(old.promise);
    const pending = service.startProductionMonitoring();
    const rejection = expect(pending).rejects.toThrow('old startup failed');
    service.stopProductionMonitoring();
    await service.startProductionMonitoring();
    old.reject(new Error('old startup failed'));
    await rejection;
    expect(mock.stopRenewal).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(2);
  });

  it('coalesces health and renewal ticks while a health check remains pending', async () => {
    const health = deferred<ProductionWatchHealth>();
    const getHealth = vi.spyOn(service, 'getProductionHealthStatus').mockReturnValue(health.promise);
    const pending = service.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(3 * hour);
    expect(getHealth).toHaveBeenCalledTimes(1);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.refreshRenewal).not.toHaveBeenCalled();
    service.stopProductionMonitoring();
    health.resolve(healthy());
    await pending;
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.refreshRenewal).not.toHaveBeenCalled();
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
  });

  it('routes the initial health pass, health timer and hourly job through the single renewal coordinator', async () => {
    const status = healthy();
    status.calendar.expiringIn24h = 2;
    status.gmail.expiringIn24h = 3;
    vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(status);
    await service.startProductionMonitoring();
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(hour / 2);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(hour / 2);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(4);
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.calendarBulkRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.calendarSync).not.toHaveBeenCalled();
    expect(mock.gmailSync).not.toHaveBeenCalled();
  });

  it('does not pretend an already-dispatched coordinator refresh was cancelled by stop', async () => {
    const renewal = deferred<void>();
    vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    mock.refreshRenewal.mockReturnValueOnce(renewal.promise);
    const pending = service.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(1);
    service.stopProductionMonitoring();
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    renewal.resolve();
    await pending;
    await vi.advanceTimersByTimeAsync(2 * hour);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(1);
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
  });

  it('does not bypass a rejected coordinator refresh with a direct provider retry', async () => {
    const renewal = deferred<void>();
    vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    mock.refreshRenewal.mockReturnValueOnce(renewal.promise);
    const pending = service.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(0);
    service.stopProductionMonitoring();
    renewal.reject(new Error('provider outcome failed'));
    await pending;
    await vi.advanceTimersByTimeAsync(hour);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(1);
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
  });

  it('retains pending maintenance across restart and resumes on a later tick', async () => {
    const renewal = deferred<void>();
    const health = vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    mock.refreshRenewal.mockReturnValueOnce(renewal.promise);
    const old = service.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(0);
    service.stopProductionMonitoring();
    const current = service.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(hour);
    expect(health).toHaveBeenCalledTimes(1);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(1);
    renewal.resolve();
    await Promise.all([old, current]);
    await vi.advanceTimersByTimeAsync(hour / 2);
    expect(health).toHaveBeenCalledTimes(2);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
  });

  it('ignores captured stale health and hourly callbacks after stop and restart', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval');
    vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    await service.startProductionMonitoring();
    const staleCallbacks = intervals.mock.calls.map(([callback]) => callback as () => void);
    service.stopProductionMonitoring();
    for (const callback of staleCallbacks) callback();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(1);
    await service.startProductionMonitoring();
    for (const callback of staleCallbacks) callback();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(2);
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
  });

  it('coalesces a pending hourly refresh across later health and hourly ticks', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const refresh = deferred<void>();
    vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    await service.startProductionMonitoring();
    const hourlyCallback = intervals.mock.calls.find(([, delay]) => delay === hour)![0] as () => void;
    mock.refreshRenewal.mockReturnValueOnce(refresh.promise);
    hourlyCallback();
    await vi.advanceTimersByTimeAsync(3 * hour);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(2);
    service.stopProductionMonitoring();
    refresh.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.refreshRenewal).toHaveBeenCalledTimes(2);
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
  });

  it('clears valid zero-valued interval handles as well as nonzero handles', async () => {
    type IntervalHandle = ReturnType<typeof setInterval>;
    vi.spyOn(globalThis, 'setInterval')
      .mockReturnValueOnce(0 as unknown as IntervalHandle)
      .mockReturnValueOnce(1 as unknown as IntervalHandle);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    await service.startProductionMonitoring();
    service.stopProductionMonitoring();
    expect(clear).toHaveBeenCalledWith(0);
    expect(clear).toHaveBeenCalledWith(1);
  });

  it.each(['calendar', 'gmail'] as const)('coalesces same-account %s recovery and stops before its second provider stage', async provider => {
    const sync = deferred<void>();
    const syncMock = provider === 'calendar' ? mock.calendarSync : mock.gmailSync;
    const setupMock = provider === 'calendar' ? mock.calendarSetup : mock.gmailSetup;
    syncMock.mockReturnValueOnce(sync.promise);
    const first = service.handle410GoneRecovery('account-a', provider);
    expect(service.handle410GoneRecovery('account-a', provider)).toBe(first);
    const result = expect(first).rejects.toThrow('Watch recovery stopped before setup');
    service.stopProductionMonitoring();
    sync.resolve();
    await result;
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(setupMock).not.toHaveBeenCalled();
    // A new explicit call is permitted after the cancelled sequence settles.
    await service.handle410GoneRecovery('account-a', provider);
    expect(syncMock).toHaveBeenCalledTimes(2);
    expect(setupMock).toHaveBeenCalledExactlyOnceWith('account-a');
  });

  it('preserves healthy monitoring when a periodic read rejects', async () => {
    const health = vi.spyOn(service, 'getProductionHealthStatus').mockResolvedValue(healthy());
    await service.startProductionMonitoring();
    health.mockRejectedValueOnce(new Error('read unavailable'));
    await vi.advanceTimersByTimeAsync(hour / 2);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(hour / 2);
    expect(health).toHaveBeenCalledTimes(3);
    service.stopProductionMonitoring();
    await vi.advanceTimersByTimeAsync(2 * hour);
    expect(health).toHaveBeenCalledTimes(3);
  });

  it('awaits renewal status before starting later statistics reads', async () => {
    mock.renewalStatus.mockRejectedValueOnce(new Error('renewal status unavailable'));
    await expect(service.getProductionHealthStatus()).rejects.toThrow('renewal status unavailable');
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('includes resolved renewal counts and next renewal timestamp in health status', async () => {
    const nextRenewal = new Date(Date.now() + hour);
    mock.renewalStatus.mockResolvedValueOnce({ scheduledRenewals: 3, nextRenewal });
    const status = await service.getProductionHealthStatus();
    expect(status.renewal.scheduledRenewals).toBe(3);
    expect(status.renewal.nextRenewalTime).toBe(nextRenewal.getTime());
  });
});
