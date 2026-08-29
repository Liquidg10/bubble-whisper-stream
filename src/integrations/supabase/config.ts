export type SupabasePublicEnvironment = Readonly<{
  VITE_SUPABASE_PROJECT_ID?: unknown;
  VITE_SUPABASE_URL?: unknown;
  VITE_SUPABASE_PUBLISHABLE_KEY?: unknown;
}>;

export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
  projectRef: string;
}>;

type ConfigErrorCode =
  | 'partial-environment-override'
  | 'missing-project-id'
  | 'missing-url'
  | 'missing-publishable-key'
  | 'invalid-project-id'
  | 'invalid-url'
  | 'invalid-project-url'
  | 'invalid-publishable-key'
  | 'unsafe-key-role'
  | 'project-ref-mismatch';

const PROJECT_HOSTNAME_PATTERN = /^([a-z0-9]{20})\.supabase\.co$/u;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u;
const OPAQUE_PUBLISHABLE_KEY_PATTERN =
  /^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/u;
const LEGACY_HS256_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

class SupabasePublicConfigError extends Error {
  constructor(code: ConfigErrorCode) {
    // Configuration errors deliberately contain neither environment values nor
    // key fragments. They can safely reach build logs and browser diagnostics.
    super(`Supabase public configuration is invalid (${code}).`);
    this.name = 'SupabasePublicConfigError';
  }
}

export function assertAtomicSupabasePublicOverrides(
  environment: SupabasePublicEnvironment,
): void {
  const suppliedValueCount = [
    environment.VITE_SUPABASE_PROJECT_ID,
    environment.VITE_SUPABASE_URL,
    environment.VITE_SUPABASE_PUBLISHABLE_KEY,
  ].filter((value) => value !== undefined).length;

  if (suppliedValueCount !== 0 && suppliedValueCount !== 3) {
    throw new SupabasePublicConfigError('partial-environment-override');
  }
}

function requireEnvironmentValue(
  value: unknown,
  missingCode: Extract<
    ConfigErrorCode,
    'missing-project-id' | 'missing-url' | 'missing-publishable-key'
  >,
): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new SupabasePublicConfigError(missingCode);
  }

  return value;
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  if (!BASE64URL_SEGMENT_PATTERN.test(segment) || segment.length % 4 === 1) {
    throw new SupabasePublicConfigError('invalid-publishable-key');
  }

  const normalized = segment.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let decoded = '';

  for (let index = 0; index < padded.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(padded[index]);
    const second = BASE64_ALPHABET.indexOf(padded[index + 1]);
    const third = padded[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(padded[index + 2]);
    const fourth = padded[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(padded[index + 3]);

    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new SupabasePublicConfigError('invalid-publishable-key');
    }

    decoded += String.fromCharCode((first << 2) | (second >> 4));
    if (padded[index + 2] !== '=') {
      decoded += String.fromCharCode(((second & 15) << 4) | (third >> 2));
    }
    if (padded[index + 3] !== '=') {
      decoded += String.fromCharCode(((third & 3) << 6) | fourth);
    }
  }

  try {
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new SupabasePublicConfigError('invalid-publishable-key');
  }
}

function assertLegacyAnonKeyMatchesProject(key: string, projectRef: string): void {
  const segments = key.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw new SupabasePublicConfigError('invalid-publishable-key');
  }

  const header = decodeBase64UrlJson(segments[0]);
  const claims = decodeBase64UrlJson(segments[1]);

  if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== 'supabase') {
    throw new SupabasePublicConfigError('invalid-publishable-key');
  }
  if (claims.role !== 'anon') {
    throw new SupabasePublicConfigError('unsafe-key-role');
  }
  if (claims.ref !== projectRef) {
    throw new SupabasePublicConfigError('project-ref-mismatch');
  }
  if (!LEGACY_HS256_SIGNATURE_PATTERN.test(segments[2])) {
    throw new SupabasePublicConfigError('invalid-publishable-key');
  }
}

export function resolveSupabasePublicConfig(
  environment: SupabasePublicEnvironment,
): SupabasePublicConfig {
  const expectedProjectRef = requireEnvironmentValue(
    environment.VITE_SUPABASE_PROJECT_ID,
    'missing-project-id',
  );
  const rawUrl = requireEnvironmentValue(environment.VITE_SUPABASE_URL, 'missing-url');
  const publishableKey = requireEnvironmentValue(
    environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    'missing-publishable-key',
  );

  if (!PROJECT_REF_PATTERN.test(expectedProjectRef)) {
    throw new SupabasePublicConfigError('invalid-project-id');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new SupabasePublicConfigError('invalid-url');
  }

  const hostnameMatch = PROJECT_HOSTNAME_PATTERN.exec(parsedUrl.hostname);
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    parsedUrl.port !== '' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== '' ||
    !hostnameMatch
  ) {
    throw new SupabasePublicConfigError('invalid-project-url');
  }

  const projectRef = hostnameMatch[1];
  if (expectedProjectRef !== projectRef) {
    throw new SupabasePublicConfigError('project-ref-mismatch');
  }

  if (publishableKey.startsWith('sb_')) {
    // Modern publishable keys are intentionally opaque rather than JWTs. Their
    // low-privilege prefix is the only project metadata available offline.
    if (!OPAQUE_PUBLISHABLE_KEY_PATTERN.test(publishableKey)) {
      throw new SupabasePublicConfigError('invalid-publishable-key');
    }
  } else {
    // Legacy anonymous keys carry a project ref, so reject mixed project pairs
    // before createClient can send a request to the wrong project.
    assertLegacyAnonKeyMatchesProject(publishableKey, projectRef);
  }

  return Object.freeze({
    url: parsedUrl.origin,
    publishableKey,
    projectRef,
  });
}
