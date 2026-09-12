import { useMemo } from 'react';
import { ArrowUpRight, CheckCircle2, GitBranch, Target } from 'lucide-react';
import type { Task } from '@/types/task';
import { getCompletedLifeContributions, getConfirmedTaskRelationships, getTaskDependencyStatus, type ResolvedTaskRelationship } from '@/domain/taskRelationships';

import { taskRelationshipLabel, taskRelationshipTraceKey } from './relationshipLabels';

export function AtomicRelationshipPanel({ tasks, onOpenTask, onTrace, canTrace }: {
  tasks: readonly Task[];
  onOpenTask: (id: string) => void;
  onTrace: (connection: ResolvedTaskRelationship) => void;
  canTrace: (connection: ResolvedTaskRelationship) => boolean;
}) {
  const contributions = useMemo(() => getCompletedLifeContributions(tasks), [tasks]);
  const relationships = useMemo(() => getConfirmedTaskRelationships(tasks), [tasks]);
  const dependencies = useMemo(() => new Map(relationships.filter(connection => connection.relationship.kind === 'depends-on').map(connection => [connection.source.id, getTaskDependencyStatus(connection.source.id, tasks)])), [relationships, tasks]);
  return <div className="space-y-3" data-testid="atomic-relationship-panel">
    {contributions.length > 0 && <details className="rounded-xl border bg-background/50 p-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Completed work across your life</summary>
      <p className="mb-2 text-xs text-muted-foreground">Current completed actions and the connections you chose. Reopening an action removes it from these counts.</p>
      <ul aria-label="Completed contributions by life area" className="space-y-3">{contributions.map(area => <li key={area.domainId} data-contribution-area={area.domainId} className="space-y-2 border-t pt-2">
        <h4 className="text-sm font-semibold">{area.label}</h4>
        <p className="text-xs text-muted-foreground">{area.supports.length} supporting {area.supports.length === 1 ? 'action' : 'actions'} · {area.tradeoffs.length} {area.tradeoffs.length === 1 ? 'tradeoff' : 'tradeoffs'}</p>
        <ul className="space-y-1">{[...area.supports.map(task => ({ task, effect: 'Support' })), ...area.tradeoffs.map(task => ({ task, effect: 'Tradeoff' }))].map(({ task, effect }) => <li key={task.id}>
          <button type="button" className="min-h-11 w-full rounded-md px-2 py-1 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenTask(task.id)}><span className="font-medium">{task.title || 'Untitled task'}</span><span className="ml-1 text-muted-foreground">· {effect}</span></button>
        </li>)}</ul>
      </li>)}</ul>
    </details>}
    {relationships.length > 0 && <details className="rounded-xl border bg-background/50 p-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4" aria-hidden="true" />Task relationships ({relationships.length})</summary>
      <p className="mb-2 text-xs text-muted-foreground">Relationships you confirmed between distinct tasks. Shared life-area bonds remain separate.</p>
      <ul aria-label="Confirmed task relationships" className="space-y-3">{relationships.map(connection => {
        const { source, target, relationship } = connection;
        const dependency = relationship.kind === 'depends-on' ? dependencies.get(source.id) : undefined;
        return <li key={taskRelationshipTraceKey(connection)} className="space-y-2 rounded-lg border p-3" data-relationship-kind={relationship.kind}>
          <p className="break-words text-sm"><strong>{source.title || 'Untitled task'}</strong> {taskRelationshipLabel(relationship.kind)} <strong>{target.title || 'Untitled task'}</strong></p>
          {relationship.reason && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{relationship.reason}</p>}
          {dependency && <p className="text-xs text-muted-foreground">{dependency.status === 'ready' ? 'Prerequisites complete — ready when you are.' : dependency.status === 'unresolved' ? 'A prerequisite needs review.' : `${dependency.completed} of ${dependency.total} prerequisites complete.`}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenTask(source.id)}>Open source<ArrowUpRight className="h-3 w-3" aria-hidden="true" /></button>
            <button type="button" className="min-h-11 rounded-lg px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenTask(target.id)}>Open connected task</button>
            {canTrace(connection) && <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onTrace(connection)} aria-label={`Trace connection from ${source.title} to ${target.title}`}><Target className="h-3 w-3" aria-hidden="true" />Trace connection</button>}
          </div>
        </li>;
      })}</ul>
    </details>}
  </div>;
}
