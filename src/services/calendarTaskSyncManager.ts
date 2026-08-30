/**
 * Owner-bound Calendar-to-task synchronization. Automatic/provider writes are
 * intentionally unavailable: outgoing changes require a separate review flow.
 * Stopping admission does not cancel an already dispatched local transaction.
 */
import type { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore } from '@/stores/taskStore';

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
const STOPPED_MESSAGE = 'Calendar synchronization is not active for this owner.';
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

export class CalendarTaskSyncManager {
  private ownerUserId: string | null = null;
  private generation = 0;
  private interval: ReturnType<typeof setInterval> | undefined;
  private owners = new Map<string, OwnerState>();
  private tail: Promise<unknown> = Promise.resolve();
  private operations = new Map<string, Promise<unknown>>();

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
    // Do not clear the admission tail or uncertainty holds on restart.
  }

  getStatus(): { isRunning: boolean; ownerUserId: string | null; pendingOperations: number; unresolvedOperations: number } {
    return {
      isRunning: this.interval !== undefined,
      ownerUserId: this.ownerUserId,
      pendingOperations: this.operations.size,
      unresolvedOperations: [...this.owners.values()].reduce((count, state) => count + state.unresolved.size + Number(state.blocked), 0),
    };
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
      return operation();
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
