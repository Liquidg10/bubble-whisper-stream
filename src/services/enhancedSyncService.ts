/**
 * Enhanced sync service with CRDT, E2EE, and collaboration features
 */

import { supabase } from '@/integrations/supabase/client';
import { Bubble } from '@/types/bubble';

export interface SyncDevice {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  public_key: string;
  is_active: boolean;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface SyncConflict {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  local_data: string;
  remote_data: string;
  local_timestamp: string;
  remote_timestamp: string;
  status: 'pending' | 'resolved' | 'ignored';
  resolution?: string;
  created_at: string;
  resolved_at?: string;
}

export interface SyncData {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  data_encrypted: string;
  iv: string;
  version: string;
  device_id: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: string;
  created_at: string;
}

export interface SharedSpace {
  id: string;
  name: string;
  owner_id: string;
  space_key: string; // Encrypted space key
  created_at: string;
  updated_at: string;
}

export interface SpaceInvite {
  id: string;
  space_id: string;
  inviter_id: string;
  email?: string;
  invite_token: string;
  permissions: 'view' | 'comment' | 'edit';
  expires_at?: string;
  created_at: string;
  used_at?: string;
}

export interface UserPresence {
  user_id: string;
  space_id?: string;
  device_id: string;
  last_seen: string;
  status: 'online' | 'away' | 'offline';
  current_view?: string;
  cursor_position?: { x: number; y: number };
}

export interface CRDTOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity_type: string;
  entity_id: string;
  timestamp: number;
  device_id: string;
  data: any;
  vector_clock: Record<string, number>;
}

class EnhancedSyncService {
  private deviceId: string;
  private encryptionKey: CryptoKey | null = null;
  private isOnline = navigator.onLine;
  private syncChannel: any = null;
  private presenceChannel: any = null;
  private conflictQueue: SyncConflict[] = [];
  private safeModeEnabled = false;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    this.initializeEncryption();
    this.setupNetworkMonitoring();
    this.setupRealtimeSync();
  }

  /**
   * Device Management
   */
  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('bubble_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('bubble_device_id', deviceId);
    }
    return deviceId;
  }

  async registerDevice(deviceName: string, deviceType: string): Promise<void> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
      );

      const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKey)));

      // Store private key locally
      const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      localStorage.setItem('bubble_private_key', btoa(String.fromCharCode(...new Uint8Array(privateKey))));

      const { error } = await supabase
        .from('sync_devices')
        .upsert({
          user_id: (await supabase.auth.getUser()).data.user?.id || '',
          device_id: this.deviceId,
          device_name: deviceName,
          device_type: deviceType,
          public_key: publicKeyBase64,
          is_active: true,
          last_seen: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to register device:', error);
      throw error;
    }
  }

  /**
   * Encryption Management
   */
  private async initializeEncryption(): Promise<void> {
    try {
      let keyData = localStorage.getItem('bubble_encryption_key');
      
      if (!keyData) {
        // Generate new encryption key
        const key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        
        const exported = await crypto.subtle.exportKey('raw', key);
        keyData = btoa(String.fromCharCode(...new Uint8Array(exported)));
        localStorage.setItem('bubble_encryption_key', keyData);
        this.encryptionKey = key;
      } else {
        // Import existing key
        const keyBuffer = new Uint8Array(atob(keyData).split('').map(c => c.charCodeAt(0)));
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
      }
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
    }
  }

  private async encryptData(data: string): Promise<{ encrypted: string; iv: string }> {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encoded
    );

    return {
      encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv))
    };
  }

  private async decryptData(encryptedData: string, iv: string): Promise<string> {
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');

    const encrypted = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
    const ivArray = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      this.encryptionKey,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * CRDT Operations
   */
  private createVectorClock(operation: CRDTOperation): Record<string, number> {
    const clock = JSON.parse(localStorage.getItem('vector_clock') || '{}');
    clock[this.deviceId] = (clock[this.deviceId] || 0) + 1;
    localStorage.setItem('vector_clock', JSON.stringify(clock));
    return clock;
  }

  private mergeVectorClocks(local: Record<string, number>, remote: Record<string, number>): Record<string, number> {
    const merged = { ...local };
    Object.entries(remote).forEach(([device, timestamp]) => {
      merged[device] = Math.max(merged[device] || 0, timestamp);
    });
    return merged;
  }

  private isAfter(vectorA: Record<string, number>, vectorB: Record<string, number>): boolean {
    let hasGreater = false;
    for (const device in vectorA) {
      if (vectorA[device] > (vectorB[device] || 0)) {
        hasGreater = true;
      } else if (vectorA[device] < (vectorB[device] || 0)) {
        return false;
      }
    }
    return hasGreater;
  }

  private detectConflict(local: CRDTOperation, remote: CRDTOperation): boolean {
    return !this.isAfter(local.vector_clock, remote.vector_clock) && 
           !this.isAfter(remote.vector_clock, local.vector_clock);
  }

  /**
   * Sync Operations
   */
  async syncBubble(bubble: Bubble, operation: 'create' | 'update' | 'delete'): Promise<void> {
    if (!this.isOnline) {
      // Queue for later sync
      this.queueOfflineOperation(bubble, operation);
      return;
    }

    try {
      const vectorClock = this.createVectorClock({
        id: crypto.randomUUID(),
        type: operation,
        entity_type: 'bubble',
        entity_id: bubble.id,
        timestamp: Date.now(),
        device_id: this.deviceId,
        data: bubble,
        vector_clock: {}
      });

      const { encrypted, iv } = await this.encryptData(JSON.stringify({
        bubble,
        vector_clock: vectorClock,
        operation
      }));

      const { error } = await supabase
        .from('sync_data')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id || '',
          entity_type: 'bubble',
          entity_id: bubble.id,
          data_encrypted: encrypted,
          iv,
          version: vectorClock[this.deviceId].toString(),
          device_id: this.deviceId,
          operation,
          timestamp: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to sync bubble:', error);
      throw error;
    }
  }

  async processSyncData(syncData: SyncData): Promise<Bubble | null> {
    try {
      const decryptedData = await this.decryptData(syncData.data_encrypted, syncData.iv);
      const { bubble, vector_clock, operation } = JSON.parse(decryptedData);

      // Check for conflicts
      const localClock = JSON.parse(localStorage.getItem('vector_clock') || '{}');
      
      if (this.detectConflict({ vector_clock: localClock } as CRDTOperation, { vector_clock } as CRDTOperation)) {
        await this.handleConflict(bubble, syncData);
        return null;
      }

      // Merge vector clocks
      const mergedClock = this.mergeVectorClocks(localClock, vector_clock);
      localStorage.setItem('vector_clock', JSON.stringify(mergedClock));

      return bubble;
    } catch (error) {
      console.error('Failed to process sync data:', error);
      return null;
    }
  }

  /**
   * Conflict Resolution
   */
  private async handleConflict(remoteBubble: Bubble, syncData: SyncData): Promise<void> {
    // Get local version
    const localBubble = this.getLocalBubble(remoteBubble.id);
    
    if (!localBubble) {
      // No local conflict, just apply remote
      return;
    }

    const conflict: Omit<SyncConflict, 'id' | 'created_at'> = {
      user_id: (await supabase.auth.getUser()).data.user?.id || '',
      entity_type: 'bubble',
      entity_id: remoteBubble.id,
      local_data: JSON.stringify(localBubble),
      remote_data: JSON.stringify(remoteBubble),
      local_timestamp: new Date(localBubble.updatedAt).toISOString(),
      remote_timestamp: syncData.timestamp,
      status: 'pending'
    };

    if (this.safeModeEnabled) {
      // Add to conflict queue for manual resolution
      const { data, error } = await supabase
        .from('sync_conflicts')
        .insert(conflict)
        .select()
        .single();

      if (!error && data) {
        this.conflictQueue.push(data as SyncConflict);
        this.notifyConflict(data as SyncConflict);
      }
    } else {
      // Auto-resolve using last-write-wins with content merge
      const resolved = this.autoResolveConflict(localBubble, remoteBubble);
      await this.applyResolution(remoteBubble.id, resolved);
    }
  }

  private autoResolveConflict(local: Bubble, remote: Bubble): Bubble {
    // Last-write-wins for most fields, but merge tags and preserve both contents
    const resolved: Bubble = {
      ...remote,
      tags: [...local.tags, ...remote.tags].filter((tag, index, arr) => 
        arr.findIndex(t => t.id === tag.id) === index
      )
    };

    // If content differs, create a merged version
    if (local.content !== remote.content && local.content && remote.content) {
      resolved.content = `${local.content}\n\n--- Remote changes ---\n${remote.content}`;
    }

    return resolved;
  }

  async resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'custom', customData?: Bubble): Promise<void> {
    try {
      const conflict = this.conflictQueue.find(c => c.id === conflictId);
      if (!conflict) throw new Error('Conflict not found');

      let resolvedData: Bubble;
      
      switch (resolution) {
        case 'local':
          resolvedData = JSON.parse(conflict.local_data);
          break;
        case 'remote':
          resolvedData = JSON.parse(conflict.remote_data);
          break;
        case 'custom':
          if (!customData) throw new Error('Custom data required');
          resolvedData = customData;
          break;
      }

      // Apply resolution
      await this.applyResolution(conflict.entity_id, resolvedData);

      // Mark conflict as resolved
      await supabase
        .from('sync_conflicts')
        .update({
          status: 'resolved',
          resolution: JSON.stringify(resolvedData),
          resolved_at: new Date().toISOString()
        })
        .eq('id', conflictId);

      // Remove from queue
      this.conflictQueue = this.conflictQueue.filter(c => c.id !== conflictId);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      throw error;
    }
  }

  /**
   * Safe Mode
   */
  enableSafeMode(): void {
    this.safeModeEnabled = true;
    localStorage.setItem('sync_safe_mode', 'true');
  }

  disableSafeMode(): void {
    this.safeModeEnabled = false;
    localStorage.setItem('sync_safe_mode', 'false');
  }

  isSafeModeEnabled(): boolean {
    return this.safeModeEnabled || localStorage.getItem('sync_safe_mode') === 'true';
  }

  /**
   * Shared Spaces
   */
  async createSharedSpace(name: string): Promise<string> {
    try {
      // Generate space key
      const spaceKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const exported = await crypto.subtle.exportKey('raw', spaceKey);
      const spaceKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));

      // Create space (this would need a spaces table)
      const spaceId = crypto.randomUUID();
      
      // Store space key locally for now (in production, this would be encrypted with user's key)
      localStorage.setItem(`space_key_${spaceId}`, spaceKeyBase64);

      return spaceId;
    } catch (error) {
      console.error('Failed to create shared space:', error);
      throw error;
    }
  }

  async generateInviteLink(spaceId: string, permissions: 'view' | 'comment' | 'edit', expiresIn?: number): Promise<string> {
    const inviteToken = crypto.randomUUID();
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn).toISOString() : undefined;

    // Store invite (this would need an invites table)
    const invite = {
      space_id: spaceId,
      invite_token: inviteToken,
      permissions,
      expires_at: expiresAt
    };

    localStorage.setItem(`invite_${inviteToken}`, JSON.stringify(invite));

    return `${window.location.origin}/join/${inviteToken}`;
  }

  /**
   * Presence Management
   */
  private setupRealtimeSync(): void {
    if (!supabase) return;

    // Sync channel for data changes
    this.syncChannel = supabase
      .channel('sync-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sync_data'
      }, (payload) => this.handleRemoteSyncData(payload.new as SyncData))
      .subscribe();

    // Presence channel for user presence
    this.presenceChannel = supabase
      .channel('user-presence')
      .on('presence', { event: 'sync' }, () => {
        const state = this.presenceChannel.presenceState();
        this.handlePresenceUpdate(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe();
  }

  async updatePresence(data: Partial<UserPresence>): Promise<void> {
    if (!this.presenceChannel) return;

    const presence = {
      device_id: this.deviceId,
      last_seen: new Date().toISOString(),
      status: 'online',
      ...data
    };

    await this.presenceChannel.track(presence);
  }

  private async handleRemoteSyncData(syncData: SyncData): Promise<void> {
    // Skip our own changes
    if (syncData.device_id === this.deviceId) return;

    const bubble = await this.processSyncData(syncData);
    if (bubble) {
      // Notify app of remote change
      window.dispatchEvent(new CustomEvent('remote-bubble-change', {
        detail: { bubble, operation: syncData.operation }
      }));
    }
  }

  private handlePresenceUpdate(state: any): void {
    window.dispatchEvent(new CustomEvent('presence-update', {
      detail: { state }
    }));
  }

  // Helper methods
  private queueOfflineOperation(bubble: Bubble, operation: string): void {
    const queue = JSON.parse(localStorage.getItem('offline_sync_queue') || '[]');
    queue.push({ bubble, operation, timestamp: Date.now() });
    localStorage.setItem('offline_sync_queue', JSON.stringify(queue));
  }

  private getLocalBubble(id: string): Bubble | null {
    // This would integrate with the bubble store
    return null;
  }

  private async applyResolution(entityId: string, resolvedData: Bubble): Promise<void> {
    // This would update the local bubble store
    window.dispatchEvent(new CustomEvent('conflict-resolved', {
      detail: { entityId, resolvedData }
    }));
  }

  private notifyConflict(conflict: SyncConflict): void {
    window.dispatchEvent(new CustomEvent('sync-conflict', {
      detail: { conflict }
    }));
  }

  private setupNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private async processOfflineQueue(): Promise<void> {
    const queue = JSON.parse(localStorage.getItem('offline_sync_queue') || '[]');
    
    for (const item of queue) {
      try {
        await this.syncBubble(item.bubble, item.operation);
      } catch (error) {
        console.error('Failed to sync queued item:', error);
      }
    }

    localStorage.removeItem('offline_sync_queue');
  }
}

export const enhancedSyncService = new EnhancedSyncService();