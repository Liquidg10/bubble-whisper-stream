import { resolveSupabasePublicConfig, type SupabasePublicEnvironment } from './config';

export const SHARED_PROJECT_REF = 'ekekeywoxvdbfbmqyhjy';
export const ISOLATED_PROJECT_REF = 'fjxedbaskrbewjunfxaj';
export const SHARED_APP_ORIGIN = 'https://bubble-whisper-stream.lovable.app';
const SHARED_PREVIEW_HOSTS = new Set([
  'id-preview--8d3041fb-8df4-4afe-87e4-b56a10af1d00.lovable.app',
  'preview--bubble-whisper-stream.lovable.app',
]);
const OWNER_LOCAL_ORIGINS = new Set(['http://localhost:4181', 'http://127.0.0.1:4181']);

export type DeploymentEnvironment = SupabasePublicEnvironment & Readonly<{
  VITE_MIND_MANUAL_DEPLOYMENT_MODE?: unknown;
  VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN?: unknown;
}>;
export type DeploymentBoundary = Readonly<{
  mode: 'shared' | 'owner-isolated';
  projectRef: string;
  origin: string | null;
}>;

type BoundaryError = 'partial-profile' | 'invalid-profile' | 'invalid-origin'
  | 'shared-origin-forbidden' | 'project-boundary-mismatch' | 'runtime-origin-mismatch';

function invalid(code: BoundaryError): never {
  // Never reflect configuration, keys, user identity, or browser URL in errors.
  throw new Error(`Mind Manual deployment boundary rejected (${code}).`);
}

export function assertAtomicDeploymentOverrides(environment: DeploymentEnvironment): void {
  const count = [environment.VITE_MIND_MANUAL_DEPLOYMENT_MODE,
    environment.VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN].filter(value => value !== undefined).length;
  if (count !== 0 && count !== 2) invalid('partial-profile');
}

function isolatedOrigin(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048 || raw !== raw.trim()) invalid('invalid-origin');
  let url: URL;
  try { url = new URL(raw); } catch { return invalid('invalid-origin'); }
  // Exact serialized origins only: no path, normalization, user info, default
  // port alias, query, fragment, trailing slash, trailing dot or encoded hostname.
  if (url.origin !== raw || url.username || url.password || url.hostname.endsWith('.')
    || url.hostname.includes('%') || url.hostname.length === 0) invalid('invalid-origin');
  if (raw === SHARED_APP_ORIGIN || SHARED_PREVIEW_HOSTS.has(url.hostname)) invalid('shared-origin-forbidden');
  if (OWNER_LOCAL_ORIGINS.has(raw)) return raw;
  if (url.protocol !== 'https:' || url.port || !url.hostname.includes('.')
    || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
    || /^\d+(?:\.\d+){3}$/u.test(url.hostname) || url.hostname.startsWith('[')) invalid('invalid-origin');
  return raw;
}

/** Configuration isolation, NOT user authorization or permission to cut over. */
export function resolveDeploymentBoundary(environment: DeploymentEnvironment): DeploymentBoundary {
  assertAtomicDeploymentOverrides(environment);
  const config = resolveSupabasePublicConfig(environment);
  if (environment.VITE_MIND_MANUAL_DEPLOYMENT_MODE === undefined) {
    if (config.projectRef !== SHARED_PROJECT_REF) invalid('project-boundary-mismatch');
    return Object.freeze({ mode: 'shared', projectRef: config.projectRef, origin: null });
  }
  if (environment.VITE_MIND_MANUAL_DEPLOYMENT_MODE !== 'owner-isolated') invalid('invalid-profile');
  const origin = isolatedOrigin(environment.VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN);
  if (config.projectRef !== ISOLATED_PROJECT_REF) invalid('project-boundary-mismatch');
  return Object.freeze({ mode: 'owner-isolated', projectRef: config.projectRef, origin });
}

export function assertDeploymentOrigin(boundary: DeploymentBoundary, actualOrigin: string | undefined): void {
  // Isolated builds cannot run on the shared app, a copied host, a sandboxed
  // opaque origin, or without a browser origin. Never redirect or fall back.
  if (boundary.mode === 'owner-isolated' && actualOrigin !== boundary.origin) invalid('runtime-origin-mismatch');
}

export function buildDeploymentEnvironment(environment: DeploymentEnvironment): DeploymentEnvironment {
  return Object.freeze({
    VITE_SUPABASE_PROJECT_ID: environment.VITE_SUPABASE_PROJECT_ID,
    VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_MIND_MANUAL_DEPLOYMENT_MODE: environment.VITE_MIND_MANUAL_DEPLOYMENT_MODE,
    VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: environment.VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN,
  });
}
