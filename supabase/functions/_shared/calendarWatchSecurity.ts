export type CalendarWatchAction = 'setup' | 'renew' | 'stop';

export type CalendarAccountIdResult =
  | { ok: true; calendarAccountId: string }
  | { ok: false; reason: string };

const CALENDAR_WATCH_ACTIONS = new Set<CalendarWatchAction>([
  'setup',
  'renew',
  'stop',
]);

const GLOBAL_ACCOUNT_SENTINELS = new Set(['*', 'all', 'global', 'null', 'undefined']);

export function isCalendarWatchAction(value: unknown): value is CalendarWatchAction {
  return typeof value === 'string' && CALENDAR_WATCH_ACTIONS.has(value as CalendarWatchAction);
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export function isExactServiceRoleBearer(
  authorizationHeader: string | null,
  serviceRoleKey: string | undefined,
): boolean {
  if (!serviceRoleKey) return false;
  return extractBearerToken(authorizationHeader) === serviceRoleKey;
}

export function requireCalendarWatchWebhookSecret(secret: string | undefined): string {
  if (!secret?.trim()) {
    throw new Error('CALENDAR_WATCH_WEBHOOK_SECRET is required');
  }
  return secret;
}

function normalizeId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCalendarAccountId(
  calendarAccountId: unknown,
  legacyAccountId: unknown,
): CalendarAccountIdResult {
  const canonical = normalizeId(calendarAccountId);
  const legacy = normalizeId(legacyAccountId);

  if (canonical && legacy && canonical !== legacy) {
    return { ok: false, reason: 'Conflicting calendar account identifiers' };
  }

  const resolved = canonical ?? legacy;
  if (!resolved || GLOBAL_ACCOUNT_SENTINELS.has(resolved.toLowerCase())) {
    return { ok: false, reason: 'A specific calendar account is required' };
  }

  return { ok: true, calendarAccountId: resolved };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function createCalendarWatchChannelToken(
  channelId: string,
  secret: string | undefined,
): Promise<string> {
  const configuredSecret = requireCalendarWatchWebhookSecret(secret);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(configuredSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(channelId));
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyCalendarWatchChannelToken(
  receivedToken: string | null,
  channelId: string,
  secret: string | undefined,
): Promise<boolean> {
  if (!receivedToken || !secret?.trim()) return false;

  const expectedToken = await createCalendarWatchChannelToken(channelId, secret);
  return constantTimeEqual(receivedToken, expectedToken);
}

export interface CalendarWatchReplacementOperations<T> {
  setupReplacement: (webhookSecret: string) => Promise<T>;
  persistReplacement: (replacement: T) => Promise<void>;
  stopPrevious: () => Promise<void>;
}

/**
 * Replace a watch without creating a dead-channel window. Configuration and
 * replacement setup are validated before the old channel is touched; the new
 * channel is persisted before best-effort retirement of the previous channel.
 */
export async function replaceCalendarWatchChannelSafely<T>(
  webhookSecret: string | undefined,
  operations: CalendarWatchReplacementOperations<T>,
): Promise<T> {
  const configuredSecret = requireCalendarWatchWebhookSecret(webhookSecret);
  const replacement = await operations.setupReplacement(configuredSecret);
  await operations.persistReplacement(replacement);
  await operations.stopPrevious();
  return replacement;
}
