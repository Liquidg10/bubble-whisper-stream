/**
 * P1 Masonry/Pinboard View Component
 * Floating card visualization for unscheduled tasks
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Task } from '@/types/task';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Clock, MoreHorizontal, Edit, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isFeatureEnabled } from '@/config/flags';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MasonryViewProps {
  tasks: Task[];
  onTaskUpdate: (task: Task) => void;
  onTaskComplete: (taskId: string) => void;
  onTaskEdit: (task: Task) => void;
  onTaskSchedule: (task: Task) => void;
  className?: string;
}

interface TaskCardProps {
  task: Task;
  onComplete: () => void;
  onEdit: () => void;
  onSchedule: () => void;
  style?: React.CSSProperties;
}

function TaskCard({ task, onComplete, onEdit, onSchedule, style }: TaskCardProps) {
  const cardSize = useMemo(() => {
    // Map priority (0-100) to size (1-4 scale)
    const size = Math.max(1, Math.min(4, 1 + (task.priority / 100) * 3));
    return {
      width: `${Math.max(200, 150 + size * 30)}px`,
      minHeight: `${Math.max(120, 80 + size * 20)}px`,
    };
  }, [task.priority]);

  const priorityColor = useMemo(() => {
    if (task.priority >= 80) return 'bg-destructive/10 border-destructive/20';
    if (task.priority >= 60) return 'bg-warning/10 border-warning/20';
    if (task.priority >= 40) return 'bg-primary/10 border-primary/20';
    return 'bg-muted border-border';
  }, [task.priority]);

  return (
    <Card 
      className={cn(
        'group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105',
        priorityColor,
        task.completed && 'opacity-60'
      )}
      style={{ ...cardSize, ...style }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">
            {task.title}
          </h3>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onComplete}>
                <Check className="h-4 w-4 mr-2" />
                {task.completed ? 'Uncomplete' : 'Complete'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSchedule}>
                <CalendarIcon className="h-4 w-4 mr-2" />
                Schedule
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.id} variant="secondary" className="text-xs px-1">
              {tag.emoji} {tag.name}
            </Badge>
          ))}
          {task.tags.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{task.tags.length - 2}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.due && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(task.due), 'MMM d')}
            </div>
          )}
          <Badge variant="outline" className="text-xs">
            {task.priority}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function MasonryView({ 
  tasks, 
  onTaskUpdate, 
  onTaskComplete, 
  onTaskEdit, 
  onTaskSchedule,
  className 
}: MasonryViewProps) {
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  // Filter to unscheduled tasks only
  const unscheduledTasks = useMemo(() => 
    tasks.filter(task => !task.start && !task.end),
    [tasks]
  );

  // Sort by priority and due date
  const sortedTasks = useMemo(() => 
    [...unscheduledTasks].sort((a, b) => {
      // Priority first (higher priority first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Then by due date (earlier first)
      if (a.due && b.due) {
        return a.due - b.due;
      }
      if (a.due) return -1;
      if (b.due) return 1;
      // Finally by creation date
      return b.createdAt - a.createdAt;
    }),
    [unscheduledTasks]
  );

  const handleTaskComplete = useCallback((taskId: string) => {
    onTaskComplete(taskId);
  }, [onTaskComplete]);

  const handleTaskEdit = useCallback((task: Task) => {
    onTaskEdit(task);
  }, [onTaskEdit]);

  const handleTaskSchedule = useCallback((task: Task) => {
    onTaskSchedule(task);
  }, [onTaskSchedule]);

  if (!isFeatureEnabled('pinboardView')) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          Pinboard view is currently disabled. Enable 'pinboardView' flag to use this feature.
        </p>
      </div>
    );
  }

  if (sortedTasks.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-semibold mb-2">No unscheduled tasks</h3>
          <p className="text-muted-foreground">
            All your tasks are scheduled or completed. Create new tasks to see them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("p-4", className)}>
      <div 
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gridAutoRows: 'min-content',
        }}
      >
        {sortedTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onComplete={() => handleTaskComplete(task.id)}
            onEdit={() => handleTaskEdit(task)}
            onSchedule={() => handleTaskSchedule(task)}
          />
        ))}
      </div>
    </div>
  );
}