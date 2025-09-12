import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface QuadrantFiltersProps {
  visibility: {
    do: boolean;
    schedule: boolean;
    delegate: boolean;
    drop: boolean;
  };
  onToggle: (quadrant: keyof QuadrantFiltersProps['visibility']) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  taskCounts: {
    do: number;
    schedule: number;
    delegate: number;
    drop: number;
  };
}

const FILTER_CONFIG = [
  {
    key: 'do' as const,
    label: 'Do',
    description: 'Urgent & Important',
    shortcut: 'Alt+1',
    color: 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
  },
  {
    key: 'schedule' as const,
    label: 'Schedule',
    description: 'Not Urgent & Important',
    shortcut: 'Alt+2',
    color: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  },
  {
    key: 'delegate' as const,
    label: 'Delegate',
    description: 'Urgent & Not Important',
    shortcut: 'Alt+3',
    color: 'bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/20 dark:hover:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
  },
  {
    key: 'drop' as const,
    label: 'Drop',
    description: 'Not Urgent & Not Important',
    shortcut: 'Alt+4',
    color: 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-950/20 dark:hover:bg-gray-900/30 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800'
  }
];

export function QuadrantFilters({
  visibility,
  onToggle,
  onShowAll,
  onHideAll,
  taskCounts
}: QuadrantFiltersProps) {
  const visibleCount = Object.values(visibility).filter(Boolean).length;
  const totalTasks = Object.values(taskCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="px-4 pb-3 border-b border-border/40">
      <div className="flex items-center justify-between gap-4">
        {/* Quadrant Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_CONFIG.map(filter => {
            const isVisible = visibility[filter.key];
            const count = taskCounts[filter.key];
            
            return (
              <Button
                key={filter.key}
                variant="outline"
                size="sm"
                onClick={() => onToggle(filter.key)}
                className={cn(
                  "gap-2 transition-all duration-200",
                  isVisible ? filter.color : "opacity-50 hover:opacity-75"
                )}
                aria-pressed={isVisible}
                title={`${filter.description} (${filter.shortcut})`}
              >
                {isVisible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
                <span className="font-medium">{filter.label}</span>
                <Badge 
                  variant="secondary" 
                  className="text-xs bg-background/50"
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground hidden sm:block">
            {visibleCount}/4 quadrants • {totalTasks} tasks
          </div>
          
          {visibleCount > 0 && visibleCount < 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowAll}
              className="gap-2 text-xs"
            >
              <Eye className="h-3 w-3" />
              Show All
            </Button>
          )}
          
          {visibleCount === 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onHideAll}
              className="gap-2 text-xs"
            >
              <EyeOff className="h-3 w-3" />
              Hide All
            </Button>
          )}
        </div>
      </div>

      {/* Filter Info */}
      {visibleCount < 4 && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span>Keyboard shortcuts: </span>
          {FILTER_CONFIG.map((filter, index) => (
            <span key={filter.key}>
              {index > 0 && ' • '}
              <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                {filter.shortcut}
              </kbd>
              {' '}
              {filter.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}