/**
 * Kanban Board Component - Unified task view with proper alignment
 */

import React, { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { TaskCard, TaskCardConfigs } from '@/components/TaskCard';
import type { Task } from '@/types/task';

interface KanbanColumn {
  id: string;
  title: string;
  tasks: Task[];
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onTaskMove?: (taskId: string, fromColumn: string, toColumn: string, newOrder: number) => void;
  onTaskUpdate?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void;
  onAddTask?: (columnId: string) => void;
}

export function KanbanBoard({
  columns,
  onTaskMove,
  onTaskUpdate,
  onTaskDelete,
  onAddTask
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = columns
      .flatMap(col => col.tasks)
      .find(task => `task-${task.id}` === active.id);
    
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id.toString().replace('task-', '');
    const overId = over.id.toString();

    // Find source column
    const sourceColumn = columns.find(col => 
      col.tasks.some(task => task.id === taskId)
    );

    if (!sourceColumn) return;

    // Determine target column
    let targetColumnId: string;
    let targetOrder: number = 0;

    if (overId.startsWith('column-')) {
      // Dropped on column
      targetColumnId = overId.replace('column-', '');
      const targetColumn = columns.find(col => col.id === targetColumnId);
      targetOrder = targetColumn ? targetColumn.tasks.length : 0;
    } else if (overId.startsWith('task-')) {
      // Dropped on another task
      const targetTaskId = overId.replace('task-', '');
      const targetColumn = columns.find(col =>
        col.tasks.some(task => task.id === targetTaskId)
      );
      
      if (!targetColumn) return;
      
      targetColumnId = targetColumn.id;
      const targetTaskIndex = targetColumn.tasks.findIndex(task => task.id === targetTaskId);
      targetOrder = targetTaskIndex + 1;
    } else {
      return;
    }

    // Only move if changing columns or order
    if (sourceColumn.id !== targetColumnId) {
      onTaskMove?.(taskId, sourceColumn.id, targetColumnId, targetOrder);
    }
  };

  return (
    <div className="flex gap-6 overflow-x-auto pb-6">
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {columns.map((column) => (
          <Card key={column.id} className="w-80 flex-shrink-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {column.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({column.tasks.length})
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddTask?.(column.id)}
                  data-testid={`add-task-${column.id}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <SortableContext
                id={`column-${column.id}`}
                items={column.tasks.map(task => `task-${task.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div 
                  className="space-y-2 min-h-24"
                  data-testid={`kanban-column-${column.id}`}
                >
                  {column.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      viewConfig={TaskCardConfigs.kanban}
                      onUpdate={onTaskUpdate}
                      onDelete={onTaskDelete}
                      data-testid="task-item"
                    />
                  ))}
                </div>
              </SortableContext>
            </CardContent>
          </Card>
        ))}
        
        <DragOverlay>
          {activeTask && (
            <TaskCard
              task={activeTask}
              viewConfig={TaskCardConfigs.kanban}
              className="opacity-80"
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}