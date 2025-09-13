/**
 * Universal Bulletproof Task Card Component
 * 
 * A robust, unified task card that works across all views (Bubble, Atomic, List, Kanban, Matrix)
 * with comprehensive error handling, accessibility, and advanced features.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  onUpdate?: (task: Task) => void;
  onDelete?: (taskId: TaskId) => void;
  onSelect?: (taskId: TaskId) => void;
  onKeyboardMove?: (taskId: TaskId, direction: 'up' | 'down' | 'left' | 'right') => void;
  
  // View-specific handlers
  onEdit?: (taskId: TaskId) => void;
  onComplete?: (taskId: TaskId, completed: boolean) => void;
  onPriorityChange?: (taskId: TaskId, priority: number) => void;
  
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
      view: task?.view || {},
      metadata: task?.metadata
    };

    // Check for issues
    if (!task?.id) issues.push('Missing or invalid ID');
    if (!task?.title || typeof task.title !== 'string') issues.push('Missing or invalid title');
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
        updatedAt: Date.now()
      },
      issues: [`Critical error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

export function TaskCard({
  task: rawTask,
  viewConfig = { view: 'universal' },
  isSelected = false,
  isFocused = false,
  onUpdate,
  onDelete,
  onSelect,
  onKeyboardMove,
  onEdit,
  onComplete,
  onPriorityChange,
  position,
  className,
  style
}: TaskCardProps) {
  const { toast } = useToast();
  const [errorState, setErrorState] = useState<TaskCardErrorState>({ hasError: false });
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Task>>({});
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Validate and sanitize task data
  const { isValid, sanitized: task, issues } = validateTask(rawTask);
  
  useEffect(() => {
    if (!isValid && issues.length > 0) {
      console.warn('TaskCard validation issues:', issues);
      setErrorState({ hasError: true, corrupted: true });
    }
  }, [isValid, issues]);

  // Drag and drop setup (only if draggable)
  const sortable = useSortable({
    id: `task-${task.id}`,
    data: { type: 'task', task },
    disabled: !viewConfig.draggable
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  // Auto-save with debouncing
  const scheduleAutoSave = useCallback((updates: Partial<Task>) => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    const timer = setTimeout(() => {
      try {
        const updatedTask = { ...task, ...updates, updatedAt: Date.now() };
        onUpdate?.(updatedTask);
        
        // Add to undo stack
        crossViewUndoService.addEntry({
          view: viewConfig.view as any,
          type: 'edit',
          description: `Edit task: ${task.title}`,
          data: { before: task, after: updatedTask },
          compensationFn: async () => {
            onUpdate?.(task);
          }
        });
      } catch (error) {
        console.error('Auto-save failed:', error);
        toast({
          title: "Save Failed",
          description: "Failed to save changes. Please try again.",
          variant: "destructive"
        });
      }
    }, 1000);

    setAutoSaveTimer(timer);
  }, [task, onUpdate, autoSaveTimer, viewConfig.view, toast]);

  // Handle editing state
  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditData({ title: task.title, description: task.description });
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [task.title, task.description]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditData({});
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      setAutoSaveTimer(null);
    }
  }, [autoSaveTimer]);

  const saveEditing = useCallback(() => {
    try {
      const updates = {
        title: editData.title?.trim() || task.title,
        description: editData.description?.trim() || task.description
      };
      
      const updatedTask = { ...task, ...updates, updatedAt: Date.now() };
      onUpdate?.(updatedTask);
      
      setIsEditing(false);
      setEditData({});
      
      toast({
        title: "Task Updated",
        description: "Changes saved successfully."
      });
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save changes. Please try again.",
        variant: "destructive"
      });
    }
  }, [editData, task, onUpdate, toast]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing) {
      switch (e.key) {
        case 'Enter':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            saveEditing();
          }
          break;
        case 'Escape':
          e.preventDefault();
          cancelEditing();
          break;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        onKeyboardMove?.(task.id, 'up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        onKeyboardMove?.(task.id, 'down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onKeyboardMove?.(task.id, 'left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        onKeyboardMove?.(task.id, 'right');
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        onSelect?.(task.id);
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        startEditing();
        break;
      case 'Delete':
      case 'Backspace':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onDelete?.(task.id);
        }
        break;
    }
  }, [isEditing, task.id, onKeyboardMove, onSelect, startEditing, saveEditing, cancelEditing, onDelete]);

  // Handle completion toggle
  const handleCompletionToggle = useCallback((checked: boolean) => {
    try {
      onComplete?.(task.id, checked);
      const updatedTask = { ...task, completed: checked, updatedAt: Date.now() };
      onUpdate?.(updatedTask);
    } catch (error) {
      console.error('Failed to toggle completion:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update task completion.",
        variant: "destructive"
      });
    }
  }, [task, onComplete, onUpdate, toast]);

  // Calculate priority styling
  const priorityVariant = task.priority >= 75 ? 'destructive' : 
                         task.priority >= 50 ? 'default' : 
                         task.priority >= 25 ? 'secondary' : 'outline';

  // Format dates safely
  const formatDate = useCallback((timestamp?: number) => {
    if (!timestamp) return null;
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return '[Invalid Date]';
    }
  }, []);

  // Error state rendering
  if (errorState.hasError) {
    return (
      <Card className={cn('border-destructive', className)}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">
              {errorState.corrupted ? 'Corrupted task data detected' : 'Failed to load task'}
            </span>
          </div>
          {issues.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Issues: {issues.join(', ')}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const cardStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...style
  };

  return (
    <Card
      ref={setNodeRef}
      style={cardStyle}
      className={cn(
        'group relative transition-all duration-200',
        {
          'opacity-50': isDragging,
          'ring-2 ring-primary': isSelected,
          'ring-2 ring-accent': isFocused,
          'bg-primary/5': isSelected,
          'cursor-pointer': viewConfig.selectable
        },
        className
      )}
      tabIndex={0}
      role="button"
      aria-label={`Task: ${task.title}. ${isSelected ? 'Selected. ' : ''}Press arrow keys to move, Enter to select, E to edit.`}
      onKeyDown={handleKeyDown}
      onClick={() => viewConfig.selectable && onSelect?.(task.id)}
    >
      <CardContent className={cn('p-3', viewConfig.compact && 'p-2')}>
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          {viewConfig.showDragHandle && viewConfig.draggable && (
            <button
              {...attributes}
              {...listeners}
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation',
                'flex items-center justify-center w-6 h-6 rounded hover:bg-muted',
                'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary/50'
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
                onCheckedChange={handleCompletionToggle}
                className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                aria-label={`Mark task ${task.completed ? 'incomplete' : 'complete'}`}
              />
              
              {/* Title - Editable */}
              {isEditing ? (
                <div className="flex-1 flex items-center gap-1">
                  <Input
                    ref={titleInputRef}
                    value={editData.title || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
                    className="text-sm font-medium border-0 p-0 h-auto focus-visible:ring-0"
                    placeholder="Task title"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={saveEditing}
                    className="h-6 w-6 p-0"
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={cancelEditing}
                    className="h-6 w-6 p-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <h4 className={cn(
                  'text-sm font-medium truncate flex-1',
                  task.completed && 'line-through text-muted-foreground'
                )}>
                  {task.title}
                </h4>
              )}
            </div>

            {/* Description - Editable */}
            {(task.description || isEditing) && (
              <div className="mb-2">
                {isEditing ? (
                  <Textarea
                    ref={descriptionRef}
                    value={editData.description || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    className="text-xs min-h-[60px] resize-none border-0 p-0 focus-visible:ring-0"
                    placeholder="Add description..."
                  />
                ) : (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {task.description}
                  </p>
                )}
              </div>
            )}

            {/* Metadata */}
            {viewConfig.showMetadata !== false && (
              <div className="flex items-center gap-1 flex-wrap">
                {task.priority > 50 && (
                  <Badge variant={priorityVariant} className="text-xs gap-1">
                    <Flag className="w-2 h-2" />
                    {task.priority}
                  </Badge>
                )}

                {task.due && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Calendar className="w-2 h-2" />
                    {formatDate(task.due)}
                  </Badge>
                )}

                {task.tags.slice(0, 2).map(tag => (
                  <Badge 
                    key={tag.id} 
                    variant="secondary" 
                    className="text-xs"
                    style={{ backgroundColor: tag.colorHex ? `${tag.colorHex}20` : undefined }}
                  >
                    {tag.emoji && <span className="mr-1">{tag.emoji}</span>}
                    {tag.name}
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
          {viewConfig.showActions !== false && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
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
                <DropdownMenuItem onClick={startEditing} className="gap-2 text-xs">
                  <Edit3 className="w-3 h-3" />
                  Edit task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit?.(task.id)} className="gap-2 text-xs">
                  <Target className="w-3 h-3" />
                  Planning mode
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={() => onDelete(task.id)} 
                    className="gap-2 text-xs text-destructive focus:text-destructive"
                  >
                    <X className="w-3 h-3" />
                    Delete task
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Default configurations for different views
export const TaskCardConfigs = {
  universal: {
    view: 'universal' as const,
    draggable: false,
    selectable: true,
    showDragHandle: false,
    showActions: true,
    showMetadata: true
  },
  kanban: {
    view: 'kanban' as const,
    draggable: true,
    selectable: true,
    showDragHandle: true,
    showActions: true,
    showMetadata: true
  },
  list: {
    view: 'list' as const,
    draggable: false,
    selectable: true,
    showDragHandle: false,
    showActions: true,
    showMetadata: true,
    compact: false
  },
  matrix: {
    view: 'matrix' as const,
    draggable: true,
    selectable: true,
    showDragHandle: false,
    showActions: true,
    showMetadata: true,
    compact: true
  },
  atomic: {
    view: 'atomic' as const,
    draggable: true,
    selectable: true,
    showDragHandle: false,
    showActions: false,
    showMetadata: false,
    compact: true
  },
  bubble: {
    view: 'bubble' as const,
    draggable: true,
    selectable: true,
    showDragHandle: false,
    showActions: false,
    showMetadata: false,
    compact: true
  }
} as const;