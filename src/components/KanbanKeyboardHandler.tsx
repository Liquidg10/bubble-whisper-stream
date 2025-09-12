import React, { useState, useEffect, useCallback } from 'react';
import { Task, TaskId } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  ArrowRight, 
  ArrowUp, 
  ArrowDown,
  Keyboard,
  X,
  Move
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface KanbanKeyboardHandlerProps {
  tasks: Task[];
  columns: Array<{ id: string; title: string }>;
  focusedTaskId: TaskId | null;
  onMove: (taskId: TaskId, columnId: string, newPosition: number) => void;
  onFocus: (taskId: TaskId) => void;
  className?: string;
}

export const KanbanKeyboardHandler: React.FC<KanbanKeyboardHandlerProps> = ({
  tasks,
  columns,
  focusedTaskId,
  onMove,
  onFocus,
  className
}) => {
  const [showInstructions, setShowInstructions] = useState(false);
  const [moveMode, setMoveMode] = useState(false);

  const focusedTask = focusedTaskId ? tasks.find(t => t.id === focusedTaskId) : null;
  const currentColumn = focusedTask?.view?.kanban?.columnId;
  const currentPosition = focusedTask?.view?.kanban?.pos || 0;

  const getTasksInColumn = useCallback((columnId: string) => {
    return tasks
      .filter(t => t.view?.kanban?.columnId === columnId)
      .sort((a, b) => (a.view?.kanban?.pos || 0) - (b.view?.kanban?.pos || 0));
  }, [tasks]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!focusedTask || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Show keyboard help
    if (e.key === 'F1' || (e.key === '?' && !e.shiftKey)) {
      e.preventDefault();
      setShowInstructions(!showInstructions);
      return;
    }

    // Toggle move mode
    if (e.key === 'm' || e.key === 'M') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setMoveMode(!moveMode);
        return;
      }
    }

    // Exit move mode
    if (e.key === 'Escape' && moveMode) {
      e.preventDefault();
      setMoveMode(false);
      return;
    }

    if (moveMode && currentColumn) {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          moveToAdjacentColumn(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveToAdjacentColumn(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveWithinColumn(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveWithinColumn(1);
          break;
        case 'Enter':
          e.preventDefault();
          setMoveMode(false);
          break;
      }
    } else {
      // Navigation mode
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown':
          if (currentColumn) {
            e.preventDefault();
            navigateWithinColumn(e.key === 'ArrowUp' ? -1 : 1);
          }
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault();
          navigateToAdjacentColumn(e.key === 'ArrowLeft' ? -1 : 1);
          break;
      }
    }
  }, [focusedTask, currentColumn, moveMode, showInstructions]);

  const moveToAdjacentColumn = (direction: 1 | -1) => {
    if (!focusedTask || !currentColumn) return;

    const currentColumnIndex = columns.findIndex(col => col.id === currentColumn);
    const nextColumnIndex = currentColumnIndex + direction;
    
    if (nextColumnIndex >= 0 && nextColumnIndex < columns.length) {
      const nextColumn = columns[nextColumnIndex];
      const tasksInNextColumn = getTasksInColumn(nextColumn.id);
      const newPosition = tasksInNextColumn.length;
      
      onMove(focusedTask.id, nextColumn.id, newPosition);
    }
  };

  const moveWithinColumn = (direction: 1 | -1) => {
    if (!focusedTask || !currentColumn) return;

    const tasksInColumn = getTasksInColumn(currentColumn);
    const currentIndex = tasksInColumn.findIndex(t => t.id === focusedTask.id);
    const newIndex = currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < tasksInColumn.length) {
      onMove(focusedTask.id, currentColumn, newIndex);
    }
  };

  const navigateWithinColumn = (direction: 1 | -1) => {
    if (!currentColumn) return;

    const tasksInColumn = getTasksInColumn(currentColumn);
    const currentIndex = tasksInColumn.findIndex(t => t.id === focusedTaskId);
    const nextIndex = currentIndex + direction;
    
    if (nextIndex >= 0 && nextIndex < tasksInColumn.length) {
      onFocus(tasksInColumn[nextIndex].id);
    }
  };

  const navigateToAdjacentColumn = (direction: 1 | -1) => {
    if (!currentColumn) return;

    const currentColumnIndex = columns.findIndex(col => col.id === currentColumn);
    const nextColumnIndex = currentColumnIndex + direction;
    
    if (nextColumnIndex >= 0 && nextColumnIndex < columns.length) {
      const nextColumn = columns[nextColumnIndex];
      const tasksInNextColumn = getTasksInColumn(nextColumn.id);
      
      if (tasksInNextColumn.length > 0) {
        onFocus(tasksInNextColumn[0].id);
      }
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={className}>
      {/* Move Mode Indicator */}
      <AnimatePresence>
        {moveMode && focusedTask && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50"
          >
            <Badge variant="default" className="px-4 py-2 text-sm">
              <Move className="w-4 h-4 mr-2" />
              Move Mode - Use arrows to move, Enter to finish, Esc to cancel
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard Instructions Modal */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowInstructions(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-border rounded-lg p-6 max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Keyboard className="w-5 h-5" />
                      Kanban Keyboard Navigation
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowInstructions(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium mb-2">Navigation Mode</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                            <ArrowUp className="w-3 h-3" />
                            <ArrowDown className="w-3 h-3" />
                          </div>
                          <span>Navigate within column</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                            <ArrowLeft className="w-3 h-3" />
                            <ArrowRight className="w-3 h-3" />
                          </div>
                          <span>Navigate between columns</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-2">Move Mode</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-1 bg-muted rounded text-xs font-mono">M</div>
                          <span>Enter/exit move mode</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                            <ArrowLeft className="w-3 h-3" />
                            <ArrowRight className="w-3 h-3" />
                          </div>
                          <span>Move between columns</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                            <ArrowUp className="w-3 h-3" />
                            <ArrowDown className="w-3 h-3" />
                          </div>
                          <span>Reorder within column</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-1 bg-muted rounded text-xs">Enter</div>
                          <span>Finish moving</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-1 bg-muted rounded text-xs">Esc</div>
                          <span>Cancel move</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-2">General</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-1 bg-muted rounded text-xs">F1 or ?</div>
                          <span>Show this help</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};