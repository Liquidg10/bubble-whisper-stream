import React from 'react';
import { MatrixTask } from '@/components/MatrixTask';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type Task } from '@/types/task';
import { type ViewSDK } from '@/views/sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MatrixGridProps {
  tasksByQuadrant: Record<1|2|3|4, Task[]>;
  quadrantVisibility: {
    do: boolean;
    schedule: boolean;
    delegate: boolean;
    drop: boolean;
  };
  focusedQuadrant: 1|2|3|4;
  focusedTaskId: string | null;
  selectedTaskIds: Set<string>;
  onTaskSelect: (taskId: string, isMulti: boolean) => void;
  onTaskFocus: (taskId: string | null) => void;
  onQuadrantFocus: (quadrant: 1|2|3|4) => void;
  viewSDK: ViewSDK;
}

const QUADRANT_CONFIG = {
  1: { 
    label: 'Do', 
    description: 'Urgent & Important',
    color: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    headerColor: 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100',
    visible: 'do' as const
  },
  2: { 
    label: 'Schedule', 
    description: 'Not Urgent & Important',
    color: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
    headerColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100',
    visible: 'schedule' as const
  },
  3: { 
    label: 'Delegate', 
    description: 'Urgent & Not Important',
    color: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
    headerColor: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100',
    visible: 'delegate' as const
  },
  4: { 
    label: 'Drop', 
    description: 'Not Urgent & Not Important',
    color: 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800',
    headerColor: 'bg-gray-100 dark:bg-gray-900/30 text-gray-900 dark:text-gray-100',
    visible: 'drop' as const
  }
} as const;

export function MatrixGrid({
  tasksByQuadrant,
  quadrantVisibility,
  focusedQuadrant,
  focusedTaskId,
  selectedTaskIds,
  onTaskSelect,
  onTaskFocus,
  onQuadrantFocus,
  viewSDK
}: MatrixGridProps) {

  const renderQuadrant = (quadrant: 1|2|3|4) => {
    const config = QUADRANT_CONFIG[quadrant];
    const tasks = tasksByQuadrant[quadrant];
    const isVisible = quadrantVisibility[config.visible];
    const isFocused = focusedQuadrant === quadrant;

    if (!isVisible) return null;

    return (
      <motion.div
        key={quadrant}
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "min-h-[300px] transition-all duration-200",
          isFocused && "ring-2 ring-primary/50"
        )}
      >
        <Card 
          className={cn(
            "h-full flex flex-col",
            config.color,
            isFocused && "ring-2 ring-primary/50"
          )}
          onClick={() => onQuadrantFocus(quadrant)}
          tabIndex={0}
          role="region"
          aria-label={`${config.label} quadrant: ${config.description}`}
        >
          {/* Quadrant Header */}
          <div className={cn("p-3 rounded-t-lg border-b", config.headerColor)}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">{config.label}</h3>
                <p className="text-xs opacity-75">{config.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {tasks.length}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Q{quadrant}
                </Badge>
              </div>
            </div>
          </div>

          {/* Tasks List */}
          <div className="flex-1 p-3 space-y-2 overflow-auto">
            <AnimatePresence mode="popLayout">
              {tasks.map(task => (
                <MatrixTask
                  key={task.id}
                  task={task}
                  quadrant={quadrant}
                  isSelected={selectedTaskIds.has(task.id)}
                  isFocused={focusedTaskId === task.id}
                  onSelect={(isMulti) => onTaskSelect(task.id, isMulti)}
                  onFocus={() => onTaskFocus(task.id)}
                  viewSDK={viewSDK}
                />
              ))}
            </AnimatePresence>

            {tasks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-2xl mb-2">⊡</div>
                <p className="text-sm">No tasks in this quadrant</p>
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
      {/* Importance axis label */}
      <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 -rotate-90">
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          ← Less Important | More Important →
        </div>
      </div>

      {/* Urgency axis label */}
      <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8">
        <div className="text-sm font-medium text-muted-foreground">
          ← Less Urgent | More Urgent →
        </div>
      </div>

      {/* Quadrants: Schedule (2) | Do (1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
        <div className="order-2 md:order-1">
          {renderQuadrant(2)}
        </div>
        <div className="order-1 md:order-2">
          {renderQuadrant(1)}
        </div>
      </div>

      {/* Quadrants: Drop (4) | Delegate (3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
        <div className="order-4 md:order-3">
          {renderQuadrant(4)}
        </div>
        <div className="order-3 md:order-4">
          {renderQuadrant(3)}
        </div>
      </div>
    </div>
  );
}