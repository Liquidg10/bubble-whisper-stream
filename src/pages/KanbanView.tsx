/**
 * P4 - Kanban View Implementation
 * Provides column-based task organization with drag-and-drop and keyboard alternatives
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useLODSystem } from '@/hooks/useLODSystem';
import { 
  DndContext, 
  DragEndEvent, 
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Plus,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTaskStoreSync } from '@/stores/taskStore';
import { createViewContext, createViewData, type ViewSDK } from '@/views/sdk';
import { SmartTaskQuickAdd } from '@/components/SmartTaskQuickAdd';
import { TaskDetail } from '@/components/TaskDetail';
import { KanbanTaskCard } from '@/components/KanbanTaskCard';
import { KanbanColumn } from '@/components/KanbanColumn';
import { KanbanColumnSettings } from '@/components/KanbanColumnSettings';
import { useKanbanColumns, type KanbanColumn as KanbanColumnType } from '@/hooks/useKanbanColumns';
import { isFeatureEnabled } from '@/config/flags';
import { cn } from '@/lib/utils';
import type { Task, TaskId } from '@/types/task';

export default function KanbanView() {
  const taskStore = useTaskStoreSync();
  const { columns, updateColumn } = useKanbanColumns();
  const [draggedTask, setDraggedTask] = useState<TaskId | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);
  const [settingsColumn, setSettingsColumn] = useState<KanbanColumnType | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  
  // LOD system for performance management
  const { setDragState, setMultiSelectState } = useLODSystem();

  // Check if Kanban feature is enabled
  if (!isFeatureEnabled('kanbanView')) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Kanban View</h1>
            <p className="text-muted-foreground">
              This feature is currently disabled. Enable the 'kanbanView' flag to access kanban organization.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Configure drag sensors with accessibility support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group tasks by kanban column
  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    
    columns.forEach(col => {
      grouped[col.id] = taskStore.tasks
        .filter(task => task.view?.kanban?.columnId === col.id)
        .sort((a, b) => (a.view?.kanban?.pos || 0) - (b.view?.kanban?.pos || 0));
    });

    // Tasks without column assignment go to backlog
    const unassigned = taskStore.tasks.filter(task => !task.view?.kanban?.columnId);
    grouped.backlog = [...(grouped.backlog || []), ...unassigned];

    return grouped;
  }, [taskStore.tasks, columns]);

  // ViewSDK implementation
  const viewSDK: ViewSDK = useMemo(() => ({
    ctx: createViewContext('kanban-main', 'kanban'),
    data: createViewData(taskStore.tasks, selectedTaskId ? [selectedTaskId] : []),
    actions: {
      upsert: async (task: Task) => {
        if (taskStore.getTask(task.id)) {
          await taskStore.updateTask(task.id, task);
        } else {
          await taskStore.addTask(task);
        }
      },
      bulkUpsert: async (tasks: Task[]) => {
        try {
          for (const task of tasks) {
            await viewSDK.actions.upsert(task);
          }
        } catch (error) {
          console.error('Bulk upsert failed:', error);
          throw error;
        }
      },
      remove: async (id: TaskId) => {
        await taskStore.deleteTask(id);
      },
      reorder: async (ids: TaskId[], dest: { columnId?: string; index: number }) => {
        // Move tasks to new column and reorder
        for (let i = 0; i < ids.length; i++) {
          const taskId = ids[i];
          const task = taskStore.getTask(taskId);
          if (task) {
            await taskStore.updateTask(taskId, {
              view: {
                ...task.view,
                kanban: {
                  boardId: 'main',
                  columnId: dest.columnId || 'backlog',
                  pos: dest.index + i
                }
              }
            });
          }
        }
      },
      focus: (id: TaskId) => {
        setSelectedTaskId(id);
      }
    }
  }), [taskStore, selectedTaskId]);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedTask(event.active.id as TaskId);
    // Notify LOD system that dragging started
    setDragState(true, 1);
  }, [setDragState]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setDraggedTask(null);
      return;
    }

    const taskId = active.id as TaskId;
    const overId = over.id as string;
    
    // Determine target column and position
    let targetColumnId = overId;
    let targetIndex = 0;

    // If dropped on a task, get its column and position
    if (overId.startsWith('task-')) {
      const overTaskId = overId.replace('task-', '');
      const overTask = taskStore.getTask(overTaskId);
      if (overTask?.view?.kanban) {
        targetColumnId = overTask.view.kanban.columnId;
        targetIndex = overTask.view.kanban.pos + 1;
      }
    } else if (overId.startsWith('column-')) {
      targetColumnId = overId.replace('column-', '');
      const columnTasks = tasksByColumn[targetColumnId] || [];
      targetIndex = columnTasks.length;
    }

    await viewSDK.actions.reorder([taskId], { 
      columnId: targetColumnId, 
      index: targetIndex 
    });

    setDraggedTask(null);
    // Notify LOD system that dragging ended
    setDragState(false, 0);
  }, [taskStore, tasksByColumn, viewSDK.actions, setDragState]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Handle visual feedback during drag
  }, []);

  // Keyboard navigation for accessibility
  const handleKeyboardMove = useCallback(async (taskId: TaskId, direction: 'up' | 'down' | 'left' | 'right') => {
    const task = taskStore.getTask(taskId);
    if (!task?.view?.kanban) return;

    const currentColumnId = task.view.kanban.columnId;
    const currentPos = task.view.kanban.pos;

    switch (direction) {
      case 'left': {
        const currentIndex = columns.findIndex(col => col.id === currentColumnId);
        if (currentIndex > 0) {
          const newColumnId = columns[currentIndex - 1].id;
          await viewSDK.actions.reorder([taskId], { columnId: newColumnId, index: 0 });
        }
        break;
      }
      case 'right': {
        const currentIndex = columns.findIndex(col => col.id === currentColumnId);
        if (currentIndex < columns.length - 1) {
          const newColumnId = columns[currentIndex + 1].id;
          await viewSDK.actions.reorder([taskId], { columnId: newColumnId, index: 0 });
        }
        break;
      }
      case 'up': {
        if (currentPos > 0) {
          await viewSDK.actions.reorder([taskId], { 
            columnId: currentColumnId, 
            index: currentPos - 1 
          });
        }
        break;
      }
      case 'down': {
        const columnTasks = tasksByColumn[currentColumnId] || [];
        if (currentPos < columnTasks.length - 1) {
          await viewSDK.actions.reorder([taskId], { 
            columnId: currentColumnId, 
            index: currentPos + 1 
          });
        }
        break;
      }
    }
  }, [taskStore, columns, tasksByColumn, viewSDK.actions]);

  // Column action handlers
  const handleAddTask = useCallback(async (columnId: string) => {
    const newTask: Task = {
      id: Date.now().toString(),
      type: 'task',
      title: 'New task',
      completed: false,
      priority: 50,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      view: {
        kanban: {
          boardId: 'main',
          columnId,
          pos: (tasksByColumn[columnId] || []).length
        }
      }
    };
    
    await viewSDK.actions.upsert(newTask);
    setSelectedTaskId(newTask.id);
  }, [tasksByColumn, viewSDK.actions]);

  const handleClearCompleted = useCallback(async (columnId: string) => {
    const completedTasks = (tasksByColumn[columnId] || []).filter(task => task.completed);
    for (const task of completedTasks) {
      await viewSDK.actions.remove(task.id);
    }
  }, [tasksByColumn, viewSDK.actions]);

  const handleColumnSettings = useCallback((columnId: string) => {
    const column = columns.find(col => col.id === columnId);
    if (column) {
      setSettingsColumn(column);
    }
  }, [columns]);

  const handleSaveColumnSettings = useCallback((updatedColumn: KanbanColumnType) => {
    updateColumn(updatedColumn.id, updatedColumn);
    setSettingsColumn(null);
  }, [updateColumn]);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Kanban Board</h1>
            <p className="text-muted-foreground">Organize tasks in columns</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-11">
              <Settings className="w-4 h-4" />
              Configure Columns
            </Button>
          </div>
        </div>

        {/* Quick Add */}
        <div className="mb-6">
          <SmartTaskQuickAdd />
        </div>

        {/* Kanban Board */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn[column.id] || []}
                isDraggedOver={false}
                onTaskKeyboardMove={handleKeyboardMove}
                onTaskSelect={setSelectedTaskId}
                selectedTaskId={selectedTaskId}
                onAddTask={handleAddTask}
                onClearCompleted={handleClearCompleted}
                onColumnSettings={handleColumnSettings}
              />
            ))}
          </div>
        </DndContext>

        {/* Keyboard Shortcuts Help */}
        <div className="mt-8 text-xs text-muted-foreground text-center">
          <p>
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Arrow keys</kbd> to move tasks • 
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs ml-1">Space</kbd> to select • 
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs ml-1">Enter</kbd> to activate
          </p>
        </div>

        {/* Column Settings Dialog */}
        {settingsColumn && (
          <KanbanColumnSettings
            column={settingsColumn}
            isOpen={!!settingsColumn}
            onClose={() => setSettingsColumn(null)}
            onSave={handleSaveColumnSettings}
          />
        )}

        {/* TaskDetail Modal */}
        <TaskDetail
          task={detailTask}
          isOpen={!!detailTask}
          onClose={() => setDetailTask(null)}
          onUpdate={(task) => taskStore.updateTask(task.id, task)}
          onDelete={(taskId) => taskStore.deleteTask(taskId)}
          view="kanban"
        />
      </div>
    </div>
  );
}