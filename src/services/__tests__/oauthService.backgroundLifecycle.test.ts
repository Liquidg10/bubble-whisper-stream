import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthService } from '../oauthService';

const mocks = vi.hoisted(() => ({ startRefresh: vi.fn(), stopRefresh: vi.fn(), startWatch: vi.fn(), stopWatch: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('../proactiveTokenRefresh', () => ({ proactiveTokenRefreshService: {
  startProactiveRefresh: mocks.startRefresh, stopProactiveRefresh: mocks.stopRefresh,
} }));
vi.mock('../watchRenewalService', () => ({ watchRenewalService: {
  startWatchRenewal: mocks.startWatch, stopWatchRenewal: mocks.stopWatch,
} }));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('OAuth background service coordinator lifecycle', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.startWatch.mockResolvedValue(undefined); });

  it('coalesces duplicate starts before and after dynamic imports', async () => {
    const service = new OAuthService();
    const first = service.startBackgroundServices(); const second = service.startBackgroundServices();
    expect(first).toBe(second);
    await Promise.all([first, second]); await service.startBackgroundServices();
    expect(mocks.startRefresh).toHaveBeenCalledTimes(1); expect(mocks.startWatch).toHaveBeenCalledTimes(1);
    await service.stopBackgroundServices();
  });

  it('stop before imports resolve prevents a late start', async () => {
    const service = new OAuthService();
    const start = service.startBackgroundServices(); const stop = service.stopBackgroundServices();
    await Promise.all([start, stop]);
    expect(mocks.startRefresh).not.toHaveBeenCalled(); expect(mocks.startWatch).not.toHaveBeenCalled();
  });

  it('an older stop awaiting imports cannot stop a new generation', async () => {
    const service = new OAuthService();
    const first = service.startBackgroundServices(); const stop = service.stopBackgroundServices();
    const restart = service.startBackgroundServices();
    await Promise.all([first, stop, restart]);
    expect(mocks.startRefresh).toHaveBeenCalledTimes(1); expect(mocks.startWatch).toHaveBeenCalledTimes(1);
    expect(mocks.stopRefresh).not.toHaveBeenCalled(); expect(mocks.stopWatch).not.toHaveBeenCalled();
    await service.stopBackgroundServices();
  });

  it('stops cached services synchronously while watch startup remains pending', async () => {
    const service = new OAuthService();
    const pending = deferred(); mocks.startWatch.mockReturnValueOnce(pending.promise);
    const start = service.startBackgroundServices();
    await vi.waitFor(() => expect(mocks.startWatch).toHaveBeenCalledTimes(1));
    const stop = service.stopBackgroundServices();
    expect(mocks.stopRefresh).toHaveBeenCalledTimes(1); expect(mocks.stopWatch).toHaveBeenCalledTimes(1);
    pending.resolve(); await Promise.all([start, stop]);
    expect(mocks.startWatch).toHaveBeenCalledTimes(1);
  });

  it('failure from a stopped startup cannot shut down its successful replacement', async () => {
    const service = new OAuthService(); const pending = deferred();
    mocks.startWatch.mockReturnValueOnce(pending.promise);
    const start = service.startBackgroundServices();
    await vi.waitFor(() => expect(mocks.startWatch).toHaveBeenCalledTimes(1));
    await service.stopBackgroundServices(); await service.startBackgroundServices();
    pending.reject(new Error('private old failure')); await start;
    expect(mocks.startWatch).toHaveBeenCalledTimes(2);
    expect(mocks.stopRefresh).toHaveBeenCalledTimes(1); expect(mocks.stopWatch).toHaveBeenCalledTimes(1);
    await service.stopBackgroundServices();
  });

  it('cleans up partial startup failure and permits a deliberate later start', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new OAuthService(); mocks.startWatch.mockRejectedValueOnce(new Error('PRIVATE_STARTUP'));
    await service.startBackgroundServices();
    expect(mocks.stopRefresh).toHaveBeenCalledTimes(1); expect(mocks.stopWatch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_STARTUP');
    await service.startBackgroundServices(); expect(mocks.startWatch).toHaveBeenCalledTimes(2);
    await service.stopBackgroundServices(); log.mockRestore();
  });
});
