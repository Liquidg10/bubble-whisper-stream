import { describe, expect, it } from 'vitest';
import {
  assertAtomicDeploymentOverrides, assertDeploymentOrigin, buildDeploymentEnvironment,
  ISOLATED_PROJECT_REF, resolveDeploymentBoundary, SHARED_APP_ORIGIN, SHARED_PROJECT_REF,
  type DeploymentEnvironment,
} from '../deploymentBoundary';

const ownerOrigin = 'https://owner.example.test';
const key = `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`;
function environment(owner = false): DeploymentEnvironment {
  const ref = owner ? ISOLATED_PROJECT_REF : SHARED_PROJECT_REF;
  return { VITE_SUPABASE_PROJECT_ID: ref, VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: key,
    ...(owner ? { VITE_MIND_MANUAL_DEPLOYMENT_MODE: 'owner-isolated', VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: ownerOrigin } : {}),
  };
}

describe('deployment isolation before app startup', () => {
  it('defaults only absent profile fields to the unchanged shared source', () => {
    const boundary = resolveDeploymentBoundary(environment());
    expect(boundary).toEqual({ mode: 'shared', projectRef: SHARED_PROJECT_REF, origin: null });
    expect(Object.isFrozen(boundary)).toBe(true);
    for (const origin of [SHARED_APP_ORIGIN, 'http://localhost:8080', 'https://preview.example.test', undefined]) {
      expect(() => assertDeploymentOrigin(boundary, origin)).not.toThrow();
    }
  });

  it('pins an explicit isolated build to the isolated target and exact separate origin', () => {
    const boundary = resolveDeploymentBoundary(environment(true));
    expect(boundary).toEqual({ mode: 'owner-isolated', projectRef: ISOLATED_PROJECT_REF, origin: ownerOrigin });
    expect(Object.isFrozen(boundary)).toBe(true);
    expect(() => assertDeploymentOrigin(boundary, ownerOrigin)).not.toThrow();
  });

  it.each([undefined, 'null', '', SHARED_APP_ORIGIN, 'http://localhost:8080', 'https://copy.example.test', `${ownerOrigin}/`, 'https://OWNER.example.test'])(
    'rejects owner-build runtime-origin mismatch %s', origin => {
      expect(() => assertDeploymentOrigin(resolveDeploymentBoundary(environment(true)), origin)).toThrow('runtime-origin-mismatch');
    });

  it.each(['http://localhost:4181', 'http://127.0.0.1:4181'])('allows only the explicit isolated local canary origin %s', origin => {
    const boundary = resolveDeploymentBoundary({ ...environment(true), VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: origin });
    expect(() => assertDeploymentOrigin(boundary, origin)).not.toThrow();
    expect(() => assertDeploymentOrigin(boundary, origin.replace('4181', '8080'))).toThrow();
  });

  it.each([
    undefined, null, 1, {}, [], '', ' ', `${ownerOrigin} `, `${ownerOrigin}/`, `${ownerOrigin}/path`,
    `${ownerOrigin}?source=secret`, `${ownerOrigin}#secret`, 'https://owner.example.test:443',
    'https://user:private@owner.example.test', 'https://OWNER.example.test', 'https://owner.example.test.',
    'https://%6fwner.example.test', 'http://owner.example.test', 'https://localhost', 'https://owner.localhost',
    'http://localhost:8080', 'http://localhost:4173', 'http://127.0.0.1:8080', 'http://[::1]:4181',
    'https://127.0.0.1', 'https://[::1]', 'file:///tmp/app', 'data:text/html,hello', 'null',
    'https://owner.example.test:4181', 'https://owner', 'https://' + 'a'.repeat(2050),
  ])('rejects invalid/noncanonical isolated origin case %#', origin => {
    expect(() => resolveDeploymentBoundary({ ...environment(true), VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: origin })).toThrow();
  });

  it.each([SHARED_APP_ORIGIN, 'https://preview--bubble-whisper-stream.lovable.app', 'https://id-preview--8d3041fb-8df4-4afe-87e4-b56a10af1d00.lovable.app'])(
    'forbids using an existing shared app origin for the isolated target %s', origin => {
      expect(() => resolveDeploymentBoundary({ ...environment(true), VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: origin })).toThrow('shared-origin-forbidden');
    });

  it.each(['', ' ', 'shared', 'owner', 'OWNER-ISOLATED', 'owner-isolated\n', true, 1, {}, null])(
    'rejects unknown or blank explicit profiles case %#', mode => {
      expect(() => resolveDeploymentBoundary({ ...environment(true), VITE_MIND_MANUAL_DEPLOYMENT_MODE: mode })).toThrow();
    });

  it('rejects partial profile process overrides and stray inherited origin', () => {
    for (const partial of [{ VITE_MIND_MANUAL_DEPLOYMENT_MODE: 'owner-isolated' }, { VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: ownerOrigin }]) {
      expect(() => assertAtomicDeploymentOverrides(partial)).toThrow('partial-profile');
      expect(() => resolveDeploymentBoundary({ ...environment(), ...partial })).toThrow('partial-profile');
    }
    expect(() => assertAtomicDeploymentOverrides({})).not.toThrow();
    expect(() => assertAtomicDeploymentOverrides(environment(true))).not.toThrow();
  });

  it.each([SHARED_PROJECT_REF, ISOLATED_PROJECT_REF, 'abcdefghijklmnopqrst'])('enforces both directions of project pinning %s', ref => {
    for (const owner of [false, true]) {
      const input = { ...environment(owner), VITE_SUPABASE_PROJECT_ID: ref, VITE_SUPABASE_URL: `https://${ref}.supabase.co` };
      if (ref === (owner ? ISOLATED_PROJECT_REF : SHARED_PROJECT_REF)) expect(() => resolveDeploymentBoundary(input)).not.toThrow();
      else expect(() => resolveDeploymentBoundary(input)).toThrow('project-boundary-mismatch');
    }
  });

  it('retains key/project validation and never reflects unsafe configuration', () => {
    const privateValue = 'private-value-must-never-appear';
    for (const input of [
      { ...environment(), VITE_SUPABASE_PUBLISHABLE_KEY: privateValue },
      { ...environment(true), VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: `https://${privateValue}@owner.example.test` },
      { ...environment(true), VITE_MIND_MANUAL_DEPLOYMENT_MODE: privateValue },
    ]) {
      try { resolveDeploymentBoundary(input); throw new Error('Expected rejection'); }
      catch (error) { expect(String(error)).not.toContain(privateValue); expect(String(error)).not.toContain(key); }
    }
  });

  it('selects and freezes only public deployment fields rather than leaking the full environment', () => {
    const input = { ...environment(true), SERVICE_ROLE_KEY: 'private', VITE_OTHER_FEATURE: 'unrelated' };
    const selected = buildDeploymentEnvironment(input);
    expect(Object.keys(selected).sort()).toEqual(['VITE_SUPABASE_PROJECT_ID', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_MIND_MANUAL_DEPLOYMENT_MODE', 'VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN'].sort());
    expect(Object.isFrozen(selected)).toBe(true);
    expect(JSON.stringify(selected)).not.toContain('private');
  });
});
