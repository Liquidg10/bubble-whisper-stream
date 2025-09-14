/**
 * Masonry/Pinboard View - Floating card visualization for unscheduled tasks
 * 
 * Displays unscheduled tasks as draggable cards sized by priority/urgency
 * with keyboard alternatives and crisis mode support.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  GripVertical, 
  Edit2, 
  Calendar, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  Check,
  MoreHorizontal 
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Task, TaskId } from '@/types/task';
import { createViewContext, createViewData, type ViewSDK } from '@/views/sdk';
import { useTaskStore } from '@/stores/taskStore';
import { useBubbleStore } from '@/stores/bubbleStore';
import { classifyDomain, getDomainEmoji, type Domain } from '@/lib/classifyDomain';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MasonryCardProps {
  task: Task;
  size: number;
  onMove: (id: TaskId, direction: 'left' | 'right' | 'up' | 'down') => void;
  onEdit: (task: Task) => void;
  onSchedule: (task: Task) => void;
  onComplete: (id: TaskId) => void;
  className?: string;
}

function MasonryCard({ task, size, onMove, onEdit, onSchedule, onComplete, className }: MasonryCardProps) {
  // Convert Task to a minimal Bubble-like shape for domain classification
  const bubbleLike = {
    id: task.id,
    content: task.title,
    tags: task.tags
  };
  const domain = classifyDomain(bubbleLike as any);
  const domainEmoji = getDomainEmoji(domain);
  const { settings } = useBubbleStore();
  const { toast } = useToast();
  
  // Size mapping: 1-4 based on priority and urgency
  const cardSizeClass = {
    1: 'w-48 h-32',
    2: 'w-56 h-36', 
    3: 'w-64 h-40',
    4: 'w-72 h-44'
  }[Math.min(4, Math.max(1, Math.round(size)))] || 'w-56 h-36';

  const isReducedMotion = settings.reducedMotion;
  const isHighContrast = settings.highContrast;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onMove(task.id, 'left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onMove(task.id, 'right');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onMove(task.id, 'up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onMove(task.id, 'down');
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit(task);
    }
  };

  const formatDueDate = (timestamp?: number) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const isToday = date.toDateString() === new Date().toDateString();
    const isTomorrow = date.toDateString() === new Date(Date.now() + 86400000).toDateString();
    
    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    return date.toLocaleDateString();
  };

  const dueLabel = formatDueDate(task.due);
  const isOverdue = task.due && task.due < Date.now();

  return (
    <Card 
      className={cn(
        cardSizeClass,
        'relative cursor-pointer border-2 select-none',
        'hover:shadow-lg focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2',
        isReducedMotion ? '' : 'transition-all duration-200 hover:scale-[1.02]',
        isHighContrast ? 'border-foreground' : 'border-border',
        className
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="button"
      aria-label={`Task: ${task.title}. Priority ${task.priority}%. ${dueLabel ? `Due ${dueLabel}` : 'No due date'}. Use arrow keys to move, Enter to edit.`}
    >
      {/* Drag Handle */}
      <div className="absolute top-2 left-2 opacity-50 hover:opacity-100">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Priority Indicator */}
      <div className="absolute top-2 right-2">
        <Badge variant={task.priority > 75 ? 'destructive' : task.priority > 50 ? 'secondary' : 'outline'}>
          {task.priority}%
        </Badge>
      </div>

      <CardHeader className="pb-2 pt-8">
        <div className="flex items-start gap-2">
          {domainEmoji && <span className="text-lg">{domainEmoji}</span>}
          <h3 className="font-medium text-sm leading-tight line-clamp-2">{task.title}</h3>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-4 space-y-3">
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {/* Due Date & Time Info */}
        {dueLabel && (
          <div className={cn(
            'flex items-center gap-1 text-xs',
            isOverdue ? 'text-destructive' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3" />
            {dueLabel}
          </div>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.tags.slice(0, 2).map(tag => (
              <Badge key={tag.id} variant="outline" className="text-xs px-1 py-0">
                {tag.emoji} {tag.name}
              </Badge>
            ))}
            {task.tags.length > 2 && (
              <Badge variant="outline" className="text-xs px-1 py-0">
                +{task.tags.length - 2}
              </Badge>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1">
            {/* Keyboard Movement Hints */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(task.id, 'left');
                    }}
                    aria-label="Move left"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Move left (or press ←)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(task.id, 'right');
                    }}
                    aria-label="Move right"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Move right (or press →)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onComplete(task.id);
              }}
              aria-label="Mark complete"
            >
              <Check className="h-3 w-3" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem onClick={() => onEdit(task)}>
                  <Edit2 className="h-3 w-3 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSchedule(task)}>
                  <Calendar className="h-3 w-3 mr-2" />
                  Schedule
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MasonryViewProps {
  viewId?: string;
  className?: string;
}

export default function MasonryView({ viewId = 'masonry-main', className }: MasonryViewProps) {
  const { tasks, updateTask } = useTaskStore();
  const { toast } = useToast();
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);

  // Filter unscheduled tasks (no calendar.startTime or future due date)
  const unscheduledTasks = useMemo(() => {
    return tasks.filter(task => 
      !task.completed && 
      (!task.view?.calendar?.startTime || !task.due || task.due > Date.now())
    );
  }, [tasks]);

  // Calculate card size based on priority and due proximity
  const getCardSize = useCallback((task: Task): number => {
    let size = 1 + (task.priority / 100) * 3; // Base 1-4 from priority
    
    // Boost size if due soon
    if (task.due) {
      const hoursUntilDue = (task.due - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDue < 24 && hoursUntilDue > 0) {
        size += 0.5; // Boost for tasks due within 24 hours
      }
    }
    
    return Math.min(4, Math.max(1, Math.round(size)));
  }, []);

  // Sort tasks by priority (descending) and due date (ascending)
  const sortedTasks = useMemo(() => {
    return [...unscheduledTasks].sort((a, b) => {
      // Primary sort: priority (higher first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Secondary sort: due date (sooner first)
      if (a.due && b.due) {
        return a.due - b.due;
      }
      if (a.due) return -1;
      if (b.due) return 1;
      
      // Tertiary sort: created date (newer first)
      return b.createdAt - a.createdAt;
    });
  }, [unscheduledTasks]);

  const handleCardMove = useCallback((taskId: TaskId, direction: 'left' | 'right' | 'up' | 'down') => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Calculate new position based on direction
    const currentPos = task.view?.pinboard || {};
    const moveDistance = 100; // pixels
    
    let newX = currentPos.x || 0;
    let newY = currentPos.y || 0;
    
    switch (direction) {
      case 'left':
        newX = Math.max(0, newX - moveDistance);
        break;
      case 'right':
        newX = newX + moveDistance;
        break;
      case 'up':
        newY = Math.max(0, newY - moveDistance);
        break;
      case 'down':
        newY = newY + moveDistance;
        break;
    }

    const updatedTask: Task = {
      ...task,
      view: {
        ...task.view,
        pinboard: {
          ...currentPos,
          x: newX,
          y: newY,
          lastMoved: Date.now()
        }
      },
      updatedAt: Date.now()
    };

    updateTask(task.id, updatedTask);
    
    toast({
      title: "Card moved",
      description: `Moved "${task.title}" ${direction}`,
    });
  }, [tasks, updateTask, toast]);

  const handleEdit = useCallback((task: Task) => {
    setSelectedTaskId(task.id);
    toast({
      title: "Edit task",
      description: `Editing "${task.title}"`,
    });
  }, [toast]);

  const handleSchedule = useCallback((task: Task) => {
    // Move to calendar - this would integrate with calendar view
    toast({
      title: "Schedule task",
      description: `Schedule "${task.title}" in calendar`,
    });
  }, [toast]);

  const handleComplete = useCallback((taskId: TaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTask: Task = {
      ...task,
      completed: true,
      updatedAt: Date.now()
    };

    updateTask(task.id, updatedTask);
    
    toast({
      title: "Task completed",
      description: `Completed "${task.title}"`,
    });
  }, [tasks, updateTask, toast]);

  if (sortedTasks.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-96 text-center', className)}>
        <div className="space-y-4">
          <div className="text-4xl">📌</div>
          <div>
            <h3 className="font-medium text-lg">No unscheduled tasks</h3>
            <p className="text-muted-foreground text-sm">
              Tasks will appear here when they need scheduling or organization
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-6 space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Task Pinboard</h2>
          <p className="text-muted-foreground">
            {sortedTasks.length} unscheduled tasks • Sized by priority and urgency
          </p>
        </div>
      </div>

      {/* Masonry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min">
        {sortedTasks.map(task => (
          <MasonryCard
            key={task.id}
            task={task}
            size={getCardSize(task)}
            onMove={handleCardMove}
            onEdit={handleEdit}
            onSchedule={handleSchedule}
            onComplete={handleComplete}
            className={selectedTaskId === task.id ? 'ring-2 ring-primary' : ''}
          />
        ))}
      </div>

      {/* Keyboard Navigation Hint */}
      <div className="text-xs text-muted-foreground text-center">
        Use arrow keys to move cards • Enter to edit • Tab to navigate
      </div>
    </div>
  );
}