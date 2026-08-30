/**
 * Pure evidence validation for mapping-only Calendar import recovery.
 * The caller owns authenticated event lookup, a complete bounded durable scan,
 * coordination and persistence. This is not an original-write receipt.
 */
export interface RecoveryEvent {
  user_id: string;
  calendar_account_id: string;
  external_event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  description: string | null;
}

export interface RecoveryCandidate {
  taskId: string;
  taskTitle: string;
  fingerprint: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_TEXT = 4096;
const TASK_TYPES = new Set(['thought', 'task', 'memory', 'mood', 'reminder', 'photo', 'event']);

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function record(value: unknown): value is Record<string, unknown> {
  if (!object(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function owns(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => own(value, key));
}

function optionalField(value: Record<string, unknown>, key: string): unknown {
  return own(value, key) ? value[key] : undefined;
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value) && value !== NIL_UUID;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}

function time(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function date(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function optionalTextMatches(value: unknown, expected: string | null): boolean {
  return value === undefined ? !expected : text(value) && value === (expected ?? '');
}

function claimsImport(metadata: unknown, owner: string, event: RecoveryEvent): metadata is Record<string, unknown> {
  if (!object(metadata) || !own(metadata, 'userId') || metadata.userId !== owner || !own(metadata, 'calendarImport')) return false;
  const provenance = metadata.calendarImport;
  return object(provenance) && own(provenance, 'calendarAccountId') && own(provenance, 'eventId') &&
    provenance.calendarAccountId === event.calendar_account_id && provenance.eventId === event.external_event_id;
}

function matchesImport(metadata: unknown, owner: string, event: RecoveryEvent): metadata is Record<string, unknown> {
  return record(metadata) && record(metadata.calendarImport) && claimsImport(metadata, owner, event);
}

function matchesCalendar(value: unknown, event: RecoveryEvent): value is Record<string, unknown> {
  return record(value) && own(value, 'startTime') && own(value, 'durationMin') && own(value, 'calendarId') &&
    value.startTime === event.start_time && value.calendarId === event.calendar_account_id &&
    value.durationMin === (Date.parse(event.end_time) - Date.parse(event.start_time)) / 60000 &&
    optionalTextMatches(optionalField(value, 'location'), event.location);
}

/**
 * Return only one exact, currently committed association candidate. Count the
 * union of direct/envelope claims before validating, so a malformed duplicate
 * cannot disappear behind projection fallback and make another row look unique.
 */
export function findRecoveryCandidate(bubbles: unknown[], owner: string, event: RecoveryEvent): RecoveryCandidate | null {
  try {
    if (!Array.isArray(bubbles) || !uuid(owner) || !record(event) ||
      !owns(event, ['user_id', 'calendar_account_id', 'external_event_id', 'title', 'start_time', 'end_time', 'description', 'location']) || event.user_id !== owner ||
      !uuid(event.calendar_account_id) || typeof event.external_event_id !== 'string' || !ID.test(event.external_event_id) ||
      !text(event.title) || !event.title.trim() || !date(event.start_time) || !date(event.end_time) ||
      Date.parse(event.end_time) <= Date.parse(event.start_time) ||
      !(event.description === null || text(event.description)) || !(event.location === null || text(event.location))) return null;

    let candidate: Record<string, unknown> | undefined;
    for (const bubble of bubbles) {
      if (!object(bubble)) continue;
      const metadata = bubble.metadata;
      const envelope = object(metadata) && object(metadata.canonicalTask) ? metadata.canonicalTask : undefined;
      if (!claimsImport(metadata, owner, event) && !claimsImport(envelope?.metadata, owner, event)) continue;
      if (candidate) return null;
      candidate = bubble;
    }
    if (!record(candidate) || !owns(candidate, ['id', 'metadata', 'content', 'createdAt', 'updatedAt']) ||
      typeof candidate.id !== 'string' || !ID.test(candidate.id) ||
      candidate.content !== event.title || !optionalTextMatches(optionalField(candidate, 'caption'), event.description) ||
      !time(candidate.createdAt) || !time(candidate.updatedAt)) return null;

    const metadata = candidate.metadata;
    if (!matchesImport(metadata, owner, event) || !owns(metadata, ['canonicalTask', 'calendar'])) return null;
    const envelope = metadata.canonicalTask;
    if (!record(envelope) || !owns(envelope, ['schemaVersion', 'type', 'metadata', 'view']) || envelope.schemaVersion !== 1 ||
      typeof envelope.type !== 'string' || !TASK_TYPES.has(envelope.type) ||
      !matchesImport(envelope.metadata, owner, event) || !record(envelope.view) || !own(envelope.view, 'calendar') ||
      !matchesCalendar(metadata.calendar, event) || !matchesCalendar(envelope.view.calendar, event)) return null;

    // Fixed-order bounded fields make a stable preview token without serializing
    // unrelated private metadata. Undefined and empty text remain distinguishable.
    const optional = (value: unknown) => value === undefined ? ['absent'] : ['text', value];
    const calendar = metadata.calendar;
    const canonicalCalendar = envelope.view.calendar;
    const fingerprint = JSON.stringify([
      'calendar-recovery-evidence:v1', owner, event.calendar_account_id, event.external_event_id,
      event.title, event.description, event.start_time, event.end_time, event.location,
      candidate.id, candidate.createdAt, candidate.updatedAt, candidate.content, optional(optionalField(candidate, 'caption')),
      envelope.schemaVersion, envelope.type,
      calendar.startTime, calendar.durationMin, calendar.calendarId, optional(optionalField(calendar, 'location')),
      canonicalCalendar.startTime, canonicalCalendar.durationMin, canonicalCalendar.calendarId, optional(optionalField(canonicalCalendar, 'location')),
    ]);
    return { taskId: candidate.id, taskTitle: event.title, fingerprint };
  } catch {
    // Corrupt/proxy/accessor-shaped inputs never produce partial evidence.
    return null;
  }
}
