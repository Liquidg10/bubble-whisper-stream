import { parseCalendarOperationIdentity, equalCalendarOperationIdentity, type CalendarOperationIdentity } from '../../supabase/functions/_shared/calendarOperationReceiptContract';

export interface CalendarOutboundIntent {
  version: 2; googleCalendarId: string; expectedEtag: string; requestDigest: string; afterDigest: string;
}
/** Minimal owner-scoped dispatch receipts. Pending/uncertain work never expires. */
export interface CalendarOutboundReceipt {
  operationId: string;
  taskId: string;
  calendarAccountId: string;
  eventId: string;
  createdAt: number;
  outcome: 'pending' | 'written' | 'not_written' | 'provider_written' | 'uncertain';
  completedAt?: number;
  etag?: string;
  intent?: CalendarOutboundIntent;
}
export interface CalendarOutboundJournal {
  version: 1;
  ownerUserId: string;
  receipts: CalendarOutboundReceipt[];
}
export type CalendarOutboundHold = CalendarOutboundReceipt & { outcome: 'pending' | 'provider_written' | 'uncertain' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const OUTCOMES = new Set(['pending', 'written', 'not_written', 'provider_written', 'uncertain']);
const MAX_BYTES = 1024 * 1024;
const fail = () => new Error('Saved Calendar update outcomes require review.');
export const calendarOutboundJournalKey = (owner: string) => `calendar-task-outbound:v1:${owner}`;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value) && value !== '00000000-0000-0000-0000-000000000000';
}
function time(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function validate(value: unknown, owner: string): CalendarOutboundJournal {
  if (!uuid(owner) || !object(value) || !exact(value, ['version', 'ownerUserId', 'receipts'])
    || value.version !== 1 || value.ownerUserId !== owner || !Array.isArray(value.receipts) || value.receipts.length > 1000) throw fail();
  const seen = new Set<string>();
  for (const receipt of value.receipts) {
    if (!object(receipt) || !exact(receipt, ['operationId', 'taskId', 'calendarAccountId', 'eventId', 'createdAt', 'outcome'], ['completedAt', 'etag', 'intent'])
      || !uuid(receipt.operationId) || seen.has(receipt.operationId) || !uuid(receipt.calendarAccountId)
      || typeof receipt.taskId !== 'string' || !ID.test(receipt.taskId) || typeof receipt.eventId !== 'string' || !ID.test(receipt.eventId)
      || !time(receipt.createdAt) || typeof receipt.outcome !== 'string' || !OUTCOMES.has(receipt.outcome)) throw fail();
    if ('intent' in receipt) {
      if (!Object.prototype.hasOwnProperty.call(receipt, 'intent') || !object(receipt.intent)
        || !exact(receipt.intent, ['version', 'googleCalendarId', 'expectedEtag', 'requestDigest', 'afterDigest']) || receipt.intent.version !== 2
        || !outboundOperationIdentity(receipt as unknown as CalendarOutboundReceipt)) throw fail();
    }
    const hasCompleted = Object.prototype.hasOwnProperty.call(receipt, 'completedAt');
    const hasEtag = Object.prototype.hasOwnProperty.call(receipt, 'etag');
    if (receipt.outcome === 'pending') {
      if (hasCompleted || hasEtag) throw fail();
    } else if (!hasCompleted || !time(receipt.completedAt) || receipt.completedAt < receipt.createdAt) throw fail();
    if (receipt.outcome === 'written' || receipt.outcome === 'provider_written') {
      if (!hasEtag || typeof receipt.etag !== 'string' || !/^"[A-Za-z0-9_-]{1,256}"$/.test(receipt.etag)) throw fail();
    } else if (hasEtag) throw fail();
    seen.add(receipt.operationId);
  }
  return value as unknown as CalendarOutboundJournal;
}
export function readOutboundJournal(owner: string): { snapshot: string | null; journal: CalendarOutboundJournal } {
  const snapshot = localStorage.getItem(calendarOutboundJournalKey(owner));
  if (snapshot !== null && (snapshot.length > MAX_BYTES || new TextEncoder().encode(snapshot).byteLength > MAX_BYTES)) throw fail();
  return { snapshot, journal: validate(snapshot === null ? { version: 1, ownerUserId: owner, receipts: [] } : JSON.parse(snapshot), owner) };
}
export function writeOutboundJournal(owner: string, journal: CalendarOutboundJournal, previous: string | null): string {
  validate(journal, owner);
  if (previous !== null) {
    const before = validate(JSON.parse(previous), owner);
    for (const old of before.receipts) {
      const next = journal.receipts.find(receipt => receipt.operationId === old.operationId);
      if (!next || old.taskId !== next.taskId || old.calendarAccountId !== next.calendarAccountId || old.eventId !== next.eventId
        || old.createdAt !== next.createdAt || Boolean(old.intent) !== Boolean(next.intent)) throw fail();
      if (old.intent && !equalCalendarOperationIdentity(outboundOperationIdentity(old)!, outboundOperationIdentity(next)!)) throw fail();
      if (old.outcome === 'provider_written' && (next.etag !== old.etag
        || (next.outcome !== 'provider_written' && next.outcome !== 'written'))) throw fail();
      // Legacy holds are never upgraded/cleared, and terminal history is immutable.
      if ((!old.intent || old.outcome === 'written' || old.outcome === 'not_written')
        && (old.outcome !== next.outcome || old.completedAt !== next.completedAt || old.etag !== next.etag)) throw fail();
    }
  }
  const serialized = JSON.stringify(journal);
  if (serialized.length > MAX_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_BYTES
    || localStorage.getItem(calendarOutboundJournalKey(owner)) !== previous) throw fail();
  localStorage.setItem(calendarOutboundJournalKey(owner), serialized);
  return serialized;
}
export function outboundHeld(journal: CalendarOutboundJournal, accountId: string, eventId: string): boolean {
  return journal.receipts.some(receipt => receipt.calendarAccountId === accountId && receipt.eventId === eventId
    && receipt.outcome !== 'written' && receipt.outcome !== 'not_written');
}

/** Includes orphaned task/event locators; no task or mapping join may hide a hold. */
export function outboundHolds(journal: CalendarOutboundJournal): CalendarOutboundHold[] {
  return journal.receipts.filter((receipt): receipt is CalendarOutboundHold =>
    receipt.outcome === 'pending' || receipt.outcome === 'provider_written' || receipt.outcome === 'uncertain')
    .map(receipt => ({ ...receipt, ...(receipt.intent ? { intent: { ...receipt.intent } } : {}) }));
}

export function outboundOperationIdentity(receipt: CalendarOutboundReceipt): CalendarOperationIdentity | null {
  if (!Object.prototype.hasOwnProperty.call(receipt, 'intent') || !receipt.intent || receipt.intent.version !== 2) return null;
  return parseCalendarOperationIdentity({ operationId: receipt.operationId, taskId: receipt.taskId,
    calendarAccountId: receipt.calendarAccountId, eventId: receipt.eventId, googleCalendarId: receipt.intent.googleCalendarId,
    expectedEtag: receipt.intent.expectedEtag, requestDigest: receipt.intent.requestDigest, afterDigest: receipt.intent.afterDigest });
}

/** Validate the UI boundary without accessing storage or accepting terminal rows. */
export function parseOutboundHoldInventory(value: unknown, owner: string): CalendarOutboundHold[] | null {
  try {
    const journal = validate({ version: 1, ownerUserId: owner, receipts: value }, owner);
    const holds = outboundHolds(journal);
    return holds.length === journal.receipts.length ? holds : null;
  } catch { return null; }
}
