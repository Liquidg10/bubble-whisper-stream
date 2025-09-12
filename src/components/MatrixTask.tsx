import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { type Task } from '@/types/task';
import { type ViewSDK } from '@/views/sdk';
import { updateTask } from '@/types/task';
import { calculateQuadrant } from '@/pages/MatrixView';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  Star,
  MoreHorizontal
} from 'lucide-react';

interface MatrixTaskProps {
  task: Task;
  quadrant: 1|2|3|4;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (isMulti: boolean) => void;
  onFocus: () => void;
  viewSDK: ViewSDK;
}

export function MatrixTask({
  task,
  quadrant,
  isSelected,
  isFocused,
  onSelect,
  onFocus,
  viewSDK
}: MatrixTaskProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);

  const urgency = (task.view?.matrix?.urgency ?? 1) as 0|1|2|3;
  const importance = (task.view?.matrix?.importance ?? 1) as 0|1|2|3;

  const handleUrgencyChange = async (delta: number) => {
    const newUrgency = Math.max(0, Math.min(3, urgency + delta)) as 0|1|2|3;
    const newQuadrant = calculateQuadrant(newUrgency, importance);
    
    const updatedTask = updateTask(task, {
      view: {
        ...task.view,
        matrix: {
          urgency: newUrgency,
          importance,
          quadrant: newQuadrant
        }
      }
    });
    
    await viewSDK.actions.upsert(updatedTask);
  };

  const handleImportanceChange = async (delta: number) => {
    const newImportance = Math.max(0, Math.min(3, importance + delta)) as 0|1|2|3;
    const newQuadrant = calculateQuadrant(urgency, newImportance);
    
    const updatedTask = updateTask(task, {
      view: {
        ...task.view,
        matrix: {
          urgency,
          importance: newImportance,
          quadrant: newQuadrant
        }
      }
    });
    
    await viewSDK.actions.upsert(updatedTask);
  };

  const handleToggleComplete = async () => {
    const updatedTask = updateTask(task, { completed: !task.completed });
    await viewSDK.actions.upsert(updatedTask);
  };

  const handleTitleSave = async () => {
    if (editTitle.trim() && editTitle !== task.title) {
      const updatedTask = updateTask(task, { title: editTitle.trim() });
      await viewSDK.actions.upsert(updatedTask);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    
    if (isEditing) {
      if (e.key === 'Enter') {
        handleTitleSave();
      } else if (e.key === 'Escape') {
        setEditTitle(task.title);
        setIsEditing(false);
      }
      return;
    }

    switch (e.key) {
      case 'Enter':
        setIsEditing(true);
        break;
      case ' ':
        e.preventDefault();
        handleToggleComplete();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        handleUrgencyChange(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        handleUrgencyChange(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        handleImportanceChange(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        handleImportanceChange(-1);
        break;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocus();
    
    if (e.detail === 2) { // Double click
      setIsEditing(true);
    } else {
      onSelect(e.ctrlKey || e.metaKey);
    }
  };

  const getUrgencyColor = (level: number) => {
    const colors = [
      'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
    ];
    return colors[level] || colors[0];
  };

  const getImportanceColor = (level: number) => {
    const colors = [
      'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
    ];
    return colors[level] || colors[0];
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        "group transition-all duration-200",
        isFocused && "ring-2 ring-primary/50"
      )}
    >
      <Card
        className={cn(
          "p-3 cursor-pointer transition-all duration-200 hover:shadow-md",
          isSelected && "ring-2 ring-primary/30 bg-primary/5",
          task.completed && "opacity-60",
          isFocused && "ring-2 ring-primary/50"
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-selected={isSelected}
        aria-label={`Task: ${task.title}, Urgency: ${urgency}, Importance: ${importance}`}
      >
        <div className="flex items-start gap-3">
          {/* Completion Checkbox */}
          <Checkbox
            checked={task.completed}
            onCheckedChange={handleToggleComplete}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
            aria-label={`Mark ${task.title} as ${task.completed ? 'incomplete' : 'complete'}`}
          />

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleKeyDown}
                className="w-full p-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h4 className={cn(
                "text-sm font-medium leading-tight break-words",
                task.completed && "line-through text-muted-foreground"
              )}>
                {task.title}
              </h4>
            )}

            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Task Metadata */}
            <div className="flex items-center gap-2 mt-2">
              {task.due && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(task.due).toLocaleDateString()}
                </Badge>
              )}
              
              {task.tags.map(tag => (
                <Badge 
                  key={tag.id} 
                  variant="secondary" 
                  className="text-xs"
                  style={{ backgroundColor: tag.colorHex + '20' }}
                >
                  {tag.emoji} {tag.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Matrix Controls */}
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Importance Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleImportanceChange(1);
                }}
                disabled={importance >= 3}
                aria-label="Increase importance"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Badge className={cn("text-xs min-w-[2rem] text-center", getImportanceColor(importance))}>
                {importance}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleImportanceChange(-1);
                }}
                disabled={importance <= 0}
                aria-label="Decrease importance"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>

            {/* Urgency Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUrgencyChange(-1);
                }}
                disabled={urgency <= 0}
                aria-label="Decrease urgency"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Badge className={cn("text-xs min-w-[2rem] text-center", getUrgencyColor(urgency))}>
                {urgency}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUrgencyChange(1);
                }}
                disabled={urgency >= 3}
                aria-label="Increase urgency"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}