/** Familiar views share one labelled, wrapping control without covering the canvas. */
import { Button } from '@/components/ui/button';
import { Atom, Circle, List, Grid3x3, Columns3, Grid } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useLocation, useNavigate } from 'react-router-dom';

const VIEWS = [
  { view: 'bubble', path: '/', label: 'Bubbles', accessibleLabel: 'Bubble view mode', icon: Circle },
  { view: 'atomic', path: '/', label: 'Atomic', accessibleLabel: 'Atomic view mode', icon: Atom },
  { view: 'list', path: '/list', label: 'List', accessibleLabel: 'List view mode', icon: List },
  { view: 'kanban', path: '/kanban', label: 'Board', accessibleLabel: 'Kanban view mode', icon: Columns3 },
  { view: 'matrix', path: '/matrix', label: 'Matrix', accessibleLabel: 'Matrix view mode', icon: Grid3x3 },
  { view: 'pinboard', path: '/pinboard', label: 'Pinboard', accessibleLabel: 'Pinboard view mode', icon: Grid },
] as const;

export function ViewModeToggle() {
  const { settings, setViewMode } = useBubbleStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div role="group" aria-label="Canvas view" className="grid w-full min-w-0 grid-cols-6 gap-1 rounded-xl bg-background/70 p-1 sm:flex sm:w-auto sm:flex-wrap">
      {VIEWS.map(({ view, path, label, accessibleLabel, icon: Icon }) => {
        const active = path === '/'
          ? pathname === '/' && (settings.viewMode || 'bubble') === view
          : path === '/kanban'
            ? pathname === '/kanban' || pathname === '/kankav'
            : pathname === path;
        return (
          <Button
            key={view}
            variant={active ? 'secondary' : 'ghost'}
            onClick={() => {
              if (view === 'bubble' || view === 'atomic') setViewMode(view);
              navigate(path);
            }}
            className={`h-auto min-h-11 min-w-0 flex-col gap-1 rounded-lg px-1 py-1.5 text-[10px] sm:flex-row sm:gap-2 sm:px-3 sm:text-xs ${active ? 'text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground'}`}
            aria-label={accessibleLabel}
            aria-pressed={active}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
