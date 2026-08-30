/** Versioned manual-update protocol. A client review token is UX, not server authorization. */
export interface CalendarReviewedUpdateFields {
  title: string;
  description: string;
  location: string;
  /** Canonical UTC ISO timestamps; provider offsets are normalized before review. */
  startTime: string;
  endTime: string;
  startTz: string | null;
  endTz: string | null;
}

export interface CalendarReviewedUpdatePrepareRequest {
  version: 1;
  operationId: string;
  action: 'prepare_reviewed_update';
  calendarAccountId: string;
  eventId: string;
}

export interface CalendarReviewedUpdateConfirmRequest {
  version: 1;
  operationId: string;
  action: 'confirm_reviewed_update';
  calendarAccountId: string;
  eventId: string;
  expectedEtag: string;
  before: CalendarReviewedUpdateFields;
  after: CalendarReviewedUpdateFields;
}

export type CalendarReviewedUpdateRequest = CalendarReviewedUpdatePrepareRequest | CalendarReviewedUpdateConfirmRequest;
export type CalendarReviewedUpdateCode = 'disabled' | 'unauthenticated' | 'invalid_request' |
  'account_unavailable' | 'write_permission_required' | 'authorization_expired' |
  'event_unavailable' | 'event_not_supported' | 'stale_review' | 'no_changes' |
  'provider_rejected' | 'provider_unavailable';

export type CalendarReviewedUpdateResponse = { operationId: string; calendarAccountId: string; eventId: string } & (
  | { version: 1; outcome: 'ready'; calendarAccountId: string; eventId: string;
      expectedEtag: string; before: CalendarReviewedUpdateFields }
  | { version: 1; outcome: 'written'; calendarAccountId: string; eventId: string;
      etag: string; fields: CalendarReviewedUpdateFields; cacheUpdated: true }
  | { version: 1; outcome: 'provider_written_cache_unknown'; calendarAccountId: string; eventId: string;
      etag: string; fields: CalendarReviewedUpdateFields; cacheUpdated: false }
  | { version: 1; outcome: 'not_written'; code: CalendarReviewedUpdateCode }
  | { version: 1; outcome: 'uncertain'; code: 'provider_outcome_unknown' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const ETAG = /^"[A-Za-z0-9_-]{1,256}"$/;
const FIELD_KEYS = ['title', 'description', 'location', 'startTime', 'endTime', 'startTz', 'endTz'] as const;

export function reviewedUpdateRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function reviewedUpdateExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).length === keys.length;
}

export function reviewedUpdateUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value) && value !== '00000000-0000-0000-0000-000000000000';
}

export function reviewedUpdateId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export function reviewedUpdateEtag(value: unknown): value is string {
  return typeof value === 'string' && ETAG.test(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 &&
    [...value].every(character => { const code = character.charCodeAt(0); return code !== 127 && (code >= 32 || [9, 10, 13].includes(code)); });
}

function zone(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_+/-]{1,100}$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}

function iso(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function isCalendarReviewedUpdateFields(value: unknown): value is CalendarReviewedUpdateFields {
  if (!reviewedUpdateRecord(value) || !reviewedUpdateExactKeys(value, FIELD_KEYS)) return false;
  return text(value.title) && value.title.trim().length > 0 && text(value.description) && text(value.location) &&
    iso(value.startTime) && iso(value.endTime) && Date.parse(value.endTime) > Date.parse(value.startTime) &&
    Date.parse(value.endTime) - Date.parse(value.startTime) <= 24 * 60 * 60 * 1000 && zone(value.startTz) && zone(value.endTz);
}

export function equalCalendarReviewedUpdateFields(left: CalendarReviewedUpdateFields, right: CalendarReviewedUpdateFields): boolean {
  return FIELD_KEYS.every(key => left[key] === right[key]);
}

export function parseCalendarReviewedUpdateRequest(value: unknown): CalendarReviewedUpdateRequest | null {
  if (!reviewedUpdateRecord(value) || value.version !== 1 || !reviewedUpdateUuid(value.operationId) || !reviewedUpdateUuid(value.calendarAccountId) || !reviewedUpdateId(value.eventId)) return null;
  const base = ['version', 'operationId', 'action', 'calendarAccountId', 'eventId'];
  if (value.action === 'prepare_reviewed_update' && reviewedUpdateExactKeys(value, base)) return value as unknown as CalendarReviewedUpdatePrepareRequest;
  if (value.action === 'confirm_reviewed_update' && reviewedUpdateExactKeys(value, [...base, 'expectedEtag', 'before', 'after']) &&
    reviewedUpdateEtag(value.expectedEtag) && isCalendarReviewedUpdateFields(value.before) && isCalendarReviewedUpdateFields(value.after)) {
    return value as unknown as CalendarReviewedUpdateConfirmRequest;
  }
  return null;
}

/** Strict receipt reader; caller must additionally match account/event and reviewed fields. */
export function parseCalendarReviewedUpdateResponse(value: unknown): CalendarReviewedUpdateResponse | null {
  if (!reviewedUpdateRecord(value) || value.version !== 1 || !reviewedUpdateUuid(value.operationId) ||
    !reviewedUpdateUuid(value.calendarAccountId) || !reviewedUpdateId(value.eventId)) return null;
  const codes: CalendarReviewedUpdateCode[] = ['disabled', 'unauthenticated', 'invalid_request', 'account_unavailable',
    'write_permission_required', 'authorization_expired', 'event_unavailable', 'event_not_supported', 'stale_review',
    'no_changes', 'provider_rejected', 'provider_unavailable'];
  if (reviewedUpdateExactKeys(value, ['version', 'operationId', 'calendarAccountId', 'eventId', 'outcome', 'code']) &&
    ((value.outcome === 'not_written' && codes.includes(value.code as CalendarReviewedUpdateCode)) ||
      (value.outcome === 'uncertain' && value.code === 'provider_outcome_unknown'))) return value as CalendarReviewedUpdateResponse;
  if (value.outcome === 'ready' && reviewedUpdateExactKeys(value, ['version', 'operationId', 'outcome', 'calendarAccountId', 'eventId', 'expectedEtag', 'before']) &&
    reviewedUpdateEtag(value.expectedEtag) && isCalendarReviewedUpdateFields(value.before)) return value as CalendarReviewedUpdateResponse;
  if (reviewedUpdateExactKeys(value, ['version', 'operationId', 'outcome', 'calendarAccountId', 'eventId', 'etag', 'fields', 'cacheUpdated']) &&
    reviewedUpdateEtag(value.etag) && isCalendarReviewedUpdateFields(value.fields) &&
    ((value.outcome === 'written' && value.cacheUpdated === true) ||
      (value.outcome === 'provider_written_cache_unknown' && value.cacheUpdated === false))) return value as CalendarReviewedUpdateResponse;
  return null;
}
