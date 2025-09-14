/**
 * Calendar Page
 * 
 * Main calendar interface bringing together all calendar functionality:
 * - Calendar view with tasks
 * - Sync management
 * - Auto-write controls
 * - Health monitoring
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar as CalendarIcon, 
  Settings, 
  RotateCw, 
  Activity,
  Zap,
  Plus
} from 'lucide-react';
import { CalendarView } from '@/components/CalendarView';
import { CalendarSyncPanel } from '@/components/CalendarSyncPanel';
import { CalendarAutoWritePanel } from '@/components/CalendarAutoWritePanel';
import { CalendarHealthPanel } from '@/components/CalendarHealthPanel';
import { TaskCalendarAutoWriteWidget } from '@/components/TaskCalendarAutoWriteWidget';
import { Task } from '@/types/task';
import { useTaskStore } from '@/stores/taskStore';
import { useToast } from '@/hooks/use-toast';

export default function Calendar() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const { addTask } = useTaskStore();
  const { toast } = useToast();

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
    toast({
      title: "Task Selected",
      description: `Selected: ${task.title}`,
    });
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleCreateTask = (date: Date) => {
    const newTask: Partial<Task> = {
      id: crypto.randomUUID(),
      title: `New task for ${date.toLocaleDateString()}`,
      type: 'task',
      priority: 50,
      completed: false,
      tags: [],
      due: date.getTime(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      view: {
        calendar: {
          startTime: date.toISOString(),
          durationMin: 60
        }
      }
    };

    addTask(newTask as Task);
    
    toast({
      title: "Task Created",
      description: `Created task for ${date.toLocaleDateString()}`,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-8 w-8" />
            Calendar
          </h1>
          <p className="text-muted-foreground">
            Unified calendar view with task integration and auto-write capabilities
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleCreateTask(new Date())}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Main Calendar Interface */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Calendar View - Takes most space */}
        <div className="xl:col-span-3">
          <CalendarView
            onTaskSelect={handleTaskSelect}
            onDateSelect={handleDateSelect}
            onCreateTask={handleCreateTask}
          />
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-4">
          {/* Auto-Write Widget */}
          <TaskCalendarAutoWriteWidget />
          
          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Calendar Events</span>
                <Badge variant="outline">12</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Auto-written</span>
                <Badge variant="secondary">3</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Sync Conflicts</span>
                <Badge variant="destructive">1</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Management Tabs */}
      <Tabs defaultValue="sync" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <RotateCw className="h-4 w-4" />
            Sync Management
          </TabsTrigger>
          <TabsTrigger value="autowrite" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Auto-Write
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Health Monitor
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <CalendarSyncPanel />
        </TabsContent>

        <TabsContent value="autowrite" className="space-y-4">
          <CalendarAutoWritePanel />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <CalendarHealthPanel />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Calendar Integration Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Calendar integration settings are managed through the main Settings page.
                Use the tabs above to configure auto-write, sync, and monitoring preferences.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Selected Task Details */}
      {selectedTask && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Selected Task Details
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTask(null)}
              >
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <h4 className="font-medium">{selectedTask.title}</h4>
              {selectedTask.view?.calendar && (
                <div className="text-xs text-muted-foreground">
                  📅 {new Date(selectedTask.view.calendar.startTime).toLocaleString()}
                  {selectedTask.view.calendar.location && ` • 📍 ${selectedTask.view.calendar.location}`}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}