/**
 * Calendar Task Sync Manager
 * 
 * Handles bi-directional synchronization between tasks and calendar events,
 * ensuring consistency and preventing conflicts.
 */

import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore } from '@/stores/taskStore';
import { taskCalendarAdapter } from './taskCalendarAdapter';
import { calendarWriteService } from './calendarWriteService';
import { decisionTraceService } from './decisionTraceService';
import { logger } from '@/utils/logger';

export interface CalendarTaskMapping {
  taskId: string;
  eventId: string;
  calendarAccountId: string;
  lastSyncedAt: number;
  syncDirection: 'task-to-calendar' | 'calendar-to-task' | 'bidirectional';
  conflictStatus: 'none' | 'resolved' | 'pending';
}

export interface SyncConflict {
  id: string;
  taskId: string;
  eventId: string;
  conflictType: 'time' | 'title' | 'location' | 'description';
  taskValue: any;
  calendarValue: any;
  timestamp: number;
  resolution?: 'prefer-task' | 'prefer-calendar' | 'merge' | 'manual';
}

class CalendarTaskSyncManager {
  private mappings = new Map<string, CalendarTaskMapping>();
  private conflicts = new Map<string, SyncConflict>();
  private syncInProgress = false;

  constructor() {
    this.loadMappings();
    this.setupSyncInterval();
  }

  /**
   * Sync a task to calendar
   */
  async syncTaskToCalendar(task: Task): Promise<{ success: boolean; eventId?: string; conflictId?: string }> {
    try {
      // Check if task already has calendar mapping
      const existingMapping = this.getMappingByTaskId(task.id);
      
      if (existingMapping) {
        return await this.updateCalendarEvent(task, existingMapping);
      } else {
        return await this.createCalendarEvent(task);
      }
    } catch (error) {
      logger.error('Failed to sync task to calendar:', error);
      return { success: false };
    }
  }

  /**
   * Sync calendar event to task
   */
  async syncCalendarToTask(eventId: string, eventData: any): Promise<{ success: boolean; taskId?: string; conflictId?: string }> {
    try {
      // Check if event already has task mapping
      const existingMapping = this.getMappingByEventId(eventId);
      
      if (existingMapping) {
        return await this.updateTaskFromCalendar(eventData, existingMapping);
      } else {
        return await this.createTaskFromCalendar(eventData);
      }
    } catch (error) {
      logger.error('Failed to sync calendar to task:', error);
      return { success: false };
    }
  }

  /**
   * Perform full bidirectional sync
   */
  async performFullSync(): Promise<{ 
    tasksProcessed: number; 
    eventsProcessed: number; 
    conflictsDetected: number; 
    errors: string[] 
  }> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const result = {
      tasksProcessed: 0,
      eventsProcessed: 0,
      conflictsDetected: 0,
      errors: []
    };

    try {
      // Get all tasks with calendar data
      const taskStore = useTaskStore.getState();
      const tasksWithCalendar = taskStore.tasks.filter(task => 
        task.view?.calendar || task.due || task.type === 'event'
      );

      // Sync tasks to calendar
      for (const task of tasksWithCalendar) {
        try {
          const syncResult = await this.syncTaskToCalendar(task);
          result.tasksProcessed++;
          
          if (syncResult.conflictId) {
            result.conflictsDetected++;
          }
        } catch (error: any) {
          result.errors.push(`Task ${task.id}: ${error.message}`);
        }
      }

      // Get all calendar events
      const { data: calendarEvents } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

      // Sync calendar events to tasks
      if (calendarEvents) {
        for (const event of calendarEvents) {
          try {
            const syncResult = await this.syncCalendarToTask(event.external_event_id, event);
            result.eventsProcessed++;
            
            if (syncResult.conflictId) {
              result.conflictsDetected++;
            }
          } catch (error: any) {
            result.errors.push(`Event ${event.external_event_id}: ${error.message}`);
          }
        }
      }

      // Clean up orphaned mappings
      await this.cleanupOrphanedMappings();

      return result;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Resolve a sync conflict
   */
  async resolveConflict(
    conflictId: string, 
    resolution: 'prefer-task' | 'prefer-calendar' | 'merge' | 'manual',
    manualValues?: any
  ): Promise<boolean> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error('Conflict not found');
    }

    try {
      const mapping = this.getMappingByTaskId(conflict.taskId);
      if (!mapping) {
        throw new Error('Task mapping not found');
      }

      const taskStore = useTaskStore.getState();
      const task = taskStore.getTask(conflict.taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      switch (resolution) {
        case 'prefer-task':
          // Update calendar event with task data
          await this.forceUpdateCalendarEvent(task, mapping);
          break;
          
        case 'prefer-calendar':
          // Update task with calendar data
          await this.forceUpdateTaskFromCalendar(conflict.calendarValue, mapping);
          break;
          
        case 'merge':
          // Merge values intelligently
          await this.mergeTaskAndCalendar(task, conflict.calendarValue, mapping);
          break;
          
        case 'manual':
          // Apply manual values
          if (manualValues) {
            await this.applyManualResolution(task, manualValues, mapping);
          }
          break;
      }

      // Mark conflict as resolved
      conflict.resolution = resolution;
      this.conflicts.set(conflictId, conflict);
      this.saveConflicts();

      // Create decision trace
      decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [{
          type: 'conflict_resolution',
          value: resolution,
          confidence: 1.0,
          source: 'user_decision'
        }],
        confidenceThreshold: 1.0,
        finalConfidence: 1.0,
        decision: 'auto-write',
        action: `Resolved ${conflict.conflictType} conflict between task and calendar`,
        becauseText: `User chose to ${resolution.replace('-', ' ')}`,
        metadata: { conflictId, taskId: conflict.taskId, eventId: conflict.eventId },
        undoable: true
      });

      return true;
    } catch (error) {
      logger.error('Failed to resolve conflict:', error);
      return false;
    }
  }

  /**
   * Get all pending conflicts
   */
  getPendingConflicts(): SyncConflict[] {
    return Array.from(this.conflicts.values())
      .filter(conflict => !conflict.resolution);
  }

  /**
   * Get mapping by task ID
   */
  getMappingByTaskId(taskId: string): CalendarTaskMapping | undefined {
    return Array.from(this.mappings.values())
      .find(mapping => mapping.taskId === taskId);
  }

  /**
   * Get mapping by event ID
   */
  getMappingByEventId(eventId: string): CalendarTaskMapping | undefined {
    return Array.from(this.mappings.values())
      .find(mapping => mapping.eventId === eventId);
  }

  /**
   * Remove mapping
   */
  async removeMapping(taskId: string, eventId?: string): Promise<boolean> {
    try {
      const mapping = eventId ? 
        this.getMappingByEventId(eventId) : 
        this.getMappingByTaskId(taskId);
        
      if (mapping) {
        this.mappings.delete(`${mapping.taskId}-${mapping.eventId}`);
        this.saveMappings();
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to remove mapping:', error);
      return false;
    }
  }

  /**
   * Private methods
   */
  private async createCalendarEvent(task: Task): Promise<{ success: boolean; eventId?: string; conflictId?: string }> {
    const validation = taskCalendarAdapter.validateGreenConditions(task);
    if (!validation.isValid) {
      return { success: false };
    }

    const intent = taskCalendarAdapter.createCalendarIntent(task);
    if (!intent) {
      return { success: false };
    }

    const calendarAccount = await this.getActiveCalendarAccount();
    if (!calendarAccount) {
      throw new Error('No active calendar account');
    }

    const eventData = this.formatEventData(task);
    const draft = await calendarWriteService.createEventDraft(calendarAccount.id, eventData);
    const result = await calendarWriteService.confirmDraft(draft.id);

    if (result.error) {
      throw new Error(result.error.message);
    }

    // Create mapping
    const mapping: CalendarTaskMapping = {
      taskId: task.id,
      eventId: result.data.id,
      calendarAccountId: calendarAccount.id,
      lastSyncedAt: Date.now(),
      syncDirection: 'task-to-calendar',
      conflictStatus: 'none'
    };

    this.mappings.set(`${task.id}-${result.data.id}`, mapping);
    this.saveMappings();

    return { success: true, eventId: result.data.id };
  }

  private async updateCalendarEvent(task: Task, mapping: CalendarTaskMapping): Promise<{ success: boolean; eventId?: string; conflictId?: string }> {
    // Check for conflicts
    const { data: currentEvent } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('external_event_id', mapping.eventId)
      .single();

    if (currentEvent) {
      const conflict = this.detectConflicts(task, currentEvent);
      if (conflict) {
        const conflictId = this.createConflict(task.id, mapping.eventId, conflict);
        return { success: false, conflictId };
      }
    }

    // Update the calendar event
    const eventData = this.formatEventData(task);
    const { error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'update_event',
        calendarAccountId: mapping.calendarAccountId,
        eventId: mapping.eventId,
        eventData
      }
    });

    if (error) {
      throw new Error(error.message);
    }

    // Update mapping timestamp
    mapping.lastSyncedAt = Date.now();
    this.mappings.set(`${task.id}-${mapping.eventId}`, mapping);
    this.saveMappings();

    return { success: true, eventId: mapping.eventId };
  }

  private async createTaskFromCalendar(eventData: any): Promise<{ success: boolean; taskId?: string; conflictId?: string }> {
    const taskStore = useTaskStore.getState();
    
    const newTask: Partial<Task> = {
      id: crypto.randomUUID(),
      title: eventData.title || eventData.summary,
      type: 'event',
      priority: 50,
      completed: false,
      tags: [{ id: 'calendar', name: 'Calendar' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      view: {
        calendar: {
          startTime: eventData.start_time,
          durationMin: 60,
          location: eventData.location,
          attendees: eventData.attendees || [],
          calendarId: eventData.calendar_account_id
        }
      }
    };

    await taskStore.addTask(newTask as Task);

    // Create mapping
    const mapping: CalendarTaskMapping = {
      taskId: newTask.id!,
      eventId: eventData.external_event_id,
      calendarAccountId: eventData.calendar_account_id,
      lastSyncedAt: Date.now(),
      syncDirection: 'calendar-to-task',
      conflictStatus: 'none'
    };

    this.mappings.set(`${newTask.id}-${eventData.external_event_id}`, mapping);
    this.saveMappings();

    return { success: true, taskId: newTask.id! };
  }

  private async updateTaskFromCalendar(eventData: any, mapping: CalendarTaskMapping): Promise<{ success: boolean; taskId?: string; conflictId?: string }> {
    const taskStore = useTaskStore.getState();
    const task = taskStore.getTask(mapping.taskId);
    
    if (!task) {
      throw new Error('Task not found');
    }

    // Check for conflicts
    const conflict = this.detectConflicts(task, eventData);
    if (conflict) {
      const conflictId = this.createConflict(task.id, mapping.eventId, conflict);
      return { success: false, conflictId };
    }

    // Update task
    const updatedTask: Task = {
      ...task,
      title: eventData.title || eventData.summary || task.title,
      updatedAt: Date.now(),
      view: {
        ...task.view,
        calendar: {
          ...task.view?.calendar,
          startTime: eventData.start_time,
          durationMin: 60,
          location: eventData.location,
          attendees: eventData.attendees || []
        }
      }
    };

    await taskStore.updateTask(updatedTask.id, updatedTask);

    // Update mapping timestamp
    mapping.lastSyncedAt = Date.now();
    this.mappings.set(`${task.id}-${mapping.eventId}`, mapping);
    this.saveMappings();

    return { success: true, taskId: task.id };
  }

  private detectConflicts(task: Task, eventData: any): { type: string; taskValue: any; calendarValue: any } | null {
    // Check title conflict
    const taskTitle = task.title.trim();
    const calendarTitle = (eventData.title || eventData.summary || '').trim();
    if (taskTitle !== calendarTitle && taskTitle && calendarTitle) {
      return {
        type: 'title',
        taskValue: taskTitle,
        calendarValue: calendarTitle
      };
    }

    // Check time conflict
    const taskStartTime = task.view?.calendar?.startTime;
    const calendarStartTime = eventData.start_time;
    if (taskStartTime && calendarStartTime && 
        new Date(taskStartTime).getTime() !== new Date(calendarStartTime).getTime()) {
      return {
        type: 'time',
        taskValue: taskStartTime,
        calendarValue: calendarStartTime
      };
    }

    // Check location conflict
    const taskLocation = task.view?.calendar?.location || '';
    const calendarLocation = eventData.location || '';
    if (taskLocation !== calendarLocation && taskLocation && calendarLocation) {
      return {
        type: 'location',
        taskValue: taskLocation,
        calendarValue: calendarLocation
      };
    }

    return null;
  }

  private createConflict(taskId: string, eventId: string, conflict: any): string {
    const conflictId = crypto.randomUUID();
    const syncConflict: SyncConflict = {
      id: conflictId,
      taskId,
      eventId,
      conflictType: conflict.type,
      taskValue: conflict.taskValue,
      calendarValue: conflict.calendarValue,
      timestamp: Date.now()
    };

    this.conflicts.set(conflictId, syncConflict);
    this.saveConflicts();
    
    return conflictId;
  }

  private formatEventData(task: Task): any {
    const startTime = task.view?.calendar?.startTime || (task.due ? new Date(task.due).toISOString() : undefined);
    const durationMin = task.view?.calendar?.durationMin || 60;
    const endTime = startTime ? 
      new Date(new Date(startTime).getTime() + durationMin * 60 * 1000).toISOString() : 
      undefined;
      
    return {
      title: task.title,
      location: task.view?.calendar?.location,
      startTime,
      endTime,
      attendees: task.view?.calendar?.attendees || []
    };
  }

  private async getActiveCalendarAccount(): Promise<any> {
    const { data: accounts } = await supabase
      .from('calendar_accounts')
      .select('*')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .eq('sync_enabled', true)
      .limit(1);

    return accounts?.[0];
  }

  private async forceUpdateCalendarEvent(task: Task, mapping: CalendarTaskMapping): Promise<void> {
    const eventData = this.formatEventData(task);
    await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'update_event',
        calendarAccountId: mapping.calendarAccountId,
        eventId: mapping.eventId,
        eventData
      }
    });
  }

  private async forceUpdateTaskFromCalendar(eventData: any, mapping: CalendarTaskMapping): Promise<void> {
    const taskStore = useTaskStore.getState();
    const task = taskStore.getTask(mapping.taskId);
    
    if (task) {
      const updatedTask: Task = {
        ...task,
        title: eventData.title || eventData.summary || task.title,
        updatedAt: Date.now(),
        view: {
          ...task.view,
          calendar: {
            ...task.view?.calendar,
            startTime: eventData.start_time,
            durationMin: 60,
            location: eventData.location,
            attendees: eventData.attendees || []
          }
        }
      };

      await taskStore.updateTask(updatedTask.id, updatedTask);
    }
  }

  private async mergeTaskAndCalendar(task: Task, eventData: any, mapping: CalendarTaskMapping): Promise<void> {
    // Intelligent merge logic - prefer more recent updates
    const taskUpdatedAt = task.updatedAt;
    const eventUpdatedAt = new Date(eventData.updated_at || eventData.last_synced_at).getTime();

    const mergedData = {
      title: taskUpdatedAt > eventUpdatedAt ? task.title : (eventData.title || eventData.summary),
      startTime: eventUpdatedAt > taskUpdatedAt ? eventData.start_time : task.view?.calendar?.startTime,
      durationMin: 60,
      location: eventData.location || task.view?.calendar?.location // Prefer calendar location
    };

    // Update both task and calendar with merged data
    await this.forceUpdateTaskFromCalendar(mergedData, mapping);
    await this.forceUpdateCalendarEvent({
      ...task,
      title: mergedData.title,
      view: {
        ...task.view,
        calendar: {
          ...task.view?.calendar,
          startTime: mergedData.startTime,
          durationMin: mergedData.durationMin,
          location: mergedData.location
        }
      }
    } as Task, mapping);
  }

  private async applyManualResolution(task: Task, manualValues: any, mapping: CalendarTaskMapping): Promise<void> {
    // Apply user-provided manual values
    const updatedTask: Task = {
      ...task,
      ...manualValues,
      updatedAt: Date.now()
    };

    await this.forceUpdateTaskFromCalendar(manualValues, mapping);
    await this.forceUpdateCalendarEvent(updatedTask, mapping);
  }

  private async cleanupOrphanedMappings(): Promise<void> {
    const taskStore = useTaskStore.getState();
    const validTaskIds = new Set(taskStore.tasks.map(t => t.id));
    
    const { data: validEventIds } = await supabase
      .from('calendar_events')
      .select('external_event_id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
    
    const validEventIdSet = new Set(validEventIds?.map(e => e.external_event_id) || []);

    for (const [key, mapping] of this.mappings.entries()) {
      if (!validTaskIds.has(mapping.taskId) || !validEventIdSet.has(mapping.eventId)) {
        this.mappings.delete(key);
      }
    }

    this.saveMappings();
  }

  private setupSyncInterval(): void {
    // Set up periodic sync every 15 minutes
    setInterval(() => {
      if (!this.syncInProgress) {
        this.performIncrementalSync();
      }
    }, 15 * 60 * 1000);
  }

  private async performIncrementalSync(): Promise<void> {
    try {
      // Only sync recently updated items
      const recentThreshold = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
      
      const taskStore = useTaskStore.getState();
      const recentTasks = taskStore.tasks.filter(task => 
        task.updatedAt > recentThreshold && (task.view?.calendar || task.due)
      );

      for (const task of recentTasks) {
        await this.syncTaskToCalendar(task);
      }
    } catch (error) {
      logger.error('Incremental sync failed:', error);
    }
  }

  private loadMappings(): void {
    try {
      const stored = localStorage.getItem('calendar-task-mappings');
      if (stored) {
        const data = JSON.parse(stored);
        this.mappings = new Map(Object.entries(data));
      }
    } catch (error) {
      logger.error('Failed to load mappings:', error);
    }
  }

  private saveMappings(): void {
    try {
      const data = Object.fromEntries(this.mappings);
      localStorage.setItem('calendar-task-mappings', JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to save mappings:', error);
    }
  }

  private loadConflicts(): void {
    try {
      const stored = localStorage.getItem('calendar-task-conflicts');
      if (stored) {
        const data = JSON.parse(stored);
        this.conflicts = new Map(Object.entries(data));
      }
    } catch (error) {
      logger.error('Failed to load conflicts:', error);
    }
  }

  private saveConflicts(): void {
    try {
      const data = Object.fromEntries(this.conflicts);
      localStorage.setItem('calendar-task-conflicts', JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to save conflicts:', error);
    }
  }
}

export const calendarTaskSyncManager = new CalendarTaskSyncManager();