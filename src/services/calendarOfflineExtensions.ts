/**
 * Calendar Offline Extensions
 * Extends OfflineTaskQueue to handle calendar-specific operations
 */

import { offlineTaskQueue, type OfflineTask } from './offlineTaskQueue';
import { Task, TaskId } from '@/types/task';
import { decisionTraceService } from './decisionTraceService';

export interface CalendarOfflineAction {
  id: string;
  type: 'reschedule' | 'move_to_calendar' | 'move_from_pinboard' | 'bulk_reschedule';
  taskId: TaskId;
  timestamp: number;
  data: {
    // For rescheduling
    oldDateTime?: string;
    newDateTime?: string;
    oldDuration?: number;
    newDuration?: number;
    
    // For pinboard moves
    fromView?: 'pinboard' | 'calendar';
    toView?: 'pinboard' | 'calendar';
    pinboardPosition?: { x: number; y: number };
    
    // For bulk operations
    taskIds?: TaskId[];
    operation?: string;
  };
  syncStatus: 'pending' | 'syncing' | 'success' | 'conflict' | 'error';
  conflictData?: {
    localAction: CalendarOfflineAction;
    remoteAction: CalendarOfflineAction;
    conflictType: 'time_overlap' | 'concurrent_move' | 'deleted_task';
  };
}

class CalendarOfflineExtensions {
  private calendarActions: Map<string, CalendarOfflineAction> = new Map();
  private conflictCallbacks: Set<(conflicts: CalendarOfflineAction[]) => void> = new Set();

  /**
   * Queue a task reschedule operation for offline sync
   */
  async queueReschedule(
    taskId: TaskId, 
    oldDateTime: string, 
    newDateTime: string, 
    oldDuration?: number, 
    newDuration?: number
  ): Promise<void> {
    const actionId = crypto.randomUUID();
    const action: CalendarOfflineAction = {
      id: actionId,
      type: 'reschedule',
      taskId,
      timestamp: Date.now(),
      data: {
        oldDateTime,
        newDateTime,
        oldDuration,
        newDuration,
      },
      syncStatus: 'pending',
    };

    this.calendarActions.set(actionId, action);
    
    // Create decision trace for the reschedule
    decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [{ type: 'reschedule', value: { taskId, oldDateTime, newDateTime }, confidence: 0.95, source: 'user' }],
      confidenceThreshold: 0.9,
      finalConfidence: 0.95,
      decision: 'auto-write',
      action: 'calendar_reschedule_queued',
      becauseText: `Task rescheduled from ${oldDateTime} to ${newDateTime}`,
      metadata: { taskId, oldDateTime, newDateTime },
      undoable: true,
      undoId: actionId,
    });

    // If online, try to sync immediately
    if (navigator.onLine) {
      this.syncCalendarAction(action);
    }
  }

  /**
   * Queue a task move from pinboard to calendar
   */
  async queueMoveToCalendar(
    taskId: TaskId, 
    newDateTime: string, 
    duration: number,
    pinboardPosition?: { x: number; y: number }
  ): Promise<void> {
    const actionId = crypto.randomUUID();
    const action: CalendarOfflineAction = {
      id: actionId,
      type: 'move_to_calendar',
      taskId,
      timestamp: Date.now(),
      data: {
        newDateTime,
        newDuration: duration,
        fromView: 'pinboard',
        toView: 'calendar',
        pinboardPosition,
      },
      syncStatus: 'pending',
    };

    this.calendarActions.set(actionId, action);
    
    decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [{ type: 'move_to_calendar', value: { taskId, newDateTime }, confidence: 0.90, source: 'user' }],
      confidenceThreshold: 0.85,
      finalConfidence: 0.90,
      decision: 'auto-write',
      action: 'pinboard_to_calendar_queued',
      becauseText: `Task moved from pinboard to calendar at ${newDateTime}`,
      metadata: { taskId, newDateTime },
      undoable: true,
      undoId: actionId,
    });

    if (navigator.onLine) {
      this.syncCalendarAction(action);
    }
  }

  /**
   * Queue a task move from calendar back to pinboard
   */
  async queueMoveToPinboard(
    taskId: TaskId, 
    oldDateTime: string,
    pinboardPosition: { x: number; y: number }
  ): Promise<void> {
    const actionId = crypto.randomUUID();
    const action: CalendarOfflineAction = {
      id: actionId,
      type: 'move_from_pinboard',
      taskId,
      timestamp: Date.now(),
      data: {
        oldDateTime,
        fromView: 'calendar',
        toView: 'pinboard',
        pinboardPosition,
      },
      syncStatus: 'pending',
    };

    this.calendarActions.set(actionId, action);
    
    decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [{ type: 'move_to_pinboard', value: { taskId, oldDateTime }, confidence: 0.90, source: 'user' }],
      confidenceThreshold: 0.85,
      finalConfidence: 0.90,
      decision: 'auto-write',
      action: 'calendar_to_pinboard_queued',
      becauseText: `Task moved from calendar back to pinboard`,
      metadata: { taskId, oldDateTime },
      undoable: true,
      undoId: actionId,
    });

    if (navigator.onLine) {
      this.syncCalendarAction(action);
    }
  }

  /**
   * Queue bulk reschedule operations
   */
  async queueBulkReschedule(
    taskIds: TaskId[], 
    operation: string,
    data: Record<string, any>
  ): Promise<void> {
    const actionId = crypto.randomUUID();
    const action: CalendarOfflineAction = {
      id: actionId,
      type: 'bulk_reschedule',
      taskId: taskIds[0], // Primary task for reference
      timestamp: Date.now(),
      data: {
        taskIds,
        operation,
        ...data,
      },
      syncStatus: 'pending',
    };

    this.calendarActions.set(actionId, action);
    
    decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [{ type: 'bulk_reschedule', value: { taskIds, operation }, confidence: 0.85, source: 'user' }],
      confidenceThreshold: 0.80,
      finalConfidence: 0.85,
      decision: 'auto-write',
      action: 'bulk_reschedule_queued',
      becauseText: `Bulk operation "${operation}" queued for ${taskIds.length} tasks`,
      metadata: { taskIds, operation },
      undoable: true,
      undoId: actionId,
    });

    if (navigator.onLine) {
      this.syncCalendarAction(action);
    }
  }

  /**
   * Sync a calendar action to the server
   */
  private async syncCalendarAction(action: CalendarOfflineAction): Promise<void> {
    try {
      action.syncStatus = 'syncing';
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      // Simulate potential conflicts (5% chance)
      if (Math.random() < 0.05) {
        this.handleSyncConflict(action);
        return;
      }
      
      action.syncStatus = 'success';
      this.calendarActions.delete(action.id);
      
    } catch (error) {
      action.syncStatus = 'error';
      console.error('Calendar sync failed:', error);
    }
  }

  /**
   * Handle sync conflicts
   */
  private handleSyncConflict(localAction: CalendarOfflineAction): void {
    // Simulate a conflicting remote action
    const remoteAction: CalendarOfflineAction = {
      ...localAction,
      id: crypto.randomUUID(),
      timestamp: localAction.timestamp + 1000, // Slightly later
      data: {
        ...localAction.data,
        newDateTime: localAction.data.newDateTime + '_REMOTE_MODIFIED',
      },
    };

    localAction.syncStatus = 'conflict';
    localAction.conflictData = {
      localAction,
      remoteAction,
      conflictType: localAction.type === 'reschedule' ? 'time_overlap' : 'concurrent_move',
    };

    // Notify conflict resolution UI
    this.notifyConflicts();
  }

  /**
   * Resolve a calendar sync conflict
   */
  async resolveConflict(
    actionId: string, 
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> {
    const action = this.calendarActions.get(actionId);
    if (!action || !action.conflictData) return;

    switch (resolution) {
      case 'local':
        // Keep local version, force sync
        action.syncStatus = 'pending';
        delete action.conflictData;
        await this.syncCalendarAction(action);
        break;
        
      case 'remote':
        // Accept remote version
        action.data = action.conflictData.remoteAction.data;
        action.syncStatus = 'success';
        delete action.conflictData;
        this.calendarActions.delete(actionId);
        break;
        
      case 'merge':
        // Create merged version (implementation specific)
        const mergedData = this.mergeActionData(
          action.conflictData.localAction.data,
          action.conflictData.remoteAction.data
        );
        action.data = mergedData;
        action.syncStatus = 'pending';
        delete action.conflictData;
        await this.syncCalendarAction(action);
        break;
    }

    this.notifyConflicts();
  }

  /**
   * Merge conflicting action data
   */
  private mergeActionData(localData: any, remoteData: any): any {
    // Simple merge strategy - prefer remote for time conflicts
    return {
      ...localData,
      newDateTime: remoteData.newDateTime,
      newDuration: remoteData.newDuration || localData.newDuration,
    };
  }

  /**
   * Get all pending calendar actions
   */
  getPendingActions(): CalendarOfflineAction[] {
    return Array.from(this.calendarActions.values())
      .filter(action => action.syncStatus === 'pending');
  }

  /**
   * Get all conflicted calendar actions
   */
  getConflicts(): CalendarOfflineAction[] {
    return Array.from(this.calendarActions.values())
      .filter(action => action.syncStatus === 'conflict');
  }

  /**
   * Subscribe to conflict notifications
   */
  onConflictsChange(callback: (conflicts: CalendarOfflineAction[]) => void): () => void {
    this.conflictCallbacks.add(callback);
    return () => this.conflictCallbacks.delete(callback);
  }

  /**
   * Notify all conflict callbacks
   */
  private notifyConflicts(): void {
    const conflicts = this.getConflicts();
    this.conflictCallbacks.forEach(callback => callback(conflicts));
  }

  // Undo methods for decision tracing

  private async undoReschedule(actionId: string): Promise<void> {
    const action = this.calendarActions.get(actionId);
    if (action && action.data.oldDateTime) {
      await this.queueReschedule(
        action.taskId,
        action.data.newDateTime!,
        action.data.oldDateTime,
        action.data.newDuration,
        action.data.oldDuration
      );
    }
    this.calendarActions.delete(actionId);
  }

  private async undoMoveToCalendar(actionId: string): Promise<void> {
    const action = this.calendarActions.get(actionId);
    if (action && action.data.pinboardPosition) {
      await this.queueMoveToPinboard(
        action.taskId,
        action.data.newDateTime!,
        action.data.pinboardPosition
      );
    }
    this.calendarActions.delete(actionId);
  }

  private async undoMoveToPinboard(actionId: string): Promise<void> {
    const action = this.calendarActions.get(actionId);
    if (action && action.data.oldDateTime) {
      await this.queueMoveToCalendar(
        action.taskId,
        action.data.oldDateTime,
        action.data.newDuration || 60,
        action.data.pinboardPosition
      );
    }
    this.calendarActions.delete(actionId);
  }

  private async undoBulkReschedule(actionId: string): Promise<void> {
    // Bulk undo implementation would depend on the specific operation
    this.calendarActions.delete(actionId);
  }
}

export const calendarOfflineExtensions = new CalendarOfflineExtensions();
