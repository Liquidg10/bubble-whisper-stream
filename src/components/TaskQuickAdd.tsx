import React, { useState, useRef } from 'react';
import { Task, createTask, TaskType } from '@/types/task';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface TaskQuickAddProps {
  onAdd: (task: Omit<Task, 'id'>) => void;
  className?: string;
  autoFocus?: boolean;
}

const TASK_TYPES: { value: TaskType; label: string; emoji: string }[] = [
  { value: 'task', label: 'Task', emoji: '✅' },
  { value: 'thought', label: 'Thought', emoji: '💭' },
  { value: 'reminder', label: 'Reminder', emoji: '⏰' },
  { value: 'memory', label: 'Memory', emoji: '💾' },
  { value: 'mood', label: 'Mood', emoji: '🌙' },
];

export const TaskQuickAdd: React.FC<TaskQuickAddProps> = ({
  onAdd,
  className,
  autoFocus = false
}) => {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('task');
  const [isExpanded, setIsExpanded] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) return;

    const newTask = createTask(title.trim(), taskType, {
      due: dueDate ? new Date(dueDate).getTime() : undefined,
      priority: 50, // Default medium priority
      view: {
        list: {
          order: Date.now(), // Use timestamp for initial ordering
        }
      }
    });

    onAdd(newTask);
    setTitle('');
    setDueDate('');
    setIsExpanded(false);
    
    // Keep focus on input for quick successive adds
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      setIsExpanded(false);
      setTitle('');
      setDueDate('');
    } else if (e.key === 'Tab' && !isExpanded && title.trim()) {
      // Expand for additional options when tabbing
      e.preventDefault();
      setIsExpanded(true);
    }
  };

  const handleFocus = () => {
    if (!isExpanded && title.trim()) {
      setIsExpanded(true);
    }
  };

  return (
    <motion.div
      layout
      className={cn(
        'border rounded-lg bg-card p-3 space-y-3',
        'focus-within:ring-2 focus-within:ring-accent-flow focus-within:ring-offset-2',
        className
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Main Input */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              placeholder="Add a task... (Press Enter to save)"
              className="border-0 focus-visible:ring-0 bg-transparent text-sm"
              autoFocus={autoFocus}
              aria-label="New task title"
            />
          </div>
          
          <Button
            type="submit"
            size="sm"
            disabled={!title.trim()}
            className="h-8 w-8 p-0 flex-shrink-0"
            aria-label="Add task"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Expanded Options */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-3 overflow-hidden"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {/* Task Type Selector */}
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  <Select value={taskType} onValueChange={(value: TaskType) => setTaskType(value)}>
                    <SelectTrigger className="w-auto h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <span className="flex items-center gap-2">
                            <span>{type.emoji}</span>
                            <span>{type.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Due Date */}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-auto h-8 text-xs"
                    aria-label="Due date"
                  />
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>💡 Press Enter to save, Tab for options, Esc to cancel</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
};
