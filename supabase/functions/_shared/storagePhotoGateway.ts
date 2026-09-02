/**
 * Photo byte mutations must run inside the outer migration admission lease.
 * Keep this module free of runtime/remote imports so the transport contract can
 * be tested offline. No retry or cleanup can establish an uncertain write's end.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_DELETE_BYTES = 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const zeroUuid = '00000000-0000-0000-0000-000000000000';
const photoTypes = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'],
  ['image/webp', 'webp'], ['image/gif', 'gif'],
]);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-storage-operation',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface StoragePhotoDependencies {
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
  randomUUID?: () => string;
}

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get(name: string): string | undefined } };
};

class GatewayError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function json(value: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function configuration(env: (name: string) => string | undefined) {
  const rawUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!rawUrl || !serviceKey || serviceKey.trim() !== serviceKey || /[\r\n]/.test(serviceKey)) {
    throw new GatewayError(503, 'PHOTO_SERVICE_UNAVAILABLE');
  }
  const url = new URL(rawUrl);
  const local = ['localhost', '127.0.0.1', '[::1]', 'kong'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new GatewayError(503, 'PHOTO_SERVICE_UNAVAILABLE');
  }
  return { origin: url.origin, serviceKey };
}

function contentLength(headers: Headers, maximum: number): number | null {
  const raw = headers.get('content-length');
  if (raw === null) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new GatewayError(400, 'INVALID_PHOTO_REQUEST');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) throw new GatewayError(413, 'PHOTO_TOO_LARGE');
  return value;
}

/** Memory is bounded even when Content-Length is absent or dishonest. */
async function boundedBytes(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Fetch streams can originate in a different realm (for example a test
      // DOM or embedded runtime). Use the built-in view brand, not instanceof.
      if (!ArrayBuffer.isView(value) || Object.prototype.toString.call(value) !== '[object Uint8Array]' ||
        value.byteLength > maximum - length) {
        await reader.cancel().catch(() => {});
        throw new GatewayError(413, 'PHOTO_TOO_LARGE');
      }
      length += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function upstreamBytes(response: Response): Promise<Uint8Array> {
  // Read the entire body before interpreting success. A body error or oversized
  // response after provider dispatch remains an ambiguous 5xx, retaining lease.
  try {
    return await boundedBytes(response.body, MAX_JSON_BYTES);
  } catch {
    // A provider body failure is never a caller payload-size error, including
    // when it occurs during authentication before any byte mutation.
    throw new Error('Unverified upstream response body');
  }
}

async function upstreamJson(response: Response): Promise<unknown> {
  const bytes = await upstreamBytes(response);
  if (!response.ok || response.redirected ||
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('Unverified upstream response');
  }
  return parseJson(bytes);
}

function matchesPhotoType(bytes: Uint8Array, type: string): boolean {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (type === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  if (type === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === 'image/gif') return starts(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || starts(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  if (type === 'image/webp') return bytes.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return false;
}

function ownedPath(value: unknown, userId: string): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${userId}/`)) return false;
  const leaf = value.slice(userId.length + 1);
  // Safe existing timestamp/name leaves remain deletable. Nested or encoded
  // legacy paths need explicit operator reconciliation, never URL normalization.
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(leaf) && !leaf.includes('..');
}

export function createStoragePhotoHandler(dependencies: StoragePhotoDependencies = {}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'PHOTO_METHOD_NOT_ALLOWED' }, 405);

    let writeDispatched = false;
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization || authorization.length > 16_384 || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization)) {
        throw new GatewayError(401, 'PHOTO_AUTHENTICATION_REQUIRED');
      }
      const operation = request.headers.get('x-storage-operation');
      const type = request.headers.get('content-type')?.toLowerCase();
      if ((operation !== 'upload' && operation !== 'delete') ||
        (operation === 'upload' && !photoTypes.has(type ?? '')) ||
        (operation === 'delete' && type !== 'application/json') ||
        (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity')) {
        throw new GatewayError(400, 'INVALID_PHOTO_REQUEST');
      }
      const maximum = operation === 'upload' ? MAX_PHOTO_BYTES : MAX_DELETE_BYTES;
      const declaredLength = contentLength(request.headers, maximum);
      const runtime = globalThis as RuntimeGlobals;
      const env = dependencies.env ?? ((name: string) => runtime.Deno?.env?.get(name));
      const { origin, serviceKey } = configuration(env);
      const requestFetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
      const authResponse = await requestFetch(`${origin}/auth/v1/user`, {
        method: 'GET', redirect: 'error', headers: { apikey: serviceKey, Authorization: authorization },
      });
      if (authResponse.status === 401 || authResponse.status === 403) {
        await upstreamBytes(authResponse);
        throw new GatewayError(401, 'PHOTO_AUTHENTICATION_REQUIRED');
      }
      const user = await upstreamJson(authResponse);
      if (!record(user) || typeof user.id !== 'string' || !uuid.test(user.id) || user.id === zeroUuid) {
        throw new Error('Unverified authenticated owner');
      }

      let bytes: Uint8Array;
      try {
        bytes = await boundedBytes(request.body, maximum);
        if (declaredLength !== null && declaredLength !== bytes.byteLength) throw new Error('Length mismatch');
      } catch (error) {
        if (error instanceof GatewayError) throw error;
        throw new GatewayError(400, 'INVALID_PHOTO_REQUEST');
      }

      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
      let path: string;
      if (operation === 'upload') {
        if (!matchesPhotoType(bytes, type!)) throw new GatewayError(400, 'INVALID_PHOTO_REQUEST');
        const fileId = (dependencies.randomUUID ?? (() => globalThis.crypto.randomUUID()))();
        if (!uuidV4.test(fileId)) throw new Error('Invalid generated object identity');
        path = `${user.id}/${fileId}.${photoTypes.get(type!)}`;
        writeDispatched = true;
        const response = await requestFetch(`${origin}/storage/v1/object/photos/${path}`, {
          method: 'POST', redirect: 'error',
          headers: { ...headers, 'Content-Type': type!, 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
          body: bytes as BodyInit,
        });
        const result = await upstreamJson(response);
        // storage-js uploadOrUpdate consumes the provider's Id/Key envelope.
        if (!record(result) || typeof result.Id !== 'string' || !uuid.test(result.Id) ||
          result.Id === zeroUuid || result.Key !== `photos/${path}`) throw new Error('Unverified photo upload');
      } else {
        let input: unknown;
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          // An exact one-field JSON object also rejects duplicate path keys.
          if (!/^\s*\{\s*"path"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}\s*$/u.test(text)) throw new Error('Invalid delete envelope');
          input = JSON.parse(text);
        } catch {
          throw new GatewayError(400, 'INVALID_PHOTO_REQUEST');
        }
        if (!record(input) || Object.keys(input).length !== 1 || !ownedPath(input.path, user.id)) {
          throw new GatewayError(400, 'INVALID_PHOTO_REQUEST');
        }
        path = input.path;
        writeDispatched = true;
        const response = await requestFetch(`${origin}/storage/v1/object/photos`, {
          method: 'DELETE', redirect: 'error',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [path] }),
        });
        const result = await upstreamJson(response);
        // Empty arrays are NOT proof that this object was deleted. Do not depend
        // on deprecated bucket_id being present, but reject it when conflicting.
        if (!Array.isArray(result) || result.length !== 1 || !record(result[0]) ||
          result[0].name !== path || typeof result[0].id !== 'string' || !uuid.test(result[0].id) ||
          result[0].id === zeroUuid || (result[0].bucket_id !== undefined && result[0].bucket_id !== 'photos')) {
          throw new Error('Unverified photo deletion');
        }
      }
      return json({ path });
    } catch (error) {
      // Once a byte write was dispatched, even an upstream 4xx or a local parse
      // failure is 5xx: the outer wrapper must retain its lease for reconciliation.
      if (writeDispatched) return json({ error: 'PHOTO_WRITE_UNVERIFIED' }, 502);
      if (error instanceof GatewayError) return json({ error: error.code }, error.status);
      return json({ error: 'PHOTO_SERVICE_UNAVAILABLE' }, 503);
    }
  };
}
