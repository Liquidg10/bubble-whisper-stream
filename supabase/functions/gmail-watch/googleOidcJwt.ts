export interface GooglePubSubOidcClaims {
  aud: string;
  email: string;
  email_verified: true;
  exp: number;
  iat: number;
  iss: "accounts.google.com" | "https://accounts.google.com";
  sub: string;
  [key: string]: unknown;
}

export interface GooglePubSubOidcVerificationOptions {
  expectedAudience: string;
  expectedServiceAccountEmail: string;
  fetcher?: typeof fetch;
  nowEpochSeconds?: number;
}

export class GoogleOidcVerificationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

interface GoogleJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface CachedJwks {
  keys: GoogleJwk[];
  expiresAt: number;
}

let jwksCache: CachedJwks | null = null;
const GOOGLE_OIDC_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const MAX_TOKEN_LENGTH = 16 * 1024;
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_AGE_SECONDS = 60 * 60 + CLOCK_SKEW_SECONDS;

function decodeBase64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new GoogleOidcVerificationError(
      "OIDC token encoding is invalid",
      "OIDC_TOKEN_INVALID",
    );
  }
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new GoogleOidcVerificationError(
      "OIDC token encoding is invalid",
      "OIDC_TOKEN_INVALID",
    );
  }
}

function decodeJsonSegment(value: string): Record<string, unknown> {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      decodeBase64UrlBytes(value),
    );
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    ) throw new Error();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GoogleOidcVerificationError) throw error;
    throw new GoogleOidcVerificationError(
      "OIDC token JSON is invalid",
      "OIDC_TOKEN_INVALID",
    );
  }
}

function parseMaxAge(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Math.min(Number(match[1]), 24 * 60 * 60) : 60 * 60;
}

async function loadGoogleJwks(
  fetcher: typeof fetch,
  nowMilliseconds: number,
): Promise<GoogleJwk[]> {
  if (jwksCache && jwksCache.expiresAt > nowMilliseconds) return jwksCache.keys;

  let response: Response;
  try {
    response = await fetcher(GOOGLE_OIDC_JWKS_URL, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new GoogleOidcVerificationError(
      "Google signing keys are unavailable",
      "OIDC_JWKS_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    throw new GoogleOidcVerificationError(
      "Google signing keys are unavailable",
      "OIDC_JWKS_UNAVAILABLE",
    );
  }

  const body = await response.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as { keys?: unknown }).keys)
  ) {
    throw new GoogleOidcVerificationError(
      "Google signing keys are invalid",
      "OIDC_JWKS_INVALID",
    );
  }

  const keys = (body as { keys: GoogleJwk[] }).keys.filter((key) =>
    key && key.kty === "RSA" && typeof key.kid === "string"
  );
  if (!keys.length) {
    throw new GoogleOidcVerificationError(
      "Google signing keys are invalid",
      "OIDC_JWKS_INVALID",
    );
  }

  jwksCache = {
    keys,
    expiresAt: nowMilliseconds +
      parseMaxAge(response.headers.get("cache-control")) * 1000,
  };
  return keys;
}

function requireConfiguredValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new GoogleOidcVerificationError(
      `${name} is required`,
      "OIDC_CONFIG_MISSING",
    );
  }
  return normalized;
}

export function extractOidcBearerToken(
  authorization: string | null,
): string | null {
  if (!authorization) return null;
  const match = authorization.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/,
  );
  return match?.[1] ?? null;
}

export async function verifyGooglePubSubOidcJwt(
  token: string,
  options: GooglePubSubOidcVerificationOptions,
): Promise<GooglePubSubOidcClaims> {
  const expectedAudience = requireConfiguredValue(
    options.expectedAudience,
    "GMAIL_PUBSUB_PUSH_AUDIENCE",
  );
  const expectedEmail = requireConfiguredValue(
    options.expectedServiceAccountEmail,
    "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
  ).toLowerCase();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new GoogleOidcVerificationError(
      "OIDC bearer token is invalid",
      "OIDC_TOKEN_INVALID",
    );
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new GoogleOidcVerificationError(
      "OIDC bearer token is invalid",
      "OIDC_TOKEN_INVALID",
    );
  }
  const header = decodeJsonSegment(segments[0]);
  const claims = decodeJsonSegment(segments[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new GoogleOidcVerificationError(
      "OIDC signing algorithm is invalid",
      "OIDC_HEADER_INVALID",
    );
  }

  const now = options.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const keys = await loadGoogleJwks(options.fetcher ?? fetch, now * 1000);
  const signingKey = keys.find((key) =>
    key.kid === header.kid &&
    (!key.alg || key.alg === "RS256") &&
    (!key.use || key.use === "sig")
  );
  if (!signingKey) {
    // Keep the bounded cache on an unknown kid. Clearing it here would let an
    // unsigned caller force a Google JWKS fetch on every other request. Google
    // publishes overlapping keys; a genuine rotation is retried after max-age.
    throw new GoogleOidcVerificationError(
      "OIDC signing key was not found",
      "OIDC_KEY_NOT_FOUND",
    );
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      signingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new GoogleOidcVerificationError(
      "OIDC signing key is invalid",
      "OIDC_JWKS_INVALID",
    );
  }

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    decodeBase64UrlBytes(segments[2]),
    new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
  );
  if (!verified) {
    throw new GoogleOidcVerificationError(
      "OIDC signature verification failed",
      "OIDC_SIGNATURE_INVALID",
    );
  }

  const issuer = claims.iss;
  if (
    issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com"
  ) {
    throw new GoogleOidcVerificationError(
      "OIDC issuer is invalid",
      "OIDC_CLAIMS_INVALID",
    );
  }
  if (claims.aud !== expectedAudience) {
    throw new GoogleOidcVerificationError(
      "OIDC audience is invalid",
      "OIDC_AUDIENCE_MISMATCH",
    );
  }
  if (
    typeof claims.email !== "string" ||
    claims.email.toLowerCase() !== expectedEmail ||
    claims.email_verified !== true
  ) {
    throw new GoogleOidcVerificationError(
      "OIDC service account is invalid",
      "OIDC_EMAIL_MISMATCH",
    );
  }
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.exp !== "number" ||
    !Number.isInteger(claims.exp) ||
    typeof claims.iat !== "number" ||
    !Number.isInteger(claims.iat) ||
    claims.exp < now - CLOCK_SKEW_SECONDS ||
    claims.iat > now + CLOCK_SKEW_SECONDS ||
    now - claims.iat > MAX_TOKEN_AGE_SECONDS ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > MAX_TOKEN_AGE_SECONDS
  ) {
    throw new GoogleOidcVerificationError(
      "OIDC time claims are invalid",
      "OIDC_CLAIMS_INVALID",
    );
  }

  return claims as unknown as GooglePubSubOidcClaims;
}

export function resetGoogleOidcJwksCacheForTest(): void {
  jwksCache = null;
}
