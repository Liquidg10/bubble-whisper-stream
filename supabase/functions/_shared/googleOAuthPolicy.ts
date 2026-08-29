export const GOOGLE_IDENTITY_SCOPES = Object.freeze([
  "openid",
  "email",
  "profile",
]);

export const GOOGLE_GMAIL_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
]);

export const DEFAULT_GMAIL_SCOPE = GOOGLE_GMAIL_SCOPES[0];

export const ALLOWED_GOOGLE_OAUTH_ORIGINS = Object.freeze([
  "https://bubble-whisper-stream.lovable.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://localhost:3000",
]);

const ALLOWED_ORIGIN_SET = new Set<string>(ALLOWED_GOOGLE_OAUTH_ORIGINS);
const ALLOWED_GMAIL_SCOPE_SET = new Set<string>(GOOGLE_GMAIL_SCOPES);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GoogleOAuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleOAuthRequestError";
  }
}

export interface GoogleOAuthStartRequest {
  accountId: string | null;
  requestedScopes: string[];
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseScopes(value: unknown): string[] {
  if (value === undefined || value === null || value === "") {
    return [DEFAULT_GMAIL_SCOPE];
  }
  if (typeof value !== "string") {
    throw new GoogleOAuthRequestError("OAuth scope must be a string", 400);
  }

  const scopes = Array.from(new Set(value.split(/\s+/).filter(Boolean)));
  if (scopes.length === 0) return [DEFAULT_GMAIL_SCOPE];
  if (scopes.some((scope) => !ALLOWED_GMAIL_SCOPE_SET.has(scope))) {
    throw new GoogleOAuthRequestError(
      "Unsupported Gmail OAuth scope requested",
      400,
    );
  }
  return scopes;
}

export function parseGoogleOAuthStartRequest(
  value: unknown,
): GoogleOAuthStartRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleOAuthRequestError("Invalid request body", 400);
  }

  const body = value as Record<string, unknown>;
  if (body.service !== "email") {
    throw new GoogleOAuthRequestError(
      "Only Gmail OAuth is supported by this endpoint",
      400,
    );
  }

  let accountId: string | null = null;
  if (
    body.accountId !== undefined && body.accountId !== null &&
    body.accountId !== ""
  ) {
    if (!isUuid(body.accountId)) {
      throw new GoogleOAuthRequestError("Invalid OAuth account ID", 400);
    }
    accountId = body.accountId;
  }

  return {
    accountId,
    requestedScopes: parseScopes(body.scope),
  };
}

export function requireAllowedGoogleOAuthOrigin(origin: string | null): string {
  if (!origin || !ALLOWED_ORIGIN_SET.has(origin)) {
    throw new GoogleOAuthRequestError("Origin is not allowed", 403);
  }
  return origin;
}

export function getGoogleOAuthRedirectUri(origin: string): string {
  requireAllowedGoogleOAuthOrigin(origin);
  return `${origin}/oauth-callback`;
}

export function googleOAuthCorsHeaders(
  origin: string,
): Record<string, string> {
  requireAllowedGoogleOAuthOrigin(origin);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export function combineGoogleOAuthScopes(
  existingScopes: Iterable<string>,
  requestedScopes: Iterable<string>,
): string[] {
  const allowed = new Set<string>([
    ...GOOGLE_IDENTITY_SCOPES,
    ...GOOGLE_GMAIL_SCOPES,
  ]);
  const combined = new Set<string>(GOOGLE_IDENTITY_SCOPES);

  for (const scope of [...existingScopes, ...requestedScopes]) {
    if (allowed.has(scope)) combined.add(scope);
  }

  return Array.from(combined).sort();
}
