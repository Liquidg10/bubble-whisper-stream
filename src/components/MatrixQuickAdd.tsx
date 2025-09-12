import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createTask, type Task } from '@/types/task';
import { calculateQuadrant } from '@/pages/MatrixView';
import { cn } from '@/lib/utils';
import { Plus, Zap, Clock, Users, Trash2 } from 'lucide-react';

interface MatrixQuickAddProps {
  targetQuadrant: 1|2|3|4;
  onTaskAdded: (task: Task) => void;
}

const QUADRANT_CONFIG = {
  1: { 
    label: 'Do', 
    icon: Zap,
    urgency: 2 as const,
    importance: 2 as const,
    color: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    placeholder: 'Add urgent & important task...'
  },
  2: { 
    label: 'Schedule', 
    icon: Clock,
    urgency: 1 as const,
    importance: 2 as const,
    color: 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    placeholder: 'Add important task to schedule...'
  },
  3: { 
    label: 'Delegate', 
    icon: Users,
    urgency: 2 as const,
    importance: 1 as const,
    color: 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    placeholder: 'Add task to delegate...'
  },
  4: { 
    label: 'Drop', 
    icon: Trash2,
    urgency: 1 as const,
    importance: 1 as const,
    color: 'bg-gray-50 dark:bg-gray-950/20 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800',
    placeholder: 'Add low priority task...'
  }
} as const;

export function MatrixQuickAdd({ targetQuadrant, onTaskAdded }: MatrixQuickAddProps) {
  const [title, setTitle] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  
  const config = QUADRANT_CONFIG[targetQuadrant];
  const Icon = config.icon;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) return;
    
    const quadrant = calculateQuadrant(config.urgency, config.importance);
    
    const newTask = {
      ...createTask(title.trim(), 'task'),
      id: crypto.randomUUID(),
      view: {
        matrix: {
          urgency: config.urgency,
          importance: config.importance,
          quadrant
        }
      }
    };
    
    onTaskAdded(newTask);
    setTitle('');
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setTitle('');
      setIsExpanded(false);
    }
    // Prevent matrix keyboard shortcuts when typing
    e.stopPropagation();
  };

  return (
    <div className="p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Quick Add Input */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium",
            config.color
          )}>
            <Icon className="h-4 w-4" />
            <span>{config.label}</span>
            <Badge variant="outline" className="text-xs">
              Q{targetQuadrant}
            </Badge>
          </div>
          
          <div className="flex-1 flex gap-2">
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setIsExpanded(true)}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              className="flex-1"
              aria-label={`Add new task to ${config.label} quadrant`}
            />
            
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim()}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        {/* Expanded Options */}
        {isExpanded && title.trim() && (
          <div className="ml-[140px] flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Urgency:</span>
              <Badge className="text-xs" variant="outline">
                {config.urgency}/3
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <span>Importance:</span>
              <Badge className="text-xs" variant="outline">
                {config.importance}/3
              </Badge>
            </div>
            
            <div className="text-muted-foreground">
              Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to add,{' '}
              <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Esc</kbd> to cancel
            </div>
          </div>
        )}
      </form>
    </div>
  );
}