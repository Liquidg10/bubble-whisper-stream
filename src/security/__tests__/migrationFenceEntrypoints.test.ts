import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSocketDrain } from '../../../supabase/functions/_shared/socketDrain.ts';
import { dispatchAndDrain } from '../../../supabase/functions/plaid-webhook-handler/dispatch.ts';
import { buildLocalFenceReadiness, inspectEdgeFenceCoverage } from '../../../scripts/lib/source-write-fence-readiness.mjs';

describe('source freeze reachability and truthful activation boundary', () => {
  it('wraps every manifested Edge entrypoint with its exact name', () => {
    const coverage = inspectEdgeFenceCoverage(process.cwd());
    expect(coverage).toHaveLength(33);
    expect(coverage.filter((entry: { covered: boolean }) => !entry.covered)).toEqual([]);
  });

  it('cannot turn local coverage into a live freeze or authorization', () => {
    const report = buildLocalFenceReadiness(process.cwd());
    expect(report).toMatchObject({ status: 'blocked', eligibleForActivation: false, sourceWriteFreezeConfirmed: false, evidenceClass: 'local_source_inspection_only' });
    expect(report.blockers.map((blocker: { code: string }) => blocker.code)).toEqual(expect.arrayContaining([
      'subject_scope', 'shared_identity', 'storage_ingress', 'runtime_generation', 'provider_outcomes', 'scheduler_inventory', 'catalog_parity', 'live_denial_and_rollback', 'owner_window',
    ]));
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
