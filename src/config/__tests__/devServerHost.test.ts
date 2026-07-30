import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEV_HOST, resolveDevHost } from '../../../vite.dev-host';

describe('Vite development host boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('binds to IPv4 loopback by default', () => {
    expect(resolveDevHost(undefined)).toBe(DEFAULT_DEV_HOST);
  });

  it.each(['127.0.0.1', 'localhost', '::1'])(
    'accepts loopback host %s without a security warning',
    (host) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(resolveDevHost(host)).toBe(host);
      expect(warning).not.toHaveBeenCalled();
    }
  );

  it('warns when an explicit host reopens network access', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveDevHost('0.0.0.0')).toBe('0.0.0.0');
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('GHSA-4w7w-66w2-5vf9'));
  });
});
