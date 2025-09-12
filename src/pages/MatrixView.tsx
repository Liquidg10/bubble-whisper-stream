import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTaskStoreSync } from '@/stores/taskStore';
import { createViewContext, createViewData, type ViewSDK } from '@/views/sdk';
import { ViewBus, ViewBusHelpers } from '@/views/bus';
import { MatrixGrid } from '@/components/MatrixGrid';
import { QuadrantFilters } from '@/components/QuadrantFilters';
import { MatrixQuickAdd } from '@/components/MatrixQuickAdd';
import { MatrixKeyboardHelp } from '@/components/MatrixKeyboardHelp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isFeatureEnabled } from '@/config/flags';
import { updateTask, type Task } from '@/types/task';
import { motion } from 'framer-motion';
import { Grid3x3, Keyboard, HelpCircle } from 'lucide-react';

interface QuadrantVisibility {
  do: boolean;
  schedule: boolean;
  delegate: boolean;
  drop: boolean;
}

// Calculate quadrant from urgency/importance (0-3 scale)
export function calculateQuadrant(urgency: 0|1|2|3, importance: 0|1|2|3): 1|2|3|4 {
  if (urgency >= 2 && importance >= 2) return 1; // Do
  if (urgency < 2 && importance >= 2) return 2;  // Schedule  
  if (urgency >= 2 && importance < 2) return 3;  // Delegate
  return 4; // Drop
}

export default function MatrixView() {
  const taskStore = useTaskStoreSync();
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedQuadrant, setFocusedQuadrant] = useState<1|2|3|4>(1);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [quadrantVisibility, setQuadrantVisibility] = useState<QuadrantVisibility>({
    do: true,
    schedule: true,
    delegate: true,
    drop: true
  });

  // Feature flag check
  if (!isFeatureEnabled('matrixView')) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Grid3x3 className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Matrix View</h2>
          <p className="text-muted-foreground">This feature is not enabled yet.</p>
        </div>
      </div>
    );
  }

  // ViewContext first
  const viewContext = useMemo(() => createViewContext('eisenhower-matrix', 'matrix'), []);

  // Update task with matrix metadata
  const updateTaskMatrix = useCallback(async (task: Task) => {
    const urgency = (task.view?.matrix?.urgency ?? 1) as 0|1|2|3;
    const importance = (task.view?.matrix?.importance ?? 1) as 0|1|2|3;
    const quadrant = calculateQuadrant(urgency, importance);
    
    const updatedTask = updateTask(task, {
      view: {
        ...task.view,
        matrix: {
          urgency,
          importance,
          quadrant
        }
      }
    });
    
    await taskStore.updateTask(task.id, {
      view: {
        ...task.view,
        matrix: {
          urgency,
          importance,
          quadrant
        }
      }
    });
    
    ViewBus.emit('task.moved', ViewBusHelpers.createTaskMovedEvent(
      task.id,
      { matrix: { urgency, importance, quadrant } },
      viewContext,
      task.view
    ));
  }, [taskStore, viewContext]);

  // ViewSDK integration
  const viewSDK: ViewSDK = useMemo(() => ({
    ctx: viewContext,
    data: createViewData(taskStore.tasks, Array.from(selectedTaskIds)),
    actions: {
      upsert: updateTaskMatrix,
      remove: taskStore.deleteTask,
      bulkUpsert: async (tasks) => {
        for (const task of tasks) {
          await updateTaskMatrix(task);
        }
      },
      focus: setFocusedTaskId
    }
  }), [taskStore.tasks, selectedTaskIds, updateTaskMatrix, taskStore.deleteTask, viewContext]);

  // Group tasks by quadrant with proper matrix metadata
  const tasksByQuadrant = useMemo(() => {
    const quadrants = { 1: [], 2: [], 3: [], 4: [] } as Record<1|2|3|4, Task[]>;
    
    taskStore.tasks.forEach(task => {
      const urgency = (task.view?.matrix?.urgency ?? 1) as 0|1|2|3;
      const importance = (task.view?.matrix?.importance ?? 1) as 0|1|2|3;
      const quadrant = calculateQuadrant(urgency, importance);
      
      // Just add task to appropriate quadrant - don't update here
      quadrants[quadrant].push(task);
    });
    
    return quadrants;
  }, [taskStore.tasks]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedQuadrant(prev => prev <= 2 ? (prev === 1 ? 3 : 4) : (prev - 2) as 1|2|3|4);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedQuadrant(prev => prev >= 3 ? (prev === 3 ? 1 : 2) : (prev + 2) as 1|2|3|4);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedQuadrant(prev => [2, 1, 4, 3][prev - 1] as 1|2|3|4);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusedQuadrant(prev => [2, 1, 4, 3][prev - 1] as 1|2|3|4);
          break;
        case '1':
          e.preventDefault();
          setFocusedQuadrant(1);
          break;
        case '2':
          e.preventDefault();
          setFocusedQuadrant(2);
          break;
        case '3':
          e.preventDefault();
          setFocusedQuadrant(3);
          break;
        case '4':
          e.preventDefault();
          setFocusedQuadrant(4);
          break;
        case '?':
          e.preventDefault();
          setShowKeyboardHelp(true);
          break;
      }

      // Alt + number for filter toggles
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const quadrantMap = { '1': 'do', '2': 'schedule', '3': 'delegate', '4': 'drop' } as const;
        const quadrant = quadrantMap[e.key as '1'|'2'|'3'|'4'];
        setQuadrantVisibility(prev => ({ ...prev, [quadrant]: !prev[quadrant] }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQuadrantFilterToggle = (quadrant: keyof QuadrantVisibility) => {
    setQuadrantVisibility(prev => ({ ...prev, [quadrant]: !prev[quadrant] }));
  };

  const handleShowAll = () => {
    setQuadrantVisibility({ do: true, schedule: true, delegate: true, drop: true });
  };

  const handleHideAll = () => {
    setQuadrantVisibility({ do: false, schedule: false, delegate: false, drop: false });
  };

  const totalTasks = taskStore.tasks.length;
  const visibleQuadrants = Object.values(quadrantVisibility).filter(Boolean).length;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Grid3x3 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Eisenhower Matrix</h1>
              <p className="text-sm text-muted-foreground">
                Organize by urgency × importance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {totalTasks} tasks
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeyboardHelp(true)}
              className="gap-2"
            >
              <Keyboard className="h-4 w-4" />
              Shortcuts
            </Button>
          </div>
        </div>

        {/* Quadrant Filters */}
        <QuadrantFilters
          visibility={quadrantVisibility}
          onToggle={handleQuadrantFilterToggle}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
          taskCounts={{
            do: tasksByQuadrant[1].length,
            schedule: tasksByQuadrant[2].length,
            delegate: tasksByQuadrant[3].length,
            drop: tasksByQuadrant[4].length
          }}
        />
      </div>

      {/* Matrix Grid */}
      <div className="flex-1 p-4 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MatrixGrid
            tasksByQuadrant={tasksByQuadrant}
            quadrantVisibility={quadrantVisibility}
            focusedQuadrant={focusedQuadrant}
            focusedTaskId={focusedTaskId}
            selectedTaskIds={selectedTaskIds}
            onTaskSelect={(taskId, isMulti) => {
              if (isMulti) {
                setSelectedTaskIds(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(taskId)) {
                    newSet.delete(taskId);
                  } else {
                    newSet.add(taskId);
                  }
                  return newSet;
                });
              } else {
                setSelectedTaskIds(new Set([taskId]));
              }
            }}
            onTaskFocus={setFocusedTaskId}
            onQuadrantFocus={setFocusedQuadrant}
            viewSDK={viewSDK}
          />
        </motion.div>
      </div>

      {/* Quick Add */}
      <div className="shrink-0 border-t border-border/40 bg-background/80 backdrop-blur">
        <MatrixQuickAdd
          targetQuadrant={focusedQuadrant}
          onTaskAdded={(task) => {
            viewSDK.actions.upsert(task);
          }}
        />
      </div>

      {/* Keyboard Help Modal */}
      {showKeyboardHelp && (
        <MatrixKeyboardHelp onClose={() => setShowKeyboardHelp(false)} />
      )}
    </div>
  );
}