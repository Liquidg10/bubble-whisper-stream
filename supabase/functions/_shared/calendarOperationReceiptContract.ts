/** V2 receipts attest saved server execution, never current provider-state inference. */
import {
  type CalendarReviewedUpdateCode, type CalendarReviewedUpdateFields,
  isCalendarReviewedUpdateFields, parseCalendarReviewedUpdateResponse,
  reviewedUpdateEtag, reviewedUpdateExactKeys, reviewedUpdateId, reviewedUpdateRecord, reviewedUpdateUuid,
} from './calendarReviewedUpdateContract.ts';

export interface CalendarOperationIdentity {
  operationId: string; taskId: string; calendarAccountId: string; eventId: string;
  googleCalendarId: string; expectedEtag: string; requestDigest: string; afterDigest: string;
}
export interface CalendarOperationIntent extends Omit<CalendarOperationIdentity, 'requestDigest' | 'afterDigest'> {
  before: CalendarReviewedUpdateFields; after: CalendarReviewedUpdateFields;
}
export interface CalendarOperationPrepareRequest {
  version: 2; action: 'prepare_reviewed_update'; operationId: string; taskId: string; calendarAccountId: string; eventId: string;
}
export type CalendarOperationConfirmRequest = CalendarOperationIdentity & {
  version: 2; action: 'confirm_reviewed_update'; before: CalendarReviewedUpdateFields; after: CalendarReviewedUpdateFields;
};
export type CalendarOperationReadRequest = CalendarOperationIdentity & { version: 2; action: 'read_reviewed_update_receipt' };
export type CalendarOperationRequest = CalendarOperationPrepareRequest | CalendarOperationConfirmRequest | CalendarOperationReadRequest;
export type CalendarOperationHeldCode = 'disabled' | 'unauthenticated' | 'invalid_request' | 'registry_unavailable' |
  'operation_pending' | 'operation_unknown' | 'operation_conflict' | 'outcome_unknown' | 'provider_written_cache_unknown';
export type CalendarOperationResult =
  | { outcome: 'written'; etag: string; cacheUpdated: true }
  | { outcome: 'not_written'; code: CalendarReviewedUpdateCode }
  | { outcome: 'uncertain'; code: 'provider_outcome_unknown' }
  | { outcome: 'provider_written_cache_unknown'; etag: string; cacheUpdated: false };
export type CalendarOperationTerminalResult = Extract<CalendarOperationResult, { outcome: 'written' | 'not_written' }>;
export type CalendarOperationRecordedResponse = CalendarOperationIdentity & {
  version: 2; outcome: 'recorded'; completedAt: number; result: CalendarOperationTerminalResult;
};
export type CalendarOperationHeldResponse = CalendarOperationIdentity & { version: 2; outcome: 'held'; code: CalendarOperationHeldCode };
type PrepareIdentity = Pick<CalendarOperationIdentity, 'operationId' | 'taskId' | 'calendarAccountId' | 'eventId'>;
export type CalendarOperationPrepareResponse = PrepareIdentity & (
  | { version: 2; outcome: 'ready'; googleCalendarId: string; expectedEtag: string; before: CalendarReviewedUpdateFields }
  | { version: 2; outcome: 'unavailable'; code: CalendarReviewedUpdateCode | 'registry_unavailable' });
export type CalendarOperationResponse = CalendarOperationPrepareResponse | CalendarOperationRecordedResponse | CalendarOperationHeldResponse;
export interface CalendarOperationStoredRecord {
  ownerUserId: string; identity: CalendarOperationIdentity;
  state: 'pending' | 'written' | 'not_written' | 'uncertain' | 'provider_written';
  completedAt: number | null; result: CalendarOperationResult | null;
}

const BASE = ['operationId', 'taskId', 'calendarAccountId', 'eventId'] as const;
const IDENTITY = [...BASE, 'googleCalendarId', 'expectedEtag', 'requestDigest', 'afterDigest'] as const;
const HELD: CalendarOperationHeldCode[] = ['disabled', 'unauthenticated', 'invalid_request', 'registry_unavailable',
  'operation_pending', 'operation_unknown', 'operation_conflict', 'outcome_unknown', 'provider_written_cache_unknown'];
const DIGEST = /^[a-f0-9]{64}$/;
export function calendarOperationGoogleId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/\s/u.test(value) &&
    ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
    !['primary', 'all', '*'].includes(value);
}
export function calendarOperationDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function base(value: Record<string, unknown>): boolean {
  return BASE.every(key => Object.prototype.hasOwnProperty.call(value, key)) && reviewedUpdateUuid(value.operationId) &&
    reviewedUpdateId(value.taskId) && reviewedUpdateUuid(value.calendarAccountId) && reviewedUpdateId(value.eventId);
}
export function parseCalendarOperationIdentity(value: unknown): CalendarOperationIdentity | null {
  if (!reviewedUpdateRecord(value) || !reviewedUpdateExactKeys(value, IDENTITY) || !base(value) ||
    !calendarOperationGoogleId(value.googleCalendarId) || !reviewedUpdateEtag(value.expectedEtag) ||
    !calendarOperationDigest(value.requestDigest) || !calendarOperationDigest(value.afterDigest)) return null;
  return value as unknown as CalendarOperationIdentity;
}
export function calendarOperationIdentity(value: CalendarOperationIdentity): CalendarOperationIdentity {
  return { operationId: value.operationId, taskId: value.taskId, calendarAccountId: value.calendarAccountId,
    eventId: value.eventId, googleCalendarId: value.googleCalendarId, expectedEtag: value.expectedEtag,
    requestDigest: value.requestDigest, afterDigest: value.afterDigest };
}
export function equalCalendarOperationIdentity(left: CalendarOperationIdentity, right: CalendarOperationIdentity): boolean {
  return IDENTITY.every(key => left[key] === right[key]);
}
export function parseCalendarOperationRequest(value: unknown): CalendarOperationRequest | null {
  if (!reviewedUpdateRecord(value) || value.version !== 2 || !base(value)) return null;
  if (value.action === 'prepare_reviewed_update' && reviewedUpdateExactKeys(value, ['version', 'action', ...BASE]))
    return value as unknown as CalendarOperationPrepareRequest;
  if (value.action !== 'confirm_reviewed_update' && value.action !== 'read_reviewed_update_receipt') return null;
  const keys = ['version', 'action', ...IDENTITY, ...(value.action === 'confirm_reviewed_update' ? ['before', 'after'] : [])];
  if (!reviewedUpdateExactKeys(value, keys) || !parseCalendarOperationIdentity(calendarOperationIdentity(value as unknown as CalendarOperationIdentity))) return null;
  if (value.action === 'confirm_reviewed_update' && (!isCalendarReviewedUpdateFields(value.before) || !isCalendarReviewedUpdateFields(value.after))) return null;
  return value as unknown as CalendarOperationRequest;
}
function knownNotWritten(code: unknown): code is CalendarReviewedUpdateCode {
  return parseCalendarReviewedUpdateResponse({ version: 1, operationId: '10000000-0000-4000-8000-000000000001',
    calendarAccountId: '20000000-0000-4000-8000-000000000002', eventId: 'validation', outcome: 'not_written', code }) !== null;
}
export function parseCalendarOperationResult(value: unknown, expectedEtag: string): CalendarOperationResult | null {
  if (!reviewedUpdateRecord(value)) return null;
  if (value.outcome === 'not_written' && reviewedUpdateExactKeys(value, ['outcome', 'code']) && knownNotWritten(value.code))
    return value as CalendarOperationResult;
  if (value.outcome === 'uncertain' && reviewedUpdateExactKeys(value, ['outcome', 'code']) && value.code === 'provider_outcome_unknown')
    return value as CalendarOperationResult;
  if (reviewedUpdateExactKeys(value, ['outcome', 'etag', 'cacheUpdated']) && reviewedUpdateEtag(value.etag) && value.etag !== expectedEtag &&
    ((value.outcome === 'written' && value.cacheUpdated === true) || (value.outcome === 'provider_written_cache_unknown' && value.cacheUpdated === false)))
    return value as CalendarOperationResult;
  return null;
}
export function parseCalendarOperationResponse(value: unknown): CalendarOperationResponse | null {
  if (!reviewedUpdateRecord(value) || value.version !== 2 || !base(value)) return null;
  if (value.outcome === 'ready' && reviewedUpdateExactKeys(value, ['version', 'outcome', ...BASE, 'googleCalendarId', 'expectedEtag', 'before']) &&
    calendarOperationGoogleId(value.googleCalendarId) && reviewedUpdateEtag(value.expectedEtag) && isCalendarReviewedUpdateFields(value.before))
    return value as unknown as CalendarOperationPrepareResponse;
  if (value.outcome === 'unavailable' && reviewedUpdateExactKeys(value, ['version', 'outcome', ...BASE, 'code']) &&
    (knownNotWritten(value.code) || value.code === 'registry_unavailable')) return value as unknown as CalendarOperationPrepareResponse;
  if (!parseCalendarOperationIdentity(calendarOperationIdentity(value as unknown as CalendarOperationIdentity))) return null;
  if (value.outcome === 'held' && reviewedUpdateExactKeys(value, ['version', 'outcome', ...IDENTITY, 'code']) && HELD.includes(value.code as CalendarOperationHeldCode))
    return value as unknown as CalendarOperationHeldResponse;
  if (value.outcome === 'recorded' && reviewedUpdateExactKeys(value, ['version', 'outcome', ...IDENTITY, 'completedAt', 'result']) &&
    Number.isSafeInteger(value.completedAt) && (value.completedAt as number) >= 0) {
    const result = parseCalendarOperationResult(value.result, value.expectedEtag as string);
    if (result?.outcome === 'written' || result?.outcome === 'not_written') return value as unknown as CalendarOperationRecordedResponse;
  }
  return null;
}
export function parseCalendarOperationStoredRecord(value: unknown, owner: string): CalendarOperationStoredRecord | null {
  if (!reviewedUpdateUuid(owner) || !reviewedUpdateRecord(value) ||
    !reviewedUpdateExactKeys(value, ['ownerUserId', 'identity', 'state', 'completedAt', 'result']) || value.ownerUserId !== owner) return null;
  const identity = parseCalendarOperationIdentity(value.identity);
  if (!identity) return null;
  if (value.state === 'pending' && value.completedAt === null && value.result === null) return value as unknown as CalendarOperationStoredRecord;
  if (!Number.isSafeInteger(value.completedAt) || (value.completedAt as number) < 0) return null;
  const result = parseCalendarOperationResult(value.result, identity.expectedEtag);
  const state = result?.outcome === 'provider_written_cache_unknown' ? 'provider_written' : result?.outcome;
  return result && state === value.state ? value as unknown as CalendarOperationStoredRecord : null;
}
function fields(value: CalendarReviewedUpdateFields): (string | null)[] {
  return [value.title, value.description, value.location, value.startTime, value.endTime, value.startTz, value.endTz];
}
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function calendarOperationAfterDigest(value: CalendarReviewedUpdateFields): Promise<string> {
  if (!isCalendarReviewedUpdateFields(value)) throw new Error('Invalid Calendar intent');
  return digest(['mind-manual-calendar-fields', 2, fields(value)]);
}
/** Stable array encoding binds the authenticated owner, exact target, original version and all reviewed fields. */
export async function calendarOperationDigests(owner: string, intent: CalendarOperationIntent): Promise<{ requestDigest: string; afterDigest: string }> {
  if (!reviewedUpdateUuid(owner) || !reviewedUpdateRecord(intent) || !base(intent as unknown as Record<string, unknown>) ||
    !calendarOperationGoogleId(intent.googleCalendarId) || !reviewedUpdateEtag(intent.expectedEtag) ||
    !isCalendarReviewedUpdateFields(intent.before) || !isCalendarReviewedUpdateFields(intent.after)) throw new Error('Invalid Calendar intent');
  const requestDigest = await digest(['mind-manual-calendar-operation', 2, owner, intent.operationId, intent.taskId,
    intent.calendarAccountId, intent.eventId, intent.googleCalendarId, intent.expectedEtag, fields(intent.before), fields(intent.after)]);
  return { requestDigest, afterDigest: await calendarOperationAfterDigest(intent.after) };
}
