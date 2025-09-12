/**
 * Task Calendar Auto-Write Widget
 * 
 * Displays and manages task-triggered calendar events, showing recent
 * auto-writes with undo capability and task context.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Undo2, ExternalLink, Clock, CheckCircle } from 'lucide-react';
import { taskAwareAutoWriteService, type TaskCalendarMapping } from '@/services/taskAwareAutoWriteService';
import { decisionTraceService } from '@/services/decisionTraceService';
import { usePrecisionGateUndo } from '@/hooks/usePrecisionGateUndo';
import { useTaskStore } from '@/stores/taskStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TaskCalendarAutoWriteWidgetProps {
  className?: string;
}

export function TaskCalendarAutoWriteWidget({ className }: TaskCalendarAutoWriteWidgetProps) {
  const [mappings, setMappings] = useState<TaskCalendarMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const { createTaskCalendarUndo, showUndoToast } = usePrecisionGateUndo();
  const taskStore = useTaskStore();

  // Load recent task-calendar mappings
  useEffect(() => {
    loadRecentMappings();
  }, []);

  const loadRecentMappings = () => {
    const allMappings = Array.from(taskAwareAutoWriteService.getAllMappings().values())
      .filter(mapping => mapping.eventId) // Only show successful auto-writes
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5); // Show last 5

    setMappings(allMappings);
  };

  const handleUndoTaskCalendar = async (mapping: TaskCalendarMapping) => {
    const task = taskStore.getTask(mapping.taskId);
    if (!task) {
      toast({
        title: "Undo failed",
        description: "Task not found",
        variant: "destructive"
      });
      return;
    }

    const undoAction = createTaskCalendarUndo({
      traceId: mapping.traceId,
      taskId: mapping.taskId,
      eventId: mapping.eventId,
      title: task.title
    });

    showUndoToast(undoAction);
    
    // Remove from local display immediately
    setMappings(prev => prev.filter(m => m.taskId !== mapping.taskId));
  };

  const handleViewInCalendar = (mapping: TaskCalendarMapping) => {
    // This would open the calendar event in the user's calendar app
    const calendarUrl = `https://calendar.google.com/calendar/event?eid=${mapping.eventId}`;
    window.open(calendarUrl, '_blank');
  };

  const getTaskForMapping = (mapping: TaskCalendarMapping) => {
    return taskStore.getTask(mapping.taskId);
  };

  if (mappings.length === 0) {
    return null;
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Task Calendar Auto-Writes</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Calendar events automatically created from your tasks
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            These events were auto-created because your tasks had clear timing and met safety conditions.
          </AlertDescription>
        </Alert>

        {mappings.map((mapping) => {
          const task = getTaskForMapping(mapping);
          if (!task) return null;

          return (
            <Card key={mapping.taskId} className="border-l-4 border-l-primary">
              <CardContent className="p-3">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium truncate">{task.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        {task.view?.calendar?.startTime && (
                          <span>
                            {new Date(task.view.calendar.startTime).toLocaleString()}
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs">
                          Task → Calendar
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUndoTaskCalendar(mapping)}
                      className="h-7 text-xs"
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      Undo
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewInCalendar(mapping)}
                      className="h-7 text-xs"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>

                    <div className="flex-1" />
                    
                    <span className="text-xs text-muted-foreground">
                      {new Date(mapping.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default TaskCalendarAutoWriteWidget;