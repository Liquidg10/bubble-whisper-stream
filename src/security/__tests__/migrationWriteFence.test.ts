import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MIND_MANUAL_EDGE_FUNCTIONS,
  MindManualAdmissionUnavailableError,
  MindManualSubjectWorkIncompleteError,
  runMindManualSubjectWork,
  verifiedBearerMindManualScope,
  wrapMindManualHandler,
  wrapMindManualSubjectHandler,
  type MigrationWriteFenceDependencies,
  type MindManualWorkLifecycle,
} from '../../../supabase/functions/_shared/migrationWriteFence.ts';

const UUID_A = '4c50665f-610a-4cc1-8df0-fc3995487261';
const UUID_B = '92f5ee58-76f8-4eb1-b593-51a7d873d2b6';
const TEST_KEY = 'not-a-real-service-key';
const SUBJECT = '10000000-0000-4000-8000-000000000001';
const GENERATION = 'owner-stage-a.test';
const request = () => new Request('https://app.invalid/function', { method: 'POST' });
const authenticatedRequest = (body?: string) => new Request('https://app.invalid/function', {
  method: 'POST', headers: { authorization: 'Bearer verified.user.token' }, body,
});
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function dependencies(overrides: MigrationWriteFenceDependencies = {}) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(true));
  const deps: MigrationWriteFenceDependencies = {
    env: (name) => ({ SUPABASE_URL: 'https://control.supabase.co', SUPABASE_SERVICE_ROLE_KEY: TEST_KEY })[name],
    fetch: fetchMock,
    randomUUID: () => UUID_A,
    ...overrides,
  };
  return { deps, fetchMock };
}
function rpcCalls(mock: ReturnType<typeof vi.fn<typeof fetch>>, name: string) {
  return mock.mock.calls.filter(([url]) => String(url).endsWith(`/rpc/${name}`));
}
function ownerScopedDependencies(decision: unknown = { decision: 'admitted', generation: GENERATION }) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: SUBJECT });
    if (url.endsWith('/rpc/mind_manual_admit_subject_edge')) return Response.json(decision);
    if (url.endsWith('/rpc/mind_manual_release_subject_edge')) return Response.json({ decision: 'released' });
    throw new Error(`Unexpected request: ${url}`);
  });
  const deps: MigrationWriteFenceDependencies = {
    env: (name) => ({
      SUPABASE_URL: 'https://control.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: TEST_KEY,
      MIND_MANUAL_RUNTIME_GENERATION: GENERATION,
    })[name],
    fetch: fetchMock,
    randomUUID: () => UUID_A,
  };
  return { deps, fetchMock };
}
function upgradedResponse() {
  const response = new Response(null);
  // Node's constructor rejects 101; Deno.upgradeWebSocket returns such a Response.
  Object.defineProperty(response, 'status', { value: 101 });
  return response;
}

describe('Mind Manual owner-scoped Edge admission V2', () => {
  it('verifies the bearer before sending an exact server-owned owner/action/generation tuple', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    const handler = vi.fn((_request, _lifecycle, context: { userId: string }) =>
      Response.json({ owner: context.userId }));
    const incoming = authenticatedRequest(JSON.stringify({
      user_id: 'attacker', subject_id: 'attacker', generation: 'attacker',
    }));
    const response = await wrapMindManualSubjectHandler(
      'gmail-compose', verifiedBearerMindManualScope('authenticated_request'), handler, deps,
    )(incoming);
    expect(await response.json()).toEqual({ owner: SUBJECT });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://control.supabase.co/auth/v1/user',
      'https://control.supabase.co/rest/v1/rpc/mind_manual_admit_subject_edge',
      'https://control.supabase.co/rest/v1/rpc/mind_manual_release_subject_edge',
    ]);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      apikey: TEST_KEY,
      Authorization: 'Bearer verified.user.token',
    });
    const tuple = {
      p_function_name: 'gmail-compose',
      p_action: 'authenticated_request',
      p_subject_id: SUBJECT,
      p_lease_id: UUID_A,
      p_generation: GENERATION,
    };
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(tuple);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(tuple);
    expect(incoming.bodyUsed).toBe(false);
  });

  it('runs a verified unrelated user without creating or releasing a lease', async () => {
    const { deps, fetchMock } = ownerScopedDependencies({ decision: 'unselected' });
    const handler = vi.fn(() => Response.json({ ok: true }));
    const response = await wrapMindManualSubjectHandler(
      'document-scan', verifiedBearerMindManualScope('authenticated_request'), handler, deps,
    )(authenticatedRequest());
    expect(await response.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')).toHaveLength(1);
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('maps an exact blocked owner decision to a sanitized 503 before handler work', async () => {
    const { deps, fetchMock } = ownerScopedDependencies({ decision: 'blocked' });
    const handler = vi.fn(() => Response.json({ unsafe: true }));
    const response = await wrapMindManualSubjectHandler(
      'document-scan', verifiedBearerMindManualScope('authenticated_request'), handler, deps,
    )(authenticatedRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'MIND_MANUAL_TEMPORARILY_UNAVAILABLE' });
    expect(handler).not.toHaveBeenCalled();
    expect(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')).toHaveLength(1);
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it.each([
    ['selected', { decision: 'admitted', generation: GENERATION }],
    ['unselected', { decision: 'unselected' }],
  ])('preserves %s handler exceptions without releasing selected work', async (_label, decision) => {
    const { deps, fetchMock } = ownerScopedDependencies(decision);
    const wrapped = wrapMindManualSubjectHandler(
      'document-scan', verifiedBearerMindManualScope('authenticated_request'),
      () => { throw new Error('handler failure'); }, deps,
    );
    await expect(wrapped(authenticatedRequest())).rejects.toThrow('handler failure');
    expect(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')).toHaveLength(1);
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('keeps an unrelated user socket lifetime alive without creating a lease', async () => {
    const completion = deferred();
    const background: Promise<unknown>[] = [];
    const { deps, fetchMock } = ownerScopedDependencies({ decision: 'unselected' });
    deps.waitUntil = (promise) => { background.push(promise); };
    const response = await wrapMindManualSubjectHandler(
      'ai-realtime-voice', verifiedBearerMindManualScope('authenticated_request'),
      (_request, lifecycle) => {
        lifecycle.holdUntil(completion.promise);
        return upgradedResponse();
      }, deps,
    )(authenticatedRequest());
    expect(response.status).toBe(101);
    expect(background).toHaveLength(1);
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
    completion.resolve();
    await Promise.all(background);
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('rejects missing/invalid authentication before admission and preserves OPTIONS', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    const handler = vi.fn(() => new Response(null));
    const wrapped = wrapMindManualSubjectHandler(
      'ai-conversation', verifiedBearerMindManualScope('authenticated_request'), handler, deps,
    );
    expect((await wrapped(request())).status).toBe(401);
    expect((await wrapped(new Request('https://app.invalid', {
      method: 'POST', headers: { authorization: 'Bearer one two' },
    }))).status).toBe(401);
    expect((await wrapped(new Request('https://app.invalid', { method: 'OPTIONS' }))).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('normalizes case-insensitive bearer schemes and horizontal whitespace to one token', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    const response = await wrapMindManualSubjectHandler(
      'ai-conversation', verifiedBearerMindManualScope('authenticated_request'),
      () => new Response(null), deps,
    )(new Request('https://app.invalid', {
      method: 'POST', headers: { authorization: 'bearer   verified.user.token\t' },
    }));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer verified.user.token',
    });
  });

  it('fails closed before authentication when the immutable deployed generation is absent', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    deps.env = (name) => ({
      SUPABASE_URL: 'https://control.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: TEST_KEY,
    })[name];
    const handler = vi.fn(() => new Response(null));
    const response = await wrapMindManualSubjectHandler(
      'ai-conversation', verifiedBearerMindManualScope('authenticated_request'), handler, deps,
    )(authenticatedRequest());
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
    { decision: 'admitted' },
    { decision: 'admitted', generation: 'other' },
    { decision: 'unselected', generation: GENERATION },
    { decision: 'blocked', extra: true },
  ])('fails closed for non-exact admission decision %j', async (decision) => {
    const { deps, fetchMock } = ownerScopedDependencies(decision);
    const handler = vi.fn(() => new Response(null));
    const response = await wrapMindManualSubjectHandler(
      'gmail-sync', verifiedBearerMindManualScope('authenticated_request'), handler, deps,
    )(authenticatedRequest());
    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('binds photo upload/delete actions from the validated operation header, never the body', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    const resolver = verifiedBearerMindManualScope((incoming) => {
      const operation = incoming.headers.get('x-storage-operation');
      return operation === 'upload' || operation === 'delete'
        ? operation
        : Response.json({ error: 'INVALID_PHOTO_REQUEST' }, { status: 400 });
    });
    const response = await wrapMindManualSubjectHandler(
      'storage-photo', resolver, () => new Response(null), deps,
    )(new Request('https://app.invalid', {
      method: 'POST',
      headers: { authorization: 'Bearer verified.user.token', 'x-storage-operation': 'delete' },
      body: JSON.stringify({ action: 'upload', user_id: 'attacker' }),
    }));
    expect(response.status).toBe(200);
    expect(JSON.parse(String(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')[0][1]?.body)))
      .toMatchObject({ p_action: 'delete', p_subject_id: SUBJECT, p_generation: GENERATION });

    const invalid = await wrapMindManualSubjectHandler(
      'storage-photo', resolver, () => new Response(null), deps,
    )(new Request('https://app.invalid', {
      method: 'POST',
      headers: { authorization: 'Bearer verified.user.token', 'x-storage-operation': 'attacker-value' },
    }));
    expect(invalid.status).toBe(400);
    expect(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')).toHaveLength(1);
  });

  it('retains selected leases for 5xx responses and uncertain registered work', async () => {
    const failed = ownerScopedDependencies();
    const response = await wrapMindManualSubjectHandler(
      'gmail-compose', verifiedBearerMindManualScope('authenticated_request'),
      () => Response.json({ error: 'provider outcome unresolved' }, { status: 502 }), failed.deps,
    )(authenticatedRequest());
    expect(response.status).toBe(502);
    expect(rpcCalls(failed.fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);

    const uncertain = ownerScopedDependencies();
    const completed = await wrapMindManualSubjectHandler(
      'gmail-compose', verifiedBearerMindManualScope('authenticated_request'),
      (_request, lifecycle) => {
        lifecycle.holdUntil(Promise.reject(new Error('completion unknown')));
        return new Response(null);
      }, uncertain.deps,
    )(authenticatedRequest());
    expect(completed.status).toBe(200);
    expect(rpcCalls(uncertain.fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });
});

describe('Mind Manual per-subject scheduled work', () => {
  it.each([
    ['selected', { decision: 'admitted', generation: GENERATION }, 1],
    ['unselected', { decision: 'unselected' }, 0],
  ])('runs %s work with the exact server-owned tuple', async (_label, decision, releaseCount) => {
    const { deps, fetchMock } = ownerScopedDependencies(decision);
    const work = vi.fn(async () => 'renewed');
    const result = await runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_gmail' }, work, deps,
    );
    expect(result).toEqual({ kind: 'completed', value: 'renewed' });
    expect(work).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')[0][1]?.body)))
      .toEqual({
        p_function_name: 'watch-renewal-cron',
        p_action: 'renew_gmail',
        p_subject_id: SUBJECT,
        p_lease_id: UUID_A,
        p_generation: GENERATION,
      });
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(releaseCount);
  });

  it('skips blocked owner work and still gives separate rows unique leases', async () => {
    const blocked = ownerScopedDependencies({ decision: 'blocked' });
    const blockedWork = vi.fn(async () => 'unsafe');
    await expect(runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_calendar' },
      blockedWork, blocked.deps,
    )).resolves.toEqual({ kind: 'blocked' });
    expect(blockedWork).not.toHaveBeenCalled();

    const selected = ownerScopedDependencies();
    selected.deps.randomUUID = vi.fn()
      .mockReturnValueOnce(UUID_A)
      .mockReturnValueOnce(UUID_B);
    await runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_calendar' },
      async () => 'first', selected.deps,
    );
    await runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_gmail' },
      async () => 'second', selected.deps,
    );
    expect(rpcCalls(selected.fetchMock, 'mind_manual_admit_subject_edge').map(([, init]) =>
      JSON.parse(String(init?.body)).p_lease_id)).toEqual([UUID_A, UUID_B]);
  });

  it('sanitizes admission failures before work and retains selected callback failures', async () => {
    const malformed = ownerScopedDependencies({ decision: 'admitted' });
    const never = vi.fn(async () => 'unsafe');
    await expect(runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_gmail' }, never, malformed.deps,
    )).rejects.toEqual(new MindManualAdmissionUnavailableError());
    expect(never).not.toHaveBeenCalled();

    const failed = ownerScopedDependencies();
    await expect(runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_gmail' },
      async () => { throw new Error('provider failure'); }, failed.deps,
    )).rejects.toThrow('provider failure');
    expect(rpcCalls(failed.fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('waits for registered completion and retains a selected lease when it rejects', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    await expect(runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_calendar' },
      async (lifecycle) => {
        lifecycle.holdUntil(Promise.reject(new Error('completion unknown')));
        return 'response returned';
      }, deps,
    )).rejects.toEqual(new MindManualSubjectWorkIncompleteError());
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('does not release selected scheduled work until a deferred completion resolves', async () => {
    const completion = deferred();
    const started = deferred();
    const { deps, fetchMock } = ownerScopedDependencies();
    const result = runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_calendar' },
      async (lifecycle) => {
        lifecycle.holdUntil(completion.promise);
        started.resolve();
        return 'renewed';
      }, deps,
    );
    await started.promise;
    await Promise.resolve();
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
    completion.resolve();
    await expect(result).resolves.toEqual({ kind: 'completed', value: 'renewed' });
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(1);
  });

  it('retains selected work for a throwing then getter even when the callback catches it', async () => {
    const { deps, fetchMock } = ownerScopedDependencies();
    const malformed = Object.create(null) as PromiseLike<unknown>;
    Object.defineProperty(malformed, 'then', {
      get() { throw new Error('hostile then getter'); },
    });
    await expect(runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_gmail' },
      async (lifecycle) => {
        expect(() => lifecycle.holdUntil(malformed)).toThrow('completion promise');
        return 'callback caught malformed registration';
      }, deps,
    )).rejects.toEqual(new MindManualSubjectWorkIncompleteError());
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(0);
  });

  it('rejects scheduled lifecycle registration after the callback has returned', async () => {
    const { deps } = ownerScopedDependencies();
    let captured!: MindManualWorkLifecycle;
    await runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_calendar' },
      async (lifecycle) => { captured = lifecycle; return 'done'; }, deps,
    );
    expect(() => captured.holdUntil(Promise.resolve())).toThrow('before returning');
  });

  it.each(['retained', 'malformed', 'transport'])(
    'makes one release attempt and preserves completed work for a %s release', async (failure) => {
    const { deps, fetchMock } = ownerScopedDependencies();
    fetchMock.mockResolvedValueOnce(Response.json({ decision: 'admitted', generation: GENERATION }));
    if (failure === 'transport') fetchMock.mockRejectedValueOnce(new Error('release transport lost'));
    else if (failure === 'malformed') fetchMock.mockResolvedValueOnce(new Response('not-json'));
    else fetchMock.mockResolvedValueOnce(Response.json({ decision: 'retained' }));
    await expect(runMindManualSubjectWork(
      'watch-renewal-cron', { subjectId: SUBJECT, action: 'renew_gmail' },
      async () => 'completed-before-release', deps,
    )).resolves.toEqual({ kind: 'completed', value: 'completed-before-release' });
    expect(rpcCalls(fetchMock, 'mind_manual_admit_subject_edge')).toHaveLength(1);
    expect(rpcCalls(fetchMock, 'mind_manual_release_subject_edge')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
});

describe('Mind Manual Edge admission', () => {
  it('matches the exact reviewed 34-function manifest', () => {
    const expected = readFileSync(resolve(process.cwd(), 'supabase/isolation/mind-manual-edge-functions.tsv'), 'utf8')
      .split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t')[0]);
    expect([...MIND_MANUAL_EDGE_FUNCTIONS]).toEqual(expected);
    expect(expected).toHaveLength(34);
  });

  it('denies before provider/storage/body work, with sanitized retriable CORS response', async () => {
    const { deps, fetchMock } = dependencies();
    fetchMock.mockResolvedValueOnce(Response.json(false));
    const provider = vi.fn();
    const storage = vi.fn();
    const handler = vi.fn(async (req: Request) => {
      await req.json(); provider(); storage(); return Response.json({ ok: true });
    });
    const incoming = new Request('https://app.invalid/', { method: 'POST', body: 'sensitive-body' });
    const response = await wrapMindManualHandler('gmail-compose', handler, deps)(incoming);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'MIND_MANUAL_TEMPORARILY_UNAVAILABLE',
      message: 'Mind Manual is temporarily unavailable. Please retry shortly.',
    });
    expect(incoming.bodyUsed).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([false, null, 1, 'true', [true], { admitted: true }])('rejects non-true admission JSON %j', async (value) => {
    const { deps, fetchMock } = dependencies();
    fetchMock.mockResolvedValueOnce(Response.json(value));
    const handler = vi.fn(() => new Response(null));
    expect((await wrapMindManualHandler('calendar-sync', handler, deps)(request())).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([404, 401, 500])('fails closed for control-plane HTTP %s', async (status) => {
    const { deps, fetchMock } = dependencies();
    fetchMock.mockResolvedValueOnce(new Response(`secret ${TEST_KEY}`, { status }));
    const handler = vi.fn(() => new Response(null));
    const response = await wrapMindManualHandler('calendar-sync', handler, deps)(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(TEST_KEY);
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed without logging transport errors or trying an uncertain release', async () => {
    const { deps, fetchMock } = dependencies();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error(`Bearer ${TEST_KEY}`));
    const handler = vi.fn(() => new Response(null));
    const response = await wrapMindManualHandler('calendar-sync', handler, deps)(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(TEST_KEY);
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('fails closed for malformed JSON and a stalled JSON body', async () => {
    const { deps, fetchMock } = dependencies({ rpcTimeoutMs: 5 });
    const handler = vi.fn(() => new Response(null));
    fetchMock.mockResolvedValueOnce(new Response('not-json'));
    expect((await wrapMindManualHandler('calendar-sync', handler, deps)(request())).status).toBe(503);
    const stalled = new Response(new ReadableStream());
    fetchMock.mockResolvedValueOnce(stalled);
    expect((await wrapMindManualHandler('calendar-sync', handler, deps)(request())).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('bounds a hung admission without expiring or deleting its possibly acquired lease', async () => {
    const { deps, fetchMock } = dependencies({ rpcTimeoutMs: 5 });
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    const handler = vi.fn(() => new Response(null));
    expect((await wrapMindManualHandler('calendar-sync', handler, deps)(request())).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  });

  it.each(['commerce-sync', '', 'calendar-sync ', '../calendar-sync'])('rejects invalid function %j before contacting control plane', async (name) => {
    const { deps, fetchMock } = dependencies();
    const handler = vi.fn(() => new Response(null));
    expect((await wrapMindManualHandler(name, handler, deps)(request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed for missing/invalid config and invalid generated UUID', async () => {
    const handler = vi.fn(() => new Response(null));
    for (const overrides of [
      { env: () => undefined },
      { env: (name: string) => name === 'SUPABASE_URL' ? 'http://external.invalid' : TEST_KEY },
      { env: (name: string) => name === 'SUPABASE_URL' ? 'https://control.supabase.co/?secret=x' : TEST_KEY },
      { randomUUID: () => 'caller-provided-id' },
    ]) {
      const { deps, fetchMock } = dependencies(overrides);
      expect((await wrapMindManualHandler('calendar-sync', handler, deps)(request())).status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('bypasses OPTIONS without acquiring a lease or executing any handler', async () => {
    const { deps, fetchMock } = dependencies({ env: () => undefined });
    const handler = vi.fn(() => new Response(null));
    const response = await wrapMindManualHandler('calendar-sync', handler, deps)(new Request('https://app.invalid', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses only server-owned credentials and a new server UUID, never request-supplied values', async () => {
    const { deps, fetchMock } = dependencies();
    const incoming = new Request('https://app.invalid?lease_id=attacker', {
      method: 'POST', headers: { authorization: 'Bearer attacker', apikey: 'attacker', 'x-lease-id': 'attacker' },
      body: JSON.stringify({ p_lease_id: 'attacker' }),
    });
    const response = await wrapMindManualHandler('calendar-sync', () => new Response(null), deps)(incoming);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://control.supabase.co/rest/v1/rpc/mind_manual_admit_edge');
    expect(init?.headers).toMatchObject({ apikey: TEST_KEY, Authorization: `Bearer ${TEST_KEY}` });
    expect(JSON.parse(String(init?.body))).toEqual({ p_function_name: 'calendar-sync', p_lease_id: UUID_A });
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ p_lease_id: UUID_A });
  });
});

describe('Mind Manual Edge lease completion', () => {
  it('waits for the actual asynchronous handler and body EOF, then releases exactly once', async () => {
    const { deps, fetchMock } = dependencies();
    const work = deferred();
    const started = deferred();
    const wrapped = wrapMindManualHandler('gmail-compose', async () => {
      started.resolve(); await work.promise; return Response.json({ ok: true });
    }, deps);
    const responsePromise = wrapped(request());
    await started.promise;
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
    work.resolve();
    const response = await responsePromise;
    expect(await response.json()).toEqual({ ok: true });
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(1);
  });

  it('isolates concurrent requests with distinct leases and completion order', async () => {
    const ids = [UUID_A, UUID_B];
    const { deps, fetchMock } = dependencies({ randomUUID: () => ids.shift()! });
    const workA = deferred();
    const workB = deferred();
    const startedA = deferred();
    const startedB = deferred();
    let count = 0;
    const wrapped = wrapMindManualHandler('calendar-sync', async () => {
      const first = count++ === 0;
      (first ? startedA : startedB).resolve();
      await (first ? workA : workB).promise;
      return new Response(null);
    }, deps);
    const responseA = wrapped(request());
    const responseB = wrapped(request());
    await Promise.all([startedA.promise, startedB.promise]);
    workB.resolve(); await responseB;
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge').map(([, init]) => JSON.parse(String(init?.body)).p_lease_id)).toEqual([UUID_B]);
    workA.resolve(); await responseA;
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge').map(([, init]) => JSON.parse(String(init?.body)).p_lease_id)).toEqual([UUID_B, UUID_A]);
  });

  it('retains the lease on a handler exception, preserving the original error', async () => {
    const { deps, fetchMock } = dependencies();
    const original = new Error('handler failed');
    const wrapped = wrapMindManualHandler('calendar-sync', async () => { throw original; }, deps);
    await expect(wrapped(request())).rejects.toBe(original);
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('retains thrown handler outcomes even if registered background work later resolves', async () => {
    const { deps, fetchMock } = dependencies();
    const background = deferred();
    const started = deferred();
    const wrapped = wrapMindManualHandler('calendar-sync', async (_, lifecycle) => {
      lifecycle.holdUntil(background.promise); started.resolve(); throw new Error('handler failed');
    }, deps);
    const result = wrapped(request());
    const observed = expect(result).rejects.toThrow('handler failed');
    await started.promise;
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
    await observed;
    background.resolve(); await Promise.resolve();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it.each([500, 502, 503])('retains HTTP %s outcomes for explicit provider reconciliation', async (status) => {
    const { deps, fetchMock } = dependencies();
    const original = Response.json({ error: 'provider outcome unresolved' }, { status });
    const response = await wrapMindManualHandler('calendar-sync', () => original, deps)(request());
    expect(response).toBe(original);
    expect(response.status).toBe(status);
    await response.text();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it.each(['false', 'malformed', 'throw'])('does not retry or expose a failed %s release', async (failure) => {
    const { deps, fetchMock } = dependencies();
    fetchMock.mockResolvedValueOnce(Response.json(true));
    if (failure === 'throw') fetchMock.mockRejectedValueOnce(new Error(TEST_KEY));
    else fetchMock.mockResolvedValueOnce(new Response(failure === 'false' ? 'false' : 'not-json'));
    const response = await wrapMindManualHandler('calendar-sync', () => Response.json({ ok: true }), deps)(request());
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(1);
  });

  it('retains rejected lifecycle work without unhandled rejections or release', async () => {
    const { deps, fetchMock } = dependencies();
    const response = await wrapMindManualHandler('calendar-sync', (_, lifecycle) => {
      lifecycle.holdUntil(Promise.reject(new Error('work completion uncertain')));
      return Response.json({ ok: true });
    }, deps)(request());
    await response.text();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('retains malformed lifecycle registrations even if the handler catches the error', async () => {
    const { deps, fetchMock } = dependencies();
    const response = await wrapMindManualHandler('ai-realtime-voice', (_, lifecycle) => {
      expect(() => lifecycle.holdUntil(undefined as unknown as Promise<void>)).toThrow('completion promise');
      return upgradedResponse();
    }, deps)(request());
    expect(response.status).toBe(101);
    await Promise.resolve();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('rejects lifecycle registration after the handler has returned', async () => {
    const { deps } = dependencies();
    let captured!: MindManualWorkLifecycle;
    await wrapMindManualHandler('calendar-sync', (_, lifecycle) => { captured = lifecycle; return new Response(null); }, deps)(request());
    expect(() => captured.holdUntil(Promise.resolve())).toThrow('before returning');
  });

  it('retains an uninstrumented WebSocket lease after the HTTP handshake', async () => {
    const { deps, fetchMock } = dependencies();
    const response = upgradedResponse();
    expect(await wrapMindManualHandler('ai-realtime-voice', () => response, deps)(request())).toBe(response);
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('holds a WebSocket lease until BOTH client and upstream are actually closed', async () => {
    const client = deferred();
    const upstream = deferred();
    const background: Promise<unknown>[] = [];
    const { deps, fetchMock } = dependencies({ waitUntil: (promise) => { background.push(promise); } });
    const response = await wrapMindManualHandler('ai-realtime-voice', (_, lifecycle) => {
      lifecycle.holdUntil(client.promise); lifecycle.holdUntil(upstream.promise);
      return upgradedResponse();
    }, deps)(request());
    expect(response.status).toBe(101);
    expect(background).toHaveLength(1);
    client.resolve();
    await Promise.resolve();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
    upstream.resolve(); await Promise.all(background);
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(1);
  });

  it('retains a WebSocket lease when a close completion rejects', async () => {
    const completion = deferred();
    const background: Promise<unknown>[] = [];
    const { deps, fetchMock } = dependencies({ waitUntil: (promise) => { background.push(promise); } });
    await wrapMindManualHandler('ai-realtime-voice', (_, lifecycle) => {
      lifecycle.holdUntil(completion.promise); return upgradedResponse();
    }, deps)(request());
    completion.reject(new Error('error is not proof of closed socket'));
    await Promise.all(background);
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('holds generic streaming work until producer EOF and registered work settle', async () => {
    const { deps, fetchMock } = dependencies();
    const producer = deferred();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = await wrapMindManualHandler('ai-tts-generate', (_, lifecycle) => {
      lifecycle.holdUntil(producer.promise);
      return new Response(new ReadableStream({ start(value) { controller = value; } }), {
        status: 201, headers: { 'content-type': 'application/octet-stream', 'x-custom': 'preserved' },
      });
    }, deps)(request());
    const consumed = response.arrayBuffer();
    controller.enqueue(new Uint8Array([1, 2, 3])); controller.close();
    await Promise.resolve();
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
    producer.resolve();
    expect([...new Uint8Array(await consumed)]).toEqual([1, 2, 3]);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-custom')).toBe('preserved');
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(1);
  });

  it('retains cancelled stream leases instead of guessing producer work ended', async () => {
    const { deps, fetchMock } = dependencies();
    const cancelled = vi.fn();
    const response = await wrapMindManualHandler('ai-tts-generate', () => new Response(new ReadableStream({ cancel: cancelled })), deps)(request());
    await response.body!.cancel();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('does not mistake cancellation resolving a pending stream read for producer EOF', async () => {
    const { deps, fetchMock } = dependencies();
    const readStarted = deferred();
    const response = await wrapMindManualHandler('ai-tts-generate', () => new Response(new ReadableStream({
      pull() { readStarted.resolve(); },
    })), deps)(request());
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await readStarted.promise;
    await reader.cancel();
    expect(await pendingRead).toEqual({ done: true, value: undefined });
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });

  it('retains errored stream leases', async () => {
    const { deps, fetchMock } = dependencies();
    const response = await wrapMindManualHandler('ai-tts-generate', () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('producer failed')); },
    })), deps)(request());
    await expect(response.text()).rejects.toThrow('producer failed');
    expect(rpcCalls(fetchMock, 'mind_manual_release_edge')).toHaveLength(0);
  });
});
