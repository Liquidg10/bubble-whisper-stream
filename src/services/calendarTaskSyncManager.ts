/**
 * Owner-bound Calendar-to-task synchronization. Automatic provider writes are
 * unavailable; manual existing-event updates use a separate gated review flow.
 * Stopping admission does not cancel an already dispatched local transaction.
 */
import type { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore } from '@/stores/taskStore';
import { storageService } from '@/services/storage';
import { withCalendarSyncLock } from '@/services/calendarSyncCoordinator';
import { findRecoveryCandidate } from '@/services/calendarImportRecoveryEvidence';
import { findOutboundTaskCandidate } from '@/services/calendarOutboundTaskEvidence';
import { readOutboundJournal, writeOutboundJournal, outboundHeld, outboundHolds, outboundOperationIdentity,
  type CalendarOutboundReceipt, type CalendarOutboundHold } from '@/services/calendarOutboundJournal';
import { parseCalendarOutcomeInspectionResponse, type CalendarOutcomeInspectionCode,
  type CalendarOutcomeInspectionResponse } from '../../supabase/functions/_shared/calendarOutcomeInspectionContract';
import { isCalendarReviewedUpdateFields, equalCalendarReviewedUpdateFields,
  type CalendarReviewedUpdateFields } from '../../supabase/functions/_shared/calendarReviewedUpdateContract';
import { parseCalendarOperationResponse, calendarOperationDigests, calendarOperationIdentity, equalCalendarOperationIdentity,
  type CalendarOperationIdentity, type CalendarOperationResponse, type CalendarOperationRecordedResponse } from '../../supabase/functions/_shared/calendarOperationReceiptContract';

export interface CalendarTaskMapping {
  taskId: string;
  eventId: string;
  calendarAccountId: string;
  lastSyncedAt: number;
  syncDirection: 'task-to-calendar' | 'calendar-to-task' | 'bidirectional';
  conflictStatus: 'none' | 'resolved' | 'pending';
}

export interface SyncConflict {
  id: string;
  taskId: string;
  eventId: string;
  conflictType: 'time' | 'title' | 'location' | 'description';
  taskValue: string;
  calendarValue: string;
  timestamp: number;
  resolution?: 'prefer-task' | 'prefer-calendar' | 'merge' | 'manual';
}

export interface CalendarSyncOutcome {
  success: boolean;
  written?: boolean;
  taskId?: string;
  eventId?: string;
  conflictId?: string;
  reviewRequired?: boolean;
  message?: string;
}

export interface CalendarFullSyncResult {
  tasksProcessed: number;
  eventsProcessed: number;
  conflictsDetected: number;
  reviewRequired: number;
  errors: string[];
}

export interface CalendarImportRecoveryInspection {
  status: 'recoverable' | 'blocked';
  message: string;
  reviewToken?: string;
  taskId?: string;
  taskTitle?: string;
  eventTitle?: string;
}

export interface CalendarImportRecoveryResult { success: boolean; message: string; taskId?: string }
export interface CalendarOutboundInspection {
  status: 'reviewable' | 'blocked'; message: string; code?: string; reviewToken?: string; taskId?: string;
  calendarAccountId?: string; eventId?: string; googleCalendarId?: string;
  before?: CalendarReviewedUpdateFields; after?: CalendarReviewedUpdateFields;
}
export interface CalendarOutboundResult {
  status: 'written' | 'not_written' | 'uncertain' | 'provider_written'; message: string; taskId?: string;
}
export type CalendarOutboundOutcomeInspection = {
  status: 'observed'; operationId: string; calendarAccountId: string; eventId: string;
  observationOnly: true; etag: string; fields: CalendarReviewedUpdateFields; observedAt: number; message: string;
} | { status: 'blocked'; message: string; code?: CalendarOutcomeInspectionCode };
export type CalendarRecordedRecoveryInspection = { status: 'reviewable'; reviewToken: string; receipt: CalendarOperationRecordedResponse; message: string }
  | { status: 'blocked'; message: string };
export type CalendarRecordedRecoveryResult = { success: boolean; operationId?: string; outcome?: 'written' | 'not_written'; message: string };

interface OwnerState {
  mappings: Map<string, CalendarTaskMapping>;
  conflicts: Map<string, SyncConflict>;
  unresolved: Set<string>;
  blocked: boolean;
}
interface SyncContext { ownerUserId: string; generation: number }
interface CanonicalEvent {
  user_id: string;
  calendar_account_id: string;
  external_event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  description: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
const MAX_ITEMS = 1000;
const MAX_STATE_BYTES = 1024 * 1024;
const REVIEW_MESSAGE = 'Outgoing Calendar changes require review; no provider event was written.';
const STOPPED_MESSAGE = 'Calendar synchronization could not run. Check this account, saved state, browser coordination, and other pending calendar work.';
const STATE_MESSAGE = 'Calendar synchronization state requires review before further imports.';
const OUTCOME_MESSAGE = 'The local import outcome requires review before it can be repeated.';
const eventKey = (accountId: string, eventId: string) => JSON.stringify([accountId, eventId]);
export const calendarSyncStorageKey = (ownerUserId: string) => `calendar-task-sync:v1:${ownerUserId}`;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function safeId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value) && value !== '00000000-0000-0000-0000-000000000000'; }
function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function safeText(value: unknown): value is string { return typeof value === 'string' && value.length <= 4096; }
function review(message = REVIEW_MESSAGE): CalendarSyncOutcome { return { success: false, reviewRequired: true, message }; }
function emptyResult(): CalendarFullSyncResult {
  return { tasksProcessed: 0, eventsProcessed: 0, conflictsDetected: 0, reviewRequired: 0, errors: [] };
}
function emptyState(): OwnerState {
  return { mappings: new Map(), conflicts: new Map(), unresolved: new Set(), blocked: false };
}
function recordedFingerprint(receipt: CalendarOperationRecordedResponse): string {
  return JSON.stringify([calendarOperationIdentity(receipt), receipt.completedAt, receipt.result.outcome,
    receipt.result.outcome === 'written' ? receipt.result.etag : receipt.result.code]);
}
function agreesWithHeldEvidence(held: CalendarOutboundHold, receipt: CalendarOperationRecordedResponse): boolean {
  return held.outcome !== 'provider_written' || (receipt.result.outcome === 'written' && held.etag === receipt.result.etag);
}
function detachedOperationResponse(value: unknown): CalendarOperationResponse | null {
  const parsed = parseCalendarOperationResponse(value);
  if (!parsed) return null;
  // A parser proves this instant's shape, not future mutations of its caller's
  // object. Own the validated snapshot before any later authentication await.
  try { return parseCalendarOperationResponse(structuredClone(parsed)); } catch { return null; }
}

export class CalendarTaskSyncManager {
  private ownerUserId: string | null = null;
  private generation = 0;
  private interval: ReturnType<typeof setInterval> | undefined;
  private owners = new Map<string, OwnerState>();
  private tail: Promise<unknown> = Promise.resolve();
  private operations = new Map<string, Promise<unknown>>();
  private recoveryReview: { token: string; context: SyncContext; accountId: string; eventId: string; fingerprint: string; expiresAt: number } | null = null;
  private outboundReview: { token: string; context: SyncContext; operationId: string; taskId: string;
    accountId: string; eventId: string; fingerprint: string; expiresAt: number; expectedEtag: string;
    googleCalendarId: string; requestDigest: string; afterDigest: string;
    before: CalendarReviewedUpdateFields; after: CalendarReviewedUpdateFields } | null = null;
  private recordedRecoveryReview: { token: string; context: SyncContext; snapshot: string; expiresAt: number;
    receipt: CalendarOperationRecordedResponse } | null = null;

  // No constructor I/O: importing the Calendar page cannot start a writer,
  // load another user's browser state, or create a background timer.
  start(ownerUserId: string): void {
    if (!uuid(ownerUserId)) throw new Error('A canonical owner ID is required for Calendar synchronization.');
    if (this.ownerUserId === ownerUserId && this.interval !== undefined) return;
    this.stop();
    this.ownerUserId = ownerUserId;
    if (!this.owners.has(ownerUserId)) this.owners.set(ownerUserId, this.loadOwnerState(ownerUserId));
    const generation = this.generation;
    this.interval = setInterval(() => {
      if (this.isCurrent({ ownerUserId, generation })) void this.performIncrementalSync();
    }, 15 * 60 * 1000);
  }

  stop(): void {
    ++this.generation;
    this.ownerUserId = null;
    if (this.interval !== undefined) clearInterval(this.interval);
    this.interval = undefined;
    this.recoveryReview = null;
    this.outboundReview = null;
    this.recordedRecoveryReview = null;
    // Do not clear the admission tail or uncertainty holds on restart.
  }

  getStatus(): { isRunning: boolean; ownerUserId: string | null; pendingOperations: number; unresolvedOperations: number } {
    return {
      isRunning: this.interval !== undefined,
      ownerUserId: this.ownerUserId,
      pendingOperations: this.operations.size,
      unresolvedOperations: this.ownerUserId ? (() => {
        const state = this.owners.get(this.ownerUserId!);
        return state ? state.unresolved.size + Number(state.blocked) : 0;
      })() : 0,
    };
  }

  getUnresolvedImports(): { calendarAccountId: string; eventId: string }[] {
    const context = this.context();
    if (!context) return [];
    return [...this.state(context).unresolved].map(key => {
      const [calendarAccountId, eventId] = JSON.parse(key) as [string, string];
      return { calendarAccountId, eventId };
    });
  }

  refreshUnresolvedImports(): Promise<{ success: boolean; items: { calendarAccountId: string; eventId: string }[]; message: string }> {
    const context = this.context();
    const blocked = () => ({ success: false, items: [], message: 'Recovery inventory is unavailable. Existing holds are preserved; check this account and other open calendar tabs.' });
    if (!context) return Promise.resolve(blocked());
    return this.admit(context, 'recovery-inventory', async () => {
      await this.requireOwner(context);
      return { success: true, items: this.getUnresolvedImports(), message: 'Known held imports for this account were refreshed.' };
    }, blocked);
  }

  inspectImportRecovery(accountId: string, eventId: string): Promise<CalendarImportRecoveryInspection> {
    const context = this.context();
    const blocked = (): CalendarImportRecoveryInspection => ({ status: 'blocked', message: 'Recovery could not be verified. The hold is preserved; check this account and any other open calendar tabs.' });
    if (!context || !uuid(accountId) || !safeId(eventId)) return Promise.resolve(blocked());
    return this.admit(context, `inspect:${eventKey(accountId, eventId)}`, async () => {
      this.recoveryReview = null;
      const evidence = await this.recoveryEvidence(context, accountId, eventId);
      if (!evidence) return blocked();
      const token = crypto.randomUUID();
      this.recoveryReview = { token, context, accountId, eventId, fingerprint: evidence.fingerprint, expiresAt: Date.now() + 5 * 60_000 };
      return { status: 'recoverable', reviewToken: token, taskId: evidence.candidate.taskId,
        taskTitle: evidence.candidate.taskTitle.slice(0, 160), eventTitle: evidence.event.title.slice(0, 160),
        message: 'One matching saved task was verified. You can restore its local calendar link without changing the task or Google Calendar.' };
    }, blocked);
  }

  confirmImportRecovery(reviewToken: string): Promise<CalendarImportRecoveryResult> {
    const context = this.context();
    const blocked = (): CalendarImportRecoveryResult => ({ success: false, message: 'Recovery was not confirmed. The hold is preserved; review the saved task again.' });
    if (!context || !uuid(reviewToken)) return Promise.resolve(blocked());
    return this.admit(context, `recover:${reviewToken}`, async () => {
      const review = this.recoveryReview;
      this.recoveryReview = null; // Single-use, including failed confirmations.
      if (!review || review.token !== reviewToken || !this.isCurrent(review.context) || Date.now() >= review.expiresAt) return blocked();
      const evidence = await this.recoveryEvidence(context, review.accountId, review.eventId);
      if (!evidence || evidence.fingerprint !== review.fingerprint || Date.now() >= review.expiresAt) return blocked();
      const state = this.state(context);
      const key = eventKey(review.accountId, review.eventId);
      const next: OwnerState = { ...state, mappings: new Map(state.mappings), conflicts: new Map(state.conflicts), unresolved: new Set(state.unresolved) };
      const existing = next.mappings.get(key);
      // This is an association receipt, not proof of the original lost write.
      // Existing conflicts remain for their separately reviewed resolution.
      next.mappings.set(key, existing ?? { taskId: evidence.candidate.taskId, eventId: review.eventId,
        calendarAccountId: review.accountId, lastSyncedAt: Date.now(), syncDirection: 'calendar-to-task', conflictStatus: 'none' });
      next.unresolved.delete(key);
      if (localStorage.getItem(calendarSyncStorageKey(context.ownerUserId)) !== evidence.storageSnapshot) return blocked();
      if (!this.persist(context.ownerUserId, next)) return blocked();
      this.owners.set(context.ownerUserId, next);
      return { success: true, taskId: evidence.candidate.taskId, message: 'The verified local calendar link was restored. No task or Google Calendar content was changed.' };
    }, blocked);
  }

  private async recoveryEvidence(context: SyncContext, accountId: string, eventId: string) {
    const state = this.state(context);
    const key = eventKey(accountId, eventId);
    if (!state.unresolved.has(key)) return null;
    const storageSnapshot = localStorage.getItem(calendarSyncStorageKey(context.ownerUserId));
    const event = await this.canonicalEvent(context, accountId, eventId);
    await this.requireOwner(context);
    await storageService.initialize();
    this.state(context);
    const bubbles = await storageService.readCommittedBubbles();
    this.state(context);
    const candidate = findRecoveryCandidate(bubbles, context.ownerUserId, event);
    if (!candidate || localStorage.getItem(calendarSyncStorageKey(context.ownerUserId)) !== storageSnapshot) return null;
    const mapping = state.mappings.get(key);
    if (mapping && mapping.taskId !== candidate.taskId) return null;
    if ([...state.mappings.entries()].some(([otherKey, value]) => otherKey !== key && value.taskId === candidate.taskId)) return null;
    return { candidate, event, storageSnapshot, fingerprint: JSON.stringify([storageSnapshot, event, candidate.fingerprint]) };
  }

  refreshOutboundHolds(): Promise<{ success: boolean; items: CalendarOutboundHold[]; message: string }> {
    const context = this.context();
    const blocked = () => ({ success: false, items: [], message: 'Saved update holds could not be verified. This is not an empty inventory; all holds remain unchanged.' });
    if (!context) return Promise.resolve(blocked());
    return this.admit(context, 'outbound-hold-inventory', async () => {
      this.recordedRecoveryReview = null;
      await this.requireOutcomeOwner(context);
      const { journal, snapshot } = readOutboundJournal(context.ownerUserId);
      await this.requireOutcomeOwner(context);
      if (readOutboundJournal(context.ownerUserId).snapshot !== snapshot) return blocked();
      return { success: true, items: outboundHolds(journal), message: 'All saved holds in this account’s current browser journal. Other browsers, devices and server work are not inventoried here.' };
    }, blocked);
  }

  inspectOutboundHold(operationId: string): Promise<CalendarOutboundOutcomeInspection> {
    const context = this.context();
    const blocked = (code?: CalendarOutcomeInspectionCode): CalendarOutboundOutcomeInspection => ({ status: 'blocked',
      message: 'The current Google event could not be inspected. The original outcome is not established by this inspection; its saved hold remains unchanged.', ...(code ? { code } : {}) });
    if (!context || !uuid(operationId)) return Promise.resolve(blocked());
    return this.admit(context, `outbound-hold-inspection:${operationId}`, async () => {
      this.recordedRecoveryReview = null;
      await this.requireOutcomeOwner(context);
      const { journal, snapshot } = readOutboundJournal(context.ownerUserId);
      const held = outboundHolds(journal).find(receipt => receipt.operationId === operationId);
      if (!held) return blocked();
      const { data, error } = await supabase.functions.invoke('calendar-sync', { body: { version: 1, action: 'inspect_reviewed_outcome',
        operationId, calendarAccountId: held.calendarAccountId, eventId: held.eventId } });
      let result: CalendarOutcomeInspectionResponse | null = null;
      if (!error) result = parseCalendarOutcomeInspectionResponse(data);
      else if (error.context instanceof Response) {
        try { result = parseCalendarOutcomeInspectionResponse(await error.context.json()); } catch { /* observation unavailable */ }
      }
      await this.requireOutcomeOwner(context);
      if (readOutboundJournal(context.ownerUserId).snapshot !== snapshot || !result || result.operationId !== operationId
        || result.calendarAccountId !== held.calendarAccountId || result.eventId !== held.eventId) return blocked();
      if (result.outcome === 'inspection_unavailable') return blocked(result.code);
      return { status: 'observed', operationId, calendarAccountId: held.calendarAccountId, eventId: held.eventId,
        observationOnly: true, etag: result.etag, fields: { ...result.fields }, observedAt: result.observedAt,
        message: 'Current Google event observed only. These values do not prove the original update completed or stopped. The saved hold remains; do not retry the update.' };
    }, blocked);
  }

  inspectRecordedOutboundRecovery(operationId: string): Promise<CalendarRecordedRecoveryInspection> {
    const context = this.context();
    const blocked = (): CalendarRecordedRecoveryInspection => ({ status: 'blocked',
      message: 'No exact completed server receipt was verified. The saved hold remains unchanged; no calendar operation was repeated.' });
    if (!context || !uuid(operationId)) return Promise.resolve(blocked());
    return this.admit(context, `recorded-outbound-inspect:${operationId}`, async () => {
      this.recordedRecoveryReview = null;
      await this.requireOutcomeOwner(context);
      const { journal, snapshot } = readOutboundJournal(context.ownerUserId);
      const held = outboundHolds(journal).find(receipt => receipt.operationId === operationId);
      const identity = held ? outboundOperationIdentity(held) : null;
      // Legacy rows never acquire intent from a provider observation or a server response.
      if (!held || !identity || snapshot === null) return blocked();
      const result = await this.invokeCalendarOperation({ version: 2, action: 'read_reviewed_update_receipt', ...identity });
      await this.requireOutcomeOwner(context);
      if (readOutboundJournal(context.ownerUserId).snapshot !== snapshot || !result || result.outcome !== 'recorded'
        || !equalCalendarOperationIdentity(result, identity) || !agreesWithHeldEvidence(held, result)) return blocked();
      const token = crypto.randomUUID();
      const receipt = { ...result, result: { ...result.result } };
      this.recordedRecoveryReview = { token, context, snapshot, expiresAt: Date.now() + 5 * 60_000, receipt };
      return { status: 'reviewable', reviewToken: token, receipt: { ...receipt, result: { ...receipt.result } },
        message: 'The server saved this exact historical completion. Confirm only to save its outcome in this browser; no Google request or task change will be made.' };
    }, blocked);
  }

  confirmRecordedOutboundRecovery(reviewToken: string): Promise<CalendarRecordedRecoveryResult> {
    const context = this.context();
    const blocked = (): CalendarRecordedRecoveryResult => ({ success: false,
      message: 'The completed receipt could not be saved. The hold remains; refresh and review its server receipt again. No calendar operation was repeated.' });
    if (!context || !uuid(reviewToken)) return Promise.resolve(blocked());
    return this.admit(context, `recorded-outbound-confirm:${reviewToken}`, async () => {
      const preview = this.recordedRecoveryReview;
      this.recordedRecoveryReview = null;
      if (!preview || preview.token !== reviewToken || !this.isCurrent(preview.context) || Date.now() >= preview.expiresAt) return blocked();
      await this.requireOutcomeOwner(context);
      const { journal, snapshot } = readOutboundJournal(context.ownerUserId);
      const held = outboundHolds(journal).find(receipt => receipt.operationId === preview.receipt.operationId);
      const identity = held ? outboundOperationIdentity(held) : null;
      if (!held || !identity || snapshot !== preview.snapshot || !equalCalendarOperationIdentity(identity, preview.receipt)
        || !agreesWithHeldEvidence(held, preview.receipt)) return blocked();
      const result = await this.invokeCalendarOperation({ version: 2, action: 'read_reviewed_update_receipt', ...identity });
      await this.requireOutcomeOwner(context);
      if (Date.now() >= preview.expiresAt || readOutboundJournal(context.ownerUserId).snapshot !== snapshot
        || !result || result.outcome !== 'recorded' || recordedFingerprint(result) !== recordedFingerprint(preview.receipt)
        || !agreesWithHeldEvidence(held, result)) return blocked();
      const completed: CalendarOutboundReceipt = { ...held, outcome: result.result.outcome,
        completedAt: Math.max(Date.now(), held.createdAt), ...(result.result.outcome === 'written' ? { etag: result.result.etag } : {}) };
      // A non-written result has no provider ETag; conflicting written evidence never gets here.
      if (result.result.outcome === 'not_written') delete completed.etag;
      writeOutboundJournal(context.ownerUserId, { ...journal,
        receipts: journal.receipts.map(receipt => receipt.operationId === held.operationId ? completed : receipt) }, snapshot);
      return { success: true, operationId: held.operationId, outcome: result.result.outcome,
        message: 'The exact server completion was saved in this browser. No Google operation, cache repair, task edit or mapping change was performed.' };
    }, blocked);
  }

  refreshOutboundTasks(): Promise<{ success: boolean; items: { taskId: string; taskTitle: string; held: boolean }[]; message: string }> {
    const context = this.context();
    const blocked = () => ({ success: false, items: [], message: 'Linked task inventory could not be verified. Saved update outcomes were preserved.' });
    if (!context) return Promise.resolve(blocked());
    return this.admit(context, 'outbound-inventory', async () => {
      this.outboundReview = null;
      await this.requireOwner(context);
      const state = this.state(context);
      const { journal, snapshot } = readOutboundJournal(context.ownerUserId);
      const syncSnapshot = localStorage.getItem(calendarSyncStorageKey(context.ownerUserId));
      await storageService.initialize();
      this.state(context);
      const rows = await storageService.readCommittedBubbles();
      await this.requireOwner(context);
      if (readOutboundJournal(context.ownerUserId).snapshot !== snapshot || localStorage.getItem(calendarSyncStorageKey(context.ownerUserId)) !== syncSnapshot) return blocked();
      const items = [...state.mappings.values()].flatMap(mapping => {
        const candidate = findOutboundTaskCandidate(rows, context.ownerUserId, mapping);
        if (!candidate || [...state.mappings.values()].filter(item => item.taskId === mapping.taskId).length !== 1) return [];
        return [{ taskId: candidate.taskId, taskTitle: candidate.fields.title.slice(0, 160),
          held: state.unresolved.has(eventKey(mapping.calendarAccountId, mapping.eventId)) || outboundHeld(journal, mapping.calendarAccountId, mapping.eventId) }];
      });
      return { success: true, items, message: 'Verified local links only; this is not a complete provider or unresolved-outcome inventory.' };
    }, blocked);
  }

  inspectOutboundUpdate(taskId: string): Promise<CalendarOutboundInspection> {
    const context = this.context();
    const blocked = (message = 'This update could not be reviewed. Check the account, saved task, permissions and existing outcome holds.', code?: string): CalendarOutboundInspection => ({ status: 'blocked', message, ...(code ? { code } : {}) });
    if (!context || !safeId(taskId)) return Promise.resolve(blocked());
    return this.admit(context, `outbound-inspect:${taskId}`, async () => {
      this.outboundReview = null;
      const evidence = await this.outboundEvidence(context, taskId);
      if (!evidence) return blocked();
      const operationId = crypto.randomUUID();
      const result = await this.invokeCalendarOperation({ version: 2, action: 'prepare_reviewed_update', operationId, taskId,
        calendarAccountId: evidence.mapping.calendarAccountId, eventId: evidence.mapping.eventId });
      await this.requireOwner(context);
      if (!result || result.operationId !== operationId || result.taskId !== taskId || result.calendarAccountId !== evidence.mapping.calendarAccountId || result.eventId !== evidence.mapping.eventId) return blocked();
      if (result.outcome === 'unavailable') return blocked(this.outboundMessage(result), result.code);
      if (result.outcome !== 'ready') return blocked();
      // Detach provider data before any further await: digests and displayed
      // review must describe the same immutable target and fields.
      const googleCalendarId = result.googleCalendarId;
      const expectedEtag = result.expectedEtag;
      const before = Object.freeze({ ...result.before });
      const fresh = await this.outboundEvidence(context, taskId);
      if (!fresh || fresh.fingerprint !== evidence.fingerprint) return blocked();
      const after = Object.freeze({ ...fresh.candidate.fields, startTz: before.startTz, endTz: before.endTz });
      if (!isCalendarReviewedUpdateFields(after)) return blocked();
      if (equalCalendarReviewedUpdateFields(before, after)) return blocked('The reviewed fields already match Google Calendar. No update was sent.');
      const digests = await calendarOperationDigests(context.ownerUserId, { operationId, taskId,
        calendarAccountId: evidence.mapping.calendarAccountId, eventId: evidence.mapping.eventId,
        googleCalendarId, expectedEtag, before, after });
      await this.requireOwner(context);
      if (readOutboundJournal(context.ownerUserId).snapshot !== fresh.journalSnapshot
        || localStorage.getItem(calendarSyncStorageKey(context.ownerUserId)) !== fresh.syncSnapshot) return blocked();
      const token = crypto.randomUUID();
      this.outboundReview = { token, context, operationId, taskId, accountId: evidence.mapping.calendarAccountId,
        eventId: evidence.mapping.eventId, fingerprint: fresh.fingerprint, expiresAt: Date.now() + 5 * 60_000,
        expectedEtag, googleCalendarId, ...digests, before, after };
      return { status: 'reviewable', reviewToken: token, taskId, calendarAccountId: evidence.mapping.calendarAccountId,
        eventId: evidence.mapping.eventId, googleCalendarId, before: { ...before }, after: { ...after },
        message: 'Review every field. Confirmation updates this existing Google event only; saved task contents and sync conflicts stay unchanged.' };
    }, blocked);
  }

  confirmOutboundUpdate(reviewToken: string): Promise<CalendarOutboundResult> {
    const context = this.context();
    const notWritten = (): CalendarOutboundResult => ({ status: 'not_written', message: 'No update was dispatched. Review the current saved task again.' });
    // From the moment dispatch is admitted, exceptions must not claim no write.
    let dispatched = false;
    const unknown = (): CalendarOutboundResult => dispatched
      ? { status: 'uncertain', message: 'The Google update outcome is unconfirmed. Its saved hold blocks another attempt; outcome review is required.' } : notWritten();
    if (!context || !uuid(reviewToken)) return Promise.resolve(notWritten());
    return this.admit(context, `outbound-confirm:${reviewToken}`, async () => {
      const reviewed = this.outboundReview;
      this.outboundReview = null;
      if (!reviewed || reviewed.token !== reviewToken || !this.isCurrent(reviewed.context) || Date.now() >= reviewed.expiresAt) return notWritten();
      const evidence = await this.outboundEvidence(context, reviewed.taskId);
      if (!evidence || evidence.fingerprint !== reviewed.fingerprint) return notWritten();
      await this.requireOwner(context);
      if (Date.now() >= reviewed.expiresAt || localStorage.getItem(calendarSyncStorageKey(context.ownerUserId)) !== evidence.syncSnapshot) return notWritten();
      const receipt: CalendarOutboundReceipt = { operationId: reviewed.operationId, taskId: reviewed.taskId,
        calendarAccountId: reviewed.accountId, eventId: reviewed.eventId, createdAt: Date.now(), outcome: 'pending',
        intent: { version: 2, googleCalendarId: reviewed.googleCalendarId, expectedEtag: reviewed.expectedEtag,
          requestDigest: reviewed.requestDigest, afterDigest: reviewed.afterDigest } };
      const identity = outboundOperationIdentity(receipt)!;
      const journal = { ...evidence.journal, receipts: [...evidence.journal.receipts, receipt] };
      const pendingSnapshot = writeOutboundJournal(context.ownerUserId, journal, evidence.journalSnapshot);
      dispatched = true;
      const result = await this.invokeCalendarOperation({ version: 2, action: 'confirm_reviewed_update', ...identity,
        before: { ...reviewed.before }, after: { ...reviewed.after } });
      this.state(context);
      if (!result || result.outcome !== 'recorded' || !equalCalendarOperationIdentity(result, identity)) return unknown();
      const outcome = result.result.outcome;
      const etag = result.result.outcome === 'written' ? result.result.etag : undefined;
      const completed = { ...receipt, outcome, completedAt: Math.max(Date.now(), receipt.createdAt), ...(etag ? { etag } : {}) };
      try {
        writeOutboundJournal(context.ownerUserId, { ...journal, receipts: [...journal.receipts.slice(0, -1), completed] }, pendingSnapshot);
      } catch {
        if (etag) return { status: 'provider_written', taskId: reviewed.taskId, message: 'Google returned the reviewed update, but its local receipt could not be saved. The hold remains; do not repeat it.' };
        return unknown();
      }
      if (outcome === 'written') return { status: 'written', taskId: reviewed.taskId, message: 'Google confirmed the reviewed update and its cache receipt. Saved task contents and existing sync conflicts were not changed.' };
      if (result.result.outcome === 'not_written') return { status: 'not_written', taskId: reviewed.taskId, message: this.outboundMessage(result.result) };
      return unknown();
    }, unknown);
  }

  private async outboundEvidence(context: SyncContext, taskId: string) {
    await this.requireOwner(context);
    const state = this.state(context);
    const mappings = [...state.mappings.values()].filter(mapping => mapping.taskId === taskId);
    if (mappings.length !== 1) return null;
    const mapping = mappings[0];
    const { journal, snapshot: journalSnapshot } = readOutboundJournal(context.ownerUserId);
    if (journal.receipts.length >= 1000 || state.unresolved.has(eventKey(mapping.calendarAccountId, mapping.eventId))
      || outboundHeld(journal, mapping.calendarAccountId, mapping.eventId)) return null;
    const syncSnapshot = localStorage.getItem(calendarSyncStorageKey(context.ownerUserId));
    await storageService.initialize();
    this.state(context);
    const rows = await storageService.readCommittedBubbles();
    await this.requireOwner(context);
    const candidate = findOutboundTaskCandidate(rows, context.ownerUserId, mapping);
    if (!candidate || readOutboundJournal(context.ownerUserId).snapshot !== journalSnapshot
      || localStorage.getItem(calendarSyncStorageKey(context.ownerUserId)) !== syncSnapshot) return null;
    return { candidate, mapping, journal, journalSnapshot, syncSnapshot,
      fingerprint: JSON.stringify([candidate.fingerprint, syncSnapshot, journalSnapshot]) };
  }

  private async invokeCalendarOperation(body: Record<string, unknown>): Promise<CalendarOperationResponse | null> {
    const { data, error } = await supabase.functions.invoke('calendar-sync', { body });
    if (!error) return detachedOperationResponse(data);
    // Supabase wraps non-2xx responses. Only a strict versioned server receipt
    // can explain a partial result; never infer an outcome from error text.
    const response = error.context;
    if (!(response instanceof Response)) return null;
    try { return detachedOperationResponse(await response.json()); } catch { return null; }
  }

  private outboundMessage(result: { code?: string }): string {
    if (result.code === 'disabled') return 'Reviewed Google updates are not enabled on this server. No update was sent.';
    if (result.code === 'write_permission_required') return 'This Google connection has no verified write permission. A separately approved reconnection is required; no update was sent.';
    if (result.code === 'stale_review') return 'The Google event changed after review. No update was written; review it again.';
    if (result.code === 'event_not_supported') return 'This flow supports only single timed events without guests. No update was sent.';
    if (result.code === 'registry_unavailable') return 'Durable Calendar receipts are unavailable. No update was submitted by this review.';
    return 'The server confirmed no update was written. Check the account and permissions, then review again.';
  }

  syncTaskToCalendar(task: Task): Promise<CalendarSyncOutcome> {
    const context = this.context();
    if (!context) return Promise.resolve(review(STOPPED_MESSAGE));
    return this.admit(context, `outgoing:${safeId(task?.id) ? task.id : 'invalid'}`, async () => review(), () => review(STOPPED_MESSAGE));
  }

  syncCalendarToTask(eventId: string, eventData: unknown): Promise<CalendarSyncOutcome> {
    const context = this.context();
    const accountId = record(eventData) ? eventData.calendar_account_id : undefined;
    if (!context) return Promise.resolve(review(STOPPED_MESSAGE));
    if (!safeId(eventId) || !uuid(accountId)) return Promise.resolve(review('A valid Calendar event reference is required.'));
    // Caller payload supplies only a locator. Content and ownership are always
    // refetched from the canonical owner/account-bound event row.
    return this.admit(context, `event:${eventKey(accountId, eventId)}`, () => this.importEvent(context, accountId, eventId), () => review(STOPPED_MESSAGE));
  }

  performFullSync(): Promise<CalendarFullSyncResult> {
    const context = this.context();
    const stopped = () => ({ ...emptyResult(), errors: [STOPPED_MESSAGE] });
    if (!context) return Promise.resolve(stopped());
    return this.admit(context, 'sync', () => this.synchronize(context), stopped);
  }

  private performIncrementalSync(): Promise<CalendarFullSyncResult> {
    const context = this.context();
    const stopped = () => ({ ...emptyResult(), errors: [STOPPED_MESSAGE] });
    if (!context) return Promise.resolve(stopped());
    // The historical timer only inspected outgoing tasks. Retiring that writer
    // must not silently enable recurring Calendar-to-local imports instead.
    return this.admit(context, 'review', async () => {
      await this.requireOwner(context);
      const state = this.state(context);
      const result = emptyResult();
      result.reviewRequired = useTaskStore.getState().tasks.filter(task =>
        task.updatedAt > Date.now() - 24 * 60 * 60 * 1000 && (task.view?.calendar || task.due) &&
        (!task.metadata?.userId || task.metadata.userId === context.ownerUserId) &&
        !this.mappingForTask(state, task.id)).length;
      return result;
    }, stopped);
  }

  resolveConflict(conflictId: string, resolution: SyncConflict['resolution'], _manualValues?: unknown): Promise<boolean> {
    // Unsupported outgoing/merge/manual paths fail before any partial local
    // mutation. There is no implemented update_event provider contract here.
    if (resolution !== 'prefer-calendar') return Promise.resolve(false);
    const context = this.context();
    if (!context || !safeId(conflictId)) return Promise.resolve(false);
    return this.admit(context, `conflict:${conflictId}`, async () => {
      const state = this.state(context);
      const conflict = state.conflicts.get(conflictId);
      if (!conflict || conflict.resolution) return false;
      const mapping = this.mappingForTask(state, conflict.taskId);
      if (!mapping || mapping.eventId !== conflict.eventId) return false;
      const result = await this.importEvent(context, mapping.calendarAccountId, mapping.eventId, true);
      return result.success;
    }, () => false);
  }

  getPendingConflicts(): SyncConflict[] {
    const state = this.visibleState();
    return state ? [...state.conflicts.values()].filter(conflict => !conflict.resolution).map(conflict => ({ ...conflict })) : [];
  }

  getMappingByTaskId(taskId: string): CalendarTaskMapping | undefined {
    const state = this.visibleState();
    const mapping = state && this.mappingForTask(state, taskId);
    return mapping ? { ...mapping } : undefined;
  }

  getMappingByEventId(eventId: string): CalendarTaskMapping | undefined {
    const mappings = [...(this.visibleState()?.mappings.values() ?? [])].filter(mapping => mapping.eventId === eventId);
    // Identical external IDs can exist in different Calendar accounts.
    return mappings.length === 1 ? { ...mappings[0] } : undefined;
  }

  async removeMapping(_taskId: string, _eventId?: string): Promise<boolean> {
    // Removing a known import association could create a duplicate next tick.
    // Keep the public API, but require a reviewed unlink/reconciliation flow.
    return false;
  }

  private context(): SyncContext | null {
    return this.ownerUserId && this.interval !== undefined ? { ownerUserId: this.ownerUserId, generation: this.generation } : null;
  }

  private isCurrent(context: SyncContext): boolean {
    return context.ownerUserId === this.ownerUserId && context.generation === this.generation && this.interval !== undefined;
  }

  private state(context: SyncContext): OwnerState {
    if (!this.isCurrent(context)) throw new Error(STOPPED_MESSAGE);
    const state = this.owners.get(context.ownerUserId);
    if (!state || state.blocked) throw new Error(STATE_MESSAGE);
    return state;
  }

  private visibleState(): OwnerState | undefined {
    const state = this.ownerUserId ? this.owners.get(this.ownerUserId) : undefined;
    return state && !state.blocked ? state : undefined;
  }

  private admit<T>(context: SyncContext, key: string, operation: () => Promise<T>, stopped: () => T): Promise<T> {
    const admissionKey = JSON.stringify([context.ownerUserId, context.generation, key]);
    const existing = this.operations.get(admissionKey);
    if (existing) return existing as Promise<T>;
    const promise = this.tail.then(async () => {
      if (!this.isCurrent(context)) return stopped();
      return withCalendarSyncLock(context.ownerUserId, async () => {
        if (!this.isCurrent(context)) return stopped();
        // A different updated tab may have committed while this instance was
        // idle. Never overwrite its mappings/holds with the constructor cache.
        this.owners.set(context.ownerUserId, this.loadOwnerState(context.ownerUserId));
        return operation();
      });
    }).catch(() => stopped()).finally(() => {
      if (this.operations.get(admissionKey) === promise) this.operations.delete(admissionKey);
    });
    this.operations.set(admissionKey, promise);
    this.tail = promise.then(() => undefined);
    return promise;
  }

  private async requireOwner(context: SyncContext): Promise<void> {
    this.state(context);
    const { data, error } = await supabase.auth.getUser();
    this.state(context);
    if (error || data.user?.id !== context.ownerUserId) throw new Error(STOPPED_MESSAGE);
  }

  /** Outcome inspection must remain available when unrelated task/mapping state is damaged. */
  private async requireOutcomeOwner(context: SyncContext): Promise<void> {
    if (!this.isCurrent(context)) throw new Error(STOPPED_MESSAGE);
    const { data, error } = await supabase.auth.getUser();
    if (!this.isCurrent(context) || error || data.user?.id !== context.ownerUserId) throw new Error(STOPPED_MESSAGE);
  }

  private async synchronize(context: SyncContext): Promise<CalendarFullSyncResult> {
    const result = emptyResult();
    try {
      await this.requireOwner(context);
      const state = this.state(context);
      const tasks = useTaskStore.getState().tasks;
      result.reviewRequired = tasks.filter(task => (task.view?.calendar || task.due || task.type === 'event') &&
        (!task.metadata?.userId || task.metadata.userId === context.ownerUserId) &&
        !this.mappingForTask(state, task.id)).length;
      const { data: accounts, error: accountError } = await supabase.from('calendar_accounts')
        .select('id,user_id,sync_enabled').eq('user_id', context.ownerUserId).eq('sync_enabled', true).limit(MAX_ITEMS + 1);
      this.state(context);
      if (accountError || !Array.isArray(accounts) || accounts.length > MAX_ITEMS) throw new Error('Calendar account inventory could not be verified.');
      for (const account of accounts) {
        if (!uuid(account.id) || account.user_id !== context.ownerUserId || account.sync_enabled !== true) throw new Error('Calendar account ownership could not be verified.');
        const { data: events, error } = await supabase.from('calendar_events')
          .select('user_id,calendar_account_id,external_event_id').eq('user_id', context.ownerUserId)
          .eq('calendar_account_id', account.id).limit(MAX_ITEMS + 1);
        this.state(context);
        if (error || !Array.isArray(events) || events.length > MAX_ITEMS) throw new Error('Calendar event inventory could not be verified.');
        for (const event of events) {
          if (event.user_id !== context.ownerUserId || event.calendar_account_id !== account.id || !safeId(event.external_event_id)) throw new Error('Calendar event ownership could not be verified.');
          const imported = await this.importEvent(context, account.id, event.external_event_id);
          this.state(context);
          if (imported.success && imported.written) result.eventsProcessed++;
          if (imported.conflictId) result.conflictsDetected++;
          if (imported.reviewRequired) result.reviewRequired++;
          if (!imported.success && !imported.reviewRequired) result.errors.push('A Calendar import could not be verified.');
        }
      }
      // A missing row or failed query must never silently erase associations.
      // Destructive orphan cleanup is intentionally not part of this pass.
    } catch {
      result.errors.push(this.isCurrent(context) ? 'Calendar synchronization could not be verified; existing mappings were preserved.' : STOPPED_MESSAGE);
    }
    return result;
  }

  private async canonicalEvent(context: SyncContext, accountId: string, eventId: string): Promise<CanonicalEvent> {
    await this.requireOwner(context);
    const { data: account, error: accountError } = await supabase.from('calendar_accounts')
      .select('id,user_id,sync_enabled').eq('id', accountId).eq('user_id', context.ownerUserId).eq('sync_enabled', true).single();
    this.state(context);
    if (accountError || !account || account.id !== accountId || account.user_id !== context.ownerUserId || account.sync_enabled !== true) throw new Error('Calendar account ownership could not be verified.');
    const { data, error } = await supabase.from('calendar_events')
      .select('user_id,calendar_account_id,external_event_id,title,start_time,end_time,location,description')
      .eq('user_id', context.ownerUserId).eq('calendar_account_id', accountId).eq('external_event_id', eventId).single();
    this.state(context);
    if (error || !record(data) || data.user_id !== context.ownerUserId || data.calendar_account_id !== accountId || data.external_event_id !== eventId ||
      !safeText(data.title) || !data.title.trim() || typeof data.start_time !== 'string' || typeof data.end_time !== 'string' ||
      !Number.isFinite(Date.parse(data.start_time)) || !Number.isFinite(Date.parse(data.end_time)) || Date.parse(data.end_time) <= Date.parse(data.start_time) ||
      !(data.location === null || safeText(data.location)) || !(data.description === null || safeText(data.description))) throw new Error('Canonical Calendar event could not be verified.');
    return data as unknown as CanonicalEvent;
  }

  private ownsImportedTask(task: Task | undefined, context: SyncContext, accountId: string, eventId: string): task is Task {
    const provenance = task?.metadata?.calendarImport;
    return !!task && task.metadata?.userId === context.ownerUserId && record(provenance) &&
      provenance.calendarAccountId === accountId && provenance.eventId === eventId;
  }

  private taskMatchesEvent(task: Task, event: CanonicalEvent): boolean {
    return task.title === event.title && (task.description ?? '') === (event.description ?? '') &&
      task.view?.calendar?.startTime === event.start_time &&
      task.view.calendar.durationMin === (Date.parse(event.end_time) - Date.parse(event.start_time)) / 60000 &&
      (task.view.calendar.location ?? '') === (event.location ?? '');
  }

  private async importEvent(context: SyncContext, accountId: string, eventId: string, preferCalendar = false): Promise<CalendarSyncOutcome> {
    let state: OwnerState;
    const key = eventKey(accountId, eventId);
    try {
      state = this.state(context);
      if (state.unresolved.has(key)) return review(OUTCOME_MESSAGE);
      if (outboundHeld(readOutboundJournal(context.ownerUserId).journal, accountId, eventId)) return review('A prior outbound update outcome requires review before this event can be imported again.');
      const event = await this.canonicalEvent(context, accountId, eventId);
      state = this.state(context);
      const mapping = state.mappings.get(key);
      const existing = mapping ? useTaskStore.getState().getTask(mapping.taskId) : undefined;
      if (!mapping && useTaskStore.getState().tasks.some(task => this.ownsImportedTask(task, context, accountId, eventId))) return review('An existing import needs mapping review before it can be repeated.');
      if (mapping && !this.ownsImportedTask(existing, context, accountId, eventId)) return review('An existing or legacy task needs an ownership review before import.');
      if (existing && this.taskMatchesEvent(existing, event) && !preferCalendar) return { success: true, written: false, taskId: existing.id };
      if (existing && !preferCalendar) return this.recordConflict(context, state, existing, event);
      // Authenticate again after metadata awaits before admitting a local write.
      await this.requireOwner(context);
      state = this.state(context);
      const refreshed = mapping ? useTaskStore.getState().getTask(mapping.taskId) : undefined;
      if (mapping && !this.ownsImportedTask(refreshed, context, accountId, eventId)) return review('Task ownership changed before import.');
      if (refreshed && this.taskMatchesEvent(refreshed, event)) {
        return preferCalendar ? this.resolveMatchingConflictState(context, state, refreshed, event) : { success: true, written: false, taskId: refreshed.id };
      }
      if (refreshed && !preferCalendar && !this.taskMatchesEvent(refreshed, event)) return this.recordConflict(context, state, refreshed, event);
      state.unresolved.add(key);
      if (!this.persist(context.ownerUserId, state)) return review(STATE_MESSAGE);
      const taskData: Omit<Task, 'id'> = {
        ...(refreshed ?? {}),
        title: event.title, description: event.description ?? undefined, type: refreshed?.type ?? 'event',
        priority: refreshed?.priority ?? 50, completed: refreshed?.completed ?? false,
        tags: refreshed?.tags ?? [{ id: 'calendar', name: 'Calendar' }],
        createdAt: refreshed?.createdAt ?? Date.now(), updatedAt: Date.now(),
        metadata: { ...refreshed?.metadata, userId: context.ownerUserId, calendarImport: { calendarAccountId: accountId, eventId } },
        view: { ...refreshed?.view, calendar: {
          ...refreshed?.view?.calendar, startTime: event.start_time,
          durationMin: (Date.parse(event.end_time) - Date.parse(event.start_time)) / 60000,
          location: event.location ?? undefined, calendarId: accountId,
        } },
      };
      const options = { origin: 'calendar-import' as const, ownerUserId: context.ownerUserId, isCurrent: () => this.isCurrent(context) };
      let taskId: string;
      if (refreshed) {
        await useTaskStore.getState().updateTask(refreshed.id, taskData, options);
        taskId = refreshed.id;
      } else {
        const created = await useTaskStore.getState().addTask(taskData, options);
        if (!this.ownsImportedTask(created, context, accountId, eventId) || !safeId(created.id)) return review(OUTCOME_MESSAGE);
        taskId = created.id;
      }
      if (!this.isCurrent(context)) return review(OUTCOME_MESSAGE);
      const committedTask = useTaskStore.getState().getTask(taskId);
      if (!this.ownsImportedTask(committedTask, context, accountId, eventId) || !this.taskMatchesEvent(committedTask, event)) return review(OUTCOME_MESSAGE);
      // Publish the association and clear the pre-write hold atomically in the
      // same owner envelope. Failed storage retains the original uncertainty.
      const next: OwnerState = { ...state, mappings: new Map(state.mappings), conflicts: new Map(state.conflicts), unresolved: new Set(state.unresolved) };
      next.mappings.set(key, { taskId, eventId, calendarAccountId: accountId, lastSyncedAt: Date.now(), syncDirection: 'calendar-to-task', conflictStatus: preferCalendar ? 'resolved' : 'none' });
      if (preferCalendar) for (const [id, conflict] of next.conflicts) {
        if (conflict.taskId === taskId && conflict.eventId === eventId && !conflict.resolution) next.conflicts.set(id, { ...conflict, resolution: 'prefer-calendar' });
      }
      next.unresolved.delete(key);
      if (!this.persist(context.ownerUserId, next)) { state.blocked = true; return review(OUTCOME_MESSAGE); }
      this.owners.set(context.ownerUserId, next);
      return { success: true, written: true, taskId, eventId };
    } catch {
      return review(this.isCurrent(context) ? OUTCOME_MESSAGE : STOPPED_MESSAGE);
    }
  }

  private recordConflict(context: SyncContext, state: OwnerState, task: Task, event: CanonicalEvent): CalendarSyncOutcome {
    const fields: [SyncConflict['conflictType'], string, string][] = [
      ['title', task.title, event.title], ['time', task.view?.calendar?.startTime ?? '', event.start_time],
      ['location', task.view?.calendar?.location ?? '', event.location ?? ''], ['description', task.description ?? '', event.description ?? ''],
    ];
    const difference = fields.find(([, taskValue, calendarValue]) => taskValue !== calendarValue) ?? ['time', String(task.view?.calendar?.durationMin ?? ''), String((Date.parse(event.end_time) - Date.parse(event.start_time)) / 60000)];
    if (!safeText(difference[1]) || !safeText(difference[2])) return review('Task values require review before a bounded conflict can be recorded.');
    const prior = [...state.conflicts.values()].find(conflict => conflict.taskId === task.id && conflict.eventId === event.external_event_id && !conflict.resolution);
    const conflict: SyncConflict = { id: prior?.id ?? crypto.randomUUID(), taskId: task.id, eventId: event.external_event_id,
      conflictType: difference[0], taskValue: difference[1], calendarValue: difference[2], timestamp: Date.now() };
    const next = { ...state, conflicts: new Map(state.conflicts), mappings: new Map(state.mappings) };
    next.conflicts.set(conflict.id, conflict);
    const key = eventKey(event.calendar_account_id, event.external_event_id);
    const mapping = next.mappings.get(key);
    if (mapping) next.mappings.set(key, { ...mapping, conflictStatus: 'pending' });
    if (!this.persist(context.ownerUserId, next)) { state.blocked = true; return review(STATE_MESSAGE); }
    this.owners.set(context.ownerUserId, next);
    return { ...review('Calendar and local task values differ; review is required.'), conflictId: conflict.id };
  }

  private resolveMatchingConflictState(context: SyncContext, state: OwnerState, task: Task, event: CanonicalEvent): CalendarSyncOutcome {
    const next = { ...state, conflicts: new Map(state.conflicts), mappings: new Map(state.mappings) };
    for (const [id, conflict] of next.conflicts) {
      if (conflict.taskId === task.id && conflict.eventId === event.external_event_id && !conflict.resolution) next.conflicts.set(id, { ...conflict, resolution: 'prefer-calendar' });
    }
    const key = eventKey(event.calendar_account_id, event.external_event_id);
    const mapping = next.mappings.get(key);
    if (!mapping) return review(STATE_MESSAGE);
    next.mappings.set(key, { ...mapping, conflictStatus: 'resolved' });
    if (!this.persist(context.ownerUserId, next)) { state.blocked = true; return review(STATE_MESSAGE); }
    this.owners.set(context.ownerUserId, next);
    return { success: true, written: false, taskId: task.id };
  }

  private mappingForTask(state: OwnerState, taskId: string): CalendarTaskMapping | undefined {
    return [...state.mappings.values()].find(mapping => mapping.taskId === taskId);
  }

  private persist(ownerUserId: string, state: OwnerState): boolean {
    try {
      if (state.mappings.size > MAX_ITEMS || state.conflicts.size > MAX_ITEMS || state.unresolved.size > MAX_ITEMS) throw new Error(STATE_MESSAGE);
      const serialized = JSON.stringify({
        version: 1, ownerUserId, mappings: [...state.mappings.values()], conflicts: [...state.conflicts.values()], unresolvedOperations: [...state.unresolved],
      });
      if (serialized.length > MAX_STATE_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_STATE_BYTES) throw new Error(STATE_MESSAGE);
      localStorage.setItem(calendarSyncStorageKey(ownerUserId), serialized);
      return true;
    } catch { state.blocked = true; return false; }
  }

  private loadOwnerState(ownerUserId: string): OwnerState {
    const state = emptyState();
    try {
      const stored = localStorage.getItem(calendarSyncStorageKey(ownerUserId));
      if (stored === null) return state;
      if (stored.length > MAX_STATE_BYTES || new TextEncoder().encode(stored).byteLength > MAX_STATE_BYTES) throw new Error(STATE_MESSAGE);
      const envelope: unknown = JSON.parse(stored);
      if (!record(envelope) || !exactKeys(envelope, ['version', 'ownerUserId', 'mappings', 'conflicts', 'unresolvedOperations']) || envelope.version !== 1 || envelope.ownerUserId !== ownerUserId) throw new Error(STATE_MESSAGE);
      for (const key of ['mappings', 'conflicts', 'unresolvedOperations']) if (!Array.isArray(envelope[key]) || envelope[key].length > MAX_ITEMS) throw new Error(STATE_MESSAGE);
      const taskIds = new Set<string>();
      for (const value of envelope.mappings as unknown[]) {
        if (!record(value) || !exactKeys(value, ['taskId', 'eventId', 'calendarAccountId', 'lastSyncedAt', 'syncDirection', 'conflictStatus']) ||
          !safeId(value.taskId) || !safeId(value.eventId) || !uuid(value.calendarAccountId) ||
          !timestamp(value.lastSyncedAt) || typeof value.syncDirection !== 'string' || !['task-to-calendar', 'calendar-to-task', 'bidirectional'].includes(value.syncDirection) ||
          typeof value.conflictStatus !== 'string' || !['none', 'resolved', 'pending'].includes(value.conflictStatus)) throw new Error(STATE_MESSAGE);
        const key = eventKey(value.calendarAccountId, value.eventId);
        if (state.mappings.has(key) || taskIds.has(value.taskId)) throw new Error(STATE_MESSAGE);
        taskIds.add(value.taskId);
        state.mappings.set(key, value as unknown as CalendarTaskMapping);
      }
      for (const value of envelope.conflicts as unknown[]) {
        if (!record(value) || !exactKeys(value, ['id', 'taskId', 'eventId', 'conflictType', 'taskValue', 'calendarValue', 'timestamp'], ['resolution']) ||
          !safeId(value.id) || !safeId(value.taskId) || !safeId(value.eventId) || typeof value.conflictType !== 'string' || !['time', 'title', 'location', 'description'].includes(value.conflictType) ||
          !safeText(value.taskValue) || !safeText(value.calendarValue) || !timestamp(value.timestamp) ||
          (value.resolution !== undefined && (typeof value.resolution !== 'string' || !['prefer-task', 'prefer-calendar', 'merge', 'manual'].includes(value.resolution))) || state.conflicts.has(value.id)) throw new Error(STATE_MESSAGE);
        const mapping = this.mappingForTask(state, value.taskId);
        if (!mapping || mapping.eventId !== value.eventId) throw new Error(STATE_MESSAGE);
        state.conflicts.set(value.id, value as unknown as SyncConflict);
      }
      for (const value of envelope.unresolvedOperations as unknown[]) {
        if (typeof value !== 'string') throw new Error(STATE_MESSAGE);
        const parts: unknown = JSON.parse(value);
        if (!Array.isArray(parts) || parts.length !== 2 || !uuid(parts[0]) || !safeId(parts[1]) || eventKey(parts[0], parts[1]) !== value || state.unresolved.has(value)) throw new Error(STATE_MESSAGE);
        state.unresolved.add(value);
      }
      return state;
    } catch { return { ...emptyState(), blocked: true }; }
  }
}

export const calendarTaskSyncManager = new CalendarTaskSyncManager();
