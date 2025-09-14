/**
 * P17 - CRDT Pilot Service (Automerge)
 * Local-first Task synchronization with conflict-free merging
 */

import * as Automerge from '@automerge/automerge';
import type { Task } from '@/types/task';

interface CRDTTask {
  id: string;
  title: string;
  completed: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  // Simplified for CRDT pilot
}

interface CRDTDocument extends Record<string, unknown> {
  tasks: { [id: string]: CRDTTask };
  metadata: {
    deviceId: string;
    lastSync: number;
    version: number;
  };
}

interface ConflictMetrics {
  totalMerges: number;
  conflicts: number;
  conflictTypes: {
    concurrent_edit: number;
    delete_update: number;
    priority_conflict: number;
  };
  lastConflict?: number;
}

export class CRDTService {
  private doc: Automerge.Doc<CRDTDocument>;
  private deviceId: string;
  private metrics: ConflictMetrics;
  private enabled: boolean = false;

  constructor() {
    this.deviceId = this.generateDeviceId();
    this.metrics = {
      totalMerges: 0,
      conflicts: 0,
      conflictTypes: {
        concurrent_edit: 0,
        delete_update: 0,
        priority_conflict: 0
      }
    };

    // Initialize empty document
    this.doc = Automerge.from<CRDTDocument>({
      tasks: {},
      metadata: {
        deviceId: this.deviceId,
        lastSync: Date.now(),
        version: 1
      }
    });

    this.loadFromStorage();
  }

  /**
   * Enable CRDT functionality (behind feature flag)
   */
  enable(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      console.log('CRDT Service enabled - local-first Task sync active');
    }
  }

  /**
   * Check if CRDT is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Add or update a task in the CRDT document
   */
  upsertTask(task: Task): void {
    if (!this.enabled) return;

    try {
      this.doc = Automerge.change(this.doc, (doc) => {
        const crdtTask: CRDTTask = {
          id: task.id,
          title: task.title,
          completed: task.completed,
          priority: task.priority,
          createdAt: task.createdAt,
          updatedAt: Date.now(),
          tags: task.tags.map(t => t.name)
        };

        doc.tasks[task.id] = crdtTask;
        doc.metadata.version += 1;
        doc.metadata.lastSync = Date.now();
      });

      this.saveToStorage();
    } catch (error) {
      console.error('CRDT upsert failed:', error);
    }
  }

  /**
   * Remove a task from the CRDT document
   */
  removeTask(taskId: string): void {
    if (!this.enabled) return;

    try {
      this.doc = Automerge.change(this.doc, (doc) => {
        delete doc.tasks[taskId];
        doc.metadata.version += 1;
        doc.metadata.lastSync = Date.now();
      });

      this.saveToStorage();
    } catch (error) {
      console.error('CRDT remove failed:', error);
    }
  }

  /**
   * Get all tasks from CRDT document
   */
  getTasks(): CRDTTask[] {
    if (!this.enabled) return [];
    
    return Object.values(this.doc.tasks);
  }

  /**
   * Merge changes from another device/instance
   */
  mergeChanges(remoteChanges: Uint8Array): boolean {
    if (!this.enabled) return false;

    try {
      const oldHeads = Automerge.getHeads(this.doc);
      
      // Apply remote changes
      const [newDoc] = Automerge.applyChanges(this.doc, [remoteChanges]);
      
      const newHeads = Automerge.getHeads(newDoc);
      
      // Detect conflicts
      const hasConflicts = this.detectConflicts(oldHeads, newHeads);
      
      this.doc = newDoc;
      this.metrics.totalMerges += 1;
      
      if (hasConflicts) {
        this.metrics.conflicts += 1;
        this.metrics.lastConflict = Date.now();
        console.log('CRDT: Conflict resolved during merge');
      }

      this.saveToStorage();
      return true;

    } catch (error) {
      console.error('CRDT merge failed:', error);
      return false;
    }
  }

  /**
   * Export changes for synchronization
   */
  exportChanges(lastSyncHeads?: Automerge.Heads): Uint8Array[] {
    if (!this.enabled) return [];

    try {
      return Automerge.getAllChanges(this.doc).slice(
        lastSyncHeads ? lastSyncHeads.length : 0
      );
    } catch (error) {
      console.error('CRDT export failed:', error);
      return [];
    }
  }

  /**
   * Get document heads for sync tracking
   */
  getHeads(): Automerge.Heads {
    return Automerge.getHeads(this.doc);
  }

  /**
   * Get conflict and merge metrics
   */
  getMetrics(): ConflictMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalMerges: 0,
      conflicts: 0,
      conflictTypes: {
        concurrent_edit: 0,
        delete_update: 0,
        priority_conflict: 0
      }
    };
  }

  /**
   * Simulate offline changes for testing
   */
  simulateOfflineChanges(): void {
    if (!this.enabled) return;

    // Create test tasks with different device IDs to simulate conflicts
    const testTasks: Partial<Task>[] = [
      { id: 'test-1', title: 'Offline Task A', completed: false, priority: 75 },
      { id: 'test-2', title: 'Offline Task B', completed: true, priority: 50 }
    ];

    testTasks.forEach(task => {
      if (task.id && task.title !== undefined) {
        this.upsertTask({
          id: task.id,
          title: task.title,
          completed: task.completed || false,
          priority: task.priority || 50,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
          type: 'task'
        } as Task);
      }
    });

    console.log('CRDT: Simulated offline changes applied');
  }

  private generateDeviceId(): string {
    return `device-${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectConflicts(oldHeads: Automerge.Heads, newHeads: Automerge.Heads): boolean {
    // Simple conflict detection - in real implementation, this would be more sophisticated
    return oldHeads.length !== newHeads.length || 
           oldHeads.some((head, i) => head !== newHeads[i]);
  }

  private saveToStorage(): void {
    try {
      const serialized = Automerge.save(this.doc);
      const base64 = btoa(String.fromCharCode(...serialized));
      localStorage.setItem('crdt-document', base64);
      localStorage.setItem('crdt-metrics', JSON.stringify(this.metrics));
    } catch (error) {
      console.error('CRDT storage save failed:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('crdt-document');
      if (stored) {
        const serialized = new Uint8Array(
          atob(stored).split('').map(char => char.charCodeAt(0))
        );
        this.doc = Automerge.load(serialized);
      }

      const metricsStored = localStorage.getItem('crdt-metrics');
      if (metricsStored) {
        this.metrics = JSON.parse(metricsStored);
      }
    } catch (error) {
      console.error('CRDT storage load failed:', error);
    }
  }
}

// Export service instance
export const crdtService = new CRDTService();