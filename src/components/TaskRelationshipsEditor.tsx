import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTaskStore } from '@/stores/taskStore';
import type { Task, TaskRelationship } from '@/types/task';
import {
  createConfirmedTaskRelationship,
  getConfirmedTaskDomainEffects,
  getTaskDependencyStatus,
  getTaskRelationshipConnections,
  isRelationshipTask,
} from '@/domain/taskRelationships';

const relationshipLabels = {
  'supports': 'Helps',
  'depends-on': 'Depends on',
  'tradeoff': 'Has a tradeoff with',
} as const;
const controlClass = 'min-h-11 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const buttonClass = 'min-h-11 h-auto whitespace-normal text-foreground hover:bg-muted hover:text-foreground transition-none';

interface Props {
  task: Task;
  onChange: (relationships: TaskRelationship[]) => void;
  onOpenTask?: (id: string) => void;
}

/** One source owns a relationship; incoming connections are read-only projections. */
export function TaskRelationshipsEditor({ task, onChange, onOpenTask }: Props) {
  const savedTasks = useTaskStore(state => state.tasks);
  const tasks = useMemo(() => savedTasks.map(saved => saved.id === task.id ? task : saved), [savedTasks, task]);
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<TaskRelationship['kind']>('depends-on');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [undo, setUndo] = useState<TaskRelationship[] | null>(null);
  const relationships = Array.isArray(task.relationships) ? task.relationships : [];
  const { incoming, outgoing } = useMemo(() => getTaskRelationshipConnections(task.id, tasks), [task.id, tasks]);
  const choices = useMemo(() => tasks.filter(candidate => candidate.id !== task.id && isRelationshipTask(candidate)), [task.id, tasks]);
  const query = search.trim().toLocaleLowerCase();
  const visibleChoices = choices.filter(candidate => candidate.title.toLocaleLowerCase().includes(query));
  const labels = useMemo(() => {
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const candidate of choices) totals.set(candidate.title, (totals.get(candidate.title) ?? 0) + 1);
    return new Map(choices.map(candidate => {
      const ordinal = (seen.get(candidate.title) ?? 0) + 1;
      seen.set(candidate.title, ordinal);
      const total = totals.get(candidate.title)!;
      return [candidate.id, `${candidate.title || 'Untitled task'}${total > 1 ? ` (task ${ordinal} of ${total})` : ''}`];
    }));
  }, [choices]);
  const replace = (next: TaskRelationship[], message: string) => {
    setUndo(relationships);
    onChange(next);
    setAnnouncement(message);
    setError('');
  };

  if (!isRelationshipTask(task)) return null;
  return <section aria-labelledby={`${id}-heading`} className="space-y-3 rounded-xl border bg-card p-3 text-card-foreground" data-testid="task-relationships-editor">
    <h3 id={`${id}-heading`} className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" aria-hidden="true" /> How tasks connect</h3>
    <p className="text-xs leading-relaxed text-muted-foreground">Name what helps, what comes first, or where you want to make a tradeoff. Each bubble stays its own task.</p>
    {relationships.length === 0 && incoming.length === 0 && <p className="text-sm text-muted-foreground">No task connections yet.</p>}
    <ul aria-label="Connections from this task" className="space-y-2">
      {relationships.filter(link => link && typeof link.id === 'string').map((link, index) => {
        const target = tasks.find(candidate => candidate.id === link.targetTaskId);
        const label = target?.title || 'Unavailable task';
        const knownKind = Object.prototype.hasOwnProperty.call(relationshipLabels, link.kind);
        return <li key={`${link.id}-${index}`} className="space-y-2 rounded-lg border p-3">
          <p className="break-words text-sm"><span className="font-medium">{knownKind ? relationshipLabels[link.kind] : 'Unrecognized connection'}</span> {label}</p>
          <p className="text-xs text-muted-foreground">{link.userConfirmed !== true ? 'Suggested connection — awaiting your review' : !target || !isRelationshipTask(target) ? 'This connection needs review; its task is unavailable.' : !outgoing.some(connection => connection.relationship === link) ? 'This connection needs review before it can be used.' : target.completed === true ? 'Connected task is complete' : 'Connected task is open'}</p>
          {typeof link.reason === 'string' && link.reason.trim() && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{link.reason}</p>}
          <div className="flex flex-wrap gap-2">
            {target && onOpenTask && <Button type="button" variant="outline" size="sm" className={buttonClass} onClick={() => onOpenTask(target.id)} aria-label={`Open connected task ${label}`}>Open task <ArrowUpRight className="ml-1 h-3 w-3" aria-hidden="true" /></Button>}
            {link.userConfirmed !== true && knownKind && target && <Button type="button" variant="outline" size="sm" className={buttonClass} onClick={() => {
              try {
                const confirmed = { ...link, ...createConfirmedTaskRelationship(task, link.targetTaskId, link.kind, tasks, { id: link.id, reason: link.reason, suggestionReason: link.suggestionReason, source: link.source }) };
                replace(relationships.map(current => current === link ? confirmed : current), 'Connection confirmed in your changes.');
              } catch (failure) { setError(failure instanceof Error ? failure.message : 'This connection could not be confirmed.'); }
            }}>Confirm connection</Button>}
            <Button type="button" variant="ghost" size="sm" className={buttonClass} aria-label={`Remove ${knownKind ? relationshipLabels[link.kind].toLowerCase() : 'connection to'} ${label}`} onClick={() => replace(relationships.filter(current => current !== link), 'Connection removed from your changes. Undo is available.')}>Remove</Button>
          </div>
        </li>;
      })}
    </ul>
    {incoming.length > 0 && <div className="space-y-2 border-t pt-3">
      <h4 className="text-xs font-semibold">Connections from other tasks</h4>
      <ul aria-label="Connections to this task" className="space-y-2">{incoming.map(({ source, relationship }) => <li key={`${source.id}-${relationship.id}`} className="rounded-lg bg-muted/50 p-3">
        <p className="break-words text-sm">{relationship.kind === 'depends-on' ? 'Needed by' : relationship.kind === 'supports' ? 'Helped by' : 'Tradeoff with'} <strong>{source.title || 'Untitled task'}</strong></p>
        {relationship.reason && <p className="mt-1 break-words text-xs text-muted-foreground">{relationship.reason}</p>}
        {onOpenTask && <Button type="button" variant="ghost" size="sm" className={`${buttonClass} mt-1 px-0`} onClick={() => onOpenTask(source.id)}>Open source task</Button>}
      </li>)}</ul>
      <p className="text-xs text-muted-foreground">Edit an incoming connection from its source task.</p>
    </div>}
    {!adding ? <Button type="button" variant="outline" className={buttonClass} onClick={() => { setAdding(true); setError(''); }}>Connect another task</Button> : <form className="space-y-3 rounded-lg border p-3" onSubmit={event => {
      event.preventDefault();
      try {
        const relationship = createConfirmedTaskRelationship(task, targetId, kind, tasks, { reason: reason.trim() || undefined });
        replace([...relationships, relationship], 'Connection added to your changes. Undo is available.');
        setAdding(false); setTargetId(''); setSearch(''); setReason('');
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Choose another task to connect.'); }
    }}>
      <div className="space-y-1"><Label htmlFor={`${id}-kind`}>This task…</Label><select id={`${id}-kind`} className={controlClass} value={kind} onChange={event => setKind(event.target.value as TaskRelationship['kind'])}>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor={`${id}-search`}>Find another task</Label><Input id={`${id}-search`} type="search" value={search} onChange={event => { setSearch(event.target.value); setTargetId(''); }} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-target`}>Connected task</Label><select id={`${id}-target`} className={controlClass} value={targetId} onChange={event => setTargetId(event.target.value)} required><option value="">Choose a task</option>{visibleChoices.map(candidate => <option key={candidate.id} value={candidate.id}>{labels.get(candidate.id)}</option>)}</select></div>
      {visibleChoices.length === 0 && <p className="text-xs text-muted-foreground">No matching task. Create a task first, or try another search.</p>}
      <div className="space-y-1"><Label htmlFor={`${id}-reason`}>What does this connection mean? (optional)</Label><Input id={`${id}-reason`} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={!targetId}>Add connection</Button><Button type="button" variant="ghost" className={buttonClass} onClick={() => { setAdding(false); setError(''); setTargetId(''); setSearch(''); setReason(''); }}>Cancel</Button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {undo && <Button type="button" variant="outline" className={buttonClass} onClick={() => { onChange(undo); setUndo(null); setAnnouncement('Previous connections restored in your changes.'); }}>Undo connection change</Button>}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </section>;
}

/** Completion and readiness come from saved canonical state, never an editor draft. */
export function SavedTaskConnections({ taskId, onOpenTask }: { taskId: string; onOpenTask?: (id: string) => void }) {
  const tasks = useTaskStore(state => state.tasks);
  const task = tasks.find(candidate => candidate.id === taskId);
  if (!task || !isRelationshipTask(task)) return null;
  const dependency = getTaskDependencyStatus(taskId, tasks);
  const effects = getConfirmedTaskDomainEffects(task);
  if (dependency.status === 'none' && (task.completed !== true || effects.length === 0)) return null;
  return <div className="space-y-2 rounded-xl border bg-card p-3 text-card-foreground" data-testid="saved-task-connections">
    {dependency.status !== 'none' && <>
      <p className="text-sm font-medium" role="status">{dependency.status === 'ready' ? 'Ready: your prerequisites are complete.' : dependency.status === 'unresolved' ? 'A prerequisite needs review.' : `Waiting on ${dependency.remaining} ${dependency.remaining === 1 ? 'prerequisite' : 'prerequisites'}.`}</p>
      <p className="text-xs text-muted-foreground">{dependency.completed} of {dependency.total} prerequisites complete. You still choose when to act.</p>
      <ul className="space-y-1" aria-label="Task prerequisites">{dependency.prerequisites.map(({ relationship, target, state }, index) => <li key={`${relationship.id}-${index}`} className="break-words text-xs">
        {target && onOpenTask ? <button type="button" className="min-h-11 rounded-md text-left underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenTask(target.id)}>{target.title || 'Untitled task'}</button> : target?.title || 'Unavailable prerequisite'} <span className="text-muted-foreground">· {state === 'complete' ? 'Complete' : state === 'waiting' ? 'Open' : 'Needs review'}</span>
      </li>)}</ul>
    </>}
    {task.completed === true && effects.length > 0 && <div role="status" aria-label="Completed work connections" className="space-y-1">
      <p className="text-sm font-semibold">This completed action connects to:</p>
      <ul className="space-y-1 text-sm">{effects.map(({ link, effect }) => <li key={link.domainId} className="break-words">{link.label || link.domainId} <span className="text-xs text-muted-foreground">· {effect === 'tradeoff' ? 'Tradeoff you noted' : 'Support you noted'}</span></li>)}</ul>
      <p className="text-xs text-muted-foreground">Your recorded connections, not a measure of the outcome. Reopening this task removes it from completed work.</p>
    </div>}
  </div>;
}
