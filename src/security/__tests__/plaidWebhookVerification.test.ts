import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  PLAID_WEBHOOK_VERIFICATION_KEY_URL,
  PLAID_WEBHOOK_VERIFICATION_LIMITS,
  type PlaidWebhookVerificationDependencies,
  PlaidWebhookVerificationError,
  verifyPlaidWebhook,
} from "../../../supabase/functions/_shared/plaidWebhookVerification.ts";

const cryptoApi = webcrypto as unknown as Crypto;
const encoder = new TextEncoder();
const NOW = 1_788_000_000;
const KID = "bfbd5111-8e33-4643-8ced-b2e642a72f3c";
const CLIENT_ID = "test-production-client";
const SECRET = "test-production-secret";
const BODY_TEXT =
  '{\n  "webhook_type": "TRANSACTIONS",\n  "item_id": "item-production-1"\n}';
const BODY = encoder.encode(BODY_TEXT);

let signingKeys: CryptoKeyPair;
let otherSigningKeys: CryptoKeyPair;
let xCoordinate: string;
let yCoordinate: string;

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function jsonSegment(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

function rawSegment(value: string): string {
  return base64Url(encoder.encode(value));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  return Buffer.from(
    await cryptoApi.subtle.digest("SHA-256", ownedBytes),
  ).toString("hex");
}

async function signSegments(
  protectedSegment: string,
  payloadSegment: string,
  privateKey: CryptoKey = signingKeys.privateKey,
): Promise<string> {
  const signingInput = `${protectedSegment}.${payloadSegment}`;
  const signature = new Uint8Array(
    await cryptoApi.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      encoder.encode(signingInput),
    ),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

async function signedToken({
  body = BODY,
  header = { alg: "ES256", kid: KID, typ: "JWT" },
  claims,
  protectedText,
  payloadText,
  privateKey,
}: {
  body?: Uint8Array;
  header?: Record<string, unknown>;
  claims?: Record<string, unknown>;
  protectedText?: string;
  payloadText?: string;
  privateKey?: CryptoKey;
} = {}): Promise<string> {
  const protectedSegment = protectedText === undefined
    ? jsonSegment(header)
    : rawSegment(protectedText);
  const payloadSegment = payloadText === undefined
    ? jsonSegment(
      claims ?? {
        iat: NOW - 60,
        request_body_sha256: await sha256Hex(body),
      },
    )
    : rawSegment(payloadText);
  return await signSegments(protectedSegment, payloadSegment, privateKey);
}

function keyEnvelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    key: {
      alg: "ES256",
      created_at: NOW - 3600,
      crv: "P-256",
      expired_at: null,
      kid: KID,
      kty: "EC",
      use: "sig",
      x: xCoordinate,
      y: yCoordinate,
      ...overrides,
    },
    request_id: "plaid-test-request",
  };
}

function responseFor(
  envelope: Record<string, unknown> = keyEnvelope(),
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
}

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    PLAID_CLIENT_ID: CLIENT_ID,
    PLAID_SECRET: SECRET,
    ...overrides,
  };
  return (name: string) => values[name];
}

function dependencies(
  fetcher: typeof fetch,
  overrides: Partial<PlaidWebhookVerificationDependencies> = {},
): PlaidWebhookVerificationDependencies {
  return {
    fetch: fetcher,
    env: environment(),
    nowEpochSeconds: () => NOW,
    webCrypto: cryptoApi,
    ...overrides,
  };
}

async function expectVerificationFailure(operation: () => Promise<unknown>) {
  const error = await operation().then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(PlaidWebhookVerificationError);
  expect(error).toMatchObject({
    code: "PLAID_WEBHOOK_VERIFICATION_FAILED",
    message: "Plaid webhook verification failed",
  });
  return error as PlaidWebhookVerificationError;
}

beforeAll(async () => {
  signingKeys = await cryptoApi.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  otherSigningKeys = await cryptoApi.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicJwk = await cryptoApi.subtle.exportKey(
    "jwk",
    signingKeys.publicKey,
  );
  xCoordinate = String(publicJwk.x);
  yCoordinate = String(publicJwk.y);
});

describe("Plaid production webhook verification", () => {
  it("verifies the exact raw bytes with the exact production key request", async () => {
    const token = await signedToken();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(PLAID_WEBHOOK_VERIFICATION_KEY_URL);
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(init?.signal?.aborted).toBe(false);
      expect(JSON.parse(String(init?.body))).toEqual({ key_id: KID });
      const headers = new Headers(init?.headers);
      expect(headers.get("plaid-client-id")).toBe(CLIENT_ID);
      expect(headers.get("plaid-secret")).toBe(SECRET);
      expect(headers.get("content-type")).toBe("application/json");
      return responseFor();
    });

    const verified = await verifyPlaidWebhook(
      BODY,
      token,
      dependencies(fetcher),
    );
    expect(verified).toEqual({
      keyId: KID,
      issuedAt: NOW - 60,
      requestBodySha256: await sha256Hex(BODY),
    });
    expect(Object.isFrozen(verified)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const reserialized = encoder.encode(JSON.stringify(JSON.parse(BODY_TEXT)));
    await expectVerificationFailure(() =>
      verifyPlaidWebhook(reserialized, token, dependencies(fetcher))
    );
  });

  it("accepts the documented header without typ but no unsupported protected fields", async () => {
    const token = await signedToken({ header: { alg: "ES256", kid: KID } });
    await expect(verifyPlaidWebhook(
      BODY,
      token,
      dependencies(vi.fn(async () => responseFor())),
    )).resolves.toMatchObject({ keyId: KID });
  });

  it("snapshots caller-owned bytes before key retrieval, including Buffer slices", async () => {
    const token = await signedToken();
    const storage = Buffer.concat([Buffer.from("prefix"), Buffer.from(BODY)]);
    const mutableBody = storage.subarray(6);
    const fetcher = vi.fn<typeof fetch>(async () => {
      mutableBody.fill(0);
      return responseFor();
    });
    await expect(verifyPlaidWebhook(mutableBody, token, dependencies(fetcher)))
      .resolves.toMatchObject({ requestBodySha256: await sha256Hex(BODY) });
    expect(mutableBody.every((byte) => byte === 0)).toBe(true);

    const initiallyWrongBody = new Uint8Array(BODY.byteLength);
    const repairingFetcher = vi.fn<typeof fetch>(async () => {
      initiallyWrongBody.set(BODY);
      return responseFor();
    });
    await expectVerificationFailure(() =>
      verifyPlaidWebhook(initiallyWrongBody, token, dependencies(repairingFetcher))
    );
  });

  it("bounds a key fetch that ignores abort and cancels any late response", async () => {
    const token = await signedToken();
    let resolveResponse!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { resolveResponse = resolve; });
    });
    vi.useFakeTimers();
    try {
      const failure = expectVerificationFailure(() =>
        verifyPlaidWebhook(BODY, token, dependencies(fetcher))
      );
      await vi.advanceTimersByTimeAsync(
        PLAID_WEBHOOK_VERIFICATION_LIMITS.maxKeyRequestDurationMs,
      );
      await failure;
      expect(requestSignal?.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);

      const cancel = vi.fn(() => new Promise<void>(() => {}));
      resolveResponse(new Response(new ReadableStream({ cancel }), {
        headers: { "Content-Type": "application/json" },
      }));
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses one deadline across response headers and a stalled body without awaiting cancellation", async () => {
    const token = await signedToken();
    let resolveResponse!: (response: Response) => void;
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    vi.useFakeTimers();
    try {
      const failure = expectVerificationFailure(() =>
        verifyPlaidWebhook(BODY, token, dependencies(fetcher))
      );
      const duration = PLAID_WEBHOOK_VERIFICATION_LIMITS.maxKeyRequestDurationMs;
      await vi.advanceTimersByTimeAsync(duration - 1);
      resolveResponse(new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(encoder.encode('{"key":')); },
        cancel,
      }), { headers: { "Content-Type": "application/json" } }));
      await vi.advanceTimersByTimeAsync(1);
      await failure;
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds zero-byte stream chunks and does not wait for cancellation", async () => {
    const token = await signedToken();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new Uint8Array());
    });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
      { headers: { "Content-Type": "application/json" } },
    ));
    await expectVerificationFailure(() =>
      verifyPlaidWebhook(BODY, token, dependencies(fetcher))
    );
    expect(pull).toHaveBeenCalledTimes(
      PLAID_WEBHOOK_VERIFICATION_LIMITS.maxKeyResponseChunks + 1,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("owns each response chunk before the stream source reuses its buffer", async () => {
    const token = await signedToken();
    const responseBytes = encoder.encode(JSON.stringify(keyEnvelope()));
    const reusableByte = new Uint8Array(1);
    let offset = 0;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === responseBytes.length) {
            reusableByte[0] = 0;
            controller.close();
            return;
          }
          reusableByte[0] = responseBytes[offset++];
          controller.enqueue(reusableByte);
        },
      }, { highWaterMark: 0 }),
      { headers: { "Content-Type": "application/json" } },
    ));
    await expect(verifyPlaidWebhook(BODY, token, dependencies(fetcher)))
      .resolves.toMatchObject({ keyId: KID });
  });

  it.each(["", "-1", "+1", "1e2", "0.5", "32769", "1".repeat(257)])(
    "rejects and cancels malformed or excessive response lengths: %j",
    async (declaredLength) => {
      const token = await signedToken();
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const fetcher = vi.fn<typeof fetch>(async () => new Response(
        new ReadableStream({ cancel }),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": declaredLength,
          },
        },
      ));
      await expectVerificationFailure(() =>
        verifyPlaidWebhook(BODY, token, dependencies(fetcher))
      );
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts exactly the five-minute window and key creation boundary", async () => {
    const issuedAt = NOW - PLAID_WEBHOOK_VERIFICATION_LIMITS.maxWebhookAgeSeconds;
    const token = await signedToken({
      claims: { iat: issuedAt, request_body_sha256: await sha256Hex(BODY) },
    });
    await expect(verifyPlaidWebhook(BODY, token, dependencies(
      vi.fn(async () => responseFor(keyEnvelope({ created_at: issuedAt }))),
    ))).resolves.toMatchObject({ issuedAt });
  });

  it("rejects noncanonical signature encoding before retrieving a key", async () => {
    const token = await signedToken();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastIndex = alphabet.indexOf(token.at(-1)!);
    const noncanonical = token.slice(0, -1) + alphabet[lastIndex + 1];
    expect(Buffer.from(noncanonical.split(".")[2], "base64url"))
      .toEqual(Buffer.from(token.split(".")[2], "base64url"));
    const fetcher = vi.fn<typeof fetch>();
    await expectVerificationFailure(() =>
      verifyPlaidWebhook(BODY, noncanonical, dependencies(fetcher))
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("clears the key deadline after successful retrieval and early provider rejection", async () => {
    const token = await signedToken();
    vi.useFakeTimers();
    try {
      await expect(verifyPlaidWebhook(BODY, token, dependencies(
        vi.fn(async () => responseFor()),
      ))).resolves.toMatchObject({ keyId: KID });
      expect(vi.getTimerCount()).toBe(0);
      await expectVerificationFailure(() => verifyPlaidWebhook(
        BODY,
        token,
        dependencies(vi.fn(async () => new Response(null, { status: 503 }))),
      ));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed, ambiguous, or unsupported protected headers before key fetch", async () => {
    const signature = base64Url(new Uint8Array(64));
    const payload = jsonSegment({
      iat: NOW,
      request_body_sha256: "a".repeat(64),
    });
    const compact = (headerText: string) =>
      `${rawSegment(headerText)}.${payload}.${signature}`;
    const cases = [
      "",
      "one.segment",
      `one.two.three.four`,
      ` ${compact(JSON.stringify({ alg: "ES256", kid: KID }))}`,
      `${
        rawSegment(JSON.stringify({ alg: "ES256", kid: KID }))
      }=.${payload}.${signature}`,
      compact("[]"),
      compact(`{"alg":"ES256","alg":"ES256","kid":"${KID}"}`),
      compact(`{"alg":"ES256","kid":"${KID}","kid":"${KID}"}`),
      compact(`{"alg":"ES256","kid":"${KID}","k\\u0069d":"${KID}"}`),
      compact(JSON.stringify({ alg: "RS256", kid: KID })),
      compact(JSON.stringify({ alg: "ES256", kid: KID, typ: "jwt" })),
      compact(
        JSON.stringify({ alg: "ES256", kid: KID, jku: "https://evil.invalid" }),
      ),
      compact(JSON.stringify({ alg: "ES256", kid: "" })),
      compact(JSON.stringify({ alg: "ES256", kid: "space kid" })),
      compact(JSON.stringify({ alg: "ES256", kid: "k".repeat(129) })),
      compact(`{"alg":"ES256","kid":"${KID}","__proto__":{}}`),
      `${"a".repeat(PLAID_WEBHOOK_VERIFICATION_LIMITS.maxJwtLength + 1)}.b.c`,
    ];
    for (const value of cases) {
      const fetcher = vi.fn<typeof fetch>();
      await expectVerificationFailure(() =>
        verifyPlaidWebhook(BODY, value, dependencies(fetcher))
      );
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["substituted kid", { kid: "another-production-key" }],
    ["wrong algorithm", { alg: "RS256" }],
    ["wrong curve", { crv: "P-384" }],
    ["wrong key type", { kty: "RSA" }],
    ["non-signing use", { use: "enc" }],
    ["retired key", { expired_at: NOW + 600 }],
    ["negative creation time", { created_at: -1 }],
    ["fractional creation time", { created_at: NOW - 0.5 }],
    ["invalid x coordinate", { x: base64Url(new Uint8Array(31)) }],
    ["invalid y coordinate", { y: "not+base64url" }],
    ["unknown JWK member", { key_ops: ["verify"] }],
  ])("rejects a %s", async (_label, override) => {
    const token = await signedToken();
    await expectVerificationFailure(() =>
      verifyPlaidWebhook(
        BODY,
        token,
        dependencies(vi.fn(async () => responseFor(keyEnvelope(override)))),
      )
    );
  });

  it("rejects duplicate key fields, redirects, non-JSON, and oversize key responses", async () => {
    const token = await signedToken();
    const duplicateKey = `{"key":{"alg":"ES256","alg":"ES256","created_at":${
      NOW - 1
    },"crv":"P-256","expired_at":null,"kid":"${KID}","kty":"EC","use":"sig","x":"${xCoordinate}","y":"${yCoordinate}"},"request_id":"duplicate"}`;
    const responses = [
      new Response(duplicateKey, {
        headers: { "Content-Type": "application/json" },
      }),
      new Response(null, {
        status: 302,
        headers: { Location: "https://sandbox.plaid.com" },
      }),
      new Response(JSON.stringify(keyEnvelope()), {
        headers: { "Content-Type": "text/plain" },
      }),
      new Response("x".repeat(32 * 1024 + 1), {
        headers: { "Content-Type": "application/json" },
      }),
    ];
    for (const response of responses) {
      const fetcher = vi.fn(async () => response);
      await expectVerificationFailure(() =>
        verifyPlaidWebhook(BODY, token, dependencies(fetcher))
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects signature substitution, stale/future time, key chronology, and bad hashes", async () => {
    const bodyHash = await sha256Hex(BODY);
    const cases: Array<{ token: string; key?: Record<string, unknown> }> = [
      { token: await signedToken({ privateKey: otherSigningKeys.privateKey }) },
      {
        token: await signedToken({
          claims: { iat: NOW - 301, request_body_sha256: bodyHash },
        }),
      },
      {
        token: await signedToken({
          claims: { iat: NOW + 1, request_body_sha256: bodyHash },
        }),
      },
      {
        token: await signedToken({
          claims: { iat: NOW - 0.5, request_body_sha256: bodyHash },
        }),
      },
      {
        token: await signedToken({
          claims: {
            iat: NOW - 60,
            request_body_sha256: bodyHash.toUpperCase(),
          },
        }),
      },
      { token: await signedToken({ claims: { iat: NOW - 60 } }) },
      { token: await signedToken(), key: { created_at: NOW } },
      {
        token: await signedToken({
          payloadText: `{"iat":${NOW - 60},"iat":${
            NOW - 60
          },"request_body_sha256":"${bodyHash}"}`,
        }),
      },
      {
        token: await signedToken({
          payloadText: `{"iat":${
            NOW - 60
          },"request_body_sha256":"${bodyHash}","request_body_sha256":"${bodyHash}"}`,
        }),
      },
      {
        token: await signedToken({
          payloadText: `{"iat":${
            NOW - 60
          },"request_body_sha256":"${bodyHash}","extra":{"a":1,"a":2}}`,
        }),
      },
    ];
    for (const entry of cases) {
      await expectVerificationFailure(() =>
        verifyPlaidWebhook(
          BODY,
          entry.token,
          dependencies(vi.fn(async () => responseFor(keyEnvelope(entry.key)))),
        )
      );
    }
  });

  it("bounds the body and collapses configuration/provider failures without leaking input", async () => {
    const token = await signedToken();
    const providerDetail = `${SECRET}:${BODY_TEXT}`;
    const throwingFetcher = vi.fn<typeof fetch>(async () => {
      throw new Error(providerDetail);
    });
    const error = await expectVerificationFailure(() =>
      verifyPlaidWebhook(BODY, token, dependencies(throwingFetcher))
    );
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain("item-production-1");
    expect(throwingFetcher).toHaveBeenCalledTimes(1);

    const noCredentialFetch = vi.fn<typeof fetch>();
    await expectVerificationFailure(() =>
      verifyPlaidWebhook(
        BODY,
        token,
        dependencies(noCredentialFetch, {
          env: environment({ PLAID_SECRET: undefined }),
        }),
      )
    );
    expect(noCredentialFetch).not.toHaveBeenCalled();

    for (
      const invalidBody of [
        new Uint8Array(),
        new Uint8Array(PLAID_WEBHOOK_VERIFICATION_LIMITS.maxBodyBytes + 1),
        new Uint8Array(new SharedArrayBuffer(BODY.byteLength)),
        "not raw bytes" as unknown as Uint8Array,
      ]
    ) {
      const fetcher = vi.fn<typeof fetch>();
      await expectVerificationFailure(() =>
        verifyPlaidWebhook(invalidBody, token, dependencies(fetcher))
      );
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
});
