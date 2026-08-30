// Local-first storage service with encryption for Bubble Universe

import { Bubble, Reminder, Tag, SelfModel, Settings } from '@/types/bubble';

const COMMITTED_BUBBLE_SNAPSHOT_MAX_ROWS = 10_000;
const COMMITTED_BUBBLE_SNAPSHOT_MAX_BYTES = 16 * 1024 * 1024;

// IndexedDB wrapper for local storage
class StorageService {
  private db: IDBDatabase | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly dbName = 'BubbleUniverse';
  private readonly dbVersion = 4;

  isInitialized(): boolean {
    return this.db !== null;
  }

  async initialize(): Promise<void> {
    if (this.db) return;

    if (!this.initializationPromise) {
      this.initializationPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
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

          // Phase 2: Add new object stores
          if (!db.objectStoreNames.contains('cbt_entries')) {
            const cbtStore = db.createObjectStore('cbt_entries', { keyPath: 'id' });
            cbtStore.createIndex('createdAt', 'createdAt', { unique: false });
            cbtStore.createIndex('bubbleId', 'bubbleId', { unique: false });
          }

          if (!db.objectStoreNames.contains('glimmers')) {
            const glimmerStore = db.createObjectStore('glimmers', { keyPath: 'id' });
            glimmerStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // SelfModelV2 stores
          if (!db.objectStoreNames.contains('self_model_v2')) {
            db.createObjectStore('self_model_v2', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('self_model_audits')) {
            const auditStore = db.createObjectStore('self_model_audits', { keyPath: 'id' });
            auditStore.createIndex('at', 'at', { unique: false });
            auditStore.createIndex('layer', 'layer', { unique: false });
          }

          if (!db.objectStoreNames.contains('monthly_reviews')) {
            db.createObjectStore('monthly_reviews', { keyPath: 'id' });
          }

          // Legacy store (keep for migration)
          if (!db.objectStoreNames.contains('self_model_audit')) {
            const auditStore = db.createObjectStore('self_model_audit', { keyPath: 'id' });
            auditStore.createIndex('at', 'at', { unique: false });
            auditStore.createIndex('layer', 'layer', { unique: false });
          }

          if (!db.objectStoreNames.contains('pattern_hints')) {
            const hintStore = db.createObjectStore('pattern_hints', { keyPath: 'id' });
            hintStore.createIndex('key', 'key', { unique: false });
            hintStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
          }

          if (!db.objectStoreNames.contains('consent_records')) {
            const consentStore = db.createObjectStore('consent_records', { keyPath: 'id' });
            consentStore.createIndex('feature', 'feature', { unique: false });
            consentStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });
    }

    const initialization = this.initializationPromise;
    try {
      await initialization;
    } finally {
      if (this.initializationPromise === initialization) {
        this.initializationPromise = null;
      }
    }
  }

  // Bubbles CRUD
  async createBubble(bubble: Bubble): Promise<void> {
    await this.commitBubble(bubble, 'add');
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

  async readCommittedBubbles(): Promise<Bubble[]> {
    if (!this.db) throw new Error('Database not initialized');
    const failure = () => new Error('Committed bubble snapshot could not be verified');
    let transaction: IDBTransaction;
    try {
      transaction = this.db.transaction(['bubbles'], 'readonly');
    } catch {
      throw failure();
    }

    // Recovery reads the database, not a possibly stale facade. A cursor bounds
    // accumulation, and only a completed transaction can publish the snapshot.
    // This is local transaction evidence, not remote or physical-disk durability.
    return new Promise((resolve, reject) => {
      const bubbles: Bubble[] = [];
      let serializedBytes = 2; // The surrounding JSON array brackets.
      let exhausted = false;
      let failed = false;
      const encoder = new TextEncoder();
      const fail = () => {
        if (failed) return;
        failed = true;
        try { transaction.abort(); } catch { /* Already inactive; no snapshot receipt. */ }
        reject(failure());
      };
      transaction.oncomplete = () => {
        if (exhausted && !failed) resolve(bubbles);
        else reject(failure());
      };
      transaction.onabort = () => {
        failed = true;
        reject(failure());
      };
      transaction.onerror = fail;

      try {
        const request = transaction.objectStore('bubbles').openCursor();
        request.onerror = fail;
        request.onsuccess = () => {
          if (failed) return;
          try {
            const cursor = request.result;
            if (cursor === null) {
              exhausted = true;
              return;
            }
            if (bubbles.length >= COMMITTED_BUBBLE_SNAPSHOT_MAX_ROWS) throw failure();
            const bubble = cursor.value as Bubble;
            const serialized = JSON.stringify(bubble);
            const separatorBytes = bubbles.length === 0 ? 0 : 1;
            const remainingBytes = COMMITTED_BUBBLE_SNAPSHOT_MAX_BYTES - serializedBytes - separatorBytes;
            // UTF-16 length is a cheap lower bound before allocating UTF-8 bytes.
            if (typeof serialized !== 'string' || serialized.length > remainingBytes) throw failure();
            const rowBytes = encoder.encode(serialized).byteLength;
            if (rowBytes > remainingBytes) throw failure();
            serializedBytes += separatorBytes + rowBytes;
            bubbles.push(bubble);
            cursor.continue();
          } catch {
            fail();
          }
        };
      } catch {
        fail();
      }
    });
  }

  async updateBubble(bubble: Bubble): Promise<void> {
    await this.commitBubble(bubble, 'put');
  }

  private commitBubble(bubble: Bubble, operation: 'add' | 'put'): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(['bubbles'], 'readwrite');
    // Request success can precede a later transaction abort. Publish a local
    // save receipt only after commit; this is not a remote sync/durability claim.
    return new Promise((resolve, reject) => {
      let requestSucceeded = false;
      let requestFailed = false;
      transaction.oncomplete = () => {
        if (requestSucceeded && !requestFailed) resolve();
        else reject(new Error('Bubble transaction completed without a verified write'));
      };
      transaction.onabort = () => reject(new Error('Bubble transaction aborted before commit'));
      transaction.onerror = () => { requestFailed = true; };
      try {
        const request = transaction.objectStore('bubbles')[operation](bubble);
        request.onsuccess = () => { requestSucceeded = true; };
        // Do not prevent the default abort or settle before the transaction.
        request.onerror = () => { requestFailed = true; };
      } catch {
        try { transaction.abort(); } catch { /* Already inactive; no write receipt. */ }
        reject(new Error('Unable to enqueue bubble write'));
      }
    });
  }

  async deleteBubble(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readwrite');
    const store = transaction.objectStore('bubbles');
    await this.promisifyRequest(store.delete(id));
  }

  async clearAllBubbles(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['bubbles'], 'readwrite');
    const store = transaction.objectStore('bubbles');
    await this.promisifyRequest(store.clear());
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

  // Phase 2 Intelligence Layer Methods
  async createCBTEntry(entry: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['cbt_entries'], 'readwrite');
    await this.promisifyRequest(tx.objectStore('cbt_entries').add(entry));
  }

  async createGlimmer(glimmer: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['glimmers'], 'readwrite');
    await this.promisifyRequest(tx.objectStore('glimmers').add(glimmer));
  }

  async updateGlimmer(glimmer: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['glimmers'], 'readwrite');
    await this.promisifyRequest(tx.objectStore('glimmers').put(glimmer));
  }

  async createPatternHint(hint: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['pattern_hints'], 'readwrite');
    await this.promisifyRequest(tx.objectStore('pattern_hints').add(hint));
  }

  async updatePatternHint(hint: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['pattern_hints'], 'readwrite');
    await this.promisifyRequest(tx.objectStore('pattern_hints').put(hint));
  }

  async getDatabase(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) throw new Error('Database initialization did not produce a connection');
    return this.db;
  }
}

export const storageService = new StorageService();
