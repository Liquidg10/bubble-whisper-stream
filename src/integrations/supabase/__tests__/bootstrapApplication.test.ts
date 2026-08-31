import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapApplication } from '../../../bootstrapApplication';
import { ISOLATED_PROJECT_REF, SHARED_APP_ORIGIN, SHARED_PROJECT_REF, type DeploymentEnvironment } from '../deploymentBoundary';

function environment(owner = false): DeploymentEnvironment {
  const ref = owner ? ISOLATED_PROJECT_REF : SHARED_PROJECT_REF;
  return { VITE_SUPABASE_PROJECT_ID: ref, VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`,
    ...(owner ? { VITE_MIND_MANUAL_DEPLOYMENT_MODE: 'owner-isolated', VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://owner.example.test' } : {}),
  };
}

describe('minimal stopped bootstrap', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="root"></div>'; });

  it.each([
    { environment: environment(true), origin: SHARED_APP_ORIGIN },
    { environment: environment(true), origin: undefined },
    { environment: { ...environment(), VITE_SUPABASE_PROJECT_ID: ISOLATED_PROJECT_REF }, origin: SHARED_APP_ORIGIN },
    { environment: { ...environment(), VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://private.example.test' }, origin: SHARED_APP_ORIGIN },
  ])('stops before importing/mounting app case %#', async input => {
    const mount = vi.fn();
    expect(await bootstrapApplication({ ...input, document, mount })).toBe('blocked');
    expect(mount).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"] h1')?.textContent).toBe('App connection paused');
    expect(document.body.textContent).toContain('No app connection was started');
    expect(document.querySelectorAll('script,link,iframe,form,a,button,img')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('private.example.test');
    expect(document.body.textContent).not.toContain(ISOLATED_PROJECT_REF);
  });

  it.each([false, true])('starts the verified app exactly once for a coherent profile (owner=%s)', async owner => {
    const mount = vi.fn(async () => {});
    expect(await bootstrapApplication({ environment: environment(owner), document,
      origin: owner ? 'https://owner.example.test' : SHARED_APP_ORIGIN, mount })).toBe('started');
    expect(mount).toHaveBeenCalledExactlyOnceWith(document.getElementById('root'));
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('handles a missing root without a blank failure page or app import', async () => {
    document.body.replaceChildren();
    const mount = vi.fn();
    expect(await bootstrapApplication({ environment: environment(true), document, origin: 'null', mount })).toBe('blocked');
    expect(document.querySelector('h1')?.textContent).toBe('App connection paused');
    expect(mount).not.toHaveBeenCalled();
  });

  it('does not claim no connection when importing or mounting already began', async () => {
    const mount = vi.fn(async () => { throw new Error('secret material must not be reflected'); });
    expect(await bootstrapApplication({ environment: environment(), document, origin: SHARED_APP_ORIGIN, mount })).toBe('unavailable');
    expect(mount).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('App could not start');
    expect(document.body.textContent).not.toContain('No app connection was started');
    expect(document.body.textContent).not.toContain('secret material');
  });
});
