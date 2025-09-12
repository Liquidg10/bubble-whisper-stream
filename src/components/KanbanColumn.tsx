/**
 * Kanban Column Component
 * Displays tasks in a droppable column with accessibility support
 */

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { KanbanTaskCard } from './KanbanTaskCard';
import { cn } from '@/lib/utils';
import type { Task, TaskId } from '@/types/task';

interface KanbanColumnProps {
  column: {
    id: string;
    title: string;
    color: string;
  };
  tasks: Task[];
  isDraggedOver: boolean;
  onTaskKeyboardMove: (taskId: TaskId, direction: 'up' | 'down' | 'left' | 'right') => void;
  onTaskSelect: (taskId: TaskId) => void;
  selectedTaskId: TaskId | null;
}

export function KanbanColumn({ 
  column, 
  tasks, 
  isDraggedOver, 
  onTaskKeyboardMove,
  onTaskSelect,
  selectedTaskId 
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
  });

  const taskIds = tasks.map(task => `task-${task.id}`);

  return (
    <div ref={setNodeRef}>
      <Card className={cn(
        'h-fit min-h-[200px] transition-colors duration-200',
        (isOver || isDraggedOver) && 'ring-2 ring-accent-flow/50 bg-accent-flow/5'
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: column.color }}
              />
              <h3 className="font-medium text-sm">{column.title}</h3>
              <Badge variant="secondary" className="text-xs">
                {tasks.length}
              </Badge>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Column ${column.title} options`}
                >
                  <MoreVertical className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="gap-2">
                  <Plus className="w-3 h-3" />
                  Add task here
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  Clear completed
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  Column settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tasks.map((task, index) => (
                <KanbanTaskCard
                  key={task.id}
                  task={task}
                  isSelected={selectedTaskId === task.id}
                  onKeyboardMove={onTaskKeyboardMove}
                  onSelect={onTaskSelect}
                  position={index}
                />
              ))}
              
              {tasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No tasks</p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 gap-2 text-xs"
                  >
                    <Plus className="w-3 h-3" />
                    Add first task
                  </Button>
                </div>
              )}
            </div>
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}