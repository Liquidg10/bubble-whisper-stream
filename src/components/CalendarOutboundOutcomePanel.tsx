import React, { useLayoutEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { calendarTaskSyncManager } from '@/services/calendarTaskSyncManager';
import { parseOutboundHoldInventory, type CalendarOutboundHold } from '@/services/calendarOutboundJournal';
import { parseCalendarOutcomeInspectionResponse, type CalendarOutcomeInspectionResponse } from '../../supabase/functions/_shared/calendarOutcomeInspectionContract';
import { reviewedUpdateRecord } from '../../supabase/functions/_shared/calendarReviewedUpdateContract';

type Observation = Extract<CalendarOutcomeInspectionResponse, { outcome: 'observed' }>;
interface OutcomeView {
  owner: string | null; entries: CalendarOutboundHold[] | null; observation: Observation | null;
  pending: boolean; message: string | null;
}
const blank = (owner: string | null = null): OutcomeView => ({ owner, entries: null, observation: null, pending: false, message: null });
const own = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const UNAVAILABLE = 'Saved update holds could not be verified. No complete list is shown; this does not mean there are no holds.';
const INSPECTION_UNAVAILABLE = 'Current Google event inspection is unavailable. The saved hold remains unchanged; do not retry the update.';
const FIELD_LABELS = [['title', 'Title'], ['description', 'Description'], ['location', 'Location'], ['startTime', 'Start time'],
  ['endTime', 'End time'], ['startTz', 'Start time zone'], ['endTz', 'End time zone']] as const;
function ready(owner: string | null): owner is string {
  if (!owner) return false;
  try { const status = calendarTaskSyncManager.getStatus(); return status.isRunning === true && status.ownerUserId === owner; }
  catch { return false; }
}
function savedTime(value: number): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Saved time unavailable';
}
function observationResult(value: unknown, held: CalendarOutboundHold): Observation | null {
  const keys = ['status', 'operationId', 'calendarAccountId', 'eventId', 'observationOnly', 'etag', 'fields', 'observedAt'];
  if (!reviewedUpdateRecord(value) || !keys.every(key => own(value, key)) || value.status !== 'observed'
    || value.operationId !== held.operationId || value.calendarAccountId !== held.calendarAccountId || value.eventId !== held.eventId) return null;
  const parsed = parseCalendarOutcomeInspectionResponse({ version: 1, outcome: 'observed', operationId: value.operationId,
    calendarAccountId: value.calendarAccountId, eventId: value.eventId, observationOnly: value.observationOnly,
    etag: value.etag, fields: value.fields, observedAt: value.observedAt });
  return parsed?.outcome === 'observed' ? parsed : null;
}

/** Legacy outcomes remain held: observation is not recovery, cancellation, or permission to replay. */
export function CalendarOutboundOutcomePanel({ readyOwner }: { readyOwner: string | null }) {
  const activeOwner = ready(readyOwner) ? readyOwner : null;
  const [view, setView] = useState<OutcomeView>(() => blank());
  const mounted = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const revision = useRef(0);
  const busy = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true; ownerRef.current = activeOwner; ++revision.current; busy.current = false;
    setView(blank(activeOwner));
    return () => { mounted.current = false; ownerRef.current = null; busy.current = false; };
  }, [activeOwner]);
  const current = (owner: string, operation: number) => mounted.current && ownerRef.current === owner
    && revision.current === operation && ready(owner);
  const begin = () => {
    if (busy.current || !mounted.current) return null;
    if (!activeOwner || ownerRef.current !== activeOwner || !ready(activeOwner)) { ++revision.current; setView(blank()); return null; }
    busy.current = true;
    return { owner: activeOwner, operation: ++revision.current };
  };
  const finish = (owner: string, operation: number) => {
    if (current(owner, operation)) { busy.current = false; setView(value => ({ ...value, pending: false })); }
    else if (mounted.current && ownerRef.current === owner && revision.current === operation) {
      busy.current = false; ++revision.current; setView(blank());
    }
  };
  const refresh = async () => {
    const action = begin(); if (!action) return;
    const { owner, operation } = action;
    setView({ ...blank(owner), pending: true });
    try {
      const result: unknown = await calendarTaskSyncManager.refreshOutboundHolds();
      if (!current(owner, operation)) return;
      if (!reviewedUpdateRecord(result) || !own(result, 'success') || result.success !== true || !own(result, 'items')) throw new Error('Unconfirmed holds');
      const entries = parseOutboundHoldInventory(result.items, owner);
      if (!entries) throw new Error('Invalid holds');
      setView(value => ({ ...value, entries }));
    } catch { if (current(owner, operation)) setView(value => ({ ...value, entries: null, message: UNAVAILABLE })); }
    finally { finish(owner, operation); }
  };
  const inspect = async (held: CalendarOutboundHold) => {
    if (view.owner !== activeOwner || !view.entries?.some(entry => entry.operationId === held.operationId)) return;
    const action = begin(); if (!action) return;
    const { owner, operation } = action;
    setView(value => ({ ...value, observation: null, pending: true, message: null }));
    try {
      const result: unknown = await calendarTaskSyncManager.inspectOutboundHold(held.operationId);
      if (!current(owner, operation)) return;
      if (reviewedUpdateRecord(result) && own(result, 'status') && result.status === 'blocked' && own(result, 'code') && result.code === 'disabled') {
        setView(value => ({ ...value, message: 'Calendar outcome inspection is not enabled on this server. The saved hold remains unchanged.' })); return;
      }
      const observation = observationResult(result, held);
      if (!observation) throw new Error('Unconfirmed observation');
      setView(value => ({ ...value, observation }));
    } catch { if (current(owner, operation)) setView(value => ({ ...value, observation: null, message: INSPECTION_UNAVAILABLE })); }
    finally { finish(owner, operation); }
  };
  // Hide previous-account material during render, before lifecycle cleanup.
  const visible = activeOwner && view.owner === activeOwner ? view : blank();
  const disabled = !activeOwner || visible.pending;
  return <section aria-labelledby="calendar-outcome-heading" className="space-y-4">
    <h3 id="calendar-outcome-heading" className="font-medium">Saved Calendar update holds</h3>
    <p className="text-sm text-muted-foreground">This inventory includes saved holds even when their tasks or mappings are missing. It covers this account’s browser journal only, not other devices or server activity.</p>
    <Alert><AlertDescription>These legacy receipts cannot prove what an interrupted update did. Inspecting current Google values does not prove the original update completed or stopped. Holds stay in place; no reset, retry, or calendar update is available here.</AlertDescription></Alert>
    {!activeOwner ? <p>Sign in and wait for the calendar manager to be ready for your account.</p> : null}
    <Button variant="outline" disabled={disabled} onClick={refresh}>Refresh saved update holds</Button>
    {visible.pending ? <p role="status">Checking the requested Calendar evidence...</p> : null}
    {visible.message ? <Alert variant="destructive"><AlertDescription>{visible.message}</AlertDescription></Alert> : null}
    {visible.entries === null ? <p>No verified hold inventory is currently shown. Refresh to check this browser journal.</p> : <div className="space-y-3">
      <p>Saved holds in this browser journal: {visible.entries.length}</p>
      {visible.entries.length === 0 ? <p>No holds were found in this account’s current browser journal. This is not proof that other calendar activity has stopped.</p> : null}
      {visible.entries.map((held, index) => <Card key={held.operationId}><CardContent className="space-y-2 p-4 text-sm">
        <p className="break-words">Operation reference: {held.operationId}</p>
        <p className="break-words">Saved task reference: {held.taskId}</p>
        <p className="break-words">Calendar account reference: {held.calendarAccountId}</p>
        <p className="break-words">Google event reference: {held.eventId}</p>
        <p>Saved at: {savedTime(held.createdAt)}</p>
        <p>{held.outcome === 'provider_written' ? 'Earlier Google update receipt exists; cache or local completion is unconfirmed.'
          : held.outcome === 'pending' ? 'Pending receipt; original update outcome is unconfirmed.' : 'Uncertain receipt; original update outcome is unconfirmed.'}</p>
        <Button variant="outline" disabled={disabled} onClick={() => inspect(held)} aria-label={`Inspect current Google event for saved hold ${index + 1}`}>Inspect current Google event</Button>
      </CardContent></Card>)}
    </div>}
    {visible.observation ? <Card><CardContent className="space-y-3 p-4">
      <h4 className="font-medium">Current Google event — observation only</h4>
      <p className="break-words text-sm">Operation reference: {visible.observation.operationId}</p>
      <p className="text-sm">Observed at: {savedTime(visible.observation.observedAt)}</p>
      <p className="text-sm">The original update outcome is not established by these values. Its saved hold remains unchanged.</p>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">{FIELD_LABELS.map(([key, label]) => <React.Fragment key={key}>
        <dt className="font-medium">{label}</dt><dd aria-label={`${label} observed`} className="whitespace-pre-wrap break-words">{visible.observation!.fields[key] ?? 'No named time zone'}{visible.observation!.fields[key] === '' ? '(empty)' : null}</dd>
      </React.Fragment>)}</dl>
    </CardContent></Card> : null}
  </section>;
}
