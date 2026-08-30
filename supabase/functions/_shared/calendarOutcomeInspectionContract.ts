import { isCalendarReviewedUpdateFields, reviewedUpdateEtag, reviewedUpdateExactKeys, reviewedUpdateId,
  reviewedUpdateRecord, reviewedUpdateUuid, type CalendarReviewedUpdateFields } from './calendarReviewedUpdateContract.ts';

/** Observation is deliberately disjoint from dispatch/completion receipts. */
export interface CalendarOutcomeInspectionRequest {
  version: 1;
  action: 'inspect_reviewed_outcome';
  operationId: string;
  calendarAccountId: string;
  eventId: string;
}
export type CalendarOutcomeInspectionCode = 'disabled' | 'unauthenticated' | 'account_unavailable' |
  'read_permission_required' | 'authorization_expired' | 'event_unavailable' | 'event_not_supported' | 'provider_unavailable';
export type CalendarOutcomeInspectionResponse = { version: 1; operationId: string; calendarAccountId: string; eventId: string } & (
  { outcome: 'observed'; observationOnly: true; etag: string; fields: CalendarReviewedUpdateFields; observedAt: number }
  | { outcome: 'inspection_unavailable'; code: CalendarOutcomeInspectionCode }
);
const identityKeys = ['version', 'operationId', 'calendarAccountId', 'eventId'];
function identity(value: unknown): value is Record<string, unknown> {
  return reviewedUpdateRecord(value) && value.version === 1 && reviewedUpdateUuid(value.operationId)
    && reviewedUpdateUuid(value.calendarAccountId) && reviewedUpdateId(value.eventId);
}
export function parseCalendarOutcomeInspectionRequest(value: unknown): CalendarOutcomeInspectionRequest | null {
  return identity(value) && value.action === 'inspect_reviewed_outcome' && reviewedUpdateExactKeys(value, [...identityKeys, 'action'])
    ? value as unknown as CalendarOutcomeInspectionRequest : null;
}
export function parseCalendarOutcomeInspectionResponse(value: unknown): CalendarOutcomeInspectionResponse | null {
  if (!identity(value)) return null;
  const codes: CalendarOutcomeInspectionCode[] = ['disabled', 'unauthenticated', 'account_unavailable', 'read_permission_required',
    'authorization_expired', 'event_unavailable', 'event_not_supported', 'provider_unavailable'];
  if (value.outcome === 'inspection_unavailable' && reviewedUpdateExactKeys(value, [...identityKeys, 'outcome', 'code'])
    && codes.includes(value.code as CalendarOutcomeInspectionCode)) return value as CalendarOutcomeInspectionResponse;
  if (value.outcome === 'observed' && reviewedUpdateExactKeys(value, [...identityKeys, 'outcome', 'observationOnly', 'etag', 'fields', 'observedAt'])
    && value.observationOnly === true && reviewedUpdateEtag(value.etag) && isCalendarReviewedUpdateFields(value.fields)
    && typeof value.observedAt === 'number' && Number.isSafeInteger(value.observedAt) && value.observedAt >= 0 && value.observedAt <= 8.64e15) {
    return value as CalendarOutcomeInspectionResponse;
  }
  return null;
}
