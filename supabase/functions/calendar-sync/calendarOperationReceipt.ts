import {
  calendarOperationDigests, calendarOperationGoogleId, calendarOperationIdentity,
  equalCalendarOperationIdentity, parseCalendarOperationRequest, parseCalendarOperationStoredRecord,
  type CalendarOperationHeldCode, type CalendarOperationIdentity, type CalendarOperationPrepareRequest,
  type CalendarOperationPrepareResponse, type CalendarOperationRequest, type CalendarOperationResponse, type CalendarOperationResult,
} from '../_shared/calendarOperationReceiptContract.ts';
import {
  equalCalendarReviewedUpdateFields, parseCalendarReviewedUpdateResponse,
  reviewedUpdateExactKeys, reviewedUpdateRecord, reviewedUpdateUuid,
} from '../_shared/calendarReviewedUpdateContract.ts';
import { handleReviewedCalendarUpdate, type ReviewedCalendarUpdateDependencies } from './reviewedCalendarUpdate.ts';
import type { CalendarOperationRegistry } from './calendarOperationRegistry.ts';

// This ledger covers reviewed v2 attempts only. Legacy create/delete, sync,
// other clients and external writers are not inventoried or frozen by it.
/** A saved-receipt read has no provider, token, account, cache-write or activation port. */
export interface CalendarOperationReadDependencies extends Pick<CalendarOperationRegistry, 'readOperation'> {
  callerUserId: string | null;
  isInternalCaller: boolean;
}
export interface CalendarOperationUpdateDependencies extends ReviewedCalendarUpdateDependencies, CalendarOperationRegistry {}

function response(body: CalendarOperationResponse | { error: 'invalid_request' }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
  } });
}
function held(identity: CalendarOperationIdentity, code: CalendarOperationHeldCode): Response {
  return response({ version: 2, ...identity, outcome: 'held', code });
}
function snapshotRequest(raw: unknown): CalendarOperationRequest | null {
  try {
    const parsed = parseCalendarOperationRequest(raw);
    return parsed ? parseCalendarOperationRequest(structuredClone(parsed)) : null;
  } catch { return null; }
}
function authenticated(dependencies: CalendarOperationReadDependencies): dependencies is CalendarOperationReadDependencies & { callerUserId: string } {
  return !dependencies.isInternalCaller && reviewedUpdateUuid(dependencies.callerUserId);
}
function storedResponse(raw: unknown, owner: string, identity: CalendarOperationIdentity, missing: CalendarOperationHeldCode): Response {
  if (raw === null) return held(identity, missing);
  const saved = parseCalendarOperationStoredRecord(raw, owner);
  if (!saved || !equalCalendarOperationIdentity(saved.identity, identity)) return held(identity, 'registry_unavailable');
  if ((saved.state === 'written' || saved.state === 'not_written') &&
    (saved.result?.outcome === 'written' || saved.result?.outcome === 'not_written') && saved.completedAt !== null) {
    return response({ version: 2, ...identity, outcome: 'recorded', completedAt: saved.completedAt, result: saved.result });
  }
  return held(identity, saved.state === 'provider_written' ? 'provider_written_cache_unknown'
    : saved.state === 'pending' ? 'operation_pending' : 'outcome_unknown');
}
function sameResult(left: CalendarOperationResult | null, right: CalendarOperationResult): boolean {
  if (!left || left.outcome !== right.outcome) return false;
  if ('code' in left && 'code' in right) return left.code === right.code;
  return 'etag' in left && 'etag' in right && left.etag === right.etag && left.cacheUpdated === right.cacheUpdated;
}

/** Recovery reads only saved execution evidence. Absence never means no write. */
export async function handleCalendarOperationReceiptRead(raw: unknown, dependencies: CalendarOperationReadDependencies): Promise<Response> {
  const parsed = snapshotRequest(raw);
  if (!parsed || parsed.action !== 'read_reviewed_update_receipt') return response({ error: 'invalid_request' }, 400);
  const identity = Object.freeze(calendarOperationIdentity(parsed));
  if (!authenticated(dependencies)) return held(identity, 'unauthenticated');
  try {
    return storedResponse(await dependencies.readOperation(dependencies.callerUserId, identity),
      dependencies.callerUserId, identity, 'operation_unknown');
  } catch { return held(identity, 'registry_unavailable'); }
}

async function prepare(request: CalendarOperationPrepareRequest, dependencies: CalendarOperationUpdateDependencies): Promise<Response> {
  const identity = { operationId: request.operationId, taskId: request.taskId,
    calendarAccountId: request.calendarAccountId, eventId: request.eventId };
  const unavailable = (code: Extract<CalendarOperationPrepareResponse, { outcome: 'unavailable' }>['code']) =>
    response({ version: 2, ...identity, outcome: 'unavailable', code });
  if (!authenticated(dependencies)) return unavailable('unauthenticated');
  if (dependencies.enabled !== 'true') return unavailable('disabled');
  // Preparation is a GET-only preview, not admission, execution or a saved hold.
  let googleCalendarId: string | undefined;
  try {
    const result = await handleReviewedCalendarUpdate({ version: 1, action: 'prepare_reviewed_update',
      operationId: request.operationId, calendarAccountId: request.calendarAccountId, eventId: request.eventId }, {
      ...dependencies,
      loadAccount: async (accountId, owner) => {
        const account = await dependencies.loadAccount(accountId, owner);
        if (reviewedUpdateRecord(account) && calendarOperationGoogleId(account.calendar_id)) googleCalendarId = account.calendar_id;
        return account;
      },
    });
    const parsed = parseCalendarReviewedUpdateResponse(await result.json());
    if (!parsed || parsed.operationId !== request.operationId || parsed.calendarAccountId !== request.calendarAccountId || parsed.eventId !== request.eventId)
      return unavailable('provider_unavailable');
    if (parsed.outcome === 'not_written') return unavailable(parsed.code);
    if (parsed.outcome !== 'ready' || !googleCalendarId) return unavailable('provider_unavailable');
    return response({ version: 2, ...identity, outcome: 'ready', googleCalendarId, expectedEtag: parsed.expectedEtag, before: parsed.before });
  } catch { return unavailable('provider_unavailable'); }
}

/** Only a freshly committed registry claim may invoke the single-attempt helper. */
export async function handleCalendarOperationUpdate(raw: unknown, dependencies: CalendarOperationUpdateDependencies): Promise<Response> {
  const parsed = snapshotRequest(raw);
  if (!parsed || parsed.action === 'read_reviewed_update_receipt') return response({ error: 'invalid_request' }, 400);
  // Detach the reviewed request before any await or dependency sees it.
  const request = parsed;
  if (request.action === 'prepare_reviewed_update') return prepare(request, dependencies);
  const identity = Object.freeze(calendarOperationIdentity(request));
  if (!authenticated(dependencies)) return held(identity, 'unauthenticated');
  if (dependencies.enabled !== 'true') return held(identity, 'disabled');
  const owner = dependencies.callerUserId;
  let admitted = false;
  try {
    const digests = await calendarOperationDigests(owner, request);
    if (digests.requestDigest !== identity.requestDigest || digests.afterDigest !== identity.afterDigest) return held(identity, 'invalid_request');
    const claim = await dependencies.claimOperation(owner, identity);
    if (!reviewedUpdateRecord(claim)) return held(identity, 'registry_unavailable');
    if (claim.claimed === false && reviewedUpdateExactKeys(claim, ['claimed'])) {
      // Replays never re-check provider liveness or turn into a fresh attempt.
      return storedResponse(await dependencies.readOperation(owner, identity), owner, identity, 'operation_conflict');
    }
    if (claim.claimed !== true || !reviewedUpdateExactKeys(claim, ['claimed', 'claimToken']) || !reviewedUpdateUuid(claim.claimToken))
      return held(identity, 'registry_unavailable');
    admitted = true;
    const result = await handleReviewedCalendarUpdate({ version: 1, action: 'confirm_reviewed_update',
      operationId: identity.operationId, calendarAccountId: identity.calendarAccountId, eventId: identity.eventId,
      expectedEtag: identity.expectedEtag, before: request.before, after: request.after }, {
      ...dependencies,
      loadAccount: async (accountId, authenticatedOwner) => {
        const account = await dependencies.loadAccount(accountId, authenticatedOwner);
        if (!reviewedUpdateRecord(account) || account.calendar_id !== identity.googleCalendarId) throw new Error('Calendar target unavailable');
        return account;
      },
    });
    const provider = parseCalendarReviewedUpdateResponse(await result.json());
    if (!provider || provider.operationId !== identity.operationId || provider.calendarAccountId !== identity.calendarAccountId ||
      provider.eventId !== identity.eventId || provider.outcome === 'ready') return held(identity, 'outcome_unknown');
    let completion: CalendarOperationResult;
    if (provider.outcome === 'written' || provider.outcome === 'provider_written_cache_unknown') {
      if (provider.etag === identity.expectedEtag || !equalCalendarReviewedUpdateFields(provider.fields, request.after)) return held(identity, 'outcome_unknown');
      completion = provider.outcome === 'written'
        ? { outcome: 'written', etag: provider.etag, cacheUpdated: true }
        : { outcome: 'provider_written_cache_unknown', etag: provider.etag, cacheUpdated: false };
    } else completion = provider.outcome === 'not_written'
      ? { outcome: 'not_written', code: provider.code }
      : { outcome: 'uncertain', code: 'provider_outcome_unknown' };
    // A lost finalize reply can follow a committed terminal row. Do not overwrite
    // it or try again: a later owner-only read can recover that exact receipt.
    const finalized = await dependencies.finalizeOperation(owner, identity, claim.claimToken, completion);
    const saved = parseCalendarOperationStoredRecord(finalized, owner);
    if (!saved || !equalCalendarOperationIdentity(saved.identity, identity) || !sameResult(saved.result, completion)) return held(identity, 'outcome_unknown');
    return storedResponse(saved, owner, identity, 'operation_unknown');
  } catch {
    // No raw provider, RPC, intent, token or account text reaches outer logging.
    return held(identity, admitted ? 'outcome_unknown' : 'registry_unavailable');
  }
}
