/**
 * Calendar View Component
 * 
 * Displays tasks in a calendar format with full calendar functionality,
 * allowing users to view, edit, and manage tasks in a time-based layout.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock,
  MapPin,
  Users,
  Settings,
  Filter
} from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { Task } from '@/types/task';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, isValid } from 'date-fns';

interface CalendarViewProps {
  className?: string;
  onTaskSelect?: (task: Task) => void;
  onDateSelect?: (date: Date) => void;
  onCreateTask?: (date: Date) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  task: Task;
  type: 'task' | 'calendar' | 'reminder';
}

export function CalendarView({ 
  className, 
  onTaskSelect, 
  onDateSelect, 
  onCreateTask 
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('week');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  const { tasks } = useTaskStore();

  // Convert tasks to calendar events
  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    
    tasks.forEach(task => {
      // Handle tasks with due dates
      if (task.due) {
        const dueDate = new Date(task.due);
        if (isValid(dueDate)) {
          events.push({
            id: `task-due-${task.id}`,
            title: `📋 ${task.title}`,
            start: dueDate,
            end: new Date(dueDate.getTime() + 60 * 60 * 1000), // 1 hour duration
            color: task.priority > 70 ? 'bg-red-100 text-red-800' : 
                   task.priority > 40 ? 'bg-yellow-100 text-yellow-800' : 
                   'bg-blue-100 text-blue-800',
            task,
            type: 'task'
          });
        }
      }
      
      // Handle tasks with calendar events
      if (task.view?.calendar?.startTime) {
        const startTime = new Date(task.view.calendar.startTime);
        const endTime = task.view.calendar.durationMin ? 
          new Date(startTime.getTime() + (task.view.calendar.durationMin * 60 * 1000)) : 
          new Date(startTime.getTime() + 60 * 60 * 1000);
          
        if (isValid(startTime)) {
          events.push({
            id: `task-calendar-${task.id}`,
            title: `📅 ${task.title}`,
            start: startTime,
            end: endTime,
            color: 'bg-green-100 text-green-800',
            task,
            type: 'calendar'
          });
        }
      }
      
      // Handle reminder tasks with due dates as reminders
      if (task.type === 'reminder' && task.due) {
        const reminderTime = new Date(task.due);
        if (isValid(reminderTime)) {
          events.push({
            id: `task-reminder-${task.id}`,
            title: `🔔 ${task.title}`,
            start: reminderTime,
            end: new Date(reminderTime.getTime() + 30 * 60 * 1000), // 30 min duration
            color: 'bg-purple-100 text-purple-800',
            task,
            type: 'reminder'
          });
        }
      }
    });
    
    return events.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [tasks]);

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return calendarEvents.filter(event => isSameDay(event.start, date));
  };

  // Get week days for week view
  const getWeekDays = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  // Navigation handlers
  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const handleEventClick = (event: CalendarEvent) => {
    onTaskSelect?.(event.task);
  };

  const handleCreateTask = (date: Date) => {
    onCreateTask?.(date);
  };

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    
    return (
      <div className="grid grid-cols-7 gap-1 h-96">
        {/* Header row */}
        {weekDays.map((day) => (
          <div key={day.toISOString()} className="border-b p-2 text-center font-medium">
            <div className="text-sm text-muted-foreground">
              {format(day, 'EEE')}
            </div>
            <div className={cn(
              "text-lg",
              isSameDay(day, new Date()) && "bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center mx-auto"
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
        
        {/* Events grid */}
        {weekDays.map((day) => {
          const dayEvents = getEventsForDate(day);
          
          return (
            <div 
              key={`events-${day.toISOString()}`} 
              className="border-r p-1 space-y-1 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleDateClick(day)}
            >
              {dayEvents.map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    "text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                    event.color
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEventClick(event);
                  }}
                  title={event.title}
                >
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{event.title}</span>
                  </div>
                  <div className="text-xs opacity-75">
                    {format(event.start, 'HH:mm')}
                  </div>
                </div>
              ))}
              
              {/* Add task button */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-6 text-xs opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateTask(day);
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMonthView = () => {
    // Month view implementation would go here
    // For now, show a calendar picker with event indicators
    return (
      <div className="flex justify-center">
        <CalendarPicker
          mode="single"
          selected={selectedDate || undefined}
          onSelect={(date) => date && handleDateClick(date)}
          month={currentDate}
          onMonthChange={setCurrentDate}
          className="rounded-md border"
          modifiers={{
            hasEvents: (date) => getEventsForDate(date).length > 0
          }}
          modifiersStyles={{
            hasEvents: {
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              borderRadius: '50%'
            }
          }}
        />
      </div>
    );
  };

  const renderDayView = () => {
    const dayEvents = getEventsForDate(currentDate);
    
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold">
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </h3>
        </div>
        
        <div className="space-y-2">
          {dayEvents.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No events for this day
            </div>
          ) : (
            dayEvents.map((event) => (
              <Card 
                key={event.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleEventClick(event)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{event.title}</h4>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                        </div>
                        {event.task.view?.calendar?.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.task.view.calendar.location}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={event.color}>
                      {event.type}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        
        <Button
          onClick={() => handleCreateTask(currentDate)}
          className="w-full"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Task for This Day
        </Button>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar View
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* View mode selector */}
            <div className="flex border rounded-md">
              {['month', 'week', 'day'].map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode(mode as any)}
                  className="rounded-none first:rounded-l-md last:rounded-r-md"
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ))}
            </div>
            
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={navigatePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-32">
                    {format(currentDate, 'MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={currentDate}
                    onSelect={(date) => date && setCurrentDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <Button variant="outline" size="sm" onClick={navigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Filters */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {showFilters && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Badge variant="outline" className="bg-blue-100 text-blue-800">
              📋 Tasks
            </Badge>
            <Badge variant="outline" className="bg-green-100 text-green-800">
              📅 Calendar
            </Badge>
            <Badge variant="outline" className="bg-purple-100 text-purple-800">
              🔔 Reminders
            </Badge>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'day' && renderDayView()}
      </CardContent>
    </Card>
  );
}