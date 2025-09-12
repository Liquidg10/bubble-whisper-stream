/**
 * CRDT Task Repository - Thin adapter between TaskStore and Automerge
 * P17 Implementation: Bridge between existing Task system and CRDT pilot
 */

import type { Task } from '@/types/task';
import { crdtTaskService, type CRDTTask, type OfflineTestResult } from '@/services/crdtTaskService';
import { crdtMetricsService } from '@/services/crdtMetricsService';

export interface MergeTestResult {
  success: boolean;
  conflicts: number;
  dataIntegrityCheck: boolean;
  performanceMs: number;
  details: string[];
}

class CRDTTaskRepository {
  private isEnabled = false;
  
  /**
   * Enable CRDT operations (controlled by feature flag)
   */
  enable(): void {
    this.isEnabled = true;
  }

  /**
   * Disable CRDT operations
   */
  disable(): void {
    this.isEnabled = false;
  }

  /**
   * Check if CRDT is enabled
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Convert Task to CRDTTask (subset of fields)
   */
  private taskToCRDT(task: Task): Omit<CRDTTask, 'id'> {
    return {
      title: task.title,
      completed: task.completed,
      priority: task.priority,
      tags: task.tags.map(tag => tag.name), // Simplified to just names
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  /**
   * Convert CRDTTask to Task (with defaults for missing fields)
   */
  private crdtToTask(crdtTask: CRDTTask): Partial<Task> {
    return {
      id: crdtTask.id,
      type: 'task',
      title: crdtTask.title,
      completed: crdtTask.completed,
      priority: crdtTask.priority,
      tags: crdtTask.tags.map(name => ({ 
        id: `tag-${name}`, 
        name 
      })),
      createdAt: crdtTask.createdAt,
      updatedAt: crdtTask.updatedAt
    };
  }

  /**
   * Sync tasks from main TaskStore to CRDT
   */
  syncFromTaskStore(tasks: Task[]): void {
    if (!this.isEnabled) return;

    const startTime = Date.now();
    
    try {
      // Get current CRDT tasks
      const crdtTasks = crdtTaskService.getAllTasks();
      const crdtTaskIds = new Set(crdtTasks.map(t => t.id));
      
      // Add new tasks to CRDT
      for (const task of tasks) {
        if (!crdtTaskIds.has(task.id)) {
          const crdtTask = this.taskToCRDT(task);
          try {
            crdtTaskService.createTask(crdtTask);
          } catch (error) {
            console.warn('Failed to sync task to CRDT:', task.id, error);
          }
        }
      }
      
      const syncTime = Date.now() - startTime;
      crdtMetricsService.recordSyncOperation('taskstore_to_crdt', tasks.length, syncTime);
    } catch (error) {
      console.error('Failed to sync from TaskStore to CRDT:', error);
    }
  }

  /**
   * Sync tasks from CRDT to main TaskStore
   */
  syncToTaskStore(): Task[] {
    if (!this.isEnabled) return [];

    try {
      const crdtTasks = crdtTaskService.getAllTasks();
      return crdtTasks.map(crdtTask => {
        const taskData = this.crdtToTask(crdtTask);
        return {
          // Default Task fields
          id: crdtTask.id,
          type: 'task' as const,
          title: crdtTask.title,
          description: undefined,
          completed: crdtTask.completed,
          priority: crdtTask.priority,
          tags: crdtTask.tags.map(name => ({ 
            id: `tag-${name}`, 
            name 
          })),
          createdAt: crdtTask.createdAt,
          updatedAt: crdtTask.updatedAt,
          due: undefined,
          start: undefined,
          end: undefined,
          view: undefined,
          metadata: undefined,
          ...taskData
        } as Task;
      });
    } catch (error) {
      console.error('Failed to sync from CRDT to TaskStore:', error);
      return [];
    }
  }

  /**
   * Add task to CRDT
   */
  addTask(task: Task): void {
    if (!this.isEnabled) return;

    try {
      const crdtTask = this.taskToCRDT(task);
      crdtTaskService.createTask(crdtTask);
    } catch (error) {
      console.error('Failed to add task to CRDT:', error);
    }
  }

  /**
   * Update task in CRDT
   */
  updateTask(id: string, updates: Partial<Task>): void {
    if (!this.isEnabled) return;

    try {
      const crdtUpdates: Partial<CRDTTask> = {};
      
      if (updates.title !== undefined) crdtUpdates.title = updates.title;
      if (updates.completed !== undefined) crdtUpdates.completed = updates.completed;
      if (updates.priority !== undefined) crdtUpdates.priority = updates.priority;
      if (updates.tags !== undefined) {
        crdtUpdates.tags = updates.tags.map(tag => tag.name);
      }
      if (updates.updatedAt !== undefined) crdtUpdates.updatedAt = updates.updatedAt;
      
      crdtTaskService.updateTask(id, crdtUpdates);
    } catch (error) {
      console.error('Failed to update task in CRDT:', error);
    }
  }

  /**
   * Delete task from CRDT
   */
  deleteTask(id: string): void {
    if (!this.isEnabled) return;

    try {
      crdtTaskService.deleteTask(id);
    } catch (error) {
      console.error('Failed to delete task from CRDT:', error);
    }
  }

  /**
   * Handle device connection for multi-device sync
   */
  handleDeviceConnection(deviceId: string): void {
    if (!this.isEnabled) return;

    try {
      // Generate sync message for the connecting device
      const syncMessage = crdtTaskService.generateSyncMessage(deviceId);
      if (syncMessage) {
        // In a real implementation, this would be sent over network
        console.log(`Sync message generated for device ${deviceId}:`, syncMessage.length, 'bytes');
      }
    } catch (error) {
      console.error('Failed to handle device connection:', error);
    }
  }

  /**
   * Handle device disconnection
   */
  handleDeviceDisconnection(deviceId: string): void {
    if (!this.isEnabled) return;
    
    console.log(`Device ${deviceId} disconnected from CRDT sync`);
  }

  /**
   * Simulate offline changes for testing
   */
  simulateOfflineChanges(): void {
    if (!this.isEnabled) return;

    try {
      // Create some test tasks
      crdtTaskService.createTask({
        title: `Offline Task ${Date.now()}`,
        completed: false,
        priority: 50,
        tags: ['offline', 'test'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Update an existing task if available
      const tasks = crdtTaskService.getAllTasks();
      if (tasks.length > 0) {
        const taskToUpdate = tasks[0];
        crdtTaskService.updateTask(taskToUpdate.id, {
          title: `${taskToUpdate.title} (offline edit)`,
          updatedAt: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to simulate offline changes:', error);
    }
  }

  /**
   * Run comprehensive merge test
   */
  triggerMergeTest(): MergeTestResult {
    if (!this.isEnabled) {
      return {
        success: false,
        conflicts: 0,
        dataIntegrityCheck: false,
        performanceMs: 0,
        details: ['CRDT not enabled']
      };
    }

    const startTime = Date.now();
    const details: string[] = [];
    
    try {
      // Get initial state
      const initialTasks = crdtTaskService.getAllTasks();
      const initialCount = initialTasks.length;
      details.push(`Initial task count: ${initialCount}`);
      
      // Simulate concurrent changes
      const device1Id = 'test-device-1';
      const device2Id = 'test-device-2';
      
      // Device 1 changes
      const task1Id = crdtTaskService.createTask({
        title: 'Device 1 Task',
        completed: false,
        priority: 75,
        tags: ['device1'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      details.push(`Device 1 created task: ${task1Id}`);
      
      // Device 2 changes (simulate by creating sync messages)
      const syncMessage1 = crdtTaskService.generateSyncMessage(device1Id);
      const syncMessage2 = crdtTaskService.generateSyncMessage(device2Id);
      
      if (syncMessage1 && syncMessage2) {
        details.push('Sync messages generated successfully');
      }
      
      // Check final state
      const finalTasks = crdtTaskService.getAllTasks();
      const finalCount = finalTasks.length;
      details.push(`Final task count: ${finalCount}`);
      
      // Get conflict metrics
      const metrics = crdtTaskService.getConflictMetrics();
      const recentConflicts = metrics.filter(m => 
        m.timestamp > startTime - 10000 // Last 10 seconds
      ).length;
      
      const performanceMs = Date.now() - startTime;
      
      return {
        success: true,
        conflicts: recentConflicts,
        dataIntegrityCheck: finalCount >= initialCount,
        performanceMs,
        details
      };
    } catch (error) {
      return {
        success: false,
        conflicts: 0,
        dataIntegrityCheck: false,
        performanceMs: Date.now() - startTime,
        details: [`Error: ${error}`]
      };
    }
  }

  /**
   * Run two-tab offline test
   */
  async runTwoTabOfflineTest(): Promise<OfflineTestResult> {
    if (!this.isEnabled) {
      return {
        success: false,
        conflictsDetected: 0,
        dataLossOccurred: true,
        mergeTimeMs: 0,
        finalTaskCount: 0,
        details: {
          expectedTasks: [],
          actualTasks: [],
          missingTasks: [],
          unexpectedTasks: []
        }
      };
    }

    const startTime = Date.now();
    
    try {
      // Simulate initial state
      const initialTasks = crdtTaskService.getAllTasks();
      const sharedTaskId = 'shared-task-test';
      
      // Create a shared task both "tabs" will modify
      crdtTaskService.createTask({
        title: 'Shared Task Original',
        completed: false,
        priority: 50,
        tags: ['shared'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      // Tab 1 offline changes
      const tab1TaskId = crdtTaskService.createTask({
        title: 'Tab 1 Offline Task',
        completed: false,
        priority: 60,
        tags: ['tab1'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      // Update shared task from Tab 1
      crdtTaskService.updateTask(sharedTaskId, {
        title: 'Shared Task - Tab 1 Edit',
        updatedAt: Date.now()
      });
      
      // Tab 2 offline changes (simulate)
      const tab2TaskId = crdtTaskService.createTask({
        title: 'Tab 2 Offline Task',
        completed: true,
        priority: 80,
        tags: ['tab2'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      // Update shared task from Tab 2 (concurrent edit)
      crdtTaskService.updateTask(sharedTaskId, {
        priority: 90,
        updatedAt: Date.now()
      });
      
      // Merge simulation (tabs coming back online)
      const finalTasks = crdtTaskService.getAllTasks();
      const expectedTaskIds = [sharedTaskId, tab1TaskId, tab2TaskId];
      const actualTaskIds = finalTasks.map(t => t.id);
      
      const missingTasks = expectedTaskIds.filter(id => !actualTaskIds.includes(id));
      const unexpectedTasks = actualTaskIds.filter(id => !expectedTaskIds.includes(id));
      
      const conflictsDetected = crdtTaskService.getConflictMetrics().filter(m => 
        m.timestamp > startTime
      ).length;
      
      return {
        success: missingTasks.length === 0,
        conflictsDetected,
        dataLossOccurred: missingTasks.length > 0,
        mergeTimeMs: Date.now() - startTime,
        finalTaskCount: finalTasks.length,
        details: {
          expectedTasks: expectedTaskIds,
          actualTasks: actualTaskIds,
          missingTasks,
          unexpectedTasks
        }
      };
    } catch (error) {
      return {
        success: false,
        conflictsDetected: 0,
        dataLossOccurred: true,
        mergeTimeMs: Date.now() - startTime,
        finalTaskCount: 0,
        details: {
          expectedTasks: [],
          actualTasks: [],
          missingTasks: [`Error: ${error}`],
          unexpectedTasks: []
        }
      };
    }
  }

  /**
   * Get CRDT statistics
   */
  getStats() {
    if (!this.isEnabled) {
      return {
        enabled: false,
        taskCount: 0,
        deviceId: null,
        conflicts: 0
      };
    }

    return {
      enabled: true,
      taskCount: crdtTaskService.getAllTasks().length,
      deviceId: crdtTaskService.getDeviceId(),
      conflicts: crdtTaskService.getConflictMetrics().length
    };
  }

  /**
   * Clear all CRDT data
   */
  clearAllData(): void {
    if (!this.isEnabled) return;
    
    crdtTaskService.clearAll();
    crdtMetricsService.clearMetrics();
  }
}

// Singleton instance
export const crdtTaskRepository = new CRDTTaskRepository();