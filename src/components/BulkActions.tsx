import React from 'react';
import { Task, TaskId, updateTask } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Trash2, Clock, Calendar, X, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface BulkActionsProps {
  selectedTasks: Task[];
  onUpdateTasks: (tasks: Task[]) => void;
  onDeleteTasks: (ids: TaskId[]) => void;
  onClearSelection: () => void;
  className?: string;
}

export const BulkActions: React.FC<BulkActionsProps> = ({
  selectedTasks,
  onUpdateTasks,
  onDeleteTasks,
  onClearSelection,
  className
}) => {
  if (selectedTasks.length === 0) return null;

  const completedCount = selectedTasks.filter(task => task.completed).length;
  const pendingCount = selectedTasks.length - completedCount;

  const handleBulkComplete = () => {
    const updatedTasks = selectedTasks.map(task => 
      updateTask(task, { completed: true })
    );
    onUpdateTasks(updatedTasks);
  };

  const handleBulkUncomplete = () => {
    const updatedTasks = selectedTasks.map(task => 
      updateTask(task, { completed: false })
    );
    onUpdateTasks(updatedTasks);
  };

  const handleBulkDelete = () => {
    const taskIds = selectedTasks.map(task => task.id);
    onDeleteTasks(taskIds);
    onClearSelection();
  };

  const handleDeferToToday = () => {
    const today = new Date();
    today.setHours(18, 0, 0, 0); // Default to 6 PM today
    
    const updatedTasks = selectedTasks.map(task => 
      updateTask(task, { 
        due: today.getTime(),
        view: {
          ...task.view,
          atomic: { ...task.view?.atomic, shell: 'today' }
        }
      })
    );
    onUpdateTasks(updatedTasks);
  };

  const handleDeferToWeek = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(18, 0, 0, 0);
    
    const updatedTasks = selectedTasks.map(task => 
      updateTask(task, { 
        due: nextWeek.getTime(),
        view: {
          ...task.view,
          atomic: { ...task.view?.atomic, shell: 'week' }
        }
      })
    );
    onUpdateTasks(updatedTasks);
  };

  const handleDeferToLater = () => {
    const updatedTasks = selectedTasks.map(task => 
      updateTask(task, { 
        due: undefined,
        view: {
          ...task.view,
          atomic: { ...task.view?.atomic, shell: 'later' }
        }
      })
    );
    onUpdateTasks(updatedTasks);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          'fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50',
          'bg-card border border-border rounded-lg shadow-lg p-3',
          'flex items-center gap-2 flex-wrap max-w-sm',
          className
        )}
        role="toolbar"
        aria-label="Bulk actions for selected tasks"
      >
        {/* Selection Summary */}
        <div className="flex items-center gap-2 mr-2">
          <Badge variant="secondary" className="text-xs">
            {selectedTasks.length} selected
          </Badge>
          
          {completedCount > 0 && (
            <Badge variant="outline" className="text-xs text-success-gentle">
              {completedCount} done
            </Badge>
          )}
          
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-xs text-accent-flow">
              {pendingCount} pending
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Complete/Uncomplete */}
          {pendingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkComplete}
              className="h-8 px-2 text-xs"
              aria-label={`Mark ${pendingCount} task${pendingCount !== 1 ? 's' : ''} as complete`}
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              Complete
            </Button>
          )}

          {completedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkUncomplete}
              className="h-8 px-2 text-xs"
              aria-label={`Mark ${completedCount} task${completedCount !== 1 ? 's' : ''} as incomplete`}
            >
              <Archive className="w-3 h-3 mr-1" />
              Undo
            </Button>
          )}

          {/* Defer Actions */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeferToToday}
            className="h-8 px-2 text-xs"
            aria-label="Defer to today"
          >
            <Clock className="w-3 h-3 mr-1" />
            Today
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeferToWeek}
            className="h-8 px-2 text-xs"
            aria-label="Defer to next week"
          >
            <Calendar className="w-3 h-3 mr-1" />
            Week
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeferToLater}
            className="h-8 px-2 text-xs"
            aria-label="Defer to later"
          >
            Later
          </Button>

          {/* Delete */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            className="h-8 px-2 text-xs text-danger-soft hover:text-danger-soft"
            aria-label={`Delete ${selectedTasks.length} selected task${selectedTasks.length !== 1 ? 's' : ''}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>

          {/* Clear Selection */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 w-8 p-0"
            aria-label="Clear selection"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};