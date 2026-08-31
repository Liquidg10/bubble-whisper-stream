import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStoragePhotoHandler,
  MAX_PHOTO_BYTES,
  type StoragePhotoDependencies,
} from '../../../supabase/functions/_shared/storagePhotoGateway.ts';
import { wrapMindManualHandler } from '../../../supabase/functions/_shared/migrationWriteFence.ts';

const ORIGIN = 'https://photos-project.supabase.co';
const USER = '4c50665f-610a-4cc1-8df0-fc3995487261';
const OTHER = '92f5ee58-76f8-4eb1-b593-51a7d873d2b6';
const FILE = 'bd7b1e1c-c485-4b7a-91c0-f9e70270d4cc';
const OBJECT = '7fccbc66-b39d-4f6a-a63f-63b584480bc1';
const LEASE = '314e4e88-e5d1-4421-8c47-a12c7907c21e';
const TOKEN = 'owner-test-token';
const KEY = 'server-only-test-key';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const PATH = `${USER}/${FILE}.png`;
const env = (name: string) => ({ SUPABASE_URL: ORIGIN, SUPABASE_SERVICE_ROLE_KEY: KEY })[name];

function upload(body: BodyInit = PNG, headers: Record<string, string> = {}) {
  return new Request('https://caller-controlled.invalid/upload?path=foreign', {
    method: 'POST', body,
    headers: { authorization: `Bearer ${TOKEN}`, 'x-storage-operation': 'upload', 'content-type': 'image/png', ...headers },
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}
function deletion(path = PATH, raw?: string) {
  return upload(raw ?? JSON.stringify({ path }), { 'x-storage-operation': 'delete', 'content-type': 'application/json' });
}
function gateway(overrides: StoragePhotoDependencies = {}) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: USER });
    return Response.json({ Id: OBJECT, Key: `photos/${PATH}` });
  });
  return { fetchMock, handler: createStoragePhotoHandler({ env, fetch: fetchMock, randomUUID: () => FILE, ...overrides }) };
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function delayedJson(value: unknown) {
  const reached = deferred();
  const close = deferred();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(value)));
      reached.resolve();
      await close.promise;
      controller.close();
    },
  });
  return { reached, close, response: new Response(body, { headers: { 'Content-Type': 'application/json' } }) };
}

afterEach(() => vi.restoreAllMocks());

describe('leased photo storage gateway', () => {
  it('uses verified server-side ownership and a generated no-upsert path, never caller URLs or keys', async () => {
    const { handler, fetchMock } = gateway();
    const response = await handler(upload(PNG, { 'x-file-name': `${OTHER}/attack.png`, apikey: 'caller-key' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: PATH });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [authUrl, auth] = fetchMock.mock.calls[0];
    expect(authUrl).toBe(`${ORIGIN}/auth/v1/user`);
    expect(auth).toMatchObject({ method: 'GET', redirect: 'error', headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}` } });
    const [writeUrl, write] = fetchMock.mock.calls[1];
    expect(writeUrl).toBe(`${ORIGIN}/storage/v1/object/photos/${PATH}`);
    expect(write).toMatchObject({ method: 'POST', redirect: 'error', headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`, 'x-upsert': 'false', 'Content-Type': 'image/png',
    } });
    expect([...write!.body as Uint8Array]).toEqual([...PNG]);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-storage-operation');
  });

  it.each([
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 1]), 'jpg'],
    ['image/png', PNG, 'png'],
    ['image/gif', new TextEncoder().encode('GIF87a'), 'gif'],
    ['image/gif', new TextEncoder().encode('GIF89a'), 'gif'],
    ['image/webp', new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]), 'webp'],
  ])('accepts the declared %s only with its matching magic signature', async (type, bytes, extension) => {
    const { handler, fetchMock } = gateway();
    const path = `${USER}/${FILE}.${extension}`;
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(Response.json({ Id: OBJECT, Key: `photos/${path}` }));
    const response = await handler(upload(bytes, { 'content-type': type }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path });
  });

  it.each(['image/svg+xml', 'text/html', 'application/octet-stream', 'image/png; charset=utf-8'])('rejects unsupported media %s before auth or storage', async (type) => {
    const { handler, fetchMock } = gateway();
    expect((await handler(upload(PNG, { 'content-type': type }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['image/jpeg', 'image/gif', 'image/webp', 'image/png'])('rejects missing/mismatched %s signatures before write', async (type) => {
    const { handler, fetchMock } = gateway();
    expect((await handler(upload(new Uint8Array([1, 2]), { 'content-type': type }))).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles OPTIONS without configuration and denies other HTTP methods', async () => {
    const { handler, fetchMock } = gateway({ env: () => undefined });
    expect((await handler(new Request('https://caller.invalid/', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(new Request('https://caller.invalid/'))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'Basic abc', 'Bearer token with spaces', 'Bearer ' + 'x'.repeat(16_384)])('rejects malformed authorization before touching the request body or provider', async (authorization) => {
    const { handler, fetchMock } = gateway();
    const request = upload(PNG, { authorization });
    expect((await handler(request)).status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])('denies an auth service %s without storage work', async (status) => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ error: KEY }, { status }));
    const request = upload();
    const response = await handler(request);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(KEY);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { id: OTHER.toUpperCase() }, { id: 'caller' }, { id: '00000000-0000-0000-0000-000000000000' }])('fails closed for an invalid auth envelope %j', async (user) => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json(user));
    expect((await handler(upload())).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['network-error', 'redirect', 'followed-redirect', 'malformed-json', 'oversized', 'oversized-401', 'wrong-content-type'])('treats auth %s as unavailable, not a client-body failure', async (failure) => {
    const { handler, fetchMock } = gateway();
    if (failure === 'network-error') fetchMock.mockRejectedValueOnce(new Error(KEY));
    else {
      let response: Response;
      if (failure === 'redirect') response = new Response(null, { status: 302, headers: { Location: 'https://foreign.invalid' } });
      else if (failure === 'followed-redirect') {
        response = Response.json({ id: USER });
        Object.defineProperty(response, 'redirected', { value: true });
      } else if (failure === 'wrong-content-type') response = new Response(JSON.stringify({ id: USER }));
      else response = new Response(failure.startsWith('oversized') ? 'x'.repeat(64 * 1024 + 1) : KEY, {
        status: failure === 'oversized-401' ? 401 : 200,
        headers: { 'content-type': 'application/json' },
      });
      fetchMock.mockResolvedValueOnce(response);
    }
    const request = upload();
    const response = await handler(request);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(KEY);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
  });

  it.each([undefined, '', ' key ', 'key\nvalue'])('refuses a missing or malformed service key before dispatch', async (key) => {
    const { handler, fetchMock } = gateway({ env: (name) => name === 'SUPABASE_URL' ? ORIGIN : key });
    expect((await handler(upload())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['http://remote.invalid', `${ORIGIN}/subpath`, `${ORIGIN}/?secret=x`, 'https://user:password@project.invalid', 'not-a-url'])('rejects unsafe server configuration %s before dispatch', async (url) => {
    const { handler, fetchMock } = gateway({ env: (name) => name === 'SUPABASE_URL' ? url : KEY });
    expect((await handler(upload())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'bad/id', OTHER.toUpperCase(), '00000000-0000-0000-0000-000000000000'])('refuses invalid generated UUID %s before writing', async (id) => {
    const { handler, fetchMock } = gateway({ randomUUID: () => id });
    expect((await handler(upload())).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([String(MAX_PHOTO_BYTES + 1), '9999999999999999999999999'])('rejects declared oversized length %s before reading or authenticating', async (length) => {
    const { handler, fetchMock } = gateway();
    const request = upload(PNG, { 'content-length': length });
    expect((await handler(request)).status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['-1', '01', 'abc', '9, 9'])('rejects malformed Content-Length %s', async (length) => {
    const { handler, fetchMock } = gateway();
    expect((await handler(upload(PNG, { 'content-length': length }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a dishonest short content length and never starts storage work', async () => {
    const { handler, fetchMock } = gateway();
    expect((await handler(upload(PNG, { 'content-length': '1' }))).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bounds an unannounced streaming body before dispatching storage', async () => {
    const { handler, fetchMock } = gateway();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(PNG); controller.enqueue(new Uint8Array(MAX_PHOTO_BYTES)); },
      cancel,
    });
    expect((await handler(upload(body))).status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('finishes reading the entire upload before making any storage request', async () => {
    const finish = deferred();
    const { handler, fetchMock } = gateway();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) { controller.enqueue(PNG); await finish.promise; controller.close(); },
    });
    const result = handler(upload(body));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/storage/'))).toBe(false);
    finish.resolve();
    expect((await result).status).toBe(200);
  });

  it('maps a failed request body to a safe pre-write 400', async () => {
    const { handler, fetchMock } = gateway();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(KEY)); } });
    const response = await handler(upload(body));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['upsert', 'signed-upload', 'list', ''])('rejects unsupported operation %s without provider work', async (operation) => {
    const { handler, fetchMock } = gateway();
    expect((await handler(upload(PNG, { 'x-storage-operation': operation }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects encoded bodies without dispatch', async () => {
    const { handler, fetchMock } = gateway();
    expect((await handler(upload(PNG, { 'content-encoding': 'gzip' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    `${OTHER}/photo.png`, `${USER}/../photo.png`, `${USER}/photo..png`, `${USER}/dir/photo.png`,
    `${USER}/%2e%2e.png`, `${USER}/photo%2fpng`, `${USER}/photo\\png`, `${USER}/photo.png?x=1`,
    `${USER}/.photo.png`, `${USER}/photo.png\n`, `${USER}/photo é.png`, `${USER}/${'x'.repeat(256)}`,
    `${USER}/`, `photos/${USER}/photo.png`,
  ])('rejects foreign/unsafe deletion path %s before write', async (path) => {
    const { handler, fetchMock } = gateway();
    expect((await handler(deletion(path))).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    '{}', '[]', 'null', '{"path":null}', `{"path":"${PATH}","userId":"${OTHER}"}`,
    `{"path":"${PATH}","path":"${PATH}"}`, `{"paths":["${PATH}"]}`, 'not-json',
  ])('rejects a non-exact deletion envelope %s', async (body) => {
    const { handler, fetchMock } = gateway();
    expect((await handler(deletion(PATH, body))).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([PATH, `${USER}/1699000000-old_photo-name.jpg`])('deletes one exact owned safe leaf %s, retaining legacy generated names', async (path) => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(Response.json([{ id: OBJECT, name: path }]));
    const response = await handler(deletion(path));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path });
    expect(fetchMock.mock.calls[1]).toEqual([`${ORIGIN}/storage/v1/object/photos`, {
      method: 'DELETE', redirect: 'error', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    }]);
  });

  it('accepts an exact delete receipt with the optional matching bucket', async () => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(Response.json([{ id: OBJECT, name: PATH, bucket_id: 'photos' }]));
    expect((await handler(deletion())).status).toBe(200);
  });

  it.each([null, [], {}, { Id: OBJECT, Key: `photos/${OTHER}/${FILE}.png` }, { Key: `photos/${PATH}` }, { Id: 'invalid', Key: `photos/${PATH}` }].map((result) => ({ result })))('treats malformed upload success $result as uncertain without retry or cleanup', async ({ result }) => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(Response.json(result));
    const response = await handler(upload());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'PHOTO_WRITE_UNVERIFIED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [], [{ id: OBJECT, name: PATH }, { id: OBJECT, name: PATH }], [{ id: OBJECT, name: `${OTHER}/photo.png` }],
    [{ name: PATH }], [{ id: 'invalid', name: PATH }], [{ id: OBJECT, name: PATH, bucket_id: 'voice-samples' }],
  ].map((result) => ({ result })))('treats unverifiable delete success $result as uncertain', async ({ result }) => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(Response.json(result));
    expect((await handler(deletion())).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 409, 500])('does not infer completion from a storage %s error', async (status) => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(Response.json({ secret: KEY }, { status }));
    const response = await handler(upload());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['redirect', 'malformed-json', 'wrong-content-type', 'oversized', 'body-error', 'network-error'])('retains uncertainty for storage %s without leaking errors', async (failure) => {
    const { handler, fetchMock } = gateway();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER }));
    if (failure === 'network-error') fetchMock.mockRejectedValueOnce(new Error(`Bearer ${KEY} ${TOKEN}`));
    else {
      let response: Response;
      if (failure === 'redirect') response = new Response(null, { status: 302, headers: { Location: 'https://foreign.invalid' } });
      else if (failure === 'wrong-content-type') response = new Response(JSON.stringify({ Id: OBJECT, Key: `photos/${PATH}` }));
      else if (failure === 'body-error') response = new Response(new ReadableStream({ start(controller) { controller.error(new Error(KEY)); } }), { headers: { 'content-type': 'application/json' } });
      else response = new Response(failure === 'oversized' ? 'x'.repeat(64 * 1024 + 1) : KEY, { headers: { 'content-type': 'application/json' } });
      fetchMock.mockResolvedValueOnce(response);
    }
    const response = await handler(upload());
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(TOKEN);
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.redirect).toBe('error');
  });

  it('waits for the complete upstream body, not just headers or the first valid JSON chunk', async () => {
    const upstream = delayedJson({ Id: OBJECT, Key: `photos/${PATH}` });
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(upstream.response);
    let settled = false;
    const result = handler(upload()).then((response) => { settled = true; return response; });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await upstream.reached.promise;
    expect(settled).toBe(false);
    upstream.close.resolve();
    expect((await result).status).toBe(200);
  });

  it('keeps the admission lease until storage body completion and the public response body EOF', async () => {
    const upstream = delayedJson({ Id: OBJECT, Key: `photos/${PATH}` });
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockResolvedValueOnce(upstream.response);
    const control = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(true));
    const wrapped = wrapMindManualHandler('storage-photo', handler, { env, fetch: control, randomUUID: () => LEASE });
    const result = wrapped(upload());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(control).toHaveBeenCalledTimes(1);
    upstream.close.resolve();
    const response = await result;
    expect(control).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ path: PATH });
    expect(control).toHaveBeenCalledTimes(2);
    expect(String(control.mock.calls[1][0])).toBe(`${ORIGIN}/rest/v1/rpc/mind_manual_release_edge`);
    expect(JSON.parse(String(control.mock.calls[1][1]?.body))).toEqual({ p_lease_id: LEASE });
  });

  it('retains its lease after any unverified storage mutation even when the caller consumes the error', async () => {
    const { handler, fetchMock } = gateway();
    fetchMock.mockResolvedValueOnce(Response.json({ id: USER })).mockRejectedValueOnce(new Error(KEY));
    const control = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(true));
    const wrapped = wrapMindManualHandler('storage-photo', handler, { env, fetch: control, randomUUID: () => LEASE });
    const response = await wrapped(upload());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'PHOTO_WRITE_UNVERIFIED' });
    expect(control).toHaveBeenCalledTimes(1);
  });

  it('denies at the outer fence before auth, body consumption, UUID generation or storage', async () => {
    const randomUUID = vi.fn(() => FILE);
    const { handler, fetchMock } = gateway({ randomUUID });
    const control = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(false));
    const wrapped = wrapMindManualHandler('storage-photo', handler, { env, fetch: control, randomUUID: () => LEASE });
    const request = upload();
    expect((await wrapped(request)).status).toBe(503);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
  });
});
