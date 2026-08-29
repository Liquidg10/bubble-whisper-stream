import { describe, expect, it } from 'vitest';
import {
  assertAtomicSupabasePublicOverrides,
  resolveSupabasePublicConfig,
} from '@/integrations/supabase/config';

const TEST_REF = 'abcdefghijklmnopqrst';
const OTHER_REF = 'tsrqponmlkjihgfedcba';

function encodeBase64Url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=/gu, '');
}

function legacyKey(ref: string, role = 'anon'): string {
  return [
    encodeBase64Url({ alg: 'HS256', typ: 'JWT' }),
    encodeBase64Url({ iss: 'supabase', ref, role, iat: 1_750_000_000, exp: 2_050_000_000 }),
    's'.repeat(43),
  ].join('.');
}

function environment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VITE_SUPABASE_PROJECT_ID: TEST_REF,
    VITE_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey(TEST_REF),
    ...overrides,
  };
}

describe('Supabase public configuration', () => {
  it('allows either no deployment override or one complete atomic override', () => {
    expect(() => assertAtomicSupabasePublicOverrides({})).not.toThrow();
    expect(() => assertAtomicSupabasePublicOverrides(environment())).not.toThrow();
  });

  it.each([
    { VITE_SUPABASE_PROJECT_ID: TEST_REF },
    { VITE_SUPABASE_URL: `https://${TEST_REF}.supabase.co` },
    { VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}` },
    {
      VITE_SUPABASE_PROJECT_ID: TEST_REF,
      VITE_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    },
    {
      VITE_SUPABASE_PROJECT_ID: TEST_REF,
      VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`,
    },
    {
      VITE_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`,
    },
  ])('rejects a partial deployment override without echoing values (%s)', (overrides) => {
    expect(() => assertAtomicSupabasePublicOverrides(overrides)).toThrow(
      '(partial-environment-override)',
    );

    try {
      assertAtomicSupabasePublicOverrides(overrides);
    } catch (error) {
      const message = (error as Error).message;
      for (const value of Object.values(overrides)) {
        expect(message).not.toContain(value);
      }
    }
  });

  it('accepts a coherent project URL and legacy anonymous key', () => {
    const config = resolveSupabasePublicConfig(environment());

    expect(config.url).toBe(`https://${TEST_REF}.supabase.co`);
    expect(config.projectRef).toBe(TEST_REF);
    expect(config.publishableKey).toBe(legacyKey(TEST_REF));
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('accepts the modern low-privilege publishable-key format', () => {
    const config = resolveSupabasePublicConfig(environment({
      VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`,
    }));

    expect(config.projectRef).toBe(TEST_REF);
  });

  it.each([
    [{ VITE_SUPABASE_PROJECT_ID: undefined }, 'missing-project-id'],
    [{ VITE_SUPABASE_URL: undefined }, 'missing-url'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: undefined }, 'missing-publishable-key'],
    [{ VITE_SUPABASE_PROJECT_ID: 'not-a-project-ref' }, 'invalid-project-id'],
    [{ VITE_SUPABASE_PROJECT_ID: OTHER_REF }, 'project-ref-mismatch'],
    [{ VITE_SUPABASE_URL: 'not-a-url' }, 'invalid-url'],
    [{ VITE_SUPABASE_URL: `http://${TEST_REF}.supabase.co` }, 'invalid-project-url'],
    [{ VITE_SUPABASE_URL: `https://${TEST_REF}.supabase.co/rest/v1` }, 'invalid-project-url'],
    [{ VITE_SUPABASE_URL: `https://${TEST_REF}.example.com` }, 'invalid-project-url'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey(OTHER_REF) }, 'project-ref-mismatch'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey(TEST_REF, 'service_role') }, 'unsafe-key-role'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'r'.repeat(30)}` }, 'invalid-publishable-key'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${'r'.repeat(22)}_${'c'.repeat(8)}` }, 'invalid-publishable-key'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: `${legacyKey(TEST_REF).slice(0, -43)}x` }, 'invalid-publishable-key'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: 'malformed' }, 'invalid-publishable-key'],
  ])('fails closed for invalid input without echoing it (%s)', (overrides, errorCode) => {
    const invalidEnvironment = environment(overrides);
    let thrown: unknown;

    try {
      resolveSupabasePublicConfig(invalidEnvironment);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain(`(${errorCode})`);
    expect(message).not.toContain(String(invalidEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY));
  });
});
