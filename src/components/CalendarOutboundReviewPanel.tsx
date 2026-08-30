import React, { useLayoutEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { calendarTaskSyncManager } from '@/services/calendarTaskSyncManager';
import { useToast } from '@/hooks/use-toast';

interface LinkedTask { taskId: string; taskTitle: string; held: boolean }
interface CalendarFields {
  title: string; description: string; location: string; startTime: string; endTime: string;
  startTz: string | null; endTz: string | null;
}
interface ReviewedUpdate {
  reviewToken: string; taskId: string; calendarAccountId: string; eventId: string;
  before: CalendarFields; after: CalendarFields;
}
interface OutboundView {
  owner: string | null;
  entries: LinkedTask[] | null;
  review: ReviewedUpdate | null;
  pending: 'refresh' | 'inspection' | 'confirmation' | null;
  message: string | null;
  problem: boolean;
}
interface CalendarOutboundReviewPanelProps { readyOwner: string | null }
const blankView = (owner: string | null = null): OutboundView => ({ owner, entries: null, review: null, pending: null, message: null, problem: false });
const UNAVAILABLE = 'Calendar update review is unavailable or the saved state needs review. No update was submitted by this action.';
const UNCERTAIN = 'The Google Calendar outcome is unconfirmed and may have changed. This task needs outcome review; do not retry the update.';
const PARTIAL = 'Google Calendar was updated, but the cache or local confirmation is incomplete. This task needs outcome review; do not retry the update.';
const DISABLED = 'Reviewed Google updates are not enabled on this server. No update was sent.';
const WRITE_PERMISSION_REQUIRED = 'This Google connection has no verified write permission. A separately approved reconnection is required; no update was sent.';
const FIELD_LABELS: ReadonlyArray<[keyof CalendarFields, string]> = [
  ['title', 'Title'], ['description', 'Description'], ['location', 'Location'], ['startTime', 'Start time'],
  ['endTime', 'End time'], ['startTz', 'Start time zone'], ['endTz', 'End time zone'],
];
function ready(owner: string | null): owner is string {
  if (!owner) return false;
  try {
    const status = calendarTaskSyncManager.getStatus();
    return status.isRunning === true && status.ownerUserId === owner;
  } catch { return false; }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function owns(value: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, name);
}
function identifier(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    && ![...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
}
function boundedText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096;
}
function validateFields(value: unknown): CalendarFields {
  if (!record(value)) throw new Error('Invalid calendar fields');
  for (const [field] of FIELD_LABELS) {
    if (!owns(value, field) || (!boundedText(value[field]) && !((field === 'startTz' || field === 'endTz') && value[field] === null))) {
      throw new Error('Incomplete calendar fields');
    }
  }
  return { title: value.title as string, description: value.description as string, location: value.location as string,
    startTime: value.startTime as string, endTime: value.endTime as string, startTz: value.startTz as string | null, endTz: value.endTz as string | null };
}
function validateEntries(value: unknown): LinkedTask[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid linked task inventory');
  const seen = new Set<string>();
  return value.map(entry => {
    if (!record(entry) || !owns(entry, 'taskId') || !owns(entry, 'taskTitle') || !owns(entry, 'held')
      || !identifier(entry.taskId) || !boundedText(entry.taskTitle) || typeof entry.held !== 'boolean'
      || seen.has(entry.taskId)) throw new Error('Invalid linked task');
    seen.add(entry.taskId);
    return { taskId: entry.taskId, taskTitle: entry.taskTitle, held: entry.held };
  });
}
function validMessageResult(value: unknown): value is Record<string, unknown> {
  return record(value) && owns(value, 'message') && boundedText(value.message);
}
function displayedField(value: string | null): string {
  return value === null ? 'No named time zone (use the numeric offset)' : value === '' ? '(empty)' : value;
}

/** Manual, single-use review of an existing owned event; never enables auto-write. */
export function CalendarOutboundReviewPanel({ readyOwner }: CalendarOutboundReviewPanelProps) {
  const activeOwner = ready(readyOwner) ? readyOwner : null;
  const [view, setView] = useState<OutboundView>(() => blankView());
  const mounted = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const operation = useRef(0);
  const busy = useRef(false);
  const { toast } = useToast();

  useLayoutEffect(() => {
    mounted.current = true;
    ownerRef.current = activeOwner;
    ++operation.current;
    busy.current = false;
    setView(blankView(activeOwner));
    return () => { mounted.current = false; ownerRef.current = null; busy.current = false; };
  }, [activeOwner]);

  const current = (owner: string, revision: number) => mounted.current
    && ownerRef.current === owner && operation.current === revision && ready(owner);

  const canBegin = () => {
    if (busy.current || !mounted.current) return false;
    if (!activeOwner || ownerRef.current !== activeOwner || !ready(activeOwner)) {
      ++operation.current;
      setView(blankView());
      return false;
    }
    return true;
  };

  const finish = (owner: string, revision: number) => {
    if (current(owner, revision)) {
      busy.current = false;
      setView(value => ({ ...value, pending: null }));
    } else if (mounted.current && ownerRef.current === owner && operation.current === revision) {
      // A manager stop without a parent render must also hide pending material.
      busy.current = false;
      ++operation.current;
      setView(blankView());
    }
  };

  const refresh = async () => {
    if (!canBegin() || !activeOwner) return;
    const owner = activeOwner;
    const revision = ++operation.current;
    busy.current = true;
    setView({ ...blankView(owner), pending: 'refresh' });
    try {
      const result: unknown = await calendarTaskSyncManager.refreshOutboundTasks();
      if (!current(owner, revision)) return;
      if (!validMessageResult(result) || !owns(result, 'success') || result.success !== true || !owns(result, 'items')) throw new Error('Unconfirmed inventory');
      const entries = validateEntries(result.items);
      setView(value => ({ ...value, entries }));
    } catch {
      if (current(owner, revision)) setView(value => ({ ...value, message: UNAVAILABLE, problem: true }));
    } finally { finish(owner, revision); }
  };

  const inspect = async (entry: LinkedTask) => {
    if (!canBegin() || !activeOwner || view.owner !== activeOwner || entry.held
      || !view.entries?.some(item => item.taskId === entry.taskId && !item.held)) return;
    const owner = activeOwner;
    const revision = ++operation.current;
    busy.current = true;
    setView(value => ({ ...value, review: null, pending: 'inspection', message: null, problem: false }));
    try {
      const result: unknown = await calendarTaskSyncManager.inspectOutboundUpdate(entry.taskId);
      if (!current(owner, revision)) return;
      if (validMessageResult(result) && owns(result, 'status') && result.status === 'blocked' && owns(result, 'code')) {
        const reason = result.code === 'disabled' ? DISABLED : result.code === 'write_permission_required' ? WRITE_PERMISSION_REQUIRED : UNAVAILABLE;
        setView(value => ({ ...value, review: null, message: reason, problem: true }));
        return;
      }
      if (!validMessageResult(result) || !owns(result, 'status') || result.status !== 'reviewable'
        || !owns(result, 'reviewToken') || !identifier(result.reviewToken, 1024)
        || !owns(result, 'taskId') || result.taskId !== entry.taskId
        || !owns(result, 'calendarAccountId') || !identifier(result.calendarAccountId)
        || !owns(result, 'eventId') || !identifier(result.eventId)
        || !owns(result, 'before') || !owns(result, 'after')) throw new Error('Unconfirmed review');
      const reviewed = { reviewToken: result.reviewToken, taskId: entry.taskId,
        calendarAccountId: result.calendarAccountId, eventId: result.eventId,
        before: validateFields(result.before), after: validateFields(result.after) };
      setView(value => ({ ...value, review: reviewed }));
    } catch {
      if (current(owner, revision)) setView(value => ({ ...value, review: null, message: UNAVAILABLE, problem: true }));
    } finally { finish(owner, revision); }
  };

  const confirm = async () => {
    if (!canBegin() || !activeOwner || view.owner !== activeOwner || !view.review) return;
    const owner = activeOwner;
    const reviewed = view.review;
    const revision = ++operation.current;
    busy.current = true;
    // Consume the local preview before submitting. A failed or uncertain result
    // can never replay this token; an uncertain task is also held in this list.
    setView(value => ({ ...value, review: null, pending: 'confirmation', message: null, problem: false }));
    const hold = (text: string) => setView(value => ({ ...value,
      entries: value.entries?.map(entry => entry.taskId === reviewed.taskId ? { ...entry, held: true } : entry) ?? null,
      message: text, problem: true }));
    try {
      const result: unknown = await calendarTaskSyncManager.confirmOutboundUpdate(reviewed.reviewToken);
      if (!current(owner, revision)) return;
      if (!validMessageResult(result) || !owns(result, 'status')
        || (owns(result, 'taskId') && result.taskId !== undefined && result.taskId !== reviewed.taskId)) { hold(UNCERTAIN); return; }
      if (result.status === 'written' && owns(result, 'taskId') && result.taskId === reviewed.taskId) {
        setView(value => ({ ...value, entries: null, message: 'Google Calendar update confirmed. Saved task contents remain unchanged. Refresh linked tasks to inspect the current state.', problem: false }));
        try {
          toast({ title: 'Google Calendar update confirmed', description: 'Only the reviewed calendar update was confirmed. Saved task contents remain unchanged.' });
        } catch { /* A display failure cannot undo the confirmed provider/local receipt. */ }
      } else if (result.status === 'not_written') {
        setView(value => ({ ...value, message: 'No Google Calendar update was written. Refresh and review the task again before making another confirmation.', problem: true }));
      } else if (result.status === 'provider_written' && owns(result, 'taskId') && result.taskId === reviewed.taskId) {
        hold(PARTIAL);
      } else { hold(UNCERTAIN); }
    } catch {
      if (current(owner, revision)) hold(UNCERTAIN);
    } finally { finish(owner, revision); }
  };

  const cancel = () => {
    if (!canBegin() || !activeOwner || view.owner !== activeOwner || !view.review) return;
    ++operation.current;
    setView(value => ({ ...value, review: null, message: 'Review canceled. No Google Calendar update was submitted.', problem: false }));
  };

  // Do not render a previous account's labels while waiting for cleanup/effects.
  const visible = activeOwner && view.owner === activeOwner ? view : blankView();
  const disabled = !activeOwner || visible.pending !== null;
  return (
    <section aria-labelledby="calendar-outbound-review-heading" className="space-y-4">
      <h3 id="calendar-outbound-review-heading" className="font-medium">Review a Google Calendar update</h3>
      <p className="text-sm text-muted-foreground">Review every field before confirming an update to an existing linked event. Writes require separately enabled backend support and Google write permission. This screen does not enable automatic writes.</p>
      <p className="text-sm text-muted-foreground">Saved task contents stay unchanged. Existing sync conflicts require separate refresh/review.</p>
      {!activeOwner ? <Alert><AlertDescription>Sign in and wait for the calendar manager to be ready for your account.</AlertDescription></Alert> : null}
      <Button variant="outline" disabled={disabled} onClick={refresh}>Refresh linked tasks</Button>
      {visible.pending ? <p role="status">{visible.pending === 'refresh' ? 'Refreshing linked tasks...' : visible.pending === 'inspection' ? 'Checking the proposed calendar update...' : 'Waiting for the reviewed Google Calendar outcome...'}</p> : null}
      {visible.message ? <Alert variant={visible.problem ? 'destructive' : 'default'}><AlertDescription>{visible.message}</AlertDescription></Alert> : null}
      {visible.entries === null ? (!visible.pending ? <p className="text-sm text-muted-foreground">Refresh to inspect this account’s linked tasks. No verified list is currently shown.</p> : null) : (
        <div className="space-y-3">
          <p>Linked tasks in this list: {visible.entries.length}</p>
          {visible.entries.length === 0 ? <p>No linked tasks were returned in this list. This does not verify other calendar activity.</p> : visible.entries.map((entry, index) => (
            <Card key={entry.taskId}><CardContent className="space-y-3 p-4">
              <p className="whitespace-pre-wrap break-words">{entry.taskTitle || 'Untitled linked task'}</p>
              {entry.held ? <p>This task needs outcome review. Do not retry the update.</p> : null}
              <Button variant="outline" disabled={disabled || entry.held} onClick={() => inspect(entry)} aria-label={`Review calendar update for linked task ${index + 1}`}>Review calendar update</Button>
            </CardContent></Card>
          ))}
        </div>
      )}
      {visible.review ? <Card><CardContent className="space-y-4 p-4">
        <h4 className="font-medium">Review all calendar fields</h4>
        <div className="space-y-1 text-sm">
          <p className="break-words">Calendar account reference: {visible.review.calendarAccountId}</p>
          <p className="break-words">Google event reference: {visible.review.eventId}</p>
          <p className="break-words">Saved task reference: {visible.review.taskId}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Current Google Calendar values and the exact proposed update</caption>
            <thead><tr><th scope="col" className="w-1/5 p-2">Field</th><th scope="col" className="p-2">Current Google Calendar</th><th scope="col" className="p-2">Reviewed task update</th></tr></thead>
            <tbody>{FIELD_LABELS.map(([field, label]) => <tr key={field}>
              <th scope="row" className="p-2 align-top">{label}</th>
              <td className="whitespace-pre-wrap break-words p-2 align-top" aria-label={`${label} before`}>{displayedField(visible.review!.before[field])}</td>
              <td className="whitespace-pre-wrap break-words p-2 align-top" aria-label={`${label} after`}>{displayedField(visible.review!.after[field])}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">Confirmation submits this reviewed update once. A changed task, event, account, or expired review requires a new review. An uncertain outcome must be investigated before another update.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled} onClick={confirm}>Confirm Google Calendar update</Button>
          <Button variant="outline" disabled={disabled} onClick={cancel}>Cancel review</Button>
        </div>
      </CardContent></Card> : null}
    </section>
  );
}
