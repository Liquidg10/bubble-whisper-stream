import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Atom,
  Check,
  Leaf,
  Plus,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTaskStore } from '@/stores/taskStore';
import { bubbleToTask } from '@/adapters/taskAdapter';
import {
  STARTER_LESSONS,
  bubbleGrowthSourceFingerprint,
  canGrowBubble,
  createStarterTask,
  starterLessonKey,
  suggestBubbleSprouts,
  type BubbleSprout,
} from '@/domain/bubbleGarden';
import './bubble-garden.css';
import type { Task } from '@/types/task';
import { ProactiveGrowthControls } from '@/components/ProactiveGrowth';
import { BubbleFamily } from '@/components/BubbleFamily';
import { addSproutOnce, persistSproutDismissal, readDismissedSproutKeys } from '@/domain/bubbleGardenState';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';

export function StarterWelcome({
  onStart,
  onCreate,
  busy,
  error,
}: {
  onStart: () => void;
  onCreate: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <section className="garden-welcome" aria-labelledby="garden-welcome-title">
      <div className="garden-preview" aria-hidden="true">
        <div className="garden-orbit orbit-one" />
        <div className="garden-orbit orbit-two" />
        <div className="garden-orbit orbit-three" />
        <div className="garden-seed">
          <Atom />
        </div>
        <i className="garden-satellite satellite-one" />
        <i className="garden-satellite satellite-two" />
        <i className="garden-satellite satellite-three" />
      </div>
      <p className="garden-eyebrow">A little space for your whole life</p>
      <h2 id="garden-welcome-title">
        Small actions.
        <br />
        <em>Connected possibilities.</em>
      </h2>
      <p className="garden-intro">
        Let a thought become a bubble. Give it room to move. Discover how one
        small action can support several parts of your life.
      </p>
      <div className="garden-welcome-actions">
        <Button
          onClick={onStart}
          disabled={busy}
          className="min-h-12 rounded-full gap-2 px-6"
        >
          <Sprout className="h-4 w-4" />
          {busy ? 'Making room…' : 'Start with 3 guide bubbles'}
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          onClick={onCreate}
          variant="ghost"
          className="min-h-12 rounded-full"
        >
          Create my own
        </Button>
      </div>
      <p className="garden-small">
        Includes example connections between Learning, Home and Wellbeing.
        <br />
        Every bubble and connection is yours to change or delete.
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="garden-features">
        <span>
          <Leaf />
          Start small
        </span>
        <span>
          <Atom />
          See connections
        </span>
        <span>
          <Sparkles />
          Grow an idea
        </span>
      </div>
    </section>
  );
}

export function useStarterBubbles() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const start = async () => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    try {
      for (const lesson of STARTER_LESSONS) {
        // Re-read after each durable write, so a retry never duplicates a partial pack.
        const existing = useTaskStore.getState().getTasks();
        if (!existing.some((task) => starterLessonKey(task) === lesson.key)) {
          await useTaskStore.getState().addTask(createStarterTask(lesson));
        }
      }
    } catch {
      setError(
        'The guide could not finish saving. Try again to add only the missing bubbles.',
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return { start, busy, error };
}

function SproutDraft({
  sprout,
  onAdd,
  onDismiss,
  disabled = false,
}: {
  sprout: BubbleSprout;
  onAdd: (
    sprout: BubbleSprout,
    title: string,
    domains: string[],
  ) => Promise<void>;
  onDismiss: () => Promise<void>;
  disabled?: boolean;
}) {
  const [title, setTitle] = useState(sprout.title);
  const [domains, setDomains] = useState(
    sprout.domainLinks.map((link) => link.domainId),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <article className="garden-draft">
      <label
        className="block text-xs font-medium text-muted-foreground"
        htmlFor={`sprout-${sprout.key}`}
      >
        Suggested bubble · {sprout.origin === 'notes' ? 'from your notes' : sprout.origin === 'ai' ? 'AI idea · review before adding' : 'local starting idea'} · about {sprout.minutes} minutes
      </label>
      <textarea
        id={`sprout-${sprout.key}`}
        value={title}
        disabled={saving || disabled}
        onChange={(event) => setTitle(event.target.value)}
        rows={2}
        maxLength={300}
        className="mt-2 w-full resize-y rounded-lg border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="my-3 text-sm text-muted-foreground">{sprout.reason}</p>
      {sprout.domainLinks.length > 0 && (
        <fieldset className="mb-3">
          <legend className="text-xs text-muted-foreground">
            Connect the new bubble to
          </legend>
          <div className="flex flex-wrap gap-2 mt-1">
            {sprout.domainLinks.map((link) => (
              <label
                key={link.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs"
              >
                <input
                  type="checkbox"
                  disabled={saving || disabled}
                  checked={domains.includes(link.domainId)}
                  onChange={(event) =>
                    setDomains((current) =>
                      event.target.checked
                        ? [...current, link.domainId]
                        : current.filter((id) => id !== link.domainId),
                    )
                  }
                />
                {link.label ?? link.domainId}{link.effect === 'tradeoff' ? ' · Tradeoff' : link.effect === undefined || link.effect === 'supports' ? ' · Supports' : ' · Review connection'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || disabled || !title.trim()}
          data-garden-add
          className="min-h-11 gap-2"
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await onAdd(sprout, title, domains);
            } catch {
              setError('This bubble was not saved. Please try again.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Plus className="h-4 w-4" />
          {saving ? 'Saving…' : 'Add this bubble'}
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={saving || disabled}
          onClick={async () => {
            setSaving(true);
            setError('');
            try { await onDismiss(); }
            catch { setError('This suggestion could not be dismissed. Your draft is still here; please try again.'); }
            finally { setSaving(false); }
          }}
        >
          Dismiss
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}

export interface GardenAiSuggestions {
  sourceTaskId: string;
  sourceFingerprint: string;
  sprouts: BubbleSprout[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  message?: string;
  onRequest: (source: Task) => void;
  onDismiss?: () => void;
}

export function BubbleGardenDialog({
  mode,
  onClose,
  onOpenTask,
  starter,
  sourceTaskId,
  aiSuggestions,
}: {
  mode: 'guide' | 'grow' | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  starter: ReturnType<typeof useStarterBubbles>;
  sourceTaskId?: string;
  aiSuggestions?: GardenAiSuggestions;
}) {
  const {
    state: learning,
    currentMilestone,
    completeMilestone,
    skipProgression,
  } = useProgressiveOnboarding();
  const bubbles = useBubbleStore((state) => state.bubbles);
  const tasks = useMemo(() => bubbles.map(bubbleToTask), [bubbles]);
  const sources = tasks.filter(task => task.type === 'task' || task.type === 'thought');
  const [sourceId, setSourceId] = useState(sourceTaskId ?? '');
  const [added, setAdded] = useState<{ id: string; sourceId: string } | null>(null);
  const [status, setStatus] = useState('');
  const [reviewPending, setReviewPending] = useState(0);
  const [reviewError, setReviewError] = useState('');
  const [undoing, setUndoing] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const focusAfterReview = (sourceId: string, addedId?: string) => {
    window.setTimeout(() => {
      const region = reviewRef.current;
      if (!region || region.dataset.gardenSourceId !== sourceId) return;
      const addedButton = addedId ? Array.from(region.querySelectorAll<HTMLButtonElement>('[data-family-task-id]')).find(button => button.dataset.familyTaskId === addedId) : undefined;
      (addedButton ?? region.querySelector<HTMLButtonElement>('[data-garden-add]:not(:disabled), [data-garden-restore]:not(:disabled)') ?? region.querySelector<HTMLSelectElement>('select'))?.focus();
    }, 0);
  };
  useEffect(() => {
    if (mode === 'grow' && sourceTaskId) setSourceId(sourceTaskId);
    setReviewError('');
    setStatus('');
  }, [mode, sourceTaskId]);
  const source = sourceId ? tasks.find(task => task.id === sourceId) : (sources.find(canGrowBubble) ?? sources[0]);
  const canGrowSource = Boolean(source && canGrowBubble(source));
  const dismissed = source ? readDismissedSproutKeys(source) : [];
  const matchingAi = source && aiSuggestions?.sourceTaskId === source.id && aiSuggestions.sourceFingerprint === bubbleGrowthSourceFingerprint(source) ? aiSuggestions : undefined;
  const suggestions = source ? [...(matchingAi?.status === 'ready' ? matchingAi.sprouts : []), ...suggestBubbleSprouts(source, tasks)].filter(item => !dismissed.includes(item.key) && !tasks.some(task => task.metadata?.bubbleGarden?.sproutKey === item.key)) : [];
  const saveReview = async (id: string, action: Parameters<typeof persistSproutDismissal>[1]) => {
    setReviewPending(count => count + 1);
    try {
      await persistSproutDismissal(id, action, {
        getBubble: targetId => useBubbleStore.getState().bubbles.find(bubble => bubble.id === targetId),
        saveBubble: bubble => useBubbleStore.getState().updateBubbleStrict(bubble),
      });
    } finally { setReviewPending(count => count - 1); }
  };
  const openFamilyTask = (id: string) => { onClose(); onOpenTask(id); };
  const lessons = tasks.filter((task) => starterLessonKey(task));
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sprout className="h-5 w-5" />
            {mode === 'guide' ? 'A small beginning' : 'Let a bubble grow'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'guide'
              ? 'Explore at your own pace. Your examples are ordinary bubbles you can edit, complete or delete.'
              : 'Choose a task or thought to explore a smaller next step. Suggestions use your unfinished lists or local templates; you review what becomes a task.'}
          </DialogDescription>
        </DialogHeader>
        {mode === 'guide' ? (
          <div className="space-y-4">
            <div className="garden-guide-legend">
              <p>
                <strong>Bubbles</strong> give your thoughts and actions room to
                breathe.
              </p>
              <p>
                <strong>Molecules</strong> group actions around life areas. One
                task can connect several areas.
              </p>
              <p>
                <strong>Today · Week · Later</strong> are the three time orbits.
                Drag an electron, or open its details and choose a time horizon.
              </p>
            </div>
            <ol className="space-y-2">
              {STARTER_LESSONS.map((lesson, index) => {
                const task = lessons.find(
                  (item) => starterLessonKey(item) === lesson.key,
                );
                return (
                  <li key={lesson.key} className="garden-lesson">
                    <span className="garden-lesson-number">
                      {task?.completed ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task?.completed
                          ? 'Complete'
                          : `${lesson.minutes} minute exploration`}
                      </p>
                    </div>
                    {task && (
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => {
                          onClose();
                          onOpenTask(task.id);
                        }}
                      >
                        Open
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
            {lessons.length < STARTER_LESSONS.length && (
              <>
                <p className="text-xs text-muted-foreground">
                  The guide includes example connections between Learning, Home
                  and Wellbeing. You can change them in Life connections.
                </p>
                <Button
                  className="min-h-11"
                  onClick={starter.start}
                  disabled={starter.busy}
                >
                  {starter.busy
                    ? 'Saving…'
                    : lessons.length
                      ? 'Add missing guide bubbles'
                      : 'Create 3 guide bubbles'}
                </Button>
              </>
            )}
            {starter.error && (
              <p role="alert" className="text-sm text-destructive">
                {starter.error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Prefer less movement? Use the motion control or Settings →
              Accessibility. The List view keeps everything in words.
            </p>
            {currentMilestone &&
              !learning.hasSkippedProgression &&
              !learning.completedMilestones.includes(currentMilestone.day) && (
                <details className="rounded-lg border p-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                    More guided lessons · Day {currentMilestone.day}
                  </summary>
                  <p className="mt-2 text-sm font-medium">
                    {currentMilestone.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentMilestone.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="min-h-11"
                      onClick={() => completeMilestone(currentMilestone.day)}
                    >
                      Mark explored
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      onClick={skipProgression}
                    >
                      Explore at my own pace
                    </Button>
                  </div>
                </details>
              )}
          </div>
        ) : (
          <div ref={reviewRef} data-garden-source-id={source?.id} className="space-y-4">
            {sources.length > 0 || source || sourceId ? (
              <>
                <label className="block text-sm font-medium">
                  Start from this bubble
                  <select
                    aria-label="Bubble to grow"
                    className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
                    value={source?.id ?? sourceId}
                    disabled={reviewPending > 0 || undoing}
                    onChange={event => { aiSuggestions?.onDismiss?.(); setSourceId(event.target.value); setReviewError(''); setStatus(''); }}
                  >
                    {!source && sourceId && <option value={sourceId}>Source bubble unavailable</option>}
                    {source && !sources.some(task => task.id === source.id) && <option value={source.id}>{source.title || 'Untitled bubble'}</option>}
                    {sources.map(task => <option key={task.id} value={task.id}>{task.title || 'Untitled bubble'}{task.type === 'thought' ? ' · Thought' : ''}{task.completed ? ' · Complete' : task.actionability === 'reference' ? ' · Reference' : ''}</option>)}
                  </select>
                </label>
                {source && <BubbleFamily taskId={source.id} onOpenTask={openFamilyTask} />}
                {source && <ProactiveGrowthControls key={source.id} source={source} tasks={tasks} />}
                {source && canGrowSource && aiSuggestions && <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Explore with AI</p>
                  <p className="text-xs text-muted-foreground">When you ask, OpenAI receives up to the first 300 characters of this bubble’s title and 4,000 characters of its notes. You review every suggested task before adding it.</p>
                  <Button variant="outline" className="min-h-11 hover:bg-muted hover:text-foreground transition-none" disabled={matchingAi?.status === 'loading' || reviewPending > 0 || undoing} onClick={() => aiSuggestions.onRequest(source)}>{matchingAi?.status === 'loading' ? 'Finding ideas…' : 'Ask AI for ideas'}</Button>
                  {matchingAi?.message && <p role={matchingAi.status === 'error' ? 'alert' : 'status'} className="text-sm text-muted-foreground">{matchingAi.message}</p>}
                  {matchingAi?.status === 'ready' && matchingAi.onDismiss && <Button variant="ghost" className="min-h-11 hover:bg-muted hover:text-foreground transition-none" onClick={matchingAi.onDismiss}>Clear AI ideas</Button>}
                </div>}
                {source?.type === 'thought' && canGrowSource && <p className="rounded-lg bg-muted p-4 text-sm">Explore this thought at your own pace. Adding a step creates a separate task and keeps your original thought intact.</p>}
                {source?.completed && <p className="rounded-lg bg-muted p-4 text-sm">This bubble is complete. Its connected steps are still available; choose an unfinished bubble for new suggestions.</p>}
                {source && !source.completed && source.actionability === 'reference' && <p className="rounded-lg bg-muted p-4 text-sm">This is a reference bubble. Its connected steps remain available.</p>}
                {source && !source.completed && source.actionability !== 'reference' && !canGrowSource && <p className="rounded-lg bg-muted p-4 text-sm">{source.type === 'task' || source.type === 'thought' ? 'Add some words to this bubble before exploring a next step.' : 'Grow offers drafts for tasks and thoughts. This bubble stays available with any connected steps.'}</p>}
                {suggestions.map(sprout => (
                  <SproutDraft
                    key={sprout.key}
                    sprout={sprout}
                    disabled={reviewPending > 0 || undoing}
                    onDismiss={async () => {
                      await saveReview(sprout.sourceTaskId, { type: 'dismiss', key: sprout.key });
                      setStatus('Suggestion dismissed. You can restore it here.');
                      focusAfterReview(sprout.sourceTaskId);
                    }}
                    onAdd={async (draft, title, domains) => {
                      const result = await addSproutOnce(draft, title, domains, {
                        getTasks: () => useTaskStore.getState().getTasks(),
                        addTask: task => useTaskStore.getState().addTask(task),
                      });
                      setAdded(result.created ? { id: result.task.id, sourceId: draft.sourceTaskId } : null);
                      setStatus(result.created ? `Added “${result.task.title}”. Find it in Connected steps.` : `“${result.task.title}” is already saved in Connected steps.`);
                      focusAfterReview(draft.sourceTaskId, result.task.id);
                    }}
                  />
                ))}
                {source && canGrowSource && dismissed.length > 0 && <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Dismissed suggestions stay hidden for this bubble, including after you return.</p>
                  <Button data-garden-restore variant="outline" className="min-h-11" disabled={reviewPending > 0 || undoing} onClick={async () => {
                    setReviewError('');
                    try { await saveReview(source.id, { type: 'restore' }); setStatus('Dismissed suggestions restored. Already-created steps remain in Connected steps.'); }
                    catch { setReviewError('Suggestions could not be restored. Please try again.'); }
                  }}>Restore suggestions</Button>
                </div>}
                {source && canGrowSource && suggestions.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm">You have explored these suggestions. Your saved steps remain in Connected steps{dismissed.length ? ', or you can restore dismissed suggestions.' : '.'}</p>}
                {!source && <p role="status" className="rounded-lg bg-muted p-4 text-sm">That source bubble is no longer available. Choose another bubble to continue.</p>}
              </>
            ) : <p className="rounded-lg bg-muted p-4 text-sm">Capture a thought or add a task, then return here to explore a smaller next step.</p>}
            {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError}</p>}
            {added && source?.id === added.sourceId && bubbles.some(bubble => bubble.id === added.id) && <Button variant="ghost" className="min-h-11" disabled={undoing || reviewPending > 0} onClick={async () => {
              const target = added;
              setUndoing(true);
              try {
                await useBubbleStore.getState().deleteBubble(target.id);
                if (useBubbleStore.getState().bubbles.some(bubble => bubble.id === target.id)) { setStatus('Could not undo. Please try again.'); return; }
                setAdded(current => current?.id === target.id ? null : current);
                setStatus('New bubble removed.');
              } catch { setStatus('Could not undo. Please try again.'); }
              finally { setUndoing(false); }
            }}>{undoing ? 'Removing…' : 'Undo last addition'}</Button>}
            <p role="status" className="text-sm text-muted-foreground">{status}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
