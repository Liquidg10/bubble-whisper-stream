import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

describe('Supabase callback URL detection', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockClear();
  });

  it('disables auth-js URL consumption only on the dedicated Calendar callback', async () => {
    window.history.replaceState({}, '', '/oauth-callback?code=calendar-code');
    const { shouldDetectSupabaseSessionInUrl } = await import('@/integrations/supabase/client');

    expect(shouldDetectSupabaseSessionInUrl('/oauth-callback')).toBe(false);
    expect(shouldDetectSupabaseSessionInUrl('/auth/callback')).toBe(true);
    expect(shouldDetectSupabaseSessionInUrl('/')).toBe(true);
    expect(shouldDetectSupabaseSessionInUrl('/settings')).toBe(true);
    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({ detectSessionInUrl: false }),
      }),
    );
  });

  it('preserves legacy Supabase URL detection on the auth callback', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=supabase-code');
    await import('@/integrations/supabase/client');

    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({ detectSessionInUrl: true }),
      }),
    );
  });
});
