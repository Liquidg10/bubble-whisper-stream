/**
 * Task Auto-Write Demo Page
 * 
 * Demonstrates the P12 Task-Aware Auto-Write Ladder functionality
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, Check, X, Zap } from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';
import { taskCalendarAdapter } from '@/services/taskCalendarAdapter';
import { createTask } from '@/types/task';
import { toast } from '@/hooks/use-toast';
import { TaskCalendarAutoWriteWidget } from '@/components/TaskCalendarAutoWriteWidget';
import { TaskEmailAutoWriteWidget } from '@/components/TaskEmailAutoWriteWidget';
import { EmailAutoWriteWidget } from '@/components/EmailAutoWriteWidget';
import { TaskEmailDemoCard } from '@/components/TaskEmailDemoCard';

export function TaskAutoWriteDemo() {
  const [taskTitle, setTaskTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const taskStore = useTaskStore();

  const handleCreateTaskWithCalendar = async () => {
    if (!taskTitle.trim() || !startTime.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide both a task title and start time",
        variant: "destructive"
      });
      return;
    }

    setIsEvaluating(true);

    try {
      // Create task with calendar metadata
      const newTaskData = {
        type: 'task' as const,
        title: taskTitle,
        completed: false,
        priority: 70,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        view: {
          calendar: {
            startTime: new Date(startTime).toISOString(),
            durationMin: 60,
            location: location || undefined,
            attendees: [], // No attendees for green conditions
            calendarId: 'primary'
          }
        }
      };

      // Add task to store (this will trigger auto-write evaluation)
      await taskStore.addTask(newTaskData);

      toast({
        title: "Task created",
        description: "Auto-write evaluation has been triggered",
      });

      // Clear form
      setTaskTitle('');
      setStartTime('');
      setLocation('');

    } catch (error) {
      toast({
        title: "Failed to create task",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTestGreenConditions = () => {
    if (!taskTitle.trim() || !startTime.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide both a task title and start time",
        variant: "destructive"
      });
      return;
    }

    const testTask = {
      id: 'test',
      type: 'task' as const,
      title: taskTitle,
      completed: false,
      priority: 70,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      view: {
        calendar: {
          startTime: new Date(startTime).toISOString(),
          location: location || undefined,
          attendees: [], // No attendees for testing
          calendarId: 'primary'
        }
      }
    };

    const validation = taskCalendarAdapter.validateGreenConditions(testTask);
    
    toast({
      title: validation.isValid ? "Green conditions ✅" : "Green conditions ❌",
      description: validation.isValid 
        ? `Confidence: ${Math.round(validation.confidence * 100)}%`
        : `Violations: ${validation.violations.join(', ')}`,
      variant: validation.isValid ? "default" : "destructive"
    });
  };

  // Get default datetime (1 hour from now)
  const defaultDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Task Auto-Write Demo</h1>
        <p className="text-muted-foreground">
          Demonstrates P12 Task-Aware Auto-Write Ladder functionality
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Task Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Create Task with Calendar
            </CardTitle>
            <CardDescription>
              Create a task with calendar information to trigger auto-write evaluation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Task Title</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Dentist appointment"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                defaultValue={defaultDateTime}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location (Optional)</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="123 Main St"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateTaskWithCalendar}
                disabled={isEvaluating}
                className="flex-1"
              >
                {isEvaluating ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Create & Auto-Write
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleTestGreenConditions}
                disabled={isEvaluating}
              >
                Test Conditions
              </Button>
            </div>

            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Green Conditions:</strong> Self-owned calendar, next 14 days, no external attendees, confidence ≥85%
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Auto-Write Status */}
        <Card>
          <CardHeader>
            <CardTitle>Auto-Write Ladder</CardTitle>
            <CardDescription>
              How the system evaluates tasks for calendar auto-write
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-500">≥85%</Badge>
                <div className="text-sm">
                  <div className="font-medium">Auto-Write</div>
                  <div className="text-muted-foreground">Creates calendar event immediately</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-yellow-500">60-84%</Badge>
                <div className="text-sm">
                  <div className="font-medium">Draft</div>
                  <div className="text-muted-foreground">Creates draft for review</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant="outline">{'<60%'}</Badge>
                <div className="text-sm">
                  <div className="font-medium">Suggest</div>
                  <div className="text-muted-foreground">Shows suggestion bubble</div>
                </div>
              </div>
            </div>

            <Alert>
              <X className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Safety Gates:</strong> External attendees, past dates, or {'>14'} days away force "suggest" mode
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Recent Auto-Write Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskCalendarAutoWriteWidget />
        <TaskEmailAutoWriteWidget />
      </div>
      
      {/* Email Drafts Widget */}
      <EmailAutoWriteWidget />
    </div>
  );
}

export default TaskAutoWriteDemo;