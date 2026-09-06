import React, { useMemo, useRef, useState } from 'react';
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
  createStarterTask,
  starterLessonKey,
  suggestBubbleSprouts,
  createSproutTask,
  type BubbleSprout,
} from '@/domain/bubbleGarden';
import './bubble-garden.css';
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
}: {
  sprout: BubbleSprout;
  onAdd: (
    sprout: BubbleSprout,
    title: string,
    domains: string[],
  ) => Promise<void>;
  onDismiss: () => void;
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
        Suggested bubble · about {sprout.minutes} minutes
      </label>
      <textarea
        id={`sprout-${sprout.key}`}
        value={title}
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
                  checked={domains.includes(link.domainId)}
                  onChange={(event) =>
                    setDomains((current) =>
                      event.target.checked
                        ? [...current, link.domainId]
                        : current.filter((id) => id !== link.domainId),
                    )
                  }
                />
                {link.label ?? link.domainId}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || !title.trim()}
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
          disabled={saving}
          onClick={onDismiss}
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

export function BubbleGardenDialog({
  mode,
  onClose,
  onOpenTask,
  starter,
}: {
  mode: 'guide' | 'grow' | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  starter: ReturnType<typeof useStarterBubbles>;
}) {
  const {
    state: learning,
    currentMilestone,
    completeMilestone,
    skipProgression,
  } = useProgressiveOnboarding();
  const bubbles = useBubbleStore((state) => state.bubbles);
  const tasks = useMemo(() => bubbles.map(bubbleToTask), [bubbles]);
  const eligible = tasks.filter(
    (task) =>
      !task.completed &&
      task.type === 'task' &&
      task.actionability !== 'reference',
  );
  const [sourceId, setSourceId] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const source = eligible.find((task) => task.id === sourceId) ?? eligible[0];
  const suggestions = source
    ? suggestBubbleSprouts(source, tasks).filter(
        (item) => !dismissed.includes(item.key),
      )
    : [];
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
              : 'Pick a bubble to find a smaller next step. These local suggestions are editable drafts; you choose what becomes a task.'}
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
          <div className="space-y-4">
            {eligible.length ? (
              <>
                <label className="block text-sm font-medium">
                  Start from this bubble
                  <select
                    aria-label="Bubble to grow"
                    className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3 text-sm"
                    value={source?.id ?? ''}
                    onChange={(event) => setSourceId(event.target.value)}
                  >
                    {eligible.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                {suggestions.map((sprout) => (
                  <SproutDraft
                    key={sprout.key}
                    sprout={sprout}
                    onDismiss={() =>
                      setDismissed((current) => [...current, sprout.key])
                    }
                    onAdd={async (draft, title, domains) => {
                      const task = await useTaskStore
                        .getState()
                        .addTask(createSproutTask(draft, title, domains));
                      setAddedId(task.id);
                      setStatus(`Added “${task.title}”.`);
                    }}
                  />
                ))}
                {suggestions.length === 0 && (
                  <p className="rounded-lg bg-muted p-4 text-sm">
                    You've explored these suggestions. Choose another bubble
                    when you're ready.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-muted p-4 text-sm">
                Add an unfinished task first, then return here to help it grow
                into smaller steps.
              </p>
            )}
            {addedId && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    onClose();
                    onOpenTask(addedId);
                  }}
                >
                  Open new bubble
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={async () => {
                    await useBubbleStore.getState().deleteBubble(addedId);
                    if (
                      useBubbleStore
                        .getState()
                        .bubbles.some((bubble) => bubble.id === addedId)
                    ) {
                      setStatus('Could not undo. Please try again.');
                      return;
                    }
                    setAddedId(null);
                    setStatus('New bubble removed.');
                  }}
                >
                  Undo last addition
                </Button>
              </div>
            )}
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
