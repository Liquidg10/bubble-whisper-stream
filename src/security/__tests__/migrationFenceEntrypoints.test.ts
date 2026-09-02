import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSocketDrain } from '../../../supabase/functions/_shared/socketDrain.ts';
import { dispatchAndDrain } from '../../../supabase/functions/plaid-webhook-handler/dispatch.ts';
import {
  buildLocalFenceReadiness,
  inspectEdgeFenceCoverage,
  LEGACY_GLOBAL_ADMISSION_FUNCTIONS,
  OWNER_SCOPED_BEARER_FUNCTIONS,
  OWNER_SCOPED_MIXED_FUNCTIONS,
  OWNER_SCOPED_SCHEDULED_FUNCTIONS,
  RETIRED_UNWRAPPED_FUNCTIONS,
} from '../../../scripts/lib/source-write-fence-readiness.mjs';

describe('source freeze reachability and truthful activation boundary', () => {
  it('exhaustively classifies the owner-scoped, legacy-blocked and retired entrypoints', () => {
    const coverage = inspectEdgeFenceCoverage(process.cwd());
    expect(coverage).toHaveLength(34);
    expect(coverage.filter((entry: { classification: string }) => entry.classification === 'owner_scoped_bearer')
      .map((entry: { name: string }) => entry.name).sort()).toEqual([...OWNER_SCOPED_BEARER_FUNCTIONS].sort());
    expect(coverage.filter((entry: { classification: string }) => entry.classification === 'owner_scoped_mixed')
      .map((entry: { name: string }) => entry.name).sort()).toEqual([...OWNER_SCOPED_MIXED_FUNCTIONS].sort());
    expect(coverage.filter((entry: { classification: string }) => entry.classification === 'owner_scoped_scheduler')
      .map((entry: { name: string }) => entry.name).sort()).toEqual([...OWNER_SCOPED_SCHEDULED_FUNCTIONS].sort());
    expect(coverage.filter((entry: { classification: string }) => entry.classification === 'legacy_global_blocked')
      .map((entry: { name: string }) => entry.name).sort()).toEqual([...LEGACY_GLOBAL_ADMISSION_FUNCTIONS].sort());
    expect(coverage.filter((entry: { classification: string }) => entry.classification === 'retired_unwrapped')
      .map((entry: { name: string }) => entry.name).sort()).toEqual([...RETIRED_UNWRAPPED_FUNCTIONS].sort());
    expect(coverage.filter((entry: { classification: string }) => entry.classification === 'invalid')).toEqual([]);
  });

  it('cannot turn local coverage into a live freeze or authorization', () => {
    const report = buildLocalFenceReadiness(process.cwd());
    expect(report).toMatchObject({ status: 'blocked', eligibleForActivation: false, sourceWriteFreezeConfirmed: false, evidenceClass: 'local_source_inspection_only' });
    expect(report).toMatchObject({ implementedEntrypointCount: 33, expectedEntrypointCount: 34 });
    expect(report.blockers.filter((blocker: { code: string }) => blocker.code === 'legacy_global_admission')).toEqual([
      { code: 'legacy_global_admission', reason: 'supabase/functions/plaid-webhook-handler/index.ts' },
    ]);
    expect(report.blockers.map((blocker: { code: string }) => blocker.code)).toEqual(expect.arrayContaining([
      'subject_scope', 'shared_identity', 'storage_ingress', 'runtime_generation', 'provider_outcomes', 'scheduler_inventory', 'catalog_parity', 'live_denial_and_rollback', 'owner_window',
    ]));
  });

  it.each([
    ['wrong resolver', 'supabase/functions/calendar-sync/index.ts',
      (text: string) => text.replace(/calendarSyncMigrationScope\(\)/u, 'calendarWatchMigrationScope()')],
    ['wrong resolver module', 'supabase/functions/calendar-sync/index.ts',
      (text: string) => text.replace('../_shared/calendarMigrationScope.ts', '../_shared/unverifiedScope.ts')],
    ['injected resolver dependency', 'supabase/functions/calendar-sync/index.ts',
      (text: string) => text.replace(/calendarSyncMigrationScope\(\)/u, 'calendarSyncMigrationScope({ bypass: true })')],
    ['missing resolver export', 'supabase/functions/_shared/calendarMigrationScope.ts',
      (text: string) => text.replace(/export function calendarSyncMigrationScope/u, 'function calendarSyncMigrationScope')],
  ])('does not count a mixed entrypoint with %s', (_label, target, mutate) => {
    const coverage = inspectEdgeFenceCoverage(process.cwd(), (path: string) => {
      const text = readFileSync(resolve(process.cwd(), path), 'utf8');
      return path === target ? mutate(text) : text;
    });
    expect(coverage.find((entry: { name: string }) => entry.name === 'calendar-sync'))
      .toMatchObject({ classification: 'invalid', covered: false });
  });

  it('binds the specialized implementation sources without claiming deployed provenance', () => {
    const coverage = inspectEdgeFenceCoverage(process.cwd());
    for (const name of [...OWNER_SCOPED_MIXED_FUNCTIONS, ...OWNER_SCOPED_SCHEDULED_FUNCTIONS]) {
      const entry = coverage.find((candidate: { name: string }) => candidate.name === name);
      expect(entry.supportingSources).toHaveLength(1);
      expect(entry.supportingSources[0].sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it.each([
    ['missing await', (text: string) => text.replace('await runMindManualSubjectWork(', 'runMindManualSubjectWork(')],
    ['wrong function binding', (text: string) => text.replace('"watch-renewal-cron",', '"gmail-watch",')],
    ['body owner', (text: string) => text.replace('subjectId: watch.user_id', 'subjectId: request.user_id')],
    ['missing call', (text: string) => text.replace('await runMindManualSubjectWork(', 'await unadmittedWork(')],
  ])('does not count a scheduler with %s', (_label, mutate) => {
    const coverage = inspectEdgeFenceCoverage(process.cwd(), (path: string) => {
      const text = readFileSync(resolve(process.cwd(), path), 'utf8');
      return path === 'supabase/functions/watch-renewal-cron/watchRenewalHandler.ts' ? mutate(text) : text;
    });
    expect(coverage.find((entry: { name: string }) => entry.name === 'watch-renewal-cron'))
      .toMatchObject({ classification: 'invalid', covered: false });
  });

  it('keeps retired tombstones bounded while preserving method-first preflight', () => {
    for (const functionName of RETIRED_UNWRAPPED_FUNCTIONS) {
      const retired = readFileSync(resolve(
        process.cwd(),
        `supabase/functions/${functionName}/index.ts`,
      ), 'utf8');
      expect(retired).toContain('request.method === "OPTIONS"');
      expect(retired).toContain('status: 204');
      expect(retired).toContain('status: 410');
      expect(retired).not.toContain('wrapMindManualHandler');
      expect(retired).not.toContain('wrapMindManualSubjectHandler');
    }
  });

  it('binds realtime sockets and awaits Plaid child requests in the reachable handlers', () => {
    const voice = readFileSync(resolve(process.cwd(), 'supabase/functions/ai-realtime-voice/index.ts'), 'utf8');
    expect(voice).toContain('lifecycle.holdUntil(drain.completion)');
    expect(voice).toContain('drain.track(openAISocket)');
    expect(voice).toContain('if (drain.sealed) return');
    const plaid = readFileSync(resolve(process.cwd(), 'supabase/functions/plaid-webhook-handler/index.ts'), 'utf8');
    expect(plaid.match(/await dispatchAndDrain\(/g)).toHaveLength(2);
    expect(plaid).not.toMatch(/\bfetch\(/);
  });
});

class TestSocket extends EventTarget {
  readyState = 1;
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

describe('realtime socket drainage', () => {
  it('waits for both browser and upstream actual close, not errors or seal alone', async () => {
    const drain = createSocketDrain();
    const browser = new TestSocket();
    const upstream = new TestSocket();
    const finished = vi.fn();
    drain.completion.then(finished);
    drain.track(browser);
    drain.track(upstream);
    upstream.dispatchEvent(new Event('error'));
    browser.close();
    drain.seal();
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    upstream.close();
    await drain.completion;
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('does not finish while a provider can still be attached', async () => {
    const drain = createSocketDrain();
    const finished = vi.fn();
    drain.completion.then(finished);
    const browser = new TestSocket();
    drain.track(browser);
    browser.close();
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    drain.seal();
    await drain.completion;
    expect(() => drain.track(new TestSocket())).toThrow('sealed');
  });

  it('does not count the same peer twice or retain an already closed socket', async () => {
    const drain = createSocketDrain();
    const peer = new TestSocket();
    drain.track(peer);
    drain.track(peer);
    peer.close();
    drain.track(peer);
    drain.seal();
    await expect(drain.completion).resolves.toBeUndefined();
  });
});

describe('Plaid nested dispatch lifetime', () => {
  it('waits for the response body rather than only headers', async () => {
    let finishBody!: () => void;
    const response = { ok: true, arrayBuffer: vi.fn(() => new Promise<void>((resolveBody) => { finishBody = resolveBody; })) };
    const fetcher = vi.fn().mockResolvedValue(response);
    const finished = vi.fn();
    const dispatch = dispatchAndDrain('https://example.invalid/child', {}, fetcher).then(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    finishBody();
    await dispatch;
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('propagates a denied child or failed body without marking the webhook processed', async () => {
    const body = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    await expect(dispatchAndDrain('https://example.invalid/child', {}, vi.fn().mockResolvedValue({ ok: false, arrayBuffer: body }))).rejects.toThrow('did not complete');
    expect(body).toHaveBeenCalledTimes(1);
    await expect(dispatchAndDrain('https://example.invalid/child', {}, vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockRejectedValue(new Error('body failed')) }))).rejects.toThrow('body failed');
  });
});
