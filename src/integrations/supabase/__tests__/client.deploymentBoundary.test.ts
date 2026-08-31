import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ISOLATED_PROJECT_REF, SHARED_APP_ORIGIN, SHARED_PROJECT_REF } from '../deploymentBoundary';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
function setup(owner: boolean, origin: string) {
  const ref = owner ? ISOLATED_PROJECT_REF : SHARED_PROJECT_REF;
  vi.stubEnv('VITE_SUPABASE_PROJECT_ID', ref);
  vi.stubEnv('VITE_SUPABASE_URL', `https://${ref}.supabase.co`);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`);
  vi.stubEnv('VITE_MIND_MANUAL_DEPLOYMENT_MODE', owner ? 'owner-isolated' : undefined);
  vi.stubEnv('VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN', owner ? 'https://owner.example.test' : undefined);
  vi.stubGlobal('window', { location: { origin, pathname: '/' } });
}
describe('SDK initialization has an independent deployment guard', () => {
  beforeEach(() => { vi.resetModules(); mocks.createClient.mockClear(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each([SHARED_APP_ORIGIN, 'https://copy.example.test', 'null', 'http://localhost:8080'])(
    'cannot initialize an isolated SDK on %s', async origin => {
      setup(true, origin);
      await expect(import('../client')).rejects.toThrow('runtime-origin-mismatch');
      expect(mocks.createClient).not.toHaveBeenCalled();
    });

  it('cannot silently switch the shared deployment to the isolated target', async () => {
    setup(false, SHARED_APP_ORIGIN);
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', ISOLATED_PROJECT_REF);
    vi.stubEnv('VITE_SUPABASE_URL', `https://${ISOLATED_PROJECT_REF}.supabase.co`);
    await expect(import('../client')).rejects.toThrow('project-boundary-mismatch');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([false, true])('initializes exactly one correctly bound SDK (owner=%s)', async owner => {
    setup(owner, owner ? 'https://owner.example.test' : SHARED_APP_ORIGIN);
    const { supabaseConfig } = await import('../client');
    expect(supabaseConfig.projectRef).toBe(owner ? ISOLATED_PROJECT_REF : SHARED_PROJECT_REF);
    expect(mocks.createClient).toHaveBeenCalledExactlyOnceWith(supabaseConfig.url, supabaseConfig.publishableKey, expect.any(Object));
  });
});
