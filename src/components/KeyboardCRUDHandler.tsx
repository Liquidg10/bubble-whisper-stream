import React, { useEffect, useCallback } from 'react';
import { Task, TaskId, createTask } from '@/types/task';
import { toast } from 'sonner';

interface KeyboardCRUDHandlerProps {
  tasks: Task[];
  focusedTaskId: TaskId | null;
  selectedTaskIds: Set<TaskId>;
  onUpdate: (task: Task) => void;
  onDelete: (id: TaskId) => void;
  onAdd: (task: Omit<Task, 'id'>) => void;
  onFocus: (id: TaskId) => void;
  onToggleSelect: (id: TaskId) => void;
  onEdit?: (id: TaskId) => void;
}

export const KeyboardCRUDHandler: React.FC<KeyboardCRUDHandlerProps> = ({
  tasks,
  focusedTaskId,
  selectedTaskIds,
  onUpdate,
  onDelete,
  onAdd,
  onFocus,
  onToggleSelect,
  onEdit
}) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in input/textarea
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const focusedTask = focusedTaskId ? tasks.find(t => t.id === focusedTaskId) : null;

    switch (e.key) {
      case 'n':
      case 'N':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // Quick add new task
          onAdd({
            title: 'New Task',
            type: 'task',
            priority: 50,
            completed: false,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          toast.success('New task created');
        }
        break;

      case 'e':
      case 'E':
        if (focusedTask && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          onEdit?.(focusedTask.id);
        }
        break;

      case 'Enter':
        if (focusedTask) {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Enter to select
            onToggleSelect(focusedTask.id);
          } else {
            // Enter to edit
            onEdit?.(focusedTask.id);
          }
        }
        break;

      case ' ':
        if (focusedTask && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          // Toggle completion
          onUpdate({
            ...focusedTask,
            completed: !focusedTask.completed,
            updatedAt: Date.now()
          });
          toast.success(focusedTask.completed ? 'Task unmarked' : 'Task completed');
        }
        break;

      case 'Delete':
        if (e.shiftKey && focusedTask) {
          e.preventDefault();
          onDelete(focusedTask.id);
          toast.success('Task deleted');
        }
        break;

      case 'Backspace':
        if (e.shiftKey && focusedTask) {
          e.preventDefault();
          onDelete(focusedTask.id);
          toast.success('Task deleted');
        }
        break;

      case 'ArrowUp':
        if (focusedTask) {
          e.preventDefault();
          const currentIndex = tasks.findIndex(t => t.id === focusedTask.id);
          const nextIndex = Math.max(0, currentIndex - 1);
          if (nextIndex !== currentIndex && tasks[nextIndex]) {
            onFocus(tasks[nextIndex].id);
          }
        }
        break;

      case 'ArrowDown':
        if (focusedTask) {
          e.preventDefault();
          const currentIndex = tasks.findIndex(t => t.id === focusedTask.id);
          const nextIndex = Math.min(tasks.length - 1, currentIndex + 1);
          if (nextIndex !== currentIndex && tasks[nextIndex]) {
            onFocus(tasks[nextIndex].id);
          }
        }
        break;

      case 'Home':
        if (tasks.length > 0) {
          e.preventDefault();
          onFocus(tasks[0].id);
        }
        break;

      case 'End':
        if (tasks.length > 0) {
          e.preventDefault();
          onFocus(tasks[tasks.length - 1].id);
        }
        break;

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // Select all visible tasks
          tasks.forEach(task => {
            if (!selectedTaskIds.has(task.id)) {
              onToggleSelect(task.id);
            }
          });
        }
        break;

      case 'Escape':
        e.preventDefault();
        // Clear selection and focus
        if (selectedTaskIds.size > 0) {
          selectedTaskIds.forEach(id => onToggleSelect(id));
        }
        break;
    }
  }, [tasks, focusedTaskId, selectedTaskIds, onUpdate, onDelete, onAdd, onFocus, onToggleSelect, onEdit]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return null; // This is a logic-only component
};