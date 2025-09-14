/**
 * CRDT Conflict Service
 * Manages multi-device synchronization conflicts with Automerge
 */

import * as Automerge from '@automerge/automerge';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/task';

export interface ConflictRecord {
  id: string;
  entityType: 'task' | 'calendar' | 'email';
  entityId: string;
  conflictType: 'concurrent_edit' | 'delete_modify' | 'move_conflict';
  localVersion: any;
  remoteVersion: any;
  mergedVersion?: any;
  timestamp: number;
  deviceIds: string[];
  resolved: boolean;
  autoResolved: boolean;
}

export interface ConflictResolution {
  strategy: 'take_local' | 'take_remote' | 'merge_custom' | 'manual_edit';
  resolvedData: any;
  reason: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  lastSeen: number;
  syncStatus: 'online' | 'offline' | 'syncing';
}

class CRDTConflictService {
  private conflicts = new Map<string, ConflictRecord>();
  private devices = new Map<string, DeviceInfo>();

  /**
   * Initialize with mock conflicts for demo purposes
   */
  constructor() {
    this.initializeMockData();
  }

  /**
   * Get all active conflicts
   */
  getActiveConflicts(): ConflictRecord[] {
    return Array.from(this.conflicts.values())
      .filter(conflict => !conflict.resolved)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get conflicts for specific entity
   */
  getConflictsForEntity(entityId: string): ConflictRecord[] {
    return Array.from(this.conflicts.values())
      .filter(conflict => conflict.entityId === entityId && !conflict.resolved);
  }

  /**
   * Resolve a conflict with chosen strategy
   */
  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<boolean> {
    try {
      const conflict = this.conflicts.get(conflictId);
      if (!conflict) {
        throw new Error(`Conflict ${conflictId} not found`);
      }

      // Apply resolution strategy
      let resolvedData;
      switch (resolution.strategy) {
        case 'take_local':
          resolvedData = conflict.localVersion;
          break;
        case 'take_remote':
          resolvedData = conflict.remoteVersion;
          break;
        case 'merge_custom':
        case 'manual_edit':
          resolvedData = resolution.resolvedData;
          break;
        default:
          throw new Error(`Unknown resolution strategy: ${resolution.strategy}`);
      }

      // Update conflict record
      const updatedConflict: ConflictRecord = {
        ...conflict,
        resolved: true,
        mergedVersion: resolvedData,
        autoResolved: false
      };

      this.conflicts.set(conflictId, updatedConflict);

      logger.info('Conflict resolved', {
        conflictId,
        strategy: resolution.strategy,
        entityType: conflict.entityType,
        entityId: conflict.entityId
      });

      return true;
    } catch (error) {
      logger.error('Failed to resolve conflict', error);
      return false;
    }
  }

  /**
   * Auto-resolve simple conflicts using CRDT merge rules
   */
  async autoResolveConflicts(): Promise<number> {
    let resolvedCount = 0;
    const activeConflicts = this.getActiveConflicts();

    for (const conflict of activeConflicts) {
      if (this.canAutoResolve(conflict)) {
        try {
          const merged = this.performAutomergeCRDT(conflict.localVersion, conflict.remoteVersion);
          
          const resolution: ConflictResolution = {
            strategy: 'merge_custom',
            resolvedData: merged,
            reason: 'Automatic CRDT merge - no semantic conflicts detected'
          };

          const success = await this.resolveConflict(conflict.id, resolution);
          if (success) {
            resolvedCount++;
            
            // Mark as auto-resolved
            const updatedConflict = this.conflicts.get(conflict.id);
            if (updatedConflict) {
              this.conflicts.set(conflict.id, {
                ...updatedConflict,
                autoResolved: true
              });
            }
          }
        } catch (error) {
          logger.warn('Auto-resolve failed for conflict', { conflictId: conflict.id, error });
        }
      }
    }

    logger.info('Auto-resolve completed', { resolvedCount, totalConflicts: activeConflicts.length });
    return resolvedCount;
  }

  /**
   * Simulate conflict detection (in real implementation, would hook into Automerge events)
   */
  async detectConflicts(): Promise<ConflictRecord[]> {
    // In a real implementation, this would be triggered by Automerge sync events
    // For demo, we'll create some mock conflicts if none exist
    
    if (this.conflicts.size === 0) {
      this.generateMockConflicts();
    }

    return this.getActiveConflicts();
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): DeviceInfo[] {
    return Array.from(this.devices.values())
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Clear all resolved conflicts
   */
  clearResolvedConflicts(): void {
    const resolved = Array.from(this.conflicts.values())
      .filter(conflict => conflict.resolved);
    
    resolved.forEach(conflict => {
      this.conflicts.delete(conflict.id);
    });

    logger.info('Cleared resolved conflicts', { count: resolved.length });
  }

  private canAutoResolve(conflict: ConflictRecord): boolean {
    // Only auto-resolve if changes are in different fields (no semantic overlap)
    if (conflict.conflictType === 'move_conflict') return true;
    if (conflict.conflictType === 'delete_modify') return false;
    
    // For concurrent edits, check if changes are in different fields
    if (conflict.entityType === 'task') {
      return this.hasNonOverlappingTaskChanges(conflict.localVersion, conflict.remoteVersion);
    }
    
    return false;
  }

  private hasNonOverlappingTaskChanges(local: any, remote: any): boolean {
    // Simple heuristic: if title changed on both sides, require manual resolution
    if (local.title !== remote.title) return false;
    
    // Otherwise, assume CRDT can handle it
    return true;
  }

  private performAutomergeCRDT(local: any, remote: any): any {
    try {
      // Create Automerge documents
      const localDoc = Automerge.from(local);
      const remoteDoc = Automerge.from(remote);
      
      // Merge using Automerge
      const merged = Automerge.merge(localDoc, remoteDoc);
      
      return Automerge.save(merged);
    } catch (error) {
      logger.error('CRDT merge failed', error);
      // Fallback to local version
      return local;
    }
  }

  private initializeMockData(): void {
    // Mock devices
    this.devices.set('device-1', {
      id: 'device-1',
      name: 'MacBook Pro',
      lastSeen: Date.now() - 60000, // 1 minute ago
      syncStatus: 'online'
    });
    
    this.devices.set('device-2', {
      id: 'device-2', 
      name: 'iPhone',
      lastSeen: Date.now() - 300000, // 5 minutes ago
      syncStatus: 'offline'
    });
  }

  private generateMockConflicts(): void {
    // Mock conflict 1: Concurrent task edit
    this.conflicts.set('conflict-1', {
      id: 'conflict-1',
      entityType: 'task',
      entityId: 'task-123',
      conflictType: 'concurrent_edit',
      localVersion: {
        id: 'task-123',
        title: 'Review quarterly reports',
        completed: false,
        priority: 80,
        due: Date.now() + 86400000,
        updatedAt: Date.now() - 30000
      },
      remoteVersion: {
        id: 'task-123', 
        title: 'Review Q3 reports',
        completed: true,
        priority: 90,
        due: Date.now() + 86400000,
        updatedAt: Date.now() - 25000
      },
      timestamp: Date.now() - 30000,
      deviceIds: ['device-1', 'device-2'],
      resolved: false,
      autoResolved: false
    });

    // Mock conflict 2: Move conflict
    this.conflicts.set('conflict-2', {
      id: 'conflict-2',
      entityType: 'task',
      entityId: 'task-456',
      conflictType: 'move_conflict',
      localVersion: {
        id: 'task-456',
        title: 'Update website copy',
        view: { bubble: { x: 100, y: 200 } }
      },
      remoteVersion: {
        id: 'task-456',
        title: 'Update website copy', 
        view: { bubble: { x: 150, y: 250 } }
      },
      timestamp: Date.now() - 60000,
      deviceIds: ['device-1', 'device-2'],
      resolved: false,
      autoResolved: false
    });
  }
}

export const crdtConflictService = new CRDTConflictService();
