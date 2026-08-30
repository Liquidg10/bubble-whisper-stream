import React, { useLayoutEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { calendarTaskSyncManager } from '@/services/calendarTaskSyncManager';
import { useToast } from '@/hooks/use-toast';

interface RecoveryEntry { calendarAccountId: string; eventId: string }
interface ReviewedImport {
  entry: RecoveryEntry;
  reviewToken: string;
  taskId: string;
  taskTitle: string;
  eventTitle: string;
}
interface RecoveryView {
  owner: string | null;
  entries: RecoveryEntry[] | null;
  review: ReviewedImport | null;
  pending: 'refresh' | 'inspection' | 'confirmation' | null;
  message: string | null;
  problem: boolean;
}
interface CalendarImportRecoveryPanelProps {
  readyOwner: string | null;
  onRecovered?: () => void;
}
const blankView = (owner: string | null = null): RecoveryView => ({ owner, entries: null, review: null, pending: null, message: null, problem: false });
const UNAVAILABLE = 'Recovery is unavailable or the saved state needs review. No task or calendar change was made.';
const UNCONFIRMED = 'Restoring the saved link was not confirmed. Review the import again before taking another action.';
const key = (entry: RecoveryEntry) => JSON.stringify([entry.calendarAccountId, entry.eventId]);
function ready(owner: string | null): owner is string {
  if (!owner) return false;
  try {
    const status = calendarTaskSyncManager.getStatus();
    return status.isRunning && status.ownerUserId === owner;
  } catch { return false; }
}
function identifier(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && ![...value].some(controlCharacter);
}
function controlCharacter(value: string): boolean {
  return value.charCodeAt(0) <= 31 || value.charCodeAt(0) === 127;
}
function message(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim()
    ? [...value.trim().slice(0, 320)].map(character => controlCharacter(character) ? ' ' : character).join('') : fallback;
}
function label(value: string): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text || 'Untitled';
}
function validateEntries(input: RecoveryEntry[]): RecoveryEntry[] {
  if (!Array.isArray(input) || input.length > 1000) throw new Error('Invalid recovery inventory');
  const seen = new Set<string>();
  return input.map(entry => {
    if (!entry || !identifier(entry.calendarAccountId) || !identifier(entry.eventId) || seen.has(key(entry))) throw new Error('Invalid recovery entry');
    seen.add(key(entry));
    return { calendarAccountId: entry.calendarAccountId, eventId: entry.eventId };
  });
}

/** Explicit owner-private review and link recovery; never retries an import. */
export function CalendarImportRecoveryPanel({ readyOwner, onRecovered }: CalendarImportRecoveryPanelProps) {
  const activeOwner = ready(readyOwner) ? readyOwner : null;
  const [view, setView] = useState<RecoveryView>(() => blankView());
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
    return () => {
      mounted.current = false;
      ownerRef.current = null;
      busy.current = false;
    };
  }, [activeOwner]);

  const current = (owner: string, revision: number) => mounted.current
    && ownerRef.current === owner && operation.current === revision && ready(owner);

  const refresh = async () => {
    if (!activeOwner || busy.current || !ready(activeOwner)) return;
    const owner = activeOwner;
    const revision = ++operation.current;
    busy.current = true;
    setView({ ...blankView(owner), pending: 'refresh' });
    try {
      const result = await calendarTaskSyncManager.refreshUnresolvedImports();
      if (!current(owner, revision)) return;
      if (result.success !== true) {
        setView(value => ({ ...value, message: message(result.message, UNAVAILABLE), problem: true }));
        return;
      }
      const entries = validateEntries(result.items);
      setView(value => ({ ...value, entries }));
    } catch {
      if (current(owner, revision)) setView(value => ({ ...value, message: UNAVAILABLE, problem: true }));
    } finally {
      if (current(owner, revision)) {
        busy.current = false;
        setView(value => ({ ...value, pending: null }));
      }
    }
  };

  const inspect = async (entry: RecoveryEntry) => {
    if (!activeOwner || busy.current || !ready(activeOwner) || view.owner !== activeOwner
      || !view.entries?.some(item => key(item) === key(entry))) return;
    const owner = activeOwner;
    const revision = ++operation.current;
    busy.current = true;
    setView(value => ({ ...value, review: null, pending: 'inspection', message: null, problem: false }));
    try {
      const result = await calendarTaskSyncManager.inspectImportRecovery(entry.calendarAccountId, entry.eventId);
      if (!current(owner, revision)) return;
      if (result.status !== 'recoverable') {
        setView(value => ({ ...value, message: message(result.message, UNAVAILABLE), problem: true }));
        return;
      }
      // Incomplete review material is not authority for a blind confirmation.
      if (!identifier(result.reviewToken, 1024) || !identifier(result.taskId)
        || typeof result.taskTitle !== 'string' || typeof result.eventTitle !== 'string') throw new Error('Incomplete recovery review');
      setView(value => ({ ...value, message: message(result.message, 'Review the saved task and calendar event before restoring their link.'),
        review: { entry, reviewToken: result.reviewToken!, taskId: result.taskId!, taskTitle: label(result.taskTitle!), eventTitle: label(result.eventTitle!) } }));
    } catch {
      if (current(owner, revision)) setView(value => ({ ...value, review: null, message: UNAVAILABLE, problem: true }));
    } finally {
      if (current(owner, revision)) {
        busy.current = false;
        setView(value => ({ ...value, pending: null }));
      }
    }
  };

  const confirm = async () => {
    if (!activeOwner || busy.current || !ready(activeOwner) || view.owner !== activeOwner || !view.review) return;
    const owner = activeOwner;
    const reviewed = view.review;
    const revision = ++operation.current;
    busy.current = true;
    // Each review permits one confirmation attempt. Any failure requires a new
    // explicit inspection instead of replaying a potentially consumed token.
    setView(value => ({ ...value, review: null, pending: 'confirmation', message: null, problem: false }));
    try {
      const result = await calendarTaskSyncManager.confirmImportRecovery(reviewed.reviewToken);
      if (!current(owner, revision)) return;
      if (result.success !== true || result.taskId !== reviewed.taskId) {
        setView(value => ({ ...value, message: result.success === false ? message(result.message, UNCONFIRMED) : UNCONFIRMED, problem: true }));
        return;
      }
      setView(value => ({ ...value, entries: value.entries?.filter(entry => key(entry) !== key(reviewed.entry)) ?? null,
        message: 'Saved task link restored. The existing task and its content were preserved. No Google calendar changes were sent.', problem: false }));
      toast({ title: 'Saved task link restored', description: 'The existing task was preserved. No task was created, deleted, or rewritten; no Google calendar change was sent.' });
      try { onRecovered?.(); } catch { /* A display refresh failure does not undo the confirmed link receipt. */ }
    } catch {
      if (current(owner, revision)) setView(value => ({ ...value, message: UNCONFIRMED, problem: true }));
    } finally {
      if (current(owner, revision)) {
        busy.current = false;
        setView(value => ({ ...value, pending: null }));
      }
    }
  };

  // Hide the preceding owner's labels during render, before cleanup/effects.
  const visible = activeOwner && view.owner === activeOwner ? view : blankView();
  const disabled = !activeOwner || visible.pending !== null;
  return (
    <section aria-labelledby="calendar-import-recovery-heading" className="space-y-4">
      <h3 id="calendar-import-recovery-heading" className="font-medium">Recover a saved calendar import link</h3>
      <p className="text-sm text-muted-foreground">An unresolved import may already have saved a task. Review the exact owned match before restoring its link. Recovery does not create, delete, or rewrite a task and does not write to Google.</p>
      {!activeOwner ? <Alert><AlertDescription>Sign in and wait for the calendar manager to be ready for your account.</AlertDescription></Alert> : null}
      <Button variant="outline" disabled={disabled} onClick={refresh}>Refresh recovery list</Button>
      {visible.pending ? <p role="status">{visible.pending === 'refresh' ? 'Refreshing known import holds...' : visible.pending === 'inspection' ? 'Checking the saved task match...' : 'Restoring the reviewed saved task link...'}</p> : null}
      {visible.message ? <Alert variant={visible.problem ? 'destructive' : 'default'}><AlertDescription>{visible.message}</AlertDescription></Alert> : null}
      {visible.entries === null ? (!visible.pending ? <p className="text-sm text-muted-foreground">Refresh to inspect this account’s known import holds. No verified list is currently shown.</p> : null) : (
        <div className="space-y-3">
          <p>Known unresolved imports in this list: {visible.entries.length}</p>
          {visible.entries.length === 0 ? <p>No known holds were returned in this list. This does not verify other calendar activity.</p> : visible.entries.map((entry, index) => (
            <Card key={key(entry)}><CardContent className="flex items-center justify-between gap-3 p-4">
              <p>Unresolved import {index + 1}</p>
              <Button variant="outline" disabled={disabled} onClick={() => inspect(entry)} aria-label={`Review saved task link for unresolved import ${index + 1}`}>Review saved task link</Button>
            </CardContent></Card>
          ))}
        </div>
      )}
      {visible.review ? <Card><CardContent className="space-y-3 p-4">
        <h4 className="font-medium">Review the saved match</h4>
        <p className="break-words">Saved task: {visible.review.taskTitle}</p>
        <p className="break-words">Calendar event: {visible.review.eventTitle}</p>
        <p className="text-sm text-muted-foreground">Restore only this saved link. The task’s content will stay unchanged and nothing will be sent to Google.</p>
        <Button disabled={disabled} onClick={confirm}>Restore saved task link</Button>
      </CardContent></Card> : null}
    </section>
  );
}
