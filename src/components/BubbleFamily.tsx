import React, { useId, useMemo } from 'react';
import { ArrowUpRight, Check, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBubbleStore } from '@/stores/bubbleStore';
import { bubbleToTask } from '@/adapters/taskAdapter';
import { deriveBubbleFamily } from '@/domain/bubbleGardenState';
import './bubble-garden.css';

export interface BubbleFamilyProps {
  taskId: string;
  onOpenTask: (id: string) => void;
}

export function BubbleFamily({ taskId, onOpenTask }: BubbleFamilyProps) {
  const headingId = useId();
  const bubbles = useBubbleStore(state => state.bubbles);
  const family = useMemo(() => deriveBubbleFamily(taskId, bubbles.map(bubbleToTask)), [taskId, bubbles]);
  if (!family.parentId && family.children.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="garden-family">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4" aria-hidden="true" />Connected steps</h3>
      {family.parentId && <div className="mt-3">
        <p className="text-xs text-muted-foreground">Grown from</p>
        {family.parent ? <Button type="button" variant="ghost" className="garden-family-link h-auto min-w-0 whitespace-normal" data-family-task-id={family.parent.id} onClick={() => onOpenTask(family.parent!.id)} aria-label={`Open source bubble: ${family.parent.title}`}>
          <span className="garden-family-title min-w-0 flex-1 whitespace-normal break-words text-left">{family.parent.title || 'Untitled bubble'}</span>
          {family.parent.completed && <span className="garden-family-status shrink-0 whitespace-nowrap text-xs text-muted-foreground">Complete</span>}
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Button> : <p className="mt-1 text-sm text-muted-foreground">The original bubble is no longer available. Your step is still here.</p>}
      </div>}
      {family.children.length > 0 && <div className="mt-3">
        <p className="text-xs text-muted-foreground">Grown from this bubble · {family.children.length}</p>
        <ul aria-label="Steps grown from this bubble" className="mt-1 space-y-1">
          {family.children.map(child => <li key={child.id}><Button type="button" variant="ghost" className="garden-family-link h-auto min-w-0 whitespace-normal" data-family-task-id={child.id} onClick={() => onOpenTask(child.id)} aria-label={`Open grown bubble: ${child.title}`}>
            {child.completed && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            <span className="garden-family-title min-w-0 flex-1 whitespace-normal break-words text-left">{child.title || 'Untitled bubble'}</span>
            <span className="garden-family-status shrink-0 whitespace-nowrap text-xs text-muted-foreground">{child.completed ? 'Complete' : 'Open'}</span>
            <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Button></li>)}
        </ul>
      </div>}
    </section>
  );
}
