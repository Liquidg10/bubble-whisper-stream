import { describe, expect, it, vi } from 'vitest';

import {
  assertDeployedContract,
  buildManifest,
  loadActiveAccounts,
  main,
  planExecution,
  rotateAccount,
  rotatePendingAccounts,
  validateManifest,
} from '../../../scripts/rotate-calendar-watch-channels.mjs';

const target = {
  origin: 'https://project-ref.supabase.co',
  projectRef: 'project-ref',
};

const account = (id: string, channelId = `old-${id}`) => ({
  id,
  watch_channel_id: channelId,
  watch_resource_id: `resource-${id}`,
  watch_expires_at: '2026-08-27T00:00:00.000Z',
});

function inventoryClient(result: { data: unknown[]; error: unknown; count: number | null }) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'range', 'in']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { from: vi.fn(() => query) };
}

function rotationClient(options: {
  invokeByAccount: Record<string, { data?: unknown; error?: unknown }>;
  refreshedByAccount: Record<string, unknown>;
}) {
  return {
    functions: {
      invoke: vi.fn(async (_name: string, request: { body: { calendarAccountId: string } }) =>
        options.invokeByAccount[request.body.calendarAccountId]),
    },
    from: vi.fn(() => {
      let selectedAccountId = '';
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: string) => {
          if (column === 'id') selectedAccountId = value;
          return query;
        }),
        single: vi.fn(async () => ({
          data: options.refreshedByAccount[selectedAccountId],
          error: null,
        })),
      };
      return query;
    }),
  };
}

describe('calendar watch rotation manifest', () => {
  it('refuses a deployed handler without the reviewed HMAC contract', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'legacy-channel-id' },
    }));

    await expect(assertDeployedContract(fetchImpl, target.origin)).rejects.toThrow(
      'deployed calendar-watch contract is legacy-channel-id',
    );
  });

  it('binds target and inventory into a tamper-evident digest', () => {
    const manifest = buildManifest({
      target,
      accounts: [account('b'), account('a')],
      requestedAccountIds: [],
      now: new Date('2026-08-26T12:00:00.000Z'),
    });

    expect(manifest.accounts.map((item: { id: string }) => item.id)).toEqual(['a', 'b']);
    expect(manifest.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(validateManifest(manifest, target)).toBe(manifest);

    expect(() => validateManifest({ ...manifest, exactActiveCount: 1 }, target)).toThrow(
      'exact count does not match',
    );
    expect(() => validateManifest(manifest, { ...target, projectRef: 'other' })).toThrow(
      'target does not match',
    );
  });

  it('writes the reviewed dry-run inventory as a new mode-0600 manifest', async () => {
    const supabase = inventoryClient({ data: [account('a')], error: null, count: 1 });
    const writeFileSync = vi.fn();
    const stdout = vi.fn();

    const exitCode = await main({
      argv: ['--manifest=/protected/manifest.json'],
      env: {
        SUPABASE_URL: target.origin,
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      },
      createClientImpl: vi.fn(() => supabase),
      stdout,
      fs: {
        appendFileSync: vi.fn(),
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync,
      },
      now: () => new Date('2026-08-26T12:00:00.000Z'),
    });

    expect(exitCode).toBe(0);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const [path, contents, options] = writeFileSync.mock.calls[0];
    expect(path).toBe('/protected/manifest.json');
    expect(options).toMatchObject({ flag: 'wx', mode: 0o600 });
    expect(JSON.parse(contents)).toMatchObject({
      target,
      exactActiveCount: 1,
      selection: 'all-active-accounts',
    });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('manifestDigest'));
  });

  it('uses an exact count to reject both cap overflow and truncated inventories', async () => {
    await expect(
      loadActiveAccounts(inventoryClient({ data: [], error: null, count: 501 }), [], 500),
    ).rejects.toThrow('501 active accounts exceeds');

    await expect(
      loadActiveAccounts(
        inventoryClient({ data: [account('a')], error: null, count: 2 }),
        [],
        500,
      ),
    ).rejects.toThrow('exact count is 2, but only 1 rows were returned');
  });

  it('resumes only receipt-confirmed channels and refuses unreceipted state drift', () => {
    const manifest = buildManifest({
      target,
      accounts: [account('a'), account('b')],
      requestedAccountIds: [],
      now: new Date('2026-08-26T12:00:00.000Z'),
    });
    const confirmedReceipt = {
      type: 'account-receipt',
      manifestDigest: manifest.digest,
      target,
      accountId: 'a',
      status: 'rotated',
      channelId: 'new-a',
    };

    const plan = planExecution(
      manifest,
      [account('a', 'new-a'), account('b')],
      new Map([['a', confirmedReceipt]]),
    );
    expect(plan.confirmed).toEqual([confirmedReceipt]);
    expect(plan.pending.map((item: { id: string }) => item.id)).toEqual(['b']);

    expect(() => planExecution(
      manifest,
      [account('a', 'new-a'), account('b', 'changed-without-receipt')],
      new Map([['a', confirmedReceipt]]),
    )).toThrow('Inventory drift for b');
  });
});

describe('calendar watch rotation receipts', () => {
  it('requires the handler channel ID to equal the persisted channel ID', async () => {
    const supabase = rotationClient({
      invokeByAccount: {
        a: { data: { success: true, channelId: 'handler-channel' }, error: null },
      },
      refreshedByAccount: {
        a: {
          watch_status: 'active',
          watch_channel_id: 'different-db-channel',
          watch_expires_at: '2026-08-28T00:00:00.000Z',
        },
      },
    });

    await expect(rotateAccount(supabase, account('a'))).rejects.toThrow(
      'exact persisted replacement channel',
    );
  });

  it('durably emits each success or failure as soon as its account finishes', async () => {
    const supabase = rotationClient({
      invokeByAccount: {
        a: { data: { success: true, channelId: 'new-a' }, error: null },
        b: { data: null, error: { message: 'provider unavailable' } },
      },
      refreshedByAccount: {
        a: {
          watch_status: 'active',
          watch_channel_id: 'new-a',
          watch_expires_at: '2026-08-28T00:00:00.000Z',
        },
      },
    });
    const appendReceipt = vi.fn();
    const emit = vi.fn();

    const outcomes = await rotatePendingAccounts({
      pending: [account('a'), account('b')],
      supabase,
      target,
      manifestDigest: 'digest',
      appendReceipt,
      emit,
      now: () => new Date('2026-08-26T12:00:00.000Z'),
      concurrency: 2,
    });

    expect(outcomes.map((item: { status: string }) => item.status).sort()).toEqual([
      'failed',
      'rotated',
    ]);
    expect(appendReceipt).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(appendReceipt.mock.calls.map(([receipt]) => receipt.accountId).sort()).toEqual(['a', 'b']);
  });
});
