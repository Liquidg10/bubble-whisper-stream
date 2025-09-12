/**
 * Kanban Task Card Component
 * Individual task card with drag-and-drop and keyboard support
 */

import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  GripVertical, 
  MoreHorizontal, 
  Calendar,
  Flag,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Edit
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Task, TaskId } from '@/types/task';

interface KanbanTaskCardProps {
  task: Task;
  isSelected: boolean;
  onKeyboardMove: (taskId: TaskId, direction: 'up' | 'down' | 'left' | 'right') => void;
  onSelect: (taskId: TaskId) => void;
  position: number;
}

export function KanbanTaskCard({ 
  task, 
  isSelected,
  onKeyboardMove, 
  onSelect,
  position 
}: KanbanTaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: `task-${task.id}`,
    data: {
      type: 'task',
      task
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle keyboard navigation as alternative to drag
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        onKeyboardMove(task.id, 'up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        onKeyboardMove(task.id, 'down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onKeyboardMove(task.id, 'left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        onKeyboardMove(task.id, 'right');
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        onSelect(task.id);
        break;
      case 'e':
      case 'E':
        if (!isEditing) {
          e.preventDefault();
          setIsEditing(true);
        }
        break;
      case 'Escape':
        if (isEditing) {
          e.preventDefault();
          setIsEditing(false);
        }
        break;
    }
  };

  const priorityColor = task.priority >= 75 ? 'destructive' : 
                       task.priority >= 50 ? 'default' : 
                       task.priority >= 25 ? 'secondary' : 'outline';

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative transition-all duration-200 cursor-pointer',
        'hover:shadow-md focus-within:ring-2 focus-within:ring-accent-flow/50',
        {
          'opacity-50': isDragging,
          'ring-2 ring-accent-flow': isSelected,
          'bg-accent-flow/5': isSelected
        }
      )}
      tabIndex={0}
      role="button"
      aria-label={`Task: ${task.title}. Press arrow keys to move, Enter to select, E to edit.`}
      onKeyDown={handleKeyDown}
      onClick={() => onSelect(task.id)}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className={cn(
              'opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation',
              'flex items-center justify-center w-6 h-6 rounded hover:bg-muted',
              'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent-flow/50'
            )}
            aria-label="Drag to reorder task"
            style={{ minWidth: '24px', minHeight: '24px' }} // Ensure 24x24 minimum
          >
            <GripVertical className="w-3 h-3" />
          </button>

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                checked={task.completed}
                className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                aria-label={`Mark task ${task.completed ? 'incomplete' : 'complete'}`}
              />
              <h4 className={cn(
                'text-sm font-medium truncate',
                task.completed && 'line-through text-muted-foreground'
              )}>
                {task.title}
              </h4>
            </div>

            {task.description && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-1 flex-wrap">
              {task.priority > 50 && (
                <Badge variant={priorityColor} className="text-xs gap-1">
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
          </div>

          {/* Actions Menu */}
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
                style={{ minWidth: '24px', minHeight: '24px' }} // Ensure 24x24 minimum
              >
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="gap-2 text-xs">
                <Edit className="w-3 h-3" />
                Edit task
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs">
                <ArrowUp className="w-3 h-3" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs">
                <ArrowDown className="w-3 h-3" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs">
                <ChevronLeft className="w-3 h-3" />
                Move left
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs">
                <ChevronRight className="w-3 h-3" />
                Move right
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}