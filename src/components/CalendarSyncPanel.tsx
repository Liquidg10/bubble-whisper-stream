/** Owner-bound calendar review; progress and outcomes reflect completed work. */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCw, RotateCw } from 'lucide-react';
import { calendarTaskSyncManager, type SyncConflict, type CalendarTaskMapping } from '@/services/calendarTaskSyncManager';
import { useTaskStore } from '@/stores/taskStore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CalendarImportRecoveryPanel } from '@/components/CalendarImportRecoveryPanel';
import { CalendarOutboundReviewPanel } from '@/components/CalendarOutboundReviewPanel';

type SyncResult = Awaited<ReturnType<typeof calendarTaskSyncManager.performFullSync>>;
type SyncView = {
  ownerUserId: string | null;
  status: 'idle' | 'syncing' | 'resolving' | 'error';
  mappings: CalendarTaskMapping[];
  conflicts: SyncConflict[];
  selectedConflict: SyncConflict | null;
  result: SyncResult | null;
};
const emptyView = (ownerUserId: string | null = null): SyncView => ({
  ownerUserId, status: 'idle', mappings: [], conflicts: [], selectedConflict: null, result: null,
});
function managerReady(owner: string): boolean {
  const status = calendarTaskSyncManager.getStatus();
  return status.isRunning && status.ownerUserId === owner;
}

export function CalendarSyncPanel() {
  const { user, session, loading } = useAuth();
  const { tasks } = useTaskStore();
  const { toast } = useToast();
  const managerStatus = calendarTaskSyncManager.getStatus();
  const readyOwner = !loading && user?.id && session?.user.id === user.id
    && managerStatus.isRunning && managerStatus.ownerUserId === user.id ? user.id : null;
  const ownedTasks = useMemo(() => tasks.filter(task => readyOwner !== null && task.metadata?.userId === readyOwner), [tasks, readyOwner]);
  const ownedTaskIds = useMemo(() => new Set(ownedTasks.map(task => task.id)), [ownedTasks]);
  const [view, setView] = useState<SyncView>(() => emptyView());
  const mounted = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const operationRevision = useRef(0);
  const operationPending = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    ownerRef.current = readyOwner;
    ++operationRevision.current;
    operationPending.current = false;
    setView(emptyView(readyOwner));
    return () => {
      mounted.current = false;
      ownerRef.current = null;
      operationPending.current = false;
    };
  }, [readyOwner]);

  const loadSyncData = useCallback(() => {
    if (!readyOwner || !managerReady(readyOwner)) return;
    try {
      // The global task facade is not an ownership boundary. Never ask for or
      // render a mapping/title for an unowned or previous account's task.
      const mappings = ownedTasks.flatMap(task => {
        const mapping = calendarTaskSyncManager.getMappingByTaskId(task.id);
        return mapping ? [mapping] : [];
      });
      const conflicts = calendarTaskSyncManager.getPendingConflicts().filter(conflict => ownedTaskIds.has(conflict.taskId));
      setView(current => ({ ...(current.ownerUserId === readyOwner ? current : emptyView(readyOwner)), mappings, conflicts }));
    } catch {
      setView({ ...emptyView(readyOwner), status: 'error' });
    }
  }, [readyOwner, ownedTasks, ownedTaskIds]);

  useEffect(() => { loadSyncData(); }, [loadSyncData]);

  const currentOperation = (owner: string, revision: number) => mounted.current
    && ownerRef.current === owner && operationRevision.current === revision && managerReady(owner);

  const handleFullSync = async () => {
    if (!readyOwner || operationPending.current || !managerReady(readyOwner)) return;
    const owner = readyOwner;
    const revision = ++operationRevision.current;
    operationPending.current = true;
    setView(current => ({ ...current, status: 'syncing' }));
    try {
      const result = await calendarTaskSyncManager.performFullSync();
      if (!currentOperation(owner, revision)) return;
      setView(current => ({ ...current, result }));
      const needsReview = result.errors.length > 0 || result.reviewRequired > 0 || result.conflictsDetected > 0;
      toast({
        title: needsReview ? 'Calendar review needed' : 'Sync results',
        description: `${result.tasksProcessed} task operations and ${result.eventsProcessed} event imports confirmed. ${result.reviewRequired} require review; ${result.errors.length} errors. No calendar changes were sent.`,
        ...(result.errors.length > 0 ? { variant: 'destructive' as const } : {}),
      });
      loadSyncData();
    } catch {
      if (!currentOperation(owner, revision)) return;
      setView(current => ({ ...current, status: 'error' }));
      toast({ title: 'Sync could not finish', description: 'The result is unconfirmed. Review the current account before trying again.', variant: 'destructive' });
    } finally {
      if (currentOperation(owner, revision)) {
        operationPending.current = false;
        setView(current => ({ ...current, status: current.status === 'error' ? 'error' : 'idle' }));
      }
    }
  };

  const handleResolveConflict = async (conflict: SyncConflict) => {
    if (!readyOwner || operationPending.current || !ownedTaskIds.has(conflict.taskId) || !managerReady(readyOwner)) return;
    const owner = readyOwner;
    const revision = ++operationRevision.current;
    operationPending.current = true;
    setView(current => ({ ...current, status: 'resolving' }));
    try {
      const success = await calendarTaskSyncManager.resolveConflict(conflict.id, 'prefer-calendar');
      if (!currentOperation(owner, revision)) return;
      if (!success) throw new Error('Resolution is not confirmed');
      toast({ title: 'Local task updated', description: 'The calendar value was applied to the owned task. No calendar changes were sent.' });
      setView(current => ({ ...current, selectedConflict: null }));
      loadSyncData();
    } catch {
      if (!currentOperation(owner, revision)) return;
      toast({ title: 'Conflict still needs review', description: 'No resolution was confirmed. Calendar updates and merges are not available here.', variant: 'destructive' });
    } finally {
      if (currentOperation(owner, revision)) {
        operationPending.current = false;
        setView(current => ({ ...current, status: 'idle' }));
      }
    }
  };

  // Hide old state during the owner-changing render, before any effect runs.
  const visible = readyOwner && view.ownerUserId === readyOwner ? view : emptyView();
  const mappings = visible.mappings.filter(mapping => ownedTaskIds.has(mapping.taskId));
  const conflicts = visible.conflicts.filter(conflict => ownedTaskIds.has(conflict.taskId));
  const selectedConflict = visible.selectedConflict && ownedTaskIds.has(visible.selectedConflict.taskId) ? visible.selectedConflict : null;
  const busy = visible.status === 'syncing' || visible.status === 'resolving';
  const disabled = !readyOwner || busy;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><RotateCw className="h-5 w-5" />Calendar Sync Manager</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadSyncData} disabled={disabled}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
            <Button onClick={handleFullSync} disabled={disabled}>{visible.status === 'syncing' ? 'Syncing...' : 'Full Sync'}</Button>
          </div>
        </div>
        {busy ? <p role="status">Waiting for confirmed sync results...</p> : null}
      </CardHeader>
      <CardContent>
        {!readyOwner ? <Alert><AlertDescription>Sign in and wait for the calendar manager to be ready for your account.</AlertDescription></Alert> : null}
        <Alert><AlertDescription>Calendar imports update owned local tasks only. Outbound calendar changes are sent only after explicit review and confirmation in Updates.</AlertDescription></Alert>
        {visible.status === 'error' ? <Alert variant="destructive"><AlertDescription>Sync data is not confirmed. Refresh or review this account.</AlertDescription></Alert> : null}
        <Tabs defaultValue="overview" className="mt-4 w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts ({conflicts.length})</TabsTrigger>
            <TabsTrigger value="mappings">Mappings</TabsTrigger>
            <TabsTrigger value="recovery">Recovery</TabsTrigger>
            <TabsTrigger value="updates">Updates</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <p><strong>{mappings.length}</strong> owned mappings</p>
              <p><strong>{conflicts.length}</strong> pending conflicts</p>
              <p><strong>{visible.result?.tasksProcessed ?? 0}</strong> confirmed task operations</p>
              <p><strong>{visible.result?.eventsProcessed ?? 0}</strong> confirmed event imports</p>
            </div>
            {visible.result && (visible.result.errors.length > 0 || visible.result.reviewRequired > 0) ? (
              <Alert variant={visible.result.errors.length > 0 ? 'destructive' : 'default'}>
                <AlertDescription>{visible.result.reviewRequired} items require review; {visible.result.errors.length} errors. Unconfirmed work is not counted as completed.</AlertDescription>
              </Alert>
            ) : null}
          </TabsContent>
          <TabsContent value="conflicts" className="space-y-3">
            {conflicts.length === 0 ? <p>No owned sync conflicts available.</p> : conflicts.map(conflict => (
              <Card key={conflict.id}><CardContent className="space-y-2 p-4">
                <h4>{conflict.conflictType} conflict</h4>
                <p>Task: {conflict.taskValue}</p><p>Calendar: {conflict.calendarValue}</p>
                <Button disabled={disabled} onClick={() => setView(current => ({ ...current, selectedConflict: conflict }))}>Review conflict</Button>
              </CardContent></Card>
            ))}
            <Dialog open={Boolean(selectedConflict)} onOpenChange={open => { if (!open) setView(current => ({ ...current, selectedConflict: null })); }}>
              {selectedConflict ? <DialogContent>
                <DialogHeader><DialogTitle>Review calendar conflict</DialogTitle><DialogDescription>Only an owned local task can be updated. Calendar writes and automatic merges are unavailable.</DialogDescription></DialogHeader>
                <p>Task: {selectedConflict.taskValue}</p><p>Calendar: {selectedConflict.calendarValue}</p>
                <Button disabled={disabled} onClick={() => handleResolveConflict(selectedConflict)}>Use calendar value in local task</Button>
                <Button variant="outline" disabled>Use task value in calendar — review only</Button>
                <Button variant="outline" disabled>Merge — review only</Button>
              </DialogContent> : null}
            </Dialog>
          </TabsContent>
          <TabsContent value="mappings" className="space-y-3">
            {mappings.length === 0 ? <p>No owned sync mappings available.</p> : mappings.map(mapping => (
              <Card key={`${mapping.taskId}-${mapping.eventId}`}><CardContent className="space-y-2 p-4">
                <h4>{ownedTasks.find(task => task.id === mapping.taskId)?.title ?? 'Owned task'}</h4>
                <p>Last confirmed local sync: {new Date(mapping.lastSyncedAt).toLocaleString()}</p>
                <Badge variant="outline">{mapping.conflictStatus}</Badge>
              </CardContent></Card>
            ))}
          </TabsContent>
          <TabsContent value="recovery"><CalendarImportRecoveryPanel readyOwner={readyOwner} onRecovered={loadSyncData} /></TabsContent>
          <TabsContent value="updates"><CalendarOutboundReviewPanel readyOwner={readyOwner} /></TabsContent>
          <TabsContent value="settings"><p>Automatic checks only review the signed-in account. Full Sync explicitly imports calendar data into owned local tasks. This panel does not change the schedule or enable outbound calendar writes.</p></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
