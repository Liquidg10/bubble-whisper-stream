import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Both lifecycle services below are real. Only external metadata, provider
// transport, health reads, and logging are mocked; no provider is contacted.
const mock = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), invoke: vi.fn(), insert: vi.fn(),
  calendarInventory: vi.fn(), gmailInventory: vi.fn(),
  calendarMetrics: vi.fn(), calendarAccounts: vi.fn(), calendarRenew: vi.fn(), calendarBulkRenew: vi.fn(),
  calendarSync: vi.fn(), calendarSetup: vi.fn(), gmailMetrics: vi.fn(), gmailAccounts: vi.fn(),
  gmailRenew: vi.fn(), gmailSync: vi.fn(), gmailSetup: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mock.rpc, from: mock.from, functions: { invoke: mock.invoke } },
}));
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

type QueryResult = { data: Record<string, unknown>[] | null; error: unknown | null };
type ProviderResult = { data: { success: boolean } | null; error: unknown | null };
type RenewalService = typeof import('../watchRenewalService')['watchRenewalService'];
type ProductionService = InstanceType<typeof import('../watchHealthProductionService')['WatchHealthProductionService']>;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const empty = (): QueryResult => ({ data: [], error: null });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('shared watch renewal admission across real monitoring lifecycles', () => {
  let renewal: RenewalService;
  let production: ProductionService;
  let calendarExpiry: string | null;
  let gmailExpiry: string | null;

  const calendarRow = () => ({
    id: 'calendar-account-fixture', user_id: 'owner-fixture', calendar_id: 'primary',
    watch_resource_id: 'resource-fixture', watch_channel_id: 'channel-fixture', watch_expires_at: calendarExpiry,
  });
  const gmailRow = () => ({
    id: 'gmail-watch-fixture', user_id: 'owner-fixture', oauth_account_id: 'gmail-account-fixture', watch_expires_at: gmailExpiry,
  });
  const setBothDue = () => {
    calendarExpiry = new Date(Date.now() + HOUR).toISOString();
    gmailExpiry = new Date(Date.now() + HOUR).toISOString();
  };
  function providerSuccess(functionName: string): ProviderResult {
    // A successful provider renewal persists its new expiration before returning.
    // Do not simulate repeated stale success rows as a new lifecycle defect.
    if (functionName === 'calendar-watch') calendarExpiry = new Date(Date.now() + 7 * DAY).toISOString();
    else if (functionName === 'gmail-watch') gmailExpiry = new Date(Date.now() + 7 * DAY).toISOString();
    else throw new Error('Unexpected provider function');
    return { data: { success: true }, error: null };
  }
  function query(table: string) {
    return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
      lt: () => mock.gmailInventory(),
      insert: mock.insert,
      then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => {
        const rows = table === 'calendar_accounts' && calendarExpiry ? [calendarRow()]
          : table === 'gmail_watch_subscriptions' && gmailExpiry ? [gmailRow()] : [];
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
  }
  function expectNoDirectHealthRenewals() {
    expect(mock.calendarRenew).not.toHaveBeenCalled();
    expect(mock.calendarBulkRenew).not.toHaveBeenCalled();
    expect(mock.gmailRenew).not.toHaveBeenCalled();
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T09:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    calendarExpiry = null;
    gmailExpiry = null;
    mock.calendarInventory.mockImplementation(() => Promise.resolve({
      data: calendarExpiry && new Date(calendarExpiry).getTime() <= Date.now() + DAY ? [calendarRow()] : [], error: null,
    }));
    mock.gmailInventory.mockImplementation(() => Promise.resolve({
      data: gmailExpiry && new Date(gmailExpiry).getTime() < Date.now() + 6 * DAY ? [gmailRow()] : [], error: null,
    }));
    mock.rpc.mockImplementation((name: string) => {
      if (name !== 'get_expiring_watch_channels') throw new Error('Unexpected metadata RPC');
      return mock.calendarInventory();
    });
    mock.from.mockImplementation(query);
    mock.insert.mockResolvedValue({ data: null, error: null });
    mock.invoke.mockImplementation(async (name: string) => providerSuccess(name));
    mock.calendarMetrics.mockResolvedValue({ totalAccounts: 1, activeWatches: 1 });
    mock.gmailMetrics.mockResolvedValue({ totalAccounts: 1, activeWatches: 1, lastSyncAt: 0 });
    mock.calendarAccounts.mockImplementation(async () => calendarExpiry
      ? [{ id: 'calendar-account-fixture', watchExpiresAt: calendarExpiry }] : []);
    mock.gmailAccounts.mockImplementation(async () => gmailExpiry
      ? [{ id: 'gmail-account-fixture', watchExpiresAt: gmailExpiry }] : []);
    renewal = (await import('../watchRenewalService')).watchRenewalService;
    const { WatchHealthProductionService } = await import('../watchHealthProductionService');
    production = new WatchHealthProductionService();
  });

  afterEach(() => {
    production.stopProductionMonitoring();
    expectNoDirectHealthRenewals();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('duplicate startup and initial health refresh renew Calendar/Gmail once through the shared transport', async () => {
    setBothDue();
    const first = production.startProductionMonitoring();
    const second = production.startProductionMonitoring();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    await production.startProductionMonitoring();
    await renewal.startWatchRenewal();
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(mock.invoke.mock.calls.map(([name]) => name)).toEqual(['calendar-watch', 'gmail-watch']);
    expect(mock.invoke.mock.calls[0][1].body.calendarAccountId).toBe('calendar-account-fixture');
    expect(mock.invoke.mock.calls[1][1].body.accountId).toBe('gmail-account-fixture');
    expect(mock.calendarMetrics).toHaveBeenCalled();
    expect(mock.gmailMetrics).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(3); // shared hourly scan, health, production hourly
    expect(await renewal.getWatchRenewalStatus()).toMatchObject({ inFlightRenewals: 0, unresolvedRenewals: 0 });
  });

  it.each(['calendar-watch', 'gmail-watch'])('holds unresolved %s across both monitoring tick types and stop/restart', async (uncertainFunction) => {
    setBothDue();
    const sharedRefresh = vi.spyOn(renewal, 'refreshRenewalSchedule');
    mock.invoke.mockImplementation(async (name: string) => name === uncertainFunction
      ? { data: null, error: new Error('private-provider-outcome-unknown') } : providerSuccess(name));
    await production.startProductionMonitoring();
    const scansAfterStart = mock.rpc.mock.calls.length;
    expect(sharedRefresh).toHaveBeenCalledTimes(1); // initial production health check
    await vi.advanceTimersByTimeAsync(HOUR / 2);
    expect(sharedRefresh).toHaveBeenCalledTimes(2); // actual 30-minute health tick
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(mock.rpc.mock.calls.length).toBeGreaterThan(scansAfterStart);
    expect(mock.calendarMetrics.mock.calls.length).toBeGreaterThan(1);
    production.stopProductionMonitoring();
    await production.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(2 * HOUR);

    expect(mock.invoke.mock.calls.map(([name]) => name)).toEqual(['calendar-watch', 'gmail-watch']);
    expect(await renewal.getWatchRenewalStatus()).toMatchObject({ isRunning: true, inFlightRenewals: 0, unresolvedRenewals: 1 });
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mock.insert.mock.calls)).not.toContain('private-provider-outcome-unknown');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-provider-outcome-unknown');
  });

  it('retains an admitted call through restart and transfers its late uncertain result into the shared hold', async () => {
    setBothDue();
    const provider = deferred<ProviderResult>();
    mock.invoke.mockImplementation((name: string) => name === 'calendar-watch' ? provider.promise : Promise.resolve(providerSuccess(name)));
    const oldStartup = production.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    production.stopProductionMonitoring();
    await production.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(mock.invoke.mock.calls.map(([name]) => name)).toEqual(['calendar-watch', 'gmail-watch']);
    expect(await renewal.getWatchRenewalStatus()).toMatchObject({ inFlightRenewals: 1, unresolvedRenewals: 0 });

    provider.resolve({ data: null, error: new Error('late-unknown-provider-outcome') });
    await oldStartup;
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(mock.invoke).toHaveBeenCalledTimes(2);
    expect(await renewal.getWatchRenewalStatus()).toMatchObject({ inFlightRenewals: 0, unresolvedRenewals: 1 });
    // The stopped generation cannot write a secondary failure record either.
    expect(mock.insert).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(3);
  });

  it('stopped late startup inventory and late health metadata cannot revive provider work or timers', async () => {
    setBothDue();
    const inventory = deferred<QueryResult>();
    mock.calendarInventory.mockReturnValueOnce(inventory.promise);
    const oldStartup = production.startProductionMonitoring();
    production.stopProductionMonitoring();
    inventory.resolve({ data: [calendarRow()], error: null });
    await oldStartup;
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.gmailInventory).not.toHaveBeenCalled();
    expect(mock.calendarMetrics).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    // A separate started generation reaches health metadata with no due work;
    // expiring rows then appear, but stop occurs before that read completes.
    calendarExpiry = null;
    gmailExpiry = null;
    const health = deferred<{ totalAccounts: number; activeWatches: number }>();
    mock.calendarMetrics.mockReturnValueOnce(health.promise);
    const startup = production.startProductionMonitoring();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.calendarMetrics).toHaveBeenCalledTimes(1);
    setBothDue();
    const scansAtStop = mock.rpc.mock.calls.length;
    production.stopProductionMonitoring();
    health.resolve({ totalAccounts: 1, activeWatches: 1 });
    await startup;
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(mock.rpc).toHaveBeenCalledTimes(scansAtStop);
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
