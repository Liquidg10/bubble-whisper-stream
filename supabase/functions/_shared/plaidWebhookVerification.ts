const PLAID_PRODUCTION_VERIFICATION_KEY_URL =
  "https://production.plaid.com/webhook_verification_key/get";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_JWT_LENGTH = 16 * 1024;
const MAX_HEADER_BYTES = 4 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_KEY_RESPONSE_BYTES = 32 * 1024;
const MAX_KEY_RESPONSE_CHUNKS = 1024;
const MAX_KEY_REQUEST_DURATION_MS = 5_000;
const MAX_KEY_ID_LENGTH = 128;
const MAX_CREDENTIAL_LENGTH = 4 * 1024;
const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;
const LOWER_SHA256 = /^[0-9a-f]{64}$/;
const SAFE_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const PLAID_WEBHOOK_VERIFICATION_LIMITS = Object.freeze({
  maxBodyBytes: MAX_BODY_BYTES,
  maxJwtLength: MAX_JWT_LENGTH,
  maxWebhookAgeSeconds: MAX_WEBHOOK_AGE_SECONDS,
  maxKeyResponseChunks: MAX_KEY_RESPONSE_CHUNKS,
  maxKeyRequestDurationMs: MAX_KEY_REQUEST_DURATION_MS,
});

export const PLAID_WEBHOOK_VERIFICATION_KEY_URL =
  PLAID_PRODUCTION_VERIFICATION_KEY_URL;

export interface PlaidWebhookVerificationDependencies {
  fetch?: typeof fetch;
  env?: (name: string) => string | undefined;
  nowEpochSeconds?: () => number;
  webCrypto?: Pick<Crypto, "subtle">;
}

export interface VerifiedPlaidWebhook {
  readonly keyId: string;
  readonly issuedAt: number;
  readonly requestBodySha256: string;
}

export class PlaidWebhookVerificationError extends Error {
  readonly code = "PLAID_WEBHOOK_VERIFICATION_FAILED";

  constructor() {
    super("Plaid webhook verification failed");
    this.name = "PlaidWebhookVerificationError";
  }
}

type JsonRecord = Record<string, unknown>;

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get(name: string): string | undefined } };
};

function fail(): never {
  throw new PlaidWebhookVerificationError();
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRawBytes(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]" &&
    (value as Uint8Array).BYTES_PER_ELEMENT === 1 &&
    // Shared buffers cannot provide a stable synchronous snapshot.
    Object.prototype.toString.call(value.buffer) === "[object ArrayBuffer]";
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function hasAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function decodeBase64Url(
  value: string,
  maxBytes: number,
): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    fail();
  }
  try {
    const standard = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(
      standard.padEnd(Math.ceil(standard.length / 4) * 4, "="),
    );
    if (binary.length > maxBytes) fail();
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (encodeBase64Url(bytes) !== value) fail();
    return bytes;
  } catch (error) {
    if (error instanceof PlaidWebhookVerificationError) throw error;
    fail();
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail();
  }
}

/** JSON.parse accepts duplicate keys. This bounded parser rejects them first. */
function assertUniqueJsonKeys(text: string): void {
  let offset = 0;
  const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);
  const whitespace = () => {
    while (offset < text.length && /[\t\n\r ]/.test(text[offset])) offset += 1;
  };
  const stringValue = (): string => {
    if (text[offset] !== '"') fail();
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      const character = text[offset];
      if (character === '"') {
        offset += 1;
        try {
          const parsed = JSON.parse(text.slice(start, offset));
          if (typeof parsed !== "string") fail();
          return parsed;
        } catch (error) {
          if (error instanceof PlaidWebhookVerificationError) throw error;
          fail();
        }
      }
      if (character === "\\") {
        offset += 2;
      } else {
        offset += 1;
      }
    }
    fail();
  };
  const value = (depth: number): void => {
    if (depth > 32) fail();
    whitespace();
    const character = text[offset];
    if (character === "{") {
      offset += 1;
      whitespace();
      const keys = new Set<string>();
      if (text[offset] === "}") {
        offset += 1;
        return;
      }
      while (offset < text.length) {
        whitespace();
        const key = stringValue();
        if (dangerousKeys.has(key) || keys.has(key)) fail();
        keys.add(key);
        whitespace();
        if (text[offset] !== ":") fail();
        offset += 1;
        value(depth + 1);
        whitespace();
        if (text[offset] === "}") {
          offset += 1;
          return;
        }
        if (text[offset] !== ",") fail();
        offset += 1;
      }
      fail();
    }
    if (character === "[") {
      offset += 1;
      whitespace();
      if (text[offset] === "]") {
        offset += 1;
        return;
      }
      while (offset < text.length) {
        value(depth + 1);
        whitespace();
        if (text[offset] === "]") {
          offset += 1;
          return;
        }
        if (text[offset] !== ",") fail();
        offset += 1;
      }
      fail();
    }
    if (character === '"') {
      stringValue();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      text.slice(offset),
    );
    if (!number) fail();
    offset += number[0].length;
  };

  value(0);
  whitespace();
  if (offset !== text.length) fail();
}

function parseUniqueJsonRecord(text: string): JsonRecord {
  assertUniqueJsonKeys(text);
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) fail();
    return parsed;
  } catch (error) {
    if (error instanceof PlaidWebhookVerificationError) throw error;
    fail();
  }
}

function configuredValue(
  env: (name: string) => string | undefined,
  name: string,
): string {
  const value = env(name);
  if (
    typeof value !== "string" || !value ||
    value.length > MAX_CREDENTIAL_LENGTH ||
    value.trim() !== value || hasAsciiControl(value)
  ) fail();
  return value;
}

function cancelWithoutWaiting(
  stream: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array>,
): void {
  // A stalled or adversarial stream may never settle its cancellation promise.
  try {
    void stream.cancel().catch(() => {});
  } catch {
    // Cleanup must not leak provider errors or extend the request deadline.
  }
}

async function readBoundedResponse(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const declaredLength = response.headers.get("content-length");
  if (
    signal.aborted || !response.ok || response.redirected ||
    contentType.length > 256 ||
    !/^application\/json(?:\s*;|$)/i.test(contentType) ||
    (declaredLength !== null && (
      !/^\d{1,10}$/.test(declaredLength) ||
      Number(declaredLength) > MAX_KEY_RESPONSE_BYTES
    ))
  ) {
    if (response.body) cancelWithoutWaiting(response.body);
    fail();
  }
  if (!response.body) fail();
  const reader = response.body.getReader();
  const bytes = new Uint8Array(MAX_KEY_RESPONSE_BYTES);
  let total = 0;
  let chunks = 0;
  let complete = false;
  const onAbort = () => cancelWithoutWaiting(reader);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (signal.aborted) fail();
      const chunk = await reader.read();
      if (signal.aborted) fail();
      if (chunk.done) {
        complete = true;
        break;
      }
      chunks += 1;
      if (
        chunks > MAX_KEY_RESPONSE_CHUNKS || !isRawBytes(chunk.value) ||
        total + chunk.value.byteLength > MAX_KEY_RESPONSE_BYTES
      ) fail();
      // Copy immediately: a stream source may reuse its chunk buffer.
      bytes.set(chunk.value, total);
      total += chunk.value.byteLength;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!complete && !signal.aborted) cancelWithoutWaiting(reader);
    reader.releaseLock();
  }
  return decodeUtf8(bytes.subarray(0, total));
}

interface ValidatedPlaidJwk extends JsonWebKey {
  alg: "ES256";
  crv: "P-256";
  kid: string;
  kty: "EC";
  use: "sig";
  x: string;
  y: string;
  createdAt: number;
}

async function fetchVerificationKey(
  keyId: string,
  fetcher: typeof fetch,
  env: (name: string) => string | undefined,
): Promise<ValidatedPlaidJwk> {
  const clientId = configuredValue(env, "PLAID_CLIENT_ID");
  const secret = configuredValue(env, "PLAID_SECRET");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new PlaidWebhookVerificationError());
      controller.abort();
    }, MAX_KEY_REQUEST_DURATION_MS);
  });
  const download = async (): Promise<string> => {
    const response = await fetcher(PLAID_PRODUCTION_VERIFICATION_KEY_URL, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
      body: JSON.stringify({ key_id: keyId }),
    });
    return await readBoundedResponse(response, controller.signal);
  };
  let responseText: string;
  try {
    // One deadline covers both headers and every body chunk. Promise.race also
    // bounds injected fetch implementations that ignore AbortSignal.
    responseText = await Promise.race([download(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  const envelope = parseUniqueJsonRecord(responseText);
  if (
    !exactKeys(envelope, ["key", "request_id"]) ||
    typeof envelope.request_id !== "string" || !envelope.request_id ||
    envelope.request_id.length > 256 || hasAsciiControl(envelope.request_id) ||
    !isRecord(envelope.key)
  ) fail();
  const key = envelope.key;
  if (
    !exactKeys(key, [
      "alg",
      "created_at",
      "crv",
      "expired_at",
      "kid",
      "kty",
      "use",
      "x",
      "y",
    ]) || key.alg !== "ES256" || key.crv !== "P-256" || key.kid !== keyId ||
    key.kty !== "EC" || key.use !== "sig" || key.expired_at !== null ||
    !Number.isSafeInteger(key.created_at) || (key.created_at as number) < 0 ||
    typeof key.x !== "string" || typeof key.y !== "string" ||
    decodeBase64Url(key.x, 32).byteLength !== 32 ||
    decodeBase64Url(key.y, 32).byteLength !== 32
  ) fail();
  return {
    alg: "ES256",
    crv: "P-256",
    kid: keyId,
    kty: "EC",
    use: "sig",
    x: key.x,
    y: key.y,
    createdAt: key.created_at as number,
  };
}

function lowercaseHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function constantTimeLowerHexEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length, 64);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function verify(
  rawBody: Uint8Array,
  verificationHeader: string,
  dependencies: PlaidWebhookVerificationDependencies,
): Promise<VerifiedPlaidWebhook> {
  if (
    !isRawBytes(rawBody) || rawBody.byteLength < 1 ||
    rawBody.byteLength > MAX_BODY_BYTES ||
    typeof verificationHeader !== "string" ||
    !verificationHeader || verificationHeader.length > MAX_JWT_LENGTH ||
    verificationHeader.trim() !== verificationHeader
  ) fail();

  // Own the bytes before the first await (or any injected dependency runs).
  // In particular, Buffer.slice() would retain the caller's mutable storage.
  const ownedRawBody = new Uint8Array(rawBody.byteLength);
  ownedRawBody.set(rawBody);

  const segments = verificationHeader.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) fail();
  const protectedHeader = parseUniqueJsonRecord(decodeUtf8(
    decodeBase64Url(segments[0], MAX_HEADER_BYTES),
  ));
  const protectedKeys = protectedHeader.typ === undefined
    ? ["alg", "kid"]
    : ["alg", "kid", "typ"];
  if (
    !exactKeys(protectedHeader, protectedKeys) ||
    protectedHeader.alg !== "ES256" ||
    (protectedHeader.typ !== undefined && protectedHeader.typ !== "JWT") ||
    typeof protectedHeader.kid !== "string" || !protectedHeader.kid ||
    protectedHeader.kid.length > MAX_KEY_ID_LENGTH ||
    !SAFE_KEY_ID.test(protectedHeader.kid)
  ) fail();
  const keyId = protectedHeader.kid;
  if (segments[1].length > Math.ceil(MAX_PAYLOAD_BYTES * 4 / 3) + 2) fail();
  const payloadBytes = decodeBase64Url(segments[1], MAX_PAYLOAD_BYTES);
  const signature = decodeBase64Url(segments[2], 64);
  if (signature.byteLength !== 64) fail();

  const runtime = globalThis as RuntimeGlobals;
  const env = dependencies.env ?? ((name) => runtime.Deno?.env?.get(name));
  const fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const webCrypto = dependencies.webCrypto ?? globalThis.crypto;
  if (!webCrypto?.subtle) fail();
  const jwk = await fetchVerificationKey(keyId, fetcher, env);
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await webCrypto.subtle.importKey(
      "jwk",
      {
        alg: jwk.alg,
        crv: jwk.crv,
        kty: jwk.kty,
        use: jwk.use,
        x: jwk.x,
        y: jwk.y,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    fail();
  }
  const signingInput = new TextEncoder().encode(
    `${segments[0]}.${segments[1]}`,
  );
  let signatureValid = false;
  try {
    signatureValid = await webCrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      signature,
      signingInput,
    );
  } catch {
    fail();
  }
  if (!signatureValid) fail();

  const claims = parseUniqueJsonRecord(decodeUtf8(payloadBytes));
  const now =
    (dependencies.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000)))();
  if (
    !Number.isSafeInteger(now) || now < 0 ||
    !Number.isSafeInteger(claims.iat) ||
    (claims.iat as number) < 0 || (claims.iat as number) > now ||
    now - (claims.iat as number) > MAX_WEBHOOK_AGE_SECONDS ||
    jwk.createdAt > (claims.iat as number) ||
    typeof claims.request_body_sha256 !== "string" ||
    !LOWER_SHA256.test(claims.request_body_sha256)
  ) fail();
  const digest = lowercaseHex(
    new Uint8Array(
      await webCrypto.subtle.digest("SHA-256", ownedRawBody),
    ),
  );
  if (!constantTimeLowerHexEqual(digest, claims.request_body_sha256)) fail();

  return Object.freeze({
    keyId,
    issuedAt: claims.iat as number,
    requestBodySha256: digest,
  });
}

/**
 * Verify one Plaid production webhook without parsing or trusting its body.
 * All failures intentionally collapse to one credential- and body-free error.
 */
export async function verifyPlaidWebhook(
  rawBody: Uint8Array,
  verificationHeader: string,
  dependencies: PlaidWebhookVerificationDependencies = {},
): Promise<VerifiedPlaidWebhook> {
  try {
    return await verify(rawBody, verificationHeader, dependencies);
  } catch {
    fail();
  }
}
