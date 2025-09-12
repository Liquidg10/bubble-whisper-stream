import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskId, updateTask } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Trash2, Calendar, Clock, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface TaskListItemProps {
  task: Task;
  isSelected: boolean;
  isFocused: boolean;
  onUpdate: (task: Task) => void;
  onDelete: (id: TaskId) => void;
  onToggleSelect: (id: TaskId) => void;
  onFocus: (id: TaskId) => void;
  onKeyDown: (e: React.KeyboardEvent, taskId: TaskId) => void;
  className?: string;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({
  task,
  isSelected,
  isFocused,
  onUpdate,
  onDelete,
  onToggleSelect,
  onFocus,
  onKeyDown,
  className
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Focus item when marked as focused
  useEffect(() => {
    if (isFocused && itemRef.current && !isEditing) {
      itemRef.current.focus();
    }
  }, [isFocused, isEditing]);

  const handleComplete = () => {
    onUpdate(updateTask(task, { completed: !task.completed }));
  };

  const handleStartEdit = () => {
    setEditTitle(task.title);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editTitle.trim() !== task.title) {
      onUpdate(updateTask(task, { title: editTitle.trim() }));
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(task.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit();
      }
      return;
    }

    // Pass through to parent for navigation
    onKeyDown(e, task.id);

    // Handle item-specific shortcuts
    switch (e.key) {
      case ' ':
        e.preventDefault();
        handleComplete();
        break;
      case 'e':
      case 'E':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleStartEdit();
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (e.shiftKey) {
          e.preventDefault();
          onDelete(task.id);
        }
        break;
      case 'Enter':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onToggleSelect(task.id);
        } else {
          e.preventDefault();
          handleStartEdit();
        }
        break;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onToggleSelect(task.id);
    } else {
      onFocus(task.id);
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return 'text-danger-soft';
    if (priority >= 60) return 'text-warning-glow';
    if (priority >= 40) return 'text-accent-flow';
    return 'text-text-secondary';
  };

  const getPriorityIcon = (priority: number) => {
    if (priority >= 80) return '🔥';
    if (priority >= 60) return '⚡';
    if (priority >= 40) return '💫';
    return '';
  };

  return (
    <motion.div
      ref={itemRef}
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        // Base styles
        'group flex items-center gap-3 p-3 rounded-lg border transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-accent-flow focus:ring-offset-2',
        'hover:shadow-md hover:border-accent-flow/30',
        
        // Conditional styles
        {
          'bg-card border-border': !isSelected && !isFocused,
          'bg-accent-void/10 border-accent-void/50': isSelected,
          'bg-accent-flow/5 border-accent-flow/50': isFocused && !isSelected,
          'opacity-60': task.completed,
        },
        className
      )}
      tabIndex={isFocused ? 0 : -1}
      role="listitem"
      aria-selected={isSelected}
      aria-label={`Task: ${task.title}. ${task.completed ? 'Completed' : 'Pending'}. Priority ${task.priority}. ${task.tags.length > 0 ? `Tags: ${task.tags.map(t => t.name).join(', ')}` : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Completion Checkbox */}
      <div className="flex-shrink-0">
        <Checkbox
          checked={task.completed}
          onCheckedChange={handleComplete}
          className="w-5 h-5"
          aria-label={`Mark task ${task.completed ? 'incomplete' : 'complete'}`}
        />
      </div>

      {/* Priority Indicator */}
      {task.priority > 50 && (
        <div className="flex-shrink-0 text-sm" aria-label={`Priority ${task.priority}`}>
          <span className={getPriorityColor(task.priority)}>
            {getPriorityIcon(task.priority)}
          </span>
        </div>
      )}

      {/* Task Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveEdit}
            className="h-8 text-sm bg-background"
            placeholder="Task title..."
            aria-label="Edit task title"
          />
        ) : (
          <div className="space-y-1">
            <div className={cn(
              'text-sm font-medium truncate',
              task.completed && 'line-through text-muted-foreground'
            )}>
              {task.title}
            </div>
            
            {/* Task metadata */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {task.due && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(task.due).toLocaleDateString()}</span>
                </div>
              )}
              
              {task.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  {task.tags.slice(0, 3).map(tag => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className="text-xs px-1 py-0"
                      style={{ backgroundColor: tag.colorHex }}
                    >
                      {tag.emoji} {tag.name}
                    </Badge>
                  ))}
                  {task.tags.length > 3 && (
                    <span className="text-muted-foreground">+{task.tags.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleStartEdit();
          }}
          className="h-8 w-8 p-0"
          aria-label="Edit task"
        >
          <span className="text-xs">✏️</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-danger-soft"
          aria-label="Delete task"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
};