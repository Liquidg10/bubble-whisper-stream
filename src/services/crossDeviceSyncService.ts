// Cross-device sync infrastructure with E2E encryption
import { supabase } from '@/integrations/supabase/client';

export interface SyncDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet';
  lastSeen: string;
  publicKey: string;
  isActive: boolean;
}

export interface SyncConflict {
  id: string;
  entityType: 'bubble' | 'cbt' | 'glimmer' | 'setting';
  entityId: string;
  localVersion: any;
  remoteVersion: any;
  timestamp: string;
  resolved?: boolean;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync: string | null;
  pendingUploads: number;
  pendingDownloads: number;
  conflicts: SyncConflict[];
  syncMode: 'full' | 'safe' | 'offline';
}

class CrossDeviceSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private syncChannel: any = null;
  private encryptionKey: CryptoKey | null = null;
  private deviceId: string;
  private isInitialized = false;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Generate or load encryption key
    await this.initializeEncryption();
    
    // Setup realtime sync channel
    await this.setupRealtimeSync();
    
    // Register this device
    await this.registerDevice();
    
    this.isInitialized = true;
  }

  private async initializeEncryption(): Promise<void> {
    const savedKey = localStorage.getItem('bubble-sync-key');
    
    if (savedKey) {
      // Import existing key
      const keyData = JSON.parse(savedKey);
      this.encryptionKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(keyData),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    } else {
      // Generate new key
      this.encryptionKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      // Save key to localStorage
      const exported = await crypto.subtle.exportKey('raw', this.encryptionKey);
      localStorage.setItem('bubble-sync-key', JSON.stringify(Array.from(new Uint8Array(exported))));
    }
  }

  private async setupRealtimeSync(): Promise<void> {
    if (!supabase) return;
    
    this.syncChannel = supabase
      .channel(`user-sync-${this.deviceId}`)
      .on('presence', { event: 'sync' }, () => {
        this.handlePresenceSync();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.handleDeviceJoin(key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.handleDeviceLeave(key, leftPresences);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sync_data'
      }, (payload) => {
        this.handleRemoteDataChange(payload);
      })
      .subscribe();
  }

  private async registerDevice(): Promise<void> {
    const deviceInfo = {
      id: this.deviceId,
      name: this.getDeviceName(),
      type: this.getDeviceType(),
      lastSeen: new Date().toISOString(),
      publicKey: await this.getPublicKey(),
      isActive: true
    };

    // Track presence
    await this.syncChannel?.track(deviceInfo);
  }

  // Encrypt data before sync
  private async encryptData(data: any): Promise<{ encrypted: string; iv: string }> {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(JSON.stringify(data));
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encodedData
    );
    
    return {
      encrypted: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
      iv: btoa(String.fromCharCode(...iv))
    };
  }

  // Decrypt synced data
  private async decryptData(encrypted: string, iv: string): Promise<any> {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');
    
    const ivBuffer = new Uint8Array(
      atob(iv).split('').map(char => char.charCodeAt(0))
    );
    const encryptedBuffer = new Uint8Array(
      atob(encrypted).split('').map(char => char.charCodeAt(0))
    );
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      this.encryptionKey,
      encryptedBuffer
    );
    
    const decryptedData = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decryptedData);
  }

  // Sync specific data entity
  async syncEntity(
    type: 'bubble' | 'cbt' | 'glimmer' | 'setting',
    id: string,
    data: any,
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    await this.initialize();
    
    try {
      const encrypted = await this.encryptData(data);
      
      const syncRecord = {
        id: `${type}-${id}`,
        entity_type: type,
        entity_id: id,
        operation,
        device_id: this.deviceId,
        encrypted_data: encrypted.encrypted,
        iv: encrypted.iv,
        timestamp: new Date().toISOString(),
        version: this.generateVersion()
      };

      // For now, store in localStorage until we have proper sync tables
      const syncQueue = JSON.parse(localStorage.getItem('bubble-sync-queue') || '[]');
      syncQueue.push(syncRecord);
      localStorage.setItem('bubble-sync-queue', JSON.stringify(syncQueue));
      
      console.log('Sync queued for later implementation:', syncRecord);

    } catch (error) {
      console.error('Failed to sync entity:', error);
      // Queue for retry
      this.queueForRetry(type, id, data, operation);
    }
  }

  // Handle incoming sync data
  private async handleRemoteDataChange(payload: any): Promise<void> {
    if (payload.new?.device_id === this.deviceId) return; // Ignore own changes
    
    try {
      const decryptedData = await this.decryptData(
        payload.new.encrypted_data,
        payload.new.iv
      );
      
      // Check for conflicts
      const conflict = await this.detectConflict(
        payload.new.entity_type,
        payload.new.entity_id,
        decryptedData,
        payload.new.timestamp
      );
      
      if (conflict) {
        await this.handleConflict(conflict);
      } else {
        await this.applyRemoteChange(
          payload.new.entity_type,
          payload.new.entity_id,
          decryptedData,
          payload.new.operation
        );
      }
    } catch (error) {
      console.error('Failed to process remote change:', error);
    }
  }

  // Conflict detection and resolution
  private async detectConflict(
    entityType: string,
    entityId: string,
    remoteData: any,
    remoteTimestamp: string
  ): Promise<SyncConflict | null> {
    // Get local version of the entity
    const localData = await this.getLocalEntity(entityType, entityId);
    
    if (!localData) return null; // No local version, no conflict
    
    // Check if local version was modified after remote timestamp
    const localTimestamp = localData.updatedAt || localData.createdAt;
    if (new Date(localTimestamp) > new Date(remoteTimestamp)) {
      return {
        id: crypto.randomUUID(),
        entityType: entityType as any,
        entityId,
        localVersion: localData,
        remoteVersion: remoteData,
        timestamp: new Date().toISOString(),
        resolved: false
      };
    }
    
    return null;
  }

  private async handleConflict(conflict: SyncConflict): Promise<void> {
    // Store conflict for user resolution
    const conflicts = this.getStoredConflicts();
    conflicts.push(conflict);
    localStorage.setItem('bubble-sync-conflicts', JSON.stringify(conflicts));
    
    // Emit event for UI to handle
    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: conflict }));
  }

  // Conflict resolution methods
  async resolveConflict(
    conflictId: string,
    resolution: 'keep-local' | 'keep-remote' | 'merge',
    mergedData?: any
  ): Promise<void> {
    const conflicts = this.getStoredConflicts();
    const conflict = conflicts.find(c => c.id === conflictId);
    
    if (!conflict) return;
    
    let finalData;
    switch (resolution) {
      case 'keep-local':
        finalData = conflict.localVersion;
        break;
      case 'keep-remote':
        finalData = conflict.remoteVersion;
        break;
      case 'merge':
        finalData = mergedData || this.autoMerge(conflict.localVersion, conflict.remoteVersion);
        break;
    }
    
    // Apply resolution
    await this.applyRemoteChange(
      conflict.entityType,
      conflict.entityId,
      finalData,
      'update'
    );
    
    // Mark conflict as resolved
    const updatedConflicts = conflicts.filter(c => c.id !== conflictId);
    localStorage.setItem('bubble-sync-conflicts', JSON.stringify(updatedConflicts));
  }

  private autoMerge(local: any, remote: any): any {
    // Simple merge strategy - prefer newer timestamps for each field
    const merged = { ...local };
    
    Object.keys(remote).forEach(key => {
      if (key === 'updatedAt' || key === 'createdAt') {
        // Use newer timestamp
        if (new Date(remote[key]) > new Date(local[key] || 0)) {
          merged[key] = remote[key];
        }
      } else if (Array.isArray(remote[key]) && Array.isArray(local[key])) {
        // Merge arrays, removing duplicates
        merged[key] = [...new Set([...local[key], ...remote[key]])];
      } else if (typeof remote[key] === 'object' && typeof local[key] === 'object') {
        // Recursively merge objects
        merged[key] = this.autoMerge(local[key], remote[key]);
      } else {
        // Use remote value if it's newer or local doesn't exist
        if (!local[key] || new Date(remote.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          merged[key] = remote[key];
        }
      }
    });
    
    return merged;
  }

  // Presence and device management
  private handlePresenceSync(): void {
    const state = this.syncChannel?.presenceState();
    // Handle device presence updates
  }

  private handleDeviceJoin(key: string, newPresences: any[]): void {
    // Handle new device joining
    newPresences.forEach(presence => {
      if (presence.id !== this.deviceId) {
        console.log('Device joined:', presence);
      }
    });
  }

  private handleDeviceLeave(key: string, leftPresences: any[]): void {
    // Handle device leaving
    leftPresences.forEach(presence => {
      console.log('Device left:', presence);
    });
  }

  // Safe mode sync
  async enableSafeMode(): Promise<void> {
    // Disable real-time sync, only sync on user action
    this.syncChannel?.unsubscribe();
    localStorage.setItem('bubble-sync-mode', 'safe');
  }

  async disableSafeMode(): Promise<void> {
    await this.setupRealtimeSync();
    localStorage.setItem('bubble-sync-mode', 'full');
  }

  // Utility methods
  private getOrCreateDeviceId(): string {
    const existing = localStorage.getItem('bubble-device-id');
    if (existing) return existing;
    
    const newId = crypto.randomUUID();
    localStorage.setItem('bubble-device-id', newId);
    return newId;
  }

  private getDeviceName(): string {
    const saved = localStorage.getItem('bubble-device-name');
    if (saved) return saved;
    
    const name = `${this.getDeviceType()}-${Date.now().toString().slice(-4)}`;
    localStorage.setItem('bubble-device-name', name);
    return name;
  }

  private getDeviceType(): 'mobile' | 'desktop' | 'tablet' {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
    if (/mobile|phone|android/i.test(userAgent)) return 'mobile';
    return 'desktop';
  }

  private async getPublicKey(): Promise<string> {
    // For now, return a placeholder. In production, this would be a real public key
    return btoa(this.deviceId);
  }

  private generateVersion(): string {
    return `${Date.now()}-${this.deviceId.slice(-6)}`;
  }

  private getStoredConflicts(): SyncConflict[] {
    const stored = localStorage.getItem('bubble-sync-conflicts');
    return stored ? JSON.parse(stored) : [];
  }

  private async getLocalEntity(type: string, id: string): Promise<any> {
    // This would interface with your local storage/IndexedDB
    // Implementation depends on your current storage strategy
    return null;
  }

  private async applyRemoteChange(
    type: string,
    id: string,
    data: any,
    operation: string
  ): Promise<void> {
    // Apply changes to local storage
    // Implementation depends on your current storage strategy
  }

  private queueForRetry(
    type: string,
    id: string,
    data: any,
    operation: string
  ): void {
    // Queue failed syncs for retry
    const queue = JSON.parse(localStorage.getItem('bubble-sync-queue') || '[]');
    queue.push({ type, id, data, operation, timestamp: Date.now() });
    localStorage.setItem('bubble-sync-queue', JSON.stringify(queue));
  }

  // Public API
  getSyncStatus(): SyncStatus {
    return {
      isOnline: navigator.onLine && !!this.syncChannel,
      lastSync: localStorage.getItem('bubble-last-sync'),
      pendingUploads: JSON.parse(localStorage.getItem('bubble-sync-queue') || '[]').length,
      pendingDownloads: 0, // Would be calculated based on remote changes
      conflicts: this.getStoredConflicts(),
      syncMode: (localStorage.getItem('bubble-sync-mode') as any) || 'full'
    };
  }

  async getDevices(): Promise<SyncDevice[]> {
    const state = this.syncChannel?.presenceState() || {};
    return Object.values(state).flat() as SyncDevice[];
  }

  async revokeDevice(deviceId: string): Promise<void> {
    // Remove device access - would involve key rotation
    console.log('Revoking device:', deviceId);
  }
}

export const crossDeviceSyncService = new CrossDeviceSyncService();