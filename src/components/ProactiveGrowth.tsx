import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTaskStore } from '@/stores/taskStore';
import { bubbleToTask } from '@/adapters/taskAdapter';
import type { Task } from '@/types/task';
import type { Bubble } from '@/types/bubble';
import { collectProactiveSuggestions, canEnrollAutomaticGrowth, getProactiveGrowthState, growthDependencyPaused, persistProactiveGrowthMode, runAutomaticGrowth } from '@/domain/proactiveGrowth';
import { suggestBubbleSprouts } from '@/domain/bubbleGarden';
import { deriveBubbleFamily, persistSproutDismissal } from '@/domain/bubbleGardenState';

const quietButton = 'min-h-11 hover:bg-muted hover:text-foreground transition-none';
function persistence() {
  return {
    getBubble: (id: string) => useBubbleStore.getState().bubbles.find(bubble => bubble.id === id),
    saveBubble: (bubble: Bubble) => useBubbleStore.getState().updateBubbleStrict(bubble),
  };
}

export function ProactiveGrowthControls({ source, tasks }: { source: Task; tasks: readonly Task[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const enabled = getProactiveGrowthState(source).enabled;
  const canEnroll = canEnrollAutomaticGrowth(source);
  const children = deriveBubbleFamily(source.id, tasks).children;
  const latest = [...children].reverse().find(child => child.metadata?.bubbleGarden?.automatic === true && !child.completed);
  const paused = growthDependencyPaused(source, tasks);
  if (!canEnroll && !enabled && !latest) return null;
  return <details className="rounded-lg border p-3">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Automatic steps · {enabled ? 'On' : 'Off'}</summary>
    <p className="text-sm text-muted-foreground">Let this bubble create one task at a time from unchecked list items in its notes, while the bubble space is open. Finish its open steps before the next appears. New tasks keep this source’s confirmed life connections.</p>
    <p className="mt-2 text-xs text-muted-foreground">Only your list items are used. Local prompts and AI ideas always wait for your review. Grown steps do not start creating more steps.</p>
    {enabled && !suggestBubbleSprouts(source, tasks).some(draft => draft.origin === 'notes') && <p className="mt-2 text-sm text-muted-foreground">No new unchecked list items are available. Add a list item to this bubble’s notes when you want another step.</p>}
    {enabled && paused && <p role="status" className="mt-2 text-sm">Waiting for this bubble’s prerequisites before creating another step.</p>}
    {enabled && !canEnroll && <p role="status" className="mt-2 text-sm">Automatic steps are paused because this source is complete or unavailable for growth.</p>}
    {enabled && children.some(child => !child.completed) && <p className="mt-2 text-sm text-muted-foreground">An open connected step is already waiting for you.</p>}
    <Button variant="outline" className={`mt-3 ${quietButton}`} disabled={busy || (!enabled && !canEnroll)} onClick={async () => {
      setBusy(true); setError(''); setStatus('');
      try { await persistProactiveGrowthMode(source.id, !enabled, persistence()); setStatus(enabled ? 'Automatic steps turned off.' : 'Automatic steps turned on for this bubble.'); }
      catch { setError('This preference was not saved. Please try again.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Saving…' : enabled ? 'Turn off automatic steps' : 'Enable automatic notes steps'}</Button>
    {latest && <div className="mt-3 rounded-lg bg-muted p-3">
      <p className="text-sm">Latest automatic step: {latest.title}</p>
      <Button variant="ghost" className={quietButton} disabled={busy} onClick={async () => {
        setBusy(true); setError(''); setStatus('');
        try {
          // Save the pause before removal, so a remount cannot immediately recreate it.
          await persistProactiveGrowthMode(source.id, false, persistence());
          const key = latest.metadata?.bubbleGarden?.sproutKey;
          if (typeof key === 'string') await persistSproutDismissal(source.id, { type: 'dismiss', key }, persistence());
          const current = useBubbleStore.getState().bubbles.find(item => item.id === latest.id);
          if (current && current.updatedAt !== latest.updatedAt) throw new Error('Step changed');
          await useBubbleStore.getState().deleteBubble(latest.id);
          if (useBubbleStore.getState().bubbles.some(item => item.id === latest.id)) throw new Error('Removal failed');
          setStatus('Automatic step removed and automatic steps turned off. Restore suggestions to use that list item again.');
        } catch { setError('The step could not be removed. Automatic steps may already be paused; review the step and try again.'); }
        finally { setBusy(false); }
      }}>Undo automatic step</Button>
    </div>}
    {status && <p role="status" className="mt-2 text-sm text-muted-foreground">{status}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </details>;
}

export function ProactiveGrowthShelf({ onReviewSource, onOpenTask }: { onReviewSource: (sourceTaskId: string) => void; onOpenTask: (taskId: string) => void }) {
  const bubbles = useBubbleStore(state => state.bubbles);
  const tasks = useMemo(() => bubbles.map(bubbleToTask), [bubbles]);
  const suggestions = useMemo(() => collectProactiveSuggestions(tasks), [tasks]);
  const [failure, setFailure] = useState(false);
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const leaving = useRef(false);
  const navigate = (action: () => void) => { leaving.current = true; setOpen(false); action(); };
  const [attempt, setAttempt] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    // A store revision is the trigger. No interval, hidden provider work, or retry loop.
    let cancelled = false;
    const sources = tasks.filter(task => getProactiveGrowthState(task).enabled);
    if (!sources.length) { setRunning(false); return; }
    setRunning(true);
    void (async () => {
      let failed = false;
      for (const source of sources) {
        if (cancelled) break;
        try {
          await runAutomaticGrowth(source.id, {
            getTasks: () => useTaskStore.getState().getTasks(),
            addTask: task => useTaskStore.getState().addTask(task),
          });
        } catch { failed = true; }
      }
      if (!cancelled) { setFailure(current => current || failed); setRunning(false); }
    })();
    return () => { cancelled = true; };
  }, [tasks, attempt]);
  const enrolled = tasks.filter(task => getProactiveGrowthState(task).enabled);
  const automatic = tasks.filter(task => task.metadata?.bubbleGarden?.automatic === true).sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  if (!suggestions.length && !enrolled.length && !automatic.length) return null;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="ghost" className={`gap-2 rounded-full px-3 ${quietButton}`} aria-label="Ideas from your bubbles" aria-describedby={failure ? `${headingId}-error` : undefined}>
      <Sprout className="h-4 w-4" aria-hidden="true" />Ideas{suggestions.length > 0 && <span aria-hidden="true" className="text-xs">{suggestions.length}</span>}{failure && <span aria-hidden="true" className="font-bold text-destructive">!</span>}
    </Button></PopoverTrigger>
    {failure && <span id={`${headingId}-error`} role="status" className="sr-only">An automatic step could not be saved. Open Ideas to retry.</span>}
    <PopoverContent side="top" align="end" sideOffset={12} aria-labelledby={headingId} className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(65dvh,var(--radix-popover-content-available-height))] overflow-y-auto rounded-2xl bg-card text-card-foreground motion-reduce:animate-none" onCloseAutoFocus={event => { if (leaving.current) { event.preventDefault(); leaving.current = false; } }}>
      <h2 id={headingId} className="mb-2 text-sm font-semibold">Ideas from your bubbles</h2>
      <p className="mb-3 text-xs text-muted-foreground">Small next steps from your notes and local starting ideas. You decide what becomes a task.</p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {suggestions.map(draft => <li key={draft.sourceTaskId} className="rounded-lg border p-3">
          <p className="text-sm break-words">{draft.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">From {draft.sourceTitle} · {draft.origin === 'notes' ? 'your notes' : 'local starting idea'}</p>
          <Button variant="ghost" className={quietButton} onClick={() => navigate(() => onReviewSource(draft.sourceTaskId))} aria-label={`Review ideas from ${draft.sourceTitle}`}>Review ideas</Button>
        </li>)}
      </ul>
      {enrolled.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Automatic notes steps are enabled for {enrolled.length} {enrolled.length === 1 ? 'source' : 'sources'}. Manage them in Grow.</p>}
      {automatic.length > 0 && <div className="mt-3"><p className="text-xs font-medium">Recently created from your notes</p><ul>{automatic.map(task => <li key={task.id}><Button variant="ghost" className={`${quietButton} h-auto max-w-full whitespace-normal break-words text-left`} onClick={() => navigate(() => onOpenTask(task.id))}>{task.title}{task.completed ? ' · Complete' : ''}</Button></li>)}</ul></div>}
    {failure && <div className="mt-2"><p role="alert" className="text-sm text-destructive">An automatic step could not be saved. Your notes are unchanged.</p><Button variant="outline" className={quietButton} disabled={running} onClick={() => { setFailure(false); setAttempt(value => value + 1); }}>Retry automatic steps</Button></div>}
    </PopoverContent>
  </Popover>;
}
