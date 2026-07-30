const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export const DEFAULT_DEV_HOST = '127.0.0.1';

export function resolveDevHost(requestedHost = process.env.VITE_DEV_HOST): string {
  if (!requestedHost) return DEFAULT_DEV_HOST;

  if (!LOOPBACK_HOSTS.has(requestedHost)) {
    console.warn(
      `[security] VITE_DEV_HOST=${requestedHost} exposes the Vite dev server beyond loopback. ` +
      'Review GHSA-4w7w-66w2-5vf9, GHSA-v6wh-96g9-6wx3, and GHSA-fx2h-pf6j-xcff before continuing.'
    );
  }

  return requestedHost;
}
