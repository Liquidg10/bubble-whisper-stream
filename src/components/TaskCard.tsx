/**
 * Universal Bulletproof Task Card Component
 * 
 * A robust, unified task card that works across all views (Bubble, Atomic, List, Kanban, Matrix)
 * with comprehensive error handling, accessibility, and advanced features.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  GripVertical, 
  MoreHorizontal, 
  Calendar,
  Flag,
  Edit3,
  Check,
  X,
  AlertTriangle,
  Tag,
  Clock,
  Target
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { crossViewUndoService } from '@/services/crossViewUndoService';
import { IntelligentTaskIntegration } from '@/components/IntelligentTaskIntegration';
import type { Task, TaskId, TaskType } from '@/types/task';

// Error boundary for individual task cards
interface TaskCardErrorState {
  hasError: boolean;
  error?: Error;
  corrupted?: boolean;
}

// View-specific configuration
export interface TaskCardViewConfig {
  view: 'bubble' | 'atomic' | 'list' | 'kanban' | 'matrix' | 'universal';
  compact?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  inline?: boolean;
  showDragHandle?: boolean;
  showActions?: boolean;
  showMetadata?: boolean;
  className?: string;
}

export interface TaskCardProps {
  task: Task;
  viewConfig?: TaskCardViewConfig;
  
  // Selection and focus
  isSelected?: boolean;
  isFocused?: boolean;
  
  // Interaction handlers
  onUpdate?: (task: Task) => void | Promise<void>;
  onDelete?: (taskId: TaskId) => void;
  onSelect?: (taskId: TaskId) => void;
  onKeyboardMove?: (taskId: TaskId, direction: 'up' | 'down' | 'left' | 'right') => void;
  
  // View-specific handlers
  onEdit?: (taskId: TaskId) => void;
  onComplete?: (taskId: TaskId, completed: boolean) => void | Promise<void>;
  onPriorityChange?: (taskId: TaskId, priority: number) => void;
  onOpenDetail?: (task: Task) => void;
  
  // Layout props
  position?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Validates and sanitizes task data to prevent crashes from corrupted data
 */
export function validateTask(task: Task): { isValid: boolean; sanitized: Task; issues: string[] } {
  const issues: string[] = [];
  
  try {
    const sanitized: Task = {
      // Preserve canonical fields that this defensive validator does not need
      // to transform (readiness, energy fit, urgency, domain links, metadata,
      // and view-specific extensions). Completion updates must never collapse
      // a task back to the older, smaller card shape.
      ...task,
      id: task?.id || `corrupted-${Date.now()}`,
      type: task?.type || 'task',
      title: typeof task?.title === 'string' ? task.title : '[Corrupted Title]',
      description: typeof task?.description === 'string' ? task.description : undefined,
      completed: Boolean(task?.completed),
      priority: typeof task?.priority === 'number' && task.priority >= 0 && task.priority <= 100 
        ? task.priority 
        : 50,
      tags: Array.isArray(task?.tags) ? task.tags.filter(tag => 
        tag && typeof tag.id === 'string' && typeof tag.name === 'string'
      ) : [],
      createdAt: typeof task?.createdAt === 'number' ? task.createdAt : Date.now(),
      updatedAt: typeof task?.updatedAt === 'number' ? task.updatedAt : Date.now(),
      due: typeof task?.due === 'number' ? task.due : undefined,
      start: typeof task?.start === 'number' ? task.start : undefined,
      end: typeof task?.end === 'number' ? task.end : undefined,
      view: task?.view || {}
    };

    // Check for corruption indicators
    if (!task?.id) issues.push('Missing task ID');
    if (typeof task?.title !== 'string') issues.push('Invalid title');
    if (task?.priority !== undefined && (typeof task.priority !== 'number' || task.priority < 0 || task.priority > 100)) {
      issues.push('Invalid priority value');
    }
    if (task?.tags && !Array.isArray(task.tags)) issues.push('Invalid tags format');

    return {
      isValid: issues.length === 0,
      sanitized,
      issues
    };
  } catch (error) {
    return {
      isValid: false,
      sanitized: {
        id: `error-${Date.now()}`,
        type: 'task',
        title: '[Error Loading Task]',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        view: {}
      },
      issues: [`Critical error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Predefined view configurations for different contexts
 */
export const TaskCardConfigs: Record<string, TaskCardViewConfig> = {
  bubble: {
    view: 'bubble',
    compact: true,
    draggable: false,
    selectable: true,
    showDragHandle: false,
    showActions: false,
    showMetadata: false
  },
  atomic: {
    view: 'atomic',
    compact: true,
    draggable: false,
    selectable: true,
    showDragHandle: false,
    showActions: false,
    showMetadata: false
  },
  list: {
    view: 'list',
    compact: false,
    draggable: false,
    selectable: true,
    showDragHandle: false,
    showActions: true,
    showMetadata: true
  },
  kanban: {
    view: 'kanban',
    compact: false,
    draggable: true,
    selectable: true,
    showDragHandle: true,
    showActions: true,
    showMetadata: true
  },
  matrix: {
    view: 'matrix',
    compact: false,
    draggable: false,
    selectable: true,
    showDragHandle: false,
    showActions: true,
    showMetadata: true,
    className: 'bg-matrix-card-bg border-matrix-card-border text-text-primary'
  },
  universal: {
    view: 'universal',
    compact: false,
    draggable: true,
    selectable: true,
    showDragHandle: true,
    showActions: true,
    showMetadata: true
  }
};

/**
 * Universal Bulletproof Task Card Component
 */
export function TaskCard({ 
  task: rawTask, 
  viewConfig = TaskCardConfigs.universal,
  isSelected = false,
  isFocused = false,
  onUpdate,
  onDelete,
  onSelect,
  onKeyboardMove,
  onEdit,
  onComplete,
  onPriorityChange,
  onOpenDetail,
  position = 0,
  className,
  style
}: TaskCardProps) {
  const { toast } = useToast();
  
  // Validate and sanitize task data.
  // MUST be memoized: validateTask() builds a fresh `sanitized` object and
  // `issues` array on every call. Left unmemoized, the effect below (which
  // depends on `issues` by reference) re-fires on every render for any
  // invalid task, calls setErrorState(), triggers a re-render, gets a new
  // `issues` array, and fires again -- an infinite render loop that hangs
  // the browser tab (and, in tests, the whole vitest worker) for any
  // task with validation issues. Found via TaskCard.test.tsx's
  // 'Error Handling & Validation' block hanging indefinitely.
  const { isValid, sanitized: task, issues } = useMemo(() => validateTask(rawTask), [rawTask]);
  
  // Error state management
  const [errorState, setErrorState] = useState<TaskCardErrorState>({ hasError: false });
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || '');
  
  // Auto-save state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isCompletionSaving, setIsCompletionSaving] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const updateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestTaskRef = useRef(task);

  const enqueueUpdate = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = updateQueueRef.current.then(operation, operation);
    updateQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  useEffect(() => {
    latestTaskRef.current = task;
  }, [task]);
  
  // Refs for focus management
  const cardRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  // Drag and drop setup (conditional)
  const sortableProps = viewConfig.draggable ? useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', task }
  }) : null;
  
  const dragStyle = sortableProps ? {
    transform: CSS.Transform.toString(sortableProps.transform),
    transition: sortableProps.transition,
  } : {};

  // Show validation warnings for corrupted data
  useEffect(() => {
    if (!isValid && issues.length > 0) {
      toast({
        title: "Task Data Issues",
        description: `Problems detected: ${issues.join(', ')}`,
        variant: "destructive",
        duration: 5000
      });
      setErrorState({ hasError: true, corrupted: true });
    }
  }, [isValid, issues, toast]);

  // Auto-save mechanism with debouncing
  const debouncedSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(async () => {
      autoSaveTimeoutRef.current = undefined;
      if (editTitle !== task.title || editDescription !== (task.description || '')) {
        try {
          const updatedTask = await enqueueUpdate(async () => {
            const nextTask: Task = {
              ...latestTaskRef.current,
              title: editTitle.trim() || '[Untitled]',
              description: editDescription.trim() || undefined,
              updatedAt: Date.now()
            };
            await onUpdate?.(nextTask);
            latestTaskRef.current = nextTask;
            return nextTask;
          });
          setHasUnsavedChanges(false);
          
          // Add to undo stack (if service available) - but only for actual changes
          try {
            if (crossViewUndoService && typeof crossViewUndoService.addEntry === 'function') {
              crossViewUndoService.addEntry({
                view: 'bubble',
                type: 'edit',
                data: { task: updatedTask },
                description: `Updated task: ${task.title}`
              });
            }
          } catch (error) {
            console.warn('Undo service not available:', error);
          }
          
        } catch (error) {
          console.error('Auto-save failed:', error);
          toast({
            title: "Save Failed",
            description: "Failed to save changes automatically",
            variant: "destructive"
          });
        }
      }
    }, 1000); // 1 second debounce
  }, [editTitle, editDescription, task, onUpdate, toast, enqueueUpdate]);

  // Trigger auto-save when content changes
  useEffect(() => {
    if (editTitle !== task.title || editDescription !== task.description) {
      setHasUnsavedChanges(true);
      debouncedSave();
    }
  }, [editTitle, editDescription, debouncedSave, task.title, task.description]);

  // Focus management
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.focus();
    }
  }, [isFocused]);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  // Cleanup auto-save timeout
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Event handlers
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    try {
      if (isCompletionSaving) return;
      if (isEditing) {
        switch (e.key) {
          case 'Enter':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setIsEditing(false);
            }
            break;
          case 'Escape':
            e.preventDefault();
            setEditTitle(task.title);
            setEditDescription(task.description || '');
            setIsEditing(false);
            setHasUnsavedChanges(false);
            break;
        }
      } else {
        switch (e.key) {
          case 'Enter':
          case ' ':
            e.preventDefault();
            onSelect?.(task.id);
            break;
          case 'e':
          case 'E':
            e.preventDefault();
            setIsEditing(true);
            break;
          case 'Delete':
          case 'Backspace':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              handleDelete();
            }
            break;
          case 'ArrowUp':
          case 'ArrowDown':
          case 'ArrowLeft':
          case 'ArrowRight':
            if (onKeyboardMove) {
              e.preventDefault();
              const direction = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
              onKeyboardMove(task.id, direction);
            }
            break;
        }
      }
    } catch (error) {
      console.error('Keyboard event error:', error);
      setErrorState({ hasError: true, error: error as Error });
    }
  }, [isCompletionSaving, isEditing, task.id, task.title, task.description, onSelect, onKeyboardMove]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    try {
      if (!isEditing) {
        onSelect?.(task.id);
      }
    } catch (error) {
      console.error('Click event error:', error);
      setErrorState({ hasError: true, error: error as Error });
    }
  }, [isEditing, onSelect, task.id]);

  const handleComplete = useCallback(async () => {
    if (isCompletionSaving) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = undefined;
    }

    const hasPendingEdits = editTitle !== task.title || editDescription !== (task.description || '');
    setIsCompletionSaving(true);
    try {
      // Any already-running title/description save completes first. The combined
      // task snapshot then wins, so neither the edit nor completion can revert
      // the other when persistence is slow.
      const targetCompleted = !task.completed;
      const updatedTask = await enqueueUpdate(async () => {
        const nextTask: Task = {
          ...latestTaskRef.current,
          ...(hasPendingEdits ? {
            title: editTitle.trim() || '[Untitled]',
            description: editDescription.trim() || undefined,
          } : {}),
          completed: targetCompleted,
          updatedAt: Date.now()
        };
        await onUpdate?.(nextTask);
        await onComplete?.(task.id, targetCompleted);
        latestTaskRef.current = nextTask;
        return nextTask;
      });
      setHasUnsavedChanges(false);
      
      // Add to undo stack (if service available) - only for completion state changes
      try {
        if (crossViewUndoService && typeof crossViewUndoService.addEntry === 'function' && task.completed !== updatedTask.completed) {
          crossViewUndoService.addEntry({
            view: 'bubble',
            type: 'edit',
            data: { task: updatedTask },
            description: `${updatedTask.completed ? 'Completed' : 'Uncompleted'} task: ${task.title}`
          });
        }
      } catch (error) {
        console.warn('Undo service not available:', error);
      }
      
    } catch (error) {
      console.error('Complete task error:', error);
      toast({
        title: "Completion not saved",
        description: "Your task is unchanged. Please try again.",
        variant: "destructive"
      });
      if (hasPendingEdits) {
        setHasUnsavedChanges(true);
        debouncedSave();
      }
    } finally {
      setIsCompletionSaving(false);
    }
  }, [isCompletionSaving, editTitle, editDescription, task, onUpdate, onComplete, toast, enqueueUpdate, debouncedSave]);

  const handleDelete = useCallback(() => {
    try {
      onDelete?.(task.id);
      
      // Add to undo stack (if service available)
      try {
        if (crossViewUndoService && typeof crossViewUndoService.addEntry === 'function') {
          crossViewUndoService.addEntry({
            view: 'bubble',
            type: 'delete',
            data: { task },
            description: `Deleted task: ${task.title}`
          });
        }
      } catch (error) {
        console.warn('Undo service not available:', error);
      }
      
      toast({
        title: "Task Deleted",
        description: "Task has been moved to trash",
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              try {
                if (crossViewUndoService && typeof crossViewUndoService.undo === 'function') {
                  crossViewUndoService.undo();
                }
              } catch (error) {
                console.warn('Undo service not available:', error);
              }
            }}
          >
            Undo
          </Button>
        )
      });
      
    } catch (error) {
      console.error('Delete task error:', error);
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive"
      });
    }
  }, [task, onDelete, toast]);

  const handlePriorityChange = useCallback(async (newPriority: number) => {
    if (isCompletionSaving) return;

    try {
      await enqueueUpdate(async () => {
        const updatedTask: Task = {
          ...latestTaskRef.current,
          priority: Math.max(0, Math.min(100, newPriority)),
          updatedAt: Date.now()
        };
        await onUpdate?.(updatedTask);
        onPriorityChange?.(task.id, newPriority);
        latestTaskRef.current = updatedTask;
      });
      
    } catch (error) {
      console.error('Priority change error:', error);
      toast({
        title: "Error",
        description: "Failed to update task priority",
        variant: "destructive"
      });
    }
  }, [isCompletionSaving, task, onUpdate, onPriorityChange, toast, enqueueUpdate]);

  const handleIntelligentTaskUpdate = useCallback(async (updatedTask: Task) => {
    if (isCompletionSaving) return;

    try {
      await enqueueUpdate(async () => {
        const currentTask = latestTaskRef.current;
        const nextTask: Task = {
          ...currentTask,
          ...updatedTask,
          // Intelligence actions do not own completion or priority. Preserve
          // the latest values written by the card coordinator.
          completed: currentTask.completed,
          priority: currentTask.priority,
          updatedAt: Date.now(),
        };
        await onUpdate?.(nextTask);
        latestTaskRef.current = nextTask;
      });
    } catch (error) {
      console.error('Intelligent task update error:', error);
      toast({
        title: "Update not saved",
        description: "Your task is unchanged. Please try again.",
        variant: "destructive"
      });
    }
  }, [isCompletionSaving, onUpdate, toast, enqueueUpdate]);

  // Render error state
  if (errorState.hasError && !errorState.corrupted) {
    return (
      <Card className={cn("border-destructive bg-destructive/5", className)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Task Error</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {errorState.error?.message || 'An error occurred while rendering this task'}
          </p>
          <Button 
            size="sm" 
            variant="outline" 
            className="mt-2"
            onClick={() => setErrorState({ hasError: false })}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Get priority styling
  const getPriorityColor = () => {
    if (task.priority >= 75) return 'destructive';
    if (task.priority >= 50) return 'default';
    if (task.priority >= 25) return 'secondary';
    return 'outline';
  };

  const getPriorityIcon = () => {
    if (task.priority >= 75) return '🔥';
    if (task.priority >= 50) return '⚡';
    if (task.priority >= 25) return '📌';
    return '💭';
  };

  // Compact rendering for bubble/atomic views
  if (viewConfig.compact) {
    return (
      <div
        ref={cardRef}
        className={cn(
          "relative transition-all duration-200 cursor-pointer rounded-lg",
          "border border-border bg-card hover:bg-accent/50",
          isSelected && "ring-2 ring-primary bg-primary/5",
          isFocused && "ring-2 ring-ring",
          task.completed && "opacity-60",
          className
        )}
        style={{ ...style, ...dragStyle }}
        onClick={handleClick}
        onDoubleClick={() => {
          if (!isCompletionSaving) onOpenDetail?.(task);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Task: ${task.title}`}
        aria-busy={isCompletionSaving}
      >
        <div className="flex items-center gap-1 p-2">
          <Checkbox 
            checked={task.completed} 
            disabled={isCompletionSaving}
            onCheckedChange={handleComplete}
            className="flex-shrink-0"
          />
          <span className={cn(
            "text-xs font-medium truncate flex-1",
            task.completed && "line-through text-muted-foreground"
          )}>
            {task.title}
          </span>
          {task.priority > 50 && (
            <span className="text-xs">{getPriorityIcon()}</span>
          )}
        </div>
        
        {/* Corruption indicator */}
        {errorState.corrupted && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-pulse" />
        )}
      </div>
    );
  }

  // Full rendering for list/kanban/matrix views
  return (
    <Card
      ref={sortableProps?.setNodeRef}
      className={cn(
        'group relative transition-all duration-200 cursor-pointer',
        'hover:shadow-md focus-within:ring-2 focus-within:ring-ring/50',
        isSelected && 'ring-2 ring-primary bg-primary/5',
        isFocused && 'ring-2 ring-ring',
        task.completed && 'opacity-75',
        errorState.corrupted && 'border-destructive bg-destructive/5',
        sortableProps?.isDragging && 'opacity-50',
        // Matrix view gets dark background for better text contrast
        viewConfig.view === 'matrix' && 'bg-matrix-card-bg border-matrix-card-border text-text-primary',
        viewConfig.className,
        className
      )}
      style={{ ...style, ...dragStyle }}
      tabIndex={0}
      role="button"
      aria-label={`Task: ${task.title}. Press Enter to select, E to edit.`}
      aria-busy={isCompletionSaving}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onDoubleClick={() => {
        if (!isCompletionSaving) onOpenDetail?.(task);
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          {viewConfig.showDragHandle && (
            <button
              {...(isCompletionSaving ? {} : sortableProps?.attributes)}
              {...(isCompletionSaving ? {} : sortableProps?.listeners)}
              disabled={isCompletionSaving}
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation',
                'flex items-center justify-center w-6 h-6 rounded hover:bg-muted',
                'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/50'
              )}
              aria-label="Drag to reorder task"
              style={{ minWidth: '24px', minHeight: '24px' }}
            >
              <GripVertical className="w-3 h-3" />
            </button>
          )}

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                checked={task.completed}
                disabled={isCompletionSaving}
                onCheckedChange={handleComplete}
                className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                aria-label={`Mark task ${task.completed ? 'incomplete' : 'complete'}`}
              />
              
              {isEditing ? (
                <Input
                  ref={titleInputRef}
                  value={editTitle}
                  disabled={isCompletionSaving}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-sm font-medium"
                  placeholder="Task title..."
                  onBlur={() => setIsEditing(false)}
                />
              ) : (
                <h4 className={cn(
                  'text-sm font-medium truncate flex-1',
                  task.completed && 'line-through text-muted-foreground'
                )}>
                  {task.title}
                </h4>
              )}
            </div>

            {/* Description */}
            {(task.description || isEditing) && viewConfig.showMetadata && (
              <div className="mb-2">
                {isEditing ? (
                  <Textarea
                    value={editDescription}
                    disabled={isCompletionSaving}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="text-xs resize-none"
                    placeholder="Task description..."
                    rows={2}
                  />
                ) : task.description ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {task.description}
                  </p>
                ) : null}
              </div>
            )}

            {/* Metadata */}
            {viewConfig.showMetadata && (
              <div className="flex items-center gap-1 flex-wrap">
                {task.priority > 50 && (
                  <Badge variant={getPriorityColor()} className="text-xs gap-1">
                    <Flag className="w-2 h-2" />
                    {task.priority}
                  </Badge>
                )}

                {task.due && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Calendar className="w-2 h-2" />
                    {new Date(task.due).toLocaleDateString()}
                  </Badge>
                )}

                {task.tags.slice(0, 2).map(tag => (
                  <Badge 
                    key={tag.id} 
                    variant="secondary" 
                    className="text-xs"
                    style={{ backgroundColor: tag.colorHex ? `${tag.colorHex}20` : undefined }}
                  >
                    {tag.emoji} {tag.name}
                  </Badge>
                ))}

                {task.tags.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{task.tags.length - 2}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Actions Menu */}
          {viewConfig.showActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isCompletionSaving}
                  className={cn(
                    'h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity',
                    'focus:opacity-100'
                  )}
                  aria-label="Task options"
                  style={{ minWidth: '24px', minHeight: '24px' }}
                >
                  <MoreHorizontal className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem 
                  className="gap-2 text-xs"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="w-3 h-3" />
                  Edit task
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="gap-2 text-xs"
                  onClick={() => handlePriorityChange(Math.min(100, task.priority + 25))}
                >
                  <Flag className="w-3 h-3" />
                  Increase priority
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="gap-2 text-xs text-destructive"
                  onClick={handleDelete}
                >
                  <X className="w-3 h-3" />
                  Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Auto-save indicator */}
        {hasUnsavedChanges && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full animate-pulse" />
        )}

        {/* Corruption indicator */}
        {errorState.corrupted && (
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-destructive rounded-full animate-pulse" />
        )}

        {/* Intelligent Task Integration */}
        {!viewConfig.compact && (
          <fieldset
            disabled={isCompletionSaving}
            className="mt-3 border-0 border-t border-border/50 p-0 pt-3"
          >
            <IntelligentTaskIntegration 
              task={task}
              onTaskUpdate={handleIntelligentTaskUpdate}
              compact={viewConfig.compact}
            />
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}

export default TaskCard;
