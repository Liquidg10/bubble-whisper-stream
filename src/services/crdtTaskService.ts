/**
 * CRDT Task Service - Automerge-based local-first task management
 * P17 Implementation: Optional CRDT pilot for measuring merge reliability
 */

import * as Automerge from '@automerge/automerge';
import type { Task } from '@/types/task';

export interface CRDTTask {
  id: string;
  title: string;
  completed: boolean;
  priority: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CRDTDocument extends Record<string, unknown> {
  tasks: { [id: string]: CRDTTask };
  metadata: {
    deviceId: string;
    lastSyncAt: number;
  };
}

export interface ConflictMetric {
  id: string;
  timestamp: number;
  deviceId: string;
  conflictType: 'concurrent_edit' | 'delete_update' | 'priority_conflict' | 'title_conflict';
  entityId: string;
  resolutionMethod: 'automerge' | 'last_write_wins' | 'manual';
  resolutionTimeMs: number;
  dataLossOccurred: boolean;
  preConflictState: any;
  postConflictState: any;
}

export interface MergeReliabilityReport {
  totalConflicts: number;
  autoResolvedConflicts: number;
  dataLossEvents: number;
  averageResolutionTime: number;
  conflictsByType: Record<string, number>;
  reliabilityScore: number; // 0-1 based on successful auto-resolutions
}

export interface OfflineTestResult {
  success: boolean;
  conflictsDetected: number;
  dataLossOccurred: boolean;
  mergeTimeMs: number;
  finalTaskCount: number;
  details: {
    expectedTasks: string[];
    actualTasks: string[];
    missingTasks: string[];
    unexpectedTasks: string[];
  };
}

class CRDTTaskService {
  private doc: Automerge.Doc<CRDTDocument>;
  private syncStates: Map<string, Automerge.SyncState> = new Map();
  private conflictMetrics: ConflictMetric[] = [];
  private deviceId: string;
  private storageKey = 'crdt-tasks-doc';

  constructor() {
    this.deviceId = this.generateDeviceId();
    this.initializeDocument();
    this.loadFromLocalStorage();
  }

  private generateDeviceId(): string {
    let deviceId = localStorage.getItem('crdt-device-id');
    if (!deviceId) {
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('crdt-device-id', deviceId);
    }
    return deviceId;
  }

  /**
   * Initialize empty Automerge document
   */
  initializeDocument(): void {
    this.doc = Automerge.from<CRDTDocument>({
      tasks: {},
      metadata: {
        deviceId: this.deviceId,
        lastSyncAt: Date.now()
      }
    });
  }

  /**
   * Create a new task using Automerge
   */
  createTask(task: Omit<CRDTTask, 'id'>): string {
    const startTime = Date.now();
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.doc = Automerge.change(this.doc, doc => {
        doc.tasks[taskId] = {
          id: taskId,
          ...task,
          updatedAt: Date.now()
        };
        doc.metadata.lastSyncAt = Date.now();
      });
      
      this.saveToLocalStorage();
      return taskId;
    } catch (error) {
      this.recordConflict({
        id: `conflict-${Date.now()}`,
        timestamp: Date.now(),
        deviceId: this.deviceId,
        conflictType: 'concurrent_edit',
        entityId: taskId,
        resolutionMethod: 'automerge',
        resolutionTimeMs: Date.now() - startTime,
        dataLossOccurred: true,
        preConflictState: task,
        postConflictState: null
      });
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  updateTask(id: string, updates: Partial<CRDTTask>): void {
    const startTime = Date.now();
    const preState = this.doc.tasks[id];
    
    try {
      this.doc = Automerge.change(this.doc, doc => {
        if (doc.tasks[id]) {
          Object.assign(doc.tasks[id], {
            ...updates,
            updatedAt: Date.now()
          });
          doc.metadata.lastSyncAt = Date.now();
        }
      });
      
      this.saveToLocalStorage();
    } catch (error) {
      this.recordConflict({
        id: `conflict-${Date.now()}`,
        timestamp: Date.now(),
        deviceId: this.deviceId,
        conflictType: 'concurrent_edit',
        entityId: id,
        resolutionMethod: 'automerge',
        resolutionTimeMs: Date.now() - startTime,
        dataLossOccurred: false, // Automerge should handle this
        preConflictState: preState,
        postConflictState: this.doc.tasks[id]
      });
      throw error;
    }
  }

  /**
   * Delete a task
   */
  deleteTask(id: string): void {
    const startTime = Date.now();
    const preState = this.doc.tasks[id];
    
    try {
      this.doc = Automerge.change(this.doc, doc => {
        delete doc.tasks[id];
        doc.metadata.lastSyncAt = Date.now();
      });
      
      this.saveToLocalStorage();
    } catch (error) {
      this.recordConflict({
        id: `conflict-${Date.now()}`,
        timestamp: Date.now(),
        deviceId: this.deviceId,
        conflictType: 'delete_update',
        entityId: id,
        resolutionMethod: 'automerge',
        resolutionTimeMs: Date.now() - startTime,
        dataLossOccurred: true,
        preConflictState: preState,
        postConflictState: null
      });
      throw error;
    }
  }

  /**
   * Get a single task
   */
  getTask(id: string): CRDTTask | undefined {
    return this.doc.tasks[id];
  }

  /**
   * Get all tasks
   */
  getAllTasks(): CRDTTask[] {
    return Object.values(this.doc.tasks);
  }

  /**
   * Generate sync message for another device
   */
  generateSyncMessage(targetDeviceId?: string): Uint8Array | null {
    try {
      if (!targetDeviceId) {
        // Full document sync
        return Automerge.save(this.doc);
      }
      
      // Incremental sync if we have sync state
      const existingSyncState = this.syncStates.get(targetDeviceId);
      if (existingSyncState) {
        const [newSyncState, message] = Automerge.generateSyncMessage(this.doc, existingSyncState);
        this.syncStates.set(targetDeviceId, newSyncState);
        return message;
      }
      
      // Initialize sync state
      const [initialSyncState, message] = Automerge.generateSyncMessage(this.doc, Automerge.initSyncState());
      this.syncStates.set(targetDeviceId, initialSyncState);
      return message;
    } catch (error) {
      console.error('Failed to generate sync message:', error);
      return null;
    }
  }

  /**
   * Receive and apply sync message from another device
   */
  receiveSyncMessage(message: Uint8Array, fromDeviceId: string): void {
    const startTime = Date.now();
    const preTaskCount = Object.keys(this.doc.tasks).length;
    
    try {
      let currentSyncState = this.syncStates.get(fromDeviceId) || Automerge.initSyncState();
      
      // Apply the sync message
      const [newDoc, newSyncState] = Automerge.receiveSyncMessage(
        this.doc,
        currentSyncState,
        message
      );
      
      this.doc = newDoc;
      this.syncStates.set(fromDeviceId, newSyncState);
      
      // Record merge metrics
      const postTaskCount = Object.keys(this.doc.tasks).length;
      const hasConflicts = postTaskCount !== preTaskCount;
      
      if (hasConflicts) {
        this.recordConflict({
          id: `merge-${Date.now()}`,
          timestamp: Date.now(),
          deviceId: this.deviceId,
          conflictType: 'concurrent_edit',
          entityId: `sync-from-${fromDeviceId}`,
          resolutionMethod: 'automerge',
          resolutionTimeMs: Date.now() - startTime,
          dataLossOccurred: postTaskCount < preTaskCount,
          preConflictState: { taskCount: preTaskCount },
          postConflictState: { taskCount: postTaskCount }
        });
      }
      
      this.saveToLocalStorage();
    } catch (error) {
      console.error('Failed to receive sync message:', error);
      this.recordConflict({
        id: `sync-error-${Date.now()}`,
        timestamp: Date.now(),
        deviceId: this.deviceId,
        conflictType: 'concurrent_edit',
        entityId: `sync-from-${fromDeviceId}`,
        resolutionMethod: 'manual',
        resolutionTimeMs: Date.now() - startTime,
        dataLossOccurred: true,
        preConflictState: error,
        postConflictState: null
      });
    }
  }

  /**
   * Save document to localStorage
   */
  saveToLocalStorage(): void {
    try {
      const binary = Automerge.save(this.doc);
      const base64 = btoa(String.fromCharCode(...binary));
      localStorage.setItem(this.storageKey, base64);
    } catch (error) {
      console.error('Failed to save CRDT doc to localStorage:', error);
    }
  }

  /**
   * Load document from localStorage
   */
  loadFromLocalStorage(): void {
    try {
      const base64 = localStorage.getItem(this.storageKey);
      if (base64) {
        const binary = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
        this.doc = Automerge.load(binary);
      }
    } catch (error) {
      console.error('Failed to load CRDT doc from localStorage:', error);
      // Fallback to empty document
      this.initializeDocument();
    }
  }

  /**
   * Record conflict metrics
   */
  recordConflict(metric: ConflictMetric): void {
    this.conflictMetrics.push(metric);
    
    // Keep only last 1000 metrics to prevent memory issues
    if (this.conflictMetrics.length > 1000) {
      this.conflictMetrics = this.conflictMetrics.slice(-1000);
    }
    
    // Persist metrics
    localStorage.setItem('crdt-conflict-metrics', JSON.stringify(this.conflictMetrics));
  }

  /**
   * Get all conflict metrics
   */
  getConflictMetrics(): ConflictMetric[] {
    return [...this.conflictMetrics];
  }

  /**
   * Generate merge reliability report
   */
  exportMergeReliabilityReport(): MergeReliabilityReport {
    const metrics = this.conflictMetrics;
    const autoResolved = metrics.filter(m => m.resolutionMethod === 'automerge').length;
    const dataLossEvents = metrics.filter(m => m.dataLossOccurred).length;
    const avgResolutionTime = metrics.reduce((sum, m) => sum + m.resolutionTimeMs, 0) / metrics.length || 0;
    
    const conflictsByType = metrics.reduce((acc, m) => {
      acc[m.conflictType] = (acc[m.conflictType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalConflicts: metrics.length,
      autoResolvedConflicts: autoResolved,
      dataLossEvents,
      averageResolutionTime: avgResolutionTime,
      conflictsByType,
      reliabilityScore: metrics.length > 0 ? autoResolved / metrics.length : 1
    };
  }

  /**
   * Get current document state for debugging
   */
  getDocumentState(): CRDTDocument {
    return this.doc;
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Clear all data (for testing)
   */
  clearAll(): void {
    this.initializeDocument();
    this.conflictMetrics = [];
    this.syncStates.clear();
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem('crdt-conflict-metrics');
  }
}

// Singleton instance
export const crdtTaskService = new CRDTTaskService();
