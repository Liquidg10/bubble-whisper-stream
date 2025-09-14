/**
 * P1-P7 - Enhanced TaskDetailModal with Planning Mode & Because Explanations
 * Modal wrapper for TaskCard with full planning and explainable AI features
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskCard } from '@/components/TaskCard';
import type { Task } from '@/types/task';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  showPlanningMode?: boolean;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  onSave,
  onDelete,
  showPlanningMode = true
}) => {
  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Task Details
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <TaskCard
            task={task}
            viewConfig={{
              view: 'universal',
              compact: false,
              draggable: false,
              selectable: false,
              showDragHandle: false,
              showActions: true,
              showMetadata: true
            }}
            onUpdate={onSave}
            onDelete={onDelete}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};