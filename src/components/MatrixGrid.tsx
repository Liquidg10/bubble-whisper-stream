import React from 'react';
import { TaskCard, TaskCardConfigs } from '@/components/TaskCard';
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
  onOpenDetail?: (task: Task) => void;
  viewSDK: ViewSDK;
}

const QUADRANT_CONFIG = {
  1: { 
    label: 'Do', 
    description: 'Urgent & Important',
    color: 'bg-red-200 dark:bg-red-900/60 border-red-400 dark:border-red-600',
    headerColor: 'bg-red-300 dark:bg-red-700/70 text-red-900 dark:text-red-100',
    visible: 'do' as const
  },
  2: { 
    label: 'Schedule', 
    description: 'Not Urgent & Important',
    color: 'bg-blue-200 dark:bg-blue-900/60 border-blue-400 dark:border-blue-600',
    headerColor: 'bg-blue-300 dark:bg-blue-700/70 text-blue-900 dark:text-blue-100',
    visible: 'schedule' as const
  },
  3: { 
    label: 'Delegate', 
    description: 'Urgent & Not Important',
    color: 'bg-yellow-200 dark:bg-yellow-900/60 border-yellow-400 dark:border-yellow-600',
    headerColor: 'bg-yellow-300 dark:bg-yellow-700/70 text-yellow-900 dark:text-yellow-100',
    visible: 'delegate' as const
  },
  4: { 
    label: 'Drop', 
    description: 'Not Urgent & Not Important',
    color: 'bg-gray-200 dark:bg-gray-900/60 border-gray-400 dark:border-gray-600',
    headerColor: 'bg-gray-300 dark:bg-gray-700/70 text-gray-900 dark:text-gray-100',
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
  onOpenDetail,
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
                <TaskCard
                  key={task.id}
                  task={task}
                  viewConfig={TaskCardConfigs.matrix}
                  isSelected={selectedTaskIds.has(task.id)}
                  isFocused={focusedTaskId === task.id}
                  onSelect={(taskId) => onTaskSelect(taskId, false)}
                  onUpdate={(updatedTask) => viewSDK.actions.upsert(updatedTask)}
                  onOpenDetail={onOpenDetail}
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