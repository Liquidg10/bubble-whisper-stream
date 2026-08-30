import { findRecoveryCandidate, type RecoveryEvent } from './calendarImportRecoveryEvidence';

/** The complete, bounded field set shown for review and sent to Calendar. */
export interface CalendarOutboundFields {
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_TEXT = 4096;
const MAX_ROWS = 10_000;
const MAX_DURATION_MINUTES = 24 * 60;
const OFFSET_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function record(value: unknown): value is Record<string, unknown> {
  if (!object(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataRecord(value: unknown, fields: string[]): value is Record<string, unknown> {
  return record(value) && fields.every(field => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value');
  });
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value) && value !== NIL_UUID;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}

function optionalText(value: Record<string, unknown>, field: string): string | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor) return field in value ? null : '';
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
  if (descriptor.value === undefined) return '';
  return text(descriptor.value) ? descriptor.value : null;
}

/** Reject local-time parsing, invalid-date normalization, and precision loss. */
function explicitTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = OFFSET_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthDays[month - 1]) return null;
  // RFC3339 -00:00 signifies an unknown local offset, not reviewed timezone evidence.
  if (offset === '-00:00' || (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

/**
 * Read one current durable task, never the permissive Task projection. The
 * caller supplies a completed bounded storage snapshot plus authenticated
 * mapping identity. This does not validate provider freshness or authorize a
 * write. The recovery validator supplies the shared exact-one provenance and
 * mirrored canonical-v1 association checks against these task-derived fields.
 */
export function findOutboundTaskCandidate(
  bubbles: unknown[],
  owner: string,
  reference: { taskId: string; calendarAccountId: string; eventId: string },
): { taskId: string; fields: CalendarOutboundFields; fingerprint: string } | null {
  try {
    if (!Array.isArray(bubbles) || bubbles.length > MAX_ROWS || !uuid(owner) ||
      !dataRecord(reference, ['taskId', 'calendarAccountId', 'eventId']) ||
      typeof reference.taskId !== 'string' || !ID.test(reference.taskId) ||
      !uuid(reference.calendarAccountId) || typeof reference.eventId !== 'string' || !ID.test(reference.eventId)) return null;

    // Copy only indexed data slots: an overridden iterator cannot hide a
    // conflicting claim from the shared recovery validator's complete scan.
    const rows: unknown[] = [];
    let candidate: Record<string, unknown> | undefined;
    for (let index = 0; index < bubbles.length; index += 1) {
      const slot = Object.getOwnPropertyDescriptor(bubbles, index);
      if (slot && !Object.prototype.hasOwnProperty.call(slot, 'value')) return null;
      const row: unknown = slot?.value;
      rows.push(row);
      if (!object(row)) continue;
      const id = Object.getOwnPropertyDescriptor(row, 'id');
      if (id && !Object.prototype.hasOwnProperty.call(id, 'value')) return null;
      if (id?.value !== reference.taskId) continue;
      if (candidate) return null;
      candidate = row;
    }

    if (!dataRecord(candidate, ['id', 'metadata', 'content', 'createdAt', 'updatedAt']) ||
      !text(candidate.content) || !candidate.content.trim()) return null;
    const metadata = candidate.metadata;
    if (!dataRecord(metadata, ['userId', 'calendarImport', 'canonicalTask', 'calendar']) ||
      !dataRecord(metadata.calendarImport, ['calendarAccountId', 'eventId']) ||
      !dataRecord(metadata.calendar, ['startTime', 'durationMin', 'calendarId'])) return null;
    const envelope = metadata.canonicalTask;
    if (!dataRecord(envelope, ['schemaVersion', 'type', 'metadata', 'view']) ||
      !dataRecord(envelope.metadata, ['userId', 'calendarImport']) ||
      !dataRecord(envelope.metadata.calendarImport, ['calendarAccountId', 'eventId']) ||
      !dataRecord(envelope.view, ['calendar']) ||
      !dataRecord(envelope.view.calendar, ['startTime', 'durationMin', 'calendarId'])) return null;

    const calendar = metadata.calendar;
    const start = explicitTimestamp(calendar.startTime);
    const duration = calendar.durationMin;
    if (start === null || typeof duration !== 'number' || !Number.isFinite(duration) ||
      duration <= 0 || duration > MAX_DURATION_MINUTES || !Number.isSafeInteger(duration * 60_000)) return null;
    const end = start + duration * 60_000;
    if (!Number.isSafeInteger(end) || end <= start) return null;
    const endTime = new Date(end).toISOString();
    if (explicitTimestamp(endTime) === null) return null;

    const description = optionalText(candidate, 'caption');
    const location = optionalText(calendar, 'location');
    if (description === null || location === null || optionalText(envelope.view.calendar, 'location') === null) return null;
    const event: RecoveryEvent = {
      user_id: owner, calendar_account_id: reference.calendarAccountId, external_event_id: reference.eventId,
      title: candidate.content, description, location,
      start_time: calendar.startTime as string, end_time: endTime,
    };
    const association = findRecoveryCandidate(rows, owner, event);
    if (!association || association.taskId !== reference.taskId) return null;
    const fields: CalendarOutboundFields = {
      title: candidate.content, description, location, startTime: new Date(start).toISOString(), endTime,
    };
    return {
      taskId: association.taskId,
      fields,
      fingerprint: JSON.stringify(['calendar-outbound-task-evidence:v1', association.fingerprint,
        fields.title, fields.description, fields.location, fields.startTime, fields.endTime]),
    };
  } catch {
    return null;
  }
}
