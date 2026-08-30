import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProactiveTokenRefreshService } from '../proactiveTokenRefresh';

const mocks = vi.hoisted(() => ({ metadata: vi.fn(), invoke: vi.fn(), getUser: vi.fn(), insert: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: mocks.from, functions: { invoke: mocks.invoke }, auth: { getUser: mocks.getUser },
} }));
const account = { id: 'synthetic-account', provider: 'google', expires_at: '2026-08-30T10:01:00Z', user_id: 'synthetic-owner' };
const inventory = (rows = [account]) => ({ data: rows, error: null });
const verified = { data: { success: true, accountId: account.id, expiresAt: '2026-08-30T11:00:00Z' }, error: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('proactive token refresh lifecycle', () => {
  let service: ProactiveTokenRefreshService;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T10:00:00Z'));
    vi.resetAllMocks();
    service = new ProactiveTokenRefreshService();
    mocks.metadata.mockResolvedValue(inventory([]));
    mocks.invoke.mockResolvedValue(verified);
    mocks.getUser.mockResolvedValue({ data: { user: { id: account.user_id } }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table) => {
      if (table === 'sync_logs') return { insert: mocks.insert };
      if (table !== 'oauth_accounts_metadata') throw new Error('Unexpected table');
      return { select: () => ({ eq: () => ({ not: () => ({ lt: mocks.metadata }) }) }) };
    });
  });
  afterEach(() => { service.stopProactiveRefresh(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('starts once and clears the tracked interval on repeated stop', async () => {
    service.startProactiveRefresh(); service.startProactiveRefresh();
    await flush();
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    service.stopProactiveRefresh(); service.stopProactiveRefresh();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(service.getRefreshStatus()).toMatchObject({ isRunning: false, pendingScans: 0, pendingRefreshes: 0 });
  });

  it('coalesces timer ticks while a metadata scan is pending', async () => {
    const scan = deferred<ReturnType<typeof inventory>>();
    mocks.metadata.mockReturnValue(scan.promise);
    service.startProactiveRefresh();
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(service.getRefreshStatus().pendingScans).toBe(1);
    scan.resolve(inventory([])); await flush();
  });

  it('never dispatches from a scan that resolves after stop', async () => {
    const scan = deferred<ReturnType<typeof inventory>>();
    mocks.metadata.mockReturnValue(scan.promise);
    service.startProactiveRefresh(); service.stopProactiveRefresh();
    scan.resolve(inventory()); await flush();
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
    expect(service.getRefreshStatus().pendingScans).toBe(0);
  });

  it('an older scan cannot join a restarted generation', async () => {
    const old = deferred<ReturnType<typeof inventory>>();
    mocks.metadata.mockReturnValueOnce(old.promise).mockResolvedValue(inventory([]));
    service.startProactiveRefresh(); service.stopProactiveRefresh(); service.startProactiveRefresh();
    await flush(); old.resolve(inventory()); await flush();
    expect(mocks.metadata).toHaveBeenCalledTimes(2); expect(mocks.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('tracks already dispatched work after stop without claiming cancellation or writing a late log', async () => {
    const pending = deferred<typeof verified>();
    mocks.metadata.mockResolvedValue(inventory()); mocks.invoke.mockReturnValue(pending.promise);
    service.startProactiveRefresh(); await flush(); service.stopProactiveRefresh();
    expect(service.getRefreshStatus()).toMatchObject({ isRunning: false, pendingRefreshes: 1 });
    pending.resolve(verified); await flush();
    expect(mocks.invoke).toHaveBeenCalledTimes(1); expect(mocks.insert).not.toHaveBeenCalled();
    expect(service.getRefreshStatus().pendingRefreshes).toBe(0);
  });

  it('does not overlap refreshes for the same account after restart', async () => {
    const pending = deferred<typeof verified>();
    mocks.metadata.mockResolvedValue(inventory()); mocks.invoke.mockReturnValue(pending.promise);
    service.startProactiveRefresh(); await flush(); service.stopProactiveRefresh(); service.startProactiveRefresh();
    await flush(); expect(mocks.invoke).toHaveBeenCalledTimes(1);
    pending.resolve(verified); await flush();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not write a log if stop occurs while resolving the current user', async () => {
    const user = deferred<{ data: { user: { id: string } }; error: null }>();
    mocks.metadata.mockResolvedValue(inventory()); mocks.getUser.mockReturnValue(user.promise);
    service.startProactiveRefresh(); await flush(); service.stopProactiveRefresh();
    user.resolve({ data: { user: { id: account.user_id } }, error: null }); await flush();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('coalesces duplicate inventory rows and simultaneous manual/background requests', async () => {
    const pending = deferred<typeof verified>();
    mocks.metadata.mockResolvedValue(inventory([account, account])); mocks.invoke.mockReturnValue(pending.promise);
    service.startProactiveRefresh(); await flush();
    const manual = service.refreshAllExpiringTokens(); await flush();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    pending.resolve(verified); await manual; await flush();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it.each(['transport error', 'invalid receipt', 'credential-bearing receipt'])('holds %s across ticks, restart and manual retry without leaking payloads', async (kind) => {
    mocks.metadata.mockResolvedValue(inventory());
    if (kind === 'transport error') mocks.invoke.mockRejectedValue(new Error('PRIVATE_PAYLOAD'));
    else mocks.invoke.mockResolvedValue({ data: kind === 'invalid receipt' ? { success: false } : { ...verified.data, access_token: 'PRIVATE_PAYLOAD' }, error: null });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.startProactiveRefresh(); await flush();
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    service.stopProactiveRefresh(); service.startProactiveRefresh(); await flush();
    const manual = await service.refreshAllExpiringTokens();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(service.getRefreshStatus().unresolvedRefreshes).toBe(1);
    expect(JSON.stringify([manual, mocks.insert.mock.calls, log.mock.calls])).not.toContain('PRIVATE_PAYLOAD');
  });

  it('a late failed response remains unresolved after stop without emitting a follow-on log', async () => {
    const pending = deferred<{ data: null; error: Error }>();
    mocks.metadata.mockResolvedValue(inventory()); mocks.invoke.mockReturnValue(pending.promise);
    service.startProactiveRefresh(); await flush(); service.stopProactiveRefresh();
    pending.resolve({ data: null, error: new Error('private failure') }); await flush();
    expect(service.getRefreshStatus()).toMatchObject({ pendingRefreshes: 0, unresolvedRefreshes: 1 });
    expect(mocks.insert).not.toHaveBeenCalled();
    service.startProactiveRefresh(); await flush(); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'not-a-date', '2026-08-30T09:59:59Z', '2026-08-30T10:00:00Z'])('holds a receipt with invalid or non-future expiry %j', async (expiresAt) => {
    mocks.metadata.mockResolvedValue(inventory());
    mocks.invoke.mockResolvedValue({ data: { ...verified.data, expiresAt }, error: null });
    await expect(service.refreshAllExpiringTokens()).resolves.toMatchObject([{ refreshed: false }]);
    expect(service.getRefreshStatus().unresolvedRefreshes).toBe(1);
    await service.refreshAllExpiringTokens();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', items_processed: 0 }));
  });

  it('keeps explicit manual refresh available without background scheduling', async () => {
    mocks.metadata.mockResolvedValue(inventory());
    await expect(service.refreshAllExpiringTokens()).resolves.toMatchObject([{ refreshed: true }]);
    expect(service.getRefreshStatus().isRunning).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('a telemetry failure does not relabel a verified provider response as uncertain', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.metadata.mockResolvedValue(inventory()); mocks.getUser.mockRejectedValue(new Error('private auth message'));
    await expect(service.refreshAllExpiringTokens()).resolves.toMatchObject([{ refreshed: true }]);
    expect(service.getRefreshStatus().unresolvedRefreshes).toBe(0);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private auth message');
  });

  it('suppresses stale metadata failures without creating any work', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.metadata.mockResolvedValue({ data: null, error: { message: 'PRIVATE_METADATA' } });
    service.startProactiveRefresh(); service.stopProactiveRefresh(); await flush();
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
});
