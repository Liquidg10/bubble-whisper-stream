/**
 * Universal TaskDetail Modal Component
 * 
 * Unified detailed task editing modal that works across all views
 * Replaces BubbleDetail for task-type bubbles and provides rich editing
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagPicker } from './TagPicker';
import { 
  Calendar as CalendarIcon, 
  Tag, 
  Trash2, 
  Plus, 
  Clock, 
  Flag,
  Target,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { crossViewUndoService } from '@/services/crossViewUndoService';
import type { Task, TaskType, TaskTag } from '@/types/task';

interface TaskDetailProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  view?: 'bubble' | 'atomic' | 'list' | 'kanban' | 'matrix';
}

export const TaskDetail: React.FC<TaskDetailProps> = ({
  task,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  view = 'universal'
}) => {
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const { toast } = useToast();

  // Auto-save debounced function
  const debouncedSave = useCallback(
    debounce(async (taskToSave: Task) => {
      onUpdate(taskToSave);
      
      // Add to undo stack
      crossViewUndoService.addEntry({
        view: view as any,
        type: 'edit',
        data: { taskId: taskToSave.id, previous: task, updated: taskToSave },
        description: `Updated task: ${taskToSave.title}`,
        compensationFn: async () => { if (task) await Promise.resolve(onUpdate(task)); }
      });

      toast({ title: "Changes saved", duration: 1000 });
    }, 1000),
    [onUpdate, task, view, toast]
  );

  useEffect(() => {
    if (task) {
      setEditedTask({ ...task });
    }
  }, [task]);

  // Auto-save when editedTask changes
  useEffect(() => {
    if (editedTask && task && JSON.stringify(editedTask) !== JSON.stringify(task)) {
      debouncedSave(editedTask);
    }
  }, [editedTask, task, debouncedSave]);

  if (!task || !editedTask) return null;

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(task.id);
      onClose();
      
      crossViewUndoService.addEntry({
        view: view as any,
        type: 'delete',
        data: { task },
        description: `Deleted task: ${task.title}`,
        compensationFn: async () => await Promise.resolve(onUpdate(task))
      });
      
      toast({ title: "Task deleted", duration: 2000 });
    }
  };

  const handleAddTag = (tag: TaskTag) => {
    const updatedTags = [...editedTask.tags, tag];
    setEditedTask({ ...editedTask, tags: updatedTags });
    setShowTagPicker(false);
  };

  const handleRemoveTag = (tagId: string) => {
    const updatedTags = editedTask.tags.filter(t => t.id !== tagId);
    setEditedTask({ ...editedTask, tags: updatedTags });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return 'hsl(var(--destructive))';
    if (priority >= 60) return 'hsl(var(--warning))';
    if (priority >= 40) return 'hsl(var(--primary))';
    return 'hsl(var(--muted-foreground))';
  };

  const getTypeIcon = (type: TaskType) => {
    switch (type) {
      case 'task': return <Target className="h-4 w-4" />;
      case 'thought': return <CheckCircle2 className="h-4 w-4" />;
      case 'reminder': return <Clock className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              {getTypeIcon(editedTask.type)}
              <span className="capitalize font-semibold">
                {editedTask.type}
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Checkbox
                checked={editedTask.completed}
                onCheckedChange={(checked) => 
                  setEditedTask({ ...editedTask, completed: Boolean(checked) })
                }
                className="h-5 w-5"
              />
              <span className="text-sm text-muted-foreground">
                {editedTask.completed ? 'Completed' : 'Pending'}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Title
            </label>
            <Input
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              placeholder="Task title"
              className="text-lg font-medium"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Description
            </label>
            <Textarea
              value={editedTask.description || ''}
              onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
              placeholder="Add details about this task..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-sm font-medium flex items-center justify-between mb-3">
              <span className="text-foreground">Priority</span>
              <span 
                className="font-bold text-lg"
                style={{ color: getPriorityColor(editedTask.priority) }}
              >
                {Math.round(editedTask.priority)}%
              </span>
            </label>
            <Slider
              value={[editedTask.priority]}
              onValueChange={([value]) => setEditedTask({ ...editedTask, priority: value })}
              max={100}
              min={0}
              step={5}
              className="w-full"
            />
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-300"
                style={{ 
                  width: `${editedTask.priority}%`,
                  backgroundColor: getPriorityColor(editedTask.priority)
                }}
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Type
            </label>
            <Select
              value={editedTask.type}
              onValueChange={(value: TaskType) => 
                setEditedTask({ ...editedTask, type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="thought">Thought</SelectItem>
                <SelectItem value="reminder">Reminder</SelectItem>
                <SelectItem value="memory">Memory</SelectItem>
                <SelectItem value="mood">Mood</SelectItem>
                <SelectItem value="photo">Photo</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Due Date
            </label>
            <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !editedTask.due && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {editedTask.due ? (
                    format(new Date(editedTask.due), "PPP")
                  ) : (
                    <span>Set due date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editedTask.due ? new Date(editedTask.due) : undefined}
                  onSelect={(date) => {
                    setEditedTask({ 
                      ...editedTask, 
                      due: date ? date.getTime() : undefined 
                    });
                    setDueDateOpen(false);
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
                {editedTask.due && (
                  <div className="p-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditedTask({ ...editedTask, due: undefined });
                        setDueDateOpen(false);
                      }}
                      className="w-full"
                    >
                      Clear due date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">Tags</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTagPicker(true)}
                className="h-8 px-3"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Tag
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {editedTask.tags.map((tag) => (
                <Badge 
                  key={tag.id} 
                  variant="secondary"
                  className="text-sm py-1 px-2"
                >
                  {tag.emoji && <span className="mr-1">{tag.emoji}</span>}
                  {tag.name}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    className="ml-2 hover:opacity-70 transition-opacity"
                  >
                    ×
                  </button>
                </Badge>
              ))}
              {editedTask.tags.length === 0 && (
                <span className="text-sm text-muted-foreground">No tags added</span>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t border-border">
            <div>Created: {formatDate(task.createdAt)}</div>
            <div>Updated: {formatDate(task.updatedAt)}</div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-border">
            <Button 
              onClick={onClose} 
              className="flex-1"
            >
              Done
            </Button>
            {onDelete && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                size="default"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {showTagPicker && (
          <TagPicker
            onSelectTag={handleAddTag}
            onClose={() => setShowTagPicker(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}