import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));
const TEST_PROJECT_REF = 'ekekeywoxvdbfbmqyhjy';
const TEST_PROJECT_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const TEST_PUBLISHABLE_KEY = `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`;

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

describe('Supabase callback URL detection', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockClear();
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', TEST_PROJECT_REF);
    vi.stubEnv('VITE_SUPABASE_URL', TEST_PROJECT_URL);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', TEST_PUBLISHABLE_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('disables auth-js URL consumption only on the dedicated Calendar callback', async () => {
    window.history.replaceState({}, '', '/oauth-callback?code=calendar-code');
    const { shouldDetectSupabaseSessionInUrl } = await import('@/integrations/supabase/client');

    expect(shouldDetectSupabaseSessionInUrl('/oauth-callback')).toBe(false);
    expect(shouldDetectSupabaseSessionInUrl('/auth/callback')).toBe(true);
    expect(shouldDetectSupabaseSessionInUrl('/')).toBe(true);
    expect(shouldDetectSupabaseSessionInUrl('/settings')).toBe(true);
    expect(mocks.createClient).toHaveBeenCalledWith(
      TEST_PROJECT_URL,
      TEST_PUBLISHABLE_KEY,
      expect.objectContaining({
        auth: expect.objectContaining({ detectSessionInUrl: false }),
      }),
    );
  });

  it('preserves legacy Supabase URL detection on the auth callback', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=supabase-code');
    await import('@/integrations/supabase/client');

    expect(mocks.createClient).toHaveBeenCalledWith(
      TEST_PROJECT_URL,
      TEST_PUBLISHABLE_KEY,
      expect.objectContaining({
        auth: expect.objectContaining({ detectSessionInUrl: true }),
      }),
    );
  });
});
