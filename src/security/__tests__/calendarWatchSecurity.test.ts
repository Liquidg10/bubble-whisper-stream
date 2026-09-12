import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createCalendarWatchChannelToken,
  extractBearerToken,
  isCalendarWatchAction,
  isExactServiceRoleBearer,
  normalizeCalendarAccountId,
  replaceCalendarWatchChannelSafely,
  requireCalendarWatchWebhookSecret,
  verifyCalendarWatchChannelToken,
} from '../../../supabase/functions/_shared/calendarWatchSecurity.ts';

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('calendar watch control authorization', () => {
  it('accepts only the exact configured service-role bearer', () => {
    expect(extractBearerToken('Bearer service-role-secret')).toBe('service-role-secret');
    expect(extractBearerToken('bearer service-role-secret')).toBe('service-role-secret');
    expect(extractBearerToken('Basic service-role-secret')).toBeNull();
    expect(extractBearerToken(null)).toBeNull();

    expect(isExactServiceRoleBearer('Bearer service-role-secret', 'service-role-secret')).toBe(true);
    expect(isExactServiceRoleBearer('Bearer ordinary-user-jwt', 'service-role-secret')).toBe(false);
    expect(isExactServiceRoleBearer('Bearer service-role-secret-extra', 'service-role-secret')).toBe(false);
    expect(isExactServiceRoleBearer(null, 'service-role-secret')).toBe(false);
    expect(isExactServiceRoleBearer('Bearer service-role-secret', undefined)).toBe(false);
  });

  it('accepts only the three explicit control actions', () => {
    expect(isCalendarWatchAction('setup')).toBe(true);
    expect(isCalendarWatchAction('renew')).toBe(true);
    expect(isCalendarWatchAction('stop')).toBe(true);
    expect(isCalendarWatchAction('renew-all')).toBe(false);
    expect(isCalendarWatchAction(undefined)).toBe(false);
  });

  it('normalizes the canonical and legacy account keys without widening scope', () => {
    expect(normalizeCalendarAccountId(' account-1 ', undefined)).toEqual({
      ok: true,
      calendarAccountId: 'account-1',
    });
    expect(normalizeCalendarAccountId(undefined, 'legacy-account')).toEqual({
      ok: true,
      calendarAccountId: 'legacy-account',
    });
    expect(normalizeCalendarAccountId('same', 'same')).toEqual({
      ok: true,
      calendarAccountId: 'same',
    });

    expect(normalizeCalendarAccountId('one', 'two')).toMatchObject({ ok: false });
    for (const sentinel of ['', ' ', '*', 'all', 'GLOBAL', 'null', 'undefined']) {
      expect(normalizeCalendarAccountId(sentinel, undefined)).toMatchObject({ ok: false });
    }
  });
});

describe('calendar watch webhook authentication', () => {
  it('uses a deterministic HMAC and rejects missing or forged channel tokens', async () => {
    const channelId = 'calendar-account-1700000000000';
    const secret = 'test-only-webhook-secret';
    const token = await createCalendarWatchChannelToken(channelId, secret);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await createCalendarWatchChannelToken(channelId, secret)).toBe(token);
    expect(await verifyCalendarWatchChannelToken(token, channelId, secret)).toBe(true);
    expect(await verifyCalendarWatchChannelToken('0'.repeat(64), channelId, secret)).toBe(false);
    expect(await verifyCalendarWatchChannelToken(null, channelId, secret)).toBe(false);
    expect(await verifyCalendarWatchChannelToken(token, channelId, undefined)).toBe(false);
    expect(await verifyCalendarWatchChannelToken(token, channelId, '   ')).toBe(false);
    await expect(createCalendarWatchChannelToken(channelId, undefined)).rejects.toThrow(
      'CALENDAR_WATCH_WEBHOOK_SECRET is required',
    );
  });

  it('rejects blank webhook secrets during preflight', () => {
    expect(() => requireCalendarWatchWebhookSecret(undefined)).toThrow(
      'CALENDAR_WATCH_WEBHOOK_SECRET is required',
    );
    expect(() => requireCalendarWatchWebhookSecret('   ')).toThrow(
      'CALENDAR_WATCH_WEBHOOK_SECRET is required',
    );
    expect(requireCalendarWatchWebhookSecret('configured-secret')).toBe('configured-secret');
  });

  it('does not touch either channel when renewal configuration is missing', async () => {
    const operations = {
      setupReplacement: vi.fn<(webhookSecret: string) => Promise<{ id: string }>>(),
      persistReplacement: vi.fn<(replacement: { id: string }) => Promise<void>>(),
      stopPrevious: vi.fn<() => Promise<void>>(),
    };

    await expect(replaceCalendarWatchChannelSafely(undefined, operations)).rejects.toThrow(
      'CALENDAR_WATCH_WEBHOOK_SECRET is required',
    );
    expect(operations.setupReplacement).not.toHaveBeenCalled();
    expect(operations.persistReplacement).not.toHaveBeenCalled();
    expect(operations.stopPrevious).not.toHaveBeenCalled();
  });

  it('keeps the previous channel alive when replacement setup fails', async () => {
    const operations = {
      setupReplacement: vi.fn<(webhookSecret: string) => Promise<{ id: string }>>()
        .mockRejectedValue(new Error('Google setup failed')),
      persistReplacement: vi.fn<(replacement: { id: string }) => Promise<void>>(),
      stopPrevious: vi.fn<() => Promise<void>>(),
    };

    await expect(
      replaceCalendarWatchChannelSafely('configured-secret', operations),
    ).rejects.toThrow('Google setup failed');
    expect(operations.persistReplacement).not.toHaveBeenCalled();
    expect(operations.stopPrevious).not.toHaveBeenCalled();
  });

  it('persists the replacement before stopping the previous channel', async () => {
    const order: string[] = [];
    const replacement = { id: 'new-channel' };

    const result = await replaceCalendarWatchChannelSafely('configured-secret', {
      setupReplacement: vi.fn(async () => {
        order.push('setup');
        return replacement;
      }),
      persistReplacement: vi.fn(async () => {
        order.push('persist');
      }),
      stopPrevious: vi.fn(async () => {
        order.push('stop');
      }),
    });

    expect(result).toBe(replacement);
    expect(order).toEqual(['setup', 'persist', 'stop']);
  });
});

describe('calendar watch authorization wiring', () => {
  it('validates the Google channel token before looking up or syncing an account', () => {
    const scope = readRepoFile('supabase/functions/_shared/calendarMigrationScope.ts');
    const handler = readRepoFile('supabase/functions/calendar-watch/index.ts');
    const tokenCheck = scope.indexOf('const verified = await verifyCalendarWatchChannelToken');
    const accountLookup = scope.indexOf('const owner = await resolveWatchOwner');
    const syncInvoke = handler.indexOf("supabase.functions.invoke('calendar-sync'");

    expect(tokenCheck).toBeGreaterThan(-1);
    expect(tokenCheck).toBeLessThan(accountLookup);
    expect(syncInvoke).toBeGreaterThan(-1);
    expect(scope).toContain("url.searchParams.set('watch_status', 'eq.active')");
  });

  it('normalizes a specific account and applies owner scope before renewal', () => {
    const source = readRepoFile('supabase/functions/calendar-watch/index.ts');
    const scope = readRepoFile('supabase/functions/_shared/calendarMigrationScope.ts');
    const normalize = scope.indexOf('normalizeCalendarAccountId(');
    const ownerResolution = scope.indexOf('const owner = await resolveAccountOwner', normalize);
    const ownerScope = source.indexOf(".eq('user_id', subjectId)");
    const renewal = source.indexOf("if (action === 'renew')");

    expect(normalize).toBeGreaterThan(-1);
    expect(normalize).toBeLessThan(ownerResolution);
    expect(ownerResolution).toBeGreaterThan(normalize);
    expect(ownerScope).toBeLessThan(renewal);
    expect(source).not.toContain('renewExpiringChannels');
  });

  it('authenticates the renewal cron before constructing its service-role client', () => {
    const entrypoint = readRepoFile('supabase/functions/watch-renewal-cron/index.ts');
    const source = readRepoFile('supabase/functions/watch-renewal-cron/watchRenewalHandler.ts');
    const authCheck = source.search(/if\s*\(\s*!isExactServiceRoleBearer\s*\(/);
    const clientCreation = source.indexOf('const supabase = dependencies.createAdminClient');

    expect(entrypoint).toContain('serve(createWatchRenewalHandler({');
    expect(authCheck).toBeGreaterThan(-1);
    expect(clientCreation).toBeGreaterThan(-1);
    expect(authCheck).toBeLessThan(clientCreation);
    expect(source).toContain('calendarAccountId: watch.account_id');
    expect(source).toContain('succeeded = !result.error && result.data?.success === true');
    expect(source).toContain('if (!succeeded) throw new Error');
  });

  it('keeps Google callbacks reachable while requiring JWT verification on the cron', () => {
    const config = readRepoFile('supabase/config.toml');

    expect(config).toMatch(/\[functions\.watch-renewal-cron\]\s*verify_jwt = true/);
    expect(config).toMatch(/\[functions\.calendar-watch\]\s*verify_jwt = false/);
  });

  it('schedules renewal with the exact protected server credential and fails on renewal errors', () => {
    const workflow = readRepoFile('.github/workflows/calendar-watch-renewal.yml');

    expect(workflow).toContain("cron: '17 */12 * * *'");
    expect(workflow).toContain(
      'SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
    );
    expect(workflow).toContain('Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).toContain('apikey: $SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).toContain("jq -e '.renewalErrors == 0'");
    expect(workflow).not.toContain('SUPABASE_ANON_KEY');
  });

  it('exposes the HMAC contract marker used by the gated rotation tool', () => {
    const handler = readRepoFile('supabase/functions/calendar-watch/index.ts');
    const rotationTool = readRepoFile('scripts/rotate-calendar-watch-channels.mjs');

    expect(handler).toContain("'X-Calendar-Watch-Contract': 'hmac-v1'");
    expect(rotationTool).toContain("const EXECUTE_FLAG = '--execute'");
    expect(rotationTool).toContain("const ACCOUNT_PREFIX = '--account='");
    expect(rotationTool).toContain("const MANIFEST_PREFIX = '--manifest='");
    expect(rotationTool).toContain("const RECEIPTS_PREFIX = '--receipts='");
    expect(rotationTool).toContain('export const CONCURRENCY = 3');
    expect(rotationTool).toContain('export const MAX_ACCOUNTS = 500');
    expect(rotationTool).toContain("contract !== EXPECTED_CONTRACT");
  });

  it('scopes the SECURITY DEFINER discovery function and removes public execution', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260826000001_scope_calendar_watch_renewals.sql',
    );

    expect(migration).toContain("auth.jwt() ->> 'role'");
    expect(migration).toContain('ca.user_id = auth.uid()');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_expiring_watch_channels(integer) FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_expiring_watch_channels(integer) TO authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_expiring_watch_channels(integer) TO service_role',
    );
  });
});
