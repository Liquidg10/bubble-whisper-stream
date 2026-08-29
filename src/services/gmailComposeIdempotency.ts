export type GmailMutationOperation = 'create_draft' | 'send' | 'send_draft';
export type GmailMutationReceiptStatus = 'pending' | 'succeeded' | 'failed';

interface PendingMutationEntry {
  key: string;
  generation: number;
  createdAt: number;
  acquisitions: number;
  terminalSucceededAt?: number;
}

interface PendingMutationState {
  version: 1;
  nextGeneration: number;
  entries: Record<string, PendingMutationEntry>;
}

export interface GmailMutationIdentity {
  key: string;
  fingerprint: string;
  managed: boolean;
}

const STORAGE_KEY = 'mind-manual:gmail-compose-idempotency:v1';
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;
/** Longer than the Edge execution window, while still allowing a later explicit repeat. */
export const GMAIL_TERMINAL_REPLAY_RETENTION_MS = 15 * 60 * 1000;

function emptyState(): PendingMutationState {
  return { version: 1, nextGeneration: 1, entries: {} };
}

function readState(): PendingMutationState {
  let stored: string | null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error('Gmail action blocked: durable retry storage is unavailable');
  }

  if (!stored) return emptyState();

  try {
    const parsed = JSON.parse(stored) as Partial<PendingMutationState>;
    if (
      parsed.version !== 1 ||
      !Number.isSafeInteger(parsed.nextGeneration) ||
      (parsed.nextGeneration ?? 0) < 1 ||
      !parsed.entries ||
      typeof parsed.entries !== 'object' ||
      Array.isArray(parsed.entries)
    ) {
      throw new Error('invalid state');
    }
    return parsed as PendingMutationState;
  } catch {
    // Silently discarding this state could lose the only key for an ambiguous
    // provider write and make a duplicate send possible.
    throw new Error('Gmail action blocked: durable retry state needs recovery');
  }
}

function writeState(state: PendingMutationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error('Gmail action blocked: durable retry state could not be saved');
  }
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Gmail action blocked: secure idempotency is unavailable');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function withStorageLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    // An unlocked read/modify/write fallback can lose the only pending key
    // when two tabs race. Blocking is safer than risking a duplicate send.
    throw new Error('Gmail action blocked: cross-tab idempotency locking is unavailable');
  }
  return navigator.locks.request('mind-manual:gmail-compose-idempotency', work);
}

export async function getGmailMutationFingerprint(input: {
  accountId: string;
  operation: GmailMutationOperation;
  payload: unknown;
}): Promise<string> {
  return sha256(JSON.stringify({
    version: 1,
    accountId: input.accountId,
    operation: input.operation,
    payload: input.payload
  }));
}

/**
 * Reuse the pending key for an identical mutation across retries and reloads.
 * Only a confirmed terminal receipt releases the key for a future user action.
 */
export async function acquireGmailMutationIdentity(
  input: {
    accountId: string;
    operation: GmailMutationOperation;
    payload: unknown;
  },
  providedKey?: string
): Promise<GmailMutationIdentity> {
  const fingerprint = await getGmailMutationFingerprint(input);

  if (providedKey) {
    if (!KEY_PATTERN.test(providedKey)) {
      throw new Error('Invalid Gmail idempotency key');
    }
    return { key: providedKey, fingerprint, managed: false };
  }

  return withStorageLock(async () => {
    const state = readState();
    const existing = state.entries[fingerprint];
    if (existing) {
      if (!KEY_PATTERN.test(existing.key)) {
        throw new Error('Gmail action blocked: durable retry state needs recovery');
      }
      const terminalRetentionExpired =
        typeof existing.terminalSucceededAt === 'number' &&
        Date.now() - existing.terminalSucceededAt > GMAIL_TERMINAL_REPLAY_RETENTION_MS;
      if (!terminalRetentionExpired) {
        existing.acquisitions = Number.isSafeInteger(existing.acquisitions) && existing.acquisitions > 0
          ? existing.acquisitions + 1
          : 2;
        writeState(state);
        return { key: existing.key, fingerprint, managed: true };
      }
      delete state.entries[fingerprint];
    }

    const generation = state.nextGeneration;
    const key = `gmail-v1:${await sha256(`${fingerprint}:${generation}`)}`;
    state.entries[fingerprint] = { key, generation, createdAt: Date.now(), acquisitions: 1 };
    state.nextGeneration = generation + 1;
    writeState(state);

    return { key, fingerprint, managed: true };
  });
}

/** Keep pending/ambiguous keys; release only a server-confirmed terminal receipt. */
export async function settleGmailMutationIdentity(
  identity: GmailMutationIdentity,
  status: GmailMutationReceiptStatus
): Promise<boolean> {
  if (!identity.managed || status === 'pending') return true;

  try {
    await withStorageLock(async () => {
      const state = readState();
      const entry = state.entries[identity.fingerprint];
      if (entry?.key !== identity.key) return;
      // If another tab/request acquired this key before the terminal success,
      // it may still be showing an ambiguous result. Retaining the key lets
      // that tab replay the receipt instead of creating a duplicate mutation.
      if (status === 'succeeded' && (entry.acquisitions ?? 1) > 1) {
        entry.terminalSucceededAt = Date.now();
        writeState(state);
        return;
      }
      delete state.entries[identity.fingerprint];
      writeState(state);
    });
    return true;
  } catch (error) {
    // The provider receipt is already terminal. Keeping the local key is safe
    // (a later retry replays it); cleanup failure must never turn a confirmed
    // send into an apparent provider failure that invites a new key.
    console.warn('Could not release terminal Gmail idempotency key:', error);
    return false;
  }
}

export function isValidGmailIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key);
}
