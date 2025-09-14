/**
 * Phase 1: Offline Task Queue Service
 * IndexedDB-backed offline-first task management with conflict resolution
 */

import { Bubble } from '@/types/bubble';

export interface OfflineTask {
  id: string;
  action: 'create' | 'update' | 'delete';
  bubble: Bubble;
  timestamp: number;
  retryCount: number;
  syncStatus: 'pending' | 'syncing' | 'success' | 'conflict' | 'error';
  conflictData?: {
    localVersion: Bubble;
    remoteVersion: Bubble;
    conflictType: 'concurrent_edit' | 'delete_edit' | 'duplicate';
  };
}

export interface SyncStatus {
  isOnline: boolean;
  pendingTasks: number;
  lastSync: number;
  syncInProgress: boolean;
  conflictsCount: number;
}

class OfflineTaskQueueService {
  private db: IDBDatabase | null = null;
  private syncCallbacks: Set<(status: SyncStatus) => void> = new Set();
  private isInitialized = false;
  private isOnline = navigator.onLine;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processPendingTasks();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyStatusChange();
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OfflineTaskQueue', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('📱 Offline Task Queue initialized');
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Tasks store
        if (!db.objectStoreNames.contains('tasks')) {
          const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
          tasksStore.createIndex('timestamp', 'timestamp');
          tasksStore.createIndex('syncStatus', 'syncStatus');
        }

        // Cache store for offline data
        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Queue a task for offline execution
   */
  async queueTask(action: 'create' | 'update' | 'delete', bubble: Bubble): Promise<void> {
    if (!this.db) await this.initialize();

    const task: OfflineTask = {
      id: crypto.randomUUID(),
      action,
      bubble,
      timestamp: Date.now(),
      retryCount: 0,
      syncStatus: this.isOnline ? 'syncing' : 'pending'
    };

    const transaction = this.db!.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    
    await store.add(task);
    
    console.log(`📱 Queued ${action} task for bubble:`, bubble.id);
    
    // Try to sync immediately if online
    if (this.isOnline) {
      this.processPendingTasks();
    }
    
    this.notifyStatusChange();
  }

  /**
   * Process all pending tasks when coming back online
   */
  async processPendingTasks(): Promise<void> {
    if (!this.db || !this.isOnline) return;

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    const index = store.index('syncStatus');
    
    const pendingTasks = await this.getAllFromIndex(index, 'pending');
    
    console.log(`📱 Processing ${pendingTasks.length} pending tasks`);
    
    for (const task of pendingTasks) {
      await this.syncTask(task);
    }
    
    this.notifyStatusChange();
  }

  /**
   * Sync a single task with the server
   */
  private async syncTask(task: OfflineTask): Promise<void> {
    try {
      task.syncStatus = 'syncing';
      await this.updateTask(task);

      // Simulate server sync - in reality this would call actual API
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check for conflicts (simplified logic)
      const hasConflict = Math.random() < 0.1; // 10% chance of conflict
      
      if (hasConflict) {
        task.syncStatus = 'conflict';
        task.conflictData = {
          localVersion: task.bubble,
          remoteVersion: { ...task.bubble, content: task.bubble.content + ' (server version)' },
          conflictType: 'concurrent_edit'
        };
        await this.updateTask(task);
        console.log('📱 Conflict detected for task:', task.id);
      } else {
        task.syncStatus = 'success';
        await this.updateTask(task);
        console.log('📱 Task synced successfully:', task.id);
        
        // Remove successful tasks after 24 hours
        setTimeout(() => this.cleanupTask(task.id), 24 * 60 * 60 * 1000);
      }
    } catch (error) {
      console.error('📱 Sync failed for task:', task.id, error);
      task.syncStatus = 'error';
      task.retryCount += 1;
      await this.updateTask(task);
      
      // Retry with exponential backoff
      if (task.retryCount < 3) {
        setTimeout(() => this.syncTask(task), Math.pow(2, task.retryCount) * 1000);
      }
    }
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    
    const [pendingTasks, conflictTasks] = await Promise.all([
      this.getAllFromIndex(store.index('syncStatus'), 'pending'),
      this.getAllFromIndex(store.index('syncStatus'), 'conflict')
    ]);

    return {
      isOnline: this.isOnline,
      pendingTasks: pendingTasks.length,
      lastSync: this.getLastSyncTime(),
      syncInProgress: false, // Could track this more precisely
      conflictsCount: conflictTasks.length
    };
  }

  /**
   * Get all conflicts for user resolution
   */
  async getConflicts(): Promise<OfflineTask[]> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    const index = store.index('syncStatus');
    
    return this.getAllFromIndex(index, 'conflict');
  }

  /**
   * Resolve a conflict by choosing local or remote version
   */
  async resolveConflict(taskId: string, resolution: 'local' | 'remote' | 'merge'): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    
    const task = await this.getTask(taskId);
    if (!task || !task.conflictData) return;

    switch (resolution) {
      case 'local':
        task.syncStatus = 'syncing';
        delete task.conflictData;
        break;
      case 'remote':
        task.bubble = task.conflictData.remoteVersion;
        task.syncStatus = 'syncing';
        delete task.conflictData;
        break;
      case 'merge':
        // Simple merge strategy - combine content
        task.bubble.content = `${task.conflictData.localVersion.content} | ${task.conflictData.remoteVersion.content}`;
        task.syncStatus = 'syncing';
        delete task.conflictData;
        break;
    }

    await store.put(task);
    console.log(`📱 Conflict resolved for task ${taskId} using ${resolution} strategy`);
    
    // Retry sync
    if (this.isOnline) {
      this.syncTask(task);
    }
    
    this.notifyStatusChange();
  }

  /**
   * Subscribe to sync status changes
   */
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.syncCallbacks.add(callback);
    
    // Send initial status
    this.getSyncStatus().then(callback);
    
    return () => {
      this.syncCallbacks.delete(callback);
    };
  }

  /**
   * Cache data for offline access
   */
  async cacheData(key: string, data: any): Promise<void> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    
    await store.put({
      key,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached data
   */
  async getCachedData(key: string): Promise<any> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(['cache'], 'readonly');
    const store = transaction.objectStore('cache');
    
    const result = await new Promise<any>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return result?.data;
  }

  // Helper methods
  private async updateTask(task: OfflineTask): Promise<void> {
    if (!this.db) return;
    
    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    await store.put(task);
  }

  private async getTask(taskId: string): Promise<OfflineTask | null> {
    if (!this.db) return null;
    
    const transaction = this.db.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    return new Promise((resolve, reject) => {
      const req = store.get(taskId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async cleanupTask(taskId: string): Promise<void> {
    if (!this.db) return;
    
    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    await store.delete(taskId);
  }

  private async getAllFromIndex(index: IDBIndex, value: string): Promise<OfflineTask[]> {
    return new Promise((resolve, reject) => {
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private notifyStatusChange(): void {
    this.getSyncStatus().then(status => {
      this.syncCallbacks.forEach(callback => callback(status));
    });
  }

  private getLastSyncTime(): number {
    return parseInt(localStorage.getItem('lastSyncTime') || '0', 10);
  }
}

export const offlineTaskQueue = new OfflineTaskQueueService();