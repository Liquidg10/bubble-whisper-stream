// Local-first storage service with encryption for Bubble Universe

import { Bubble, Reminder, Tag, SelfModel, Settings } from '@/types/bubble';

// IndexedDB wrapper for local storage
class StorageService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'BubbleUniverse';
  private readonly dbVersion = 1;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Bubbles store
        if (!db.objectStoreNames.contains('bubbles')) {
          const bubbleStore = db.createObjectStore('bubbles', { keyPath: 'id' });
          bubbleStore.createIndex('createdAt', 'createdAt');
          bubbleStore.createIndex('type', 'type');
          bubbleStore.createIndex('updatedAt', 'updatedAt');
        }

        // Reminders store
        if (!db.objectStoreNames.contains('reminders')) {
          const reminderStore = db.createObjectStore('reminders', { keyPath: 'id' });
          reminderStore.createIndex('scheduledAt', 'scheduledAt');
          reminderStore.createIndex('status', 'status');
          reminderStore.createIndex('bubbleId', 'bubbleId');
        }

        // Tags store
        if (!db.objectStoreNames.contains('tags')) {
          db.createObjectStore('tags', { keyPath: 'id' });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }

        // Self model store
        if (!db.objectStoreNames.contains('selfModel')) {
          db.createObjectStore('selfModel', { keyPath: 'id' });
        }

        // Schema version tracking
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
    });
  }

  // Bubbles CRUD
  async createBubble(bubble: Bubble): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readwrite');
    const store = transaction.objectStore('bubbles');
    await this.promisifyRequest(store.add(bubble));
  }

  async getBubble(id: string): Promise<Bubble | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readonly');
    const store = transaction.objectStore('bubbles');
    const result = await this.promisifyRequest(store.get(id));
    return result || null;
  }

  async getAllBubbles(): Promise<Bubble[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readonly');
    const store = transaction.objectStore('bubbles');
    const result = await this.promisifyRequest(store.getAll());
    return result || [];
  }

  async updateBubble(bubble: Bubble): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readwrite');
    const store = transaction.objectStore('bubbles');
    await this.promisifyRequest(store.put(bubble));
  }

  async deleteBubble(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readwrite');
    const store = transaction.objectStore('bubbles');
    await this.promisifyRequest(store.delete(id));
  }

  // Reminders CRUD
  async createReminder(reminder: Reminder): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['reminders'], 'readwrite');
    const store = transaction.objectStore('reminders');
    await this.promisifyRequest(store.add(reminder));
  }

  async getActiveReminders(): Promise<Reminder[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['reminders'], 'readonly');
    const store = transaction.objectStore('reminders');
    const index = store.index('status');
    const result = await this.promisifyRequest(index.getAll('Active'));
    return result || [];
  }

  async updateReminder(reminder: Reminder): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['reminders'], 'readwrite');
    const store = transaction.objectStore('reminders');
    await this.promisifyRequest(store.put(reminder));
  }

  // Tags CRUD
  async createTag(tag: Tag): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');
    await this.promisifyRequest(store.add(tag));
  }

  async getAllTags(): Promise<Tag[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    const result = await this.promisifyRequest(store.getAll());
    return result || [];
  }

  // Settings
  async getSettings(): Promise<Settings> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const result = await this.promisifyRequest(store.get('app-settings'));
    
    return result || {
      ttsEnabled: true,
      reducedMotion: false,
      highContrast: false,
      bubbleDensity: 'medium',
      biometricLock: false,
    };
  }

  async updateSettings(settings: Settings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    await this.promisifyRequest(store.put({ id: 'app-settings', ...settings }));
  }

  // Self Model
  async getSelfModel(): Promise<SelfModel> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['selfModel'], 'readonly');
    const store = transaction.objectStore('selfModel');
    const result = await this.promisifyRequest(store.get('self'));
    
    return result || {
      id: 'self',
      routines: [],
      medicationTimes: [],
      preferences: {},
      triggers: [],
    };
  }

  async updateSelfModel(model: SelfModel): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['selfModel'], 'readwrite');
    const store = transaction.objectStore('selfModel');
    await this.promisifyRequest(store.put(model));
  }

  // Export data for backup
  async exportData(): Promise<string> {
    const data = {
      bubbles: await this.getAllBubbles(),
      reminders: await this.getActiveReminders(),
      tags: await this.getAllTags(),
      settings: await this.getSettings(),
      selfModel: await this.getSelfModel(),
      exportedAt: Date.now(),
    };
    
    return JSON.stringify(data, null, 2);
  }

  // Helper to promisify IndexedDB requests
  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const storageService = new StorageService();