/**
 * Dual-Write Migration System - Phase 2 Architecture
 * Manages transitional state between Bubble and Task authorities
 */

import type { Task } from '@/types/task';
import type { Bubble } from '@/types/bubble';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { decisionTracer } from '@/services/decisionTracer';

export interface MigrationField {
  field: string;
  authority: 'bubble' | 'task' | 'transitional';
  confidence: number;
  lastUpdated: number;
  migrationProgress: number; // 0-100%
}

export interface MigrationState {
  id: string;
  bubbleId: string;
  taskId: string;
  fields: Record<string, MigrationField>;
  overallProgress: number;
  isActive: boolean;
  conflicts: Array<{
    field: string;
    bubbleValue: any;
    taskValue: any;
    timestamp: number;
    resolved: boolean;
  }>;
  rollbackSnapshot?: {
    bubble: Bubble;
    task: Task;
    timestamp: number;
  };
}

export interface MigrationParity {
  bubbleId: string;
  fieldParity: Record<string, {
    match: boolean;
    bubbleValue: any;
    taskValue: any;
    confidence: number;
  }>;
  overallParity: number;
  criticalMismatches: string[];
  warnings: string[];
}

class DualWriteMigrationSystem {
  private migrations = new Map<string, MigrationState>();
  private fieldAuthorities = new Map<string, 'bubble' | 'task'>();
  private isEnabled = false;

  /**
   * Enable dual-write migration system
   */
  enable(): void {
    this.isEnabled = true;
    this.initializeFieldAuthorities();
  }

  /**
   * Disable dual-write and finalize Task authority
   */
  disable(): void {
    this.isEnabled = false;
    this.finalizeTaskAuthority();
  }

  /**
   * Initialize field authority mapping
   */
  private initializeFieldAuthorities(): void {
    // Task is authoritative for core fields
    this.fieldAuthorities.set('id', 'task');
    this.fieldAuthorities.set('title', 'task');
    this.fieldAuthorities.set('type', 'task');
    this.fieldAuthorities.set('completed', 'task');
    this.fieldAuthorities.set('priority', 'task');
    this.fieldAuthorities.set('tags', 'task');
    this.fieldAuthorities.set('createdAt', 'task');
    this.fieldAuthorities.set('updatedAt', 'task');

    // Bubble remains authoritative during transition for view-specific fields
    this.fieldAuthorities.set('x', 'bubble');
    this.fieldAuthorities.set('y', 'bubble');
    this.fieldAuthorities.set('size', 'bubble');
    this.fieldAuthorities.set('content', 'bubble');
  }

  /**
   * Create migration state for bubble-task pair
   */
  createMigration(bubbleId: string, bubble: Bubble): MigrationState {
    const task = bubbleToTask(bubble);
    const migrationId = `migration-${bubbleId}`;

    const fields: Record<string, MigrationField> = {};
    
    // Initialize field migration states
    const coreFields = ['id', 'title', 'type', 'completed', 'priority', 'tags'];
    const viewFields = ['x', 'y', 'size', 'content'];

    coreFields.forEach(field => {
      fields[field] = {
        field,
        authority: 'task',
        confidence: 0.9,
        lastUpdated: Date.now(),
        migrationProgress: 100
      };
    });

    viewFields.forEach(field => {
      fields[field] = {
        field,
        authority: 'bubble',
        confidence: 1.0,
        lastUpdated: Date.now(),
        migrationProgress: 0
      };
    });

    const migration: MigrationState = {
      id: migrationId,
      bubbleId,
      taskId: task.id || bubbleId,
      fields,
      overallProgress: 50, // Transitional state
      isActive: true,
      conflicts: [],
      rollbackSnapshot: {
        bubble: { ...bubble },
        task: { ...task },
        timestamp: Date.now()
      }
    };

    this.migrations.set(bubbleId, migration);

    decisionTracer.trace({
      action: 'migration_created',
      input: { bubbleId, taskId: task.id },
      confidence: 0.8,
      reasoning: 'Created dual-write migration state',
      metadata: { migrationId, fieldCount: Object.keys(fields).length }
    });

    return migration;
  }

  /**
   * Update field during dual-write phase
   */
  updateField(bubbleId: string, field: string, value: any, source: 'bubble' | 'task'): void {
    if (!this.isEnabled) return;

    const migration = this.migrations.get(bubbleId);
    if (!migration) return;

    const fieldAuth = this.fieldAuthorities.get(field);
    const fieldMigration = migration.fields[field];

    if (!fieldMigration) {
      migration.fields[field] = {
        field,
        authority: fieldAuth || 'transitional',
        confidence: 0.5,
        lastUpdated: Date.now(),
        migrationProgress: source === fieldAuth ? 100 : 0
      };
    }

    // Check for conflicts
    if (fieldAuth && fieldAuth !== source) {
      const conflict = {
        field,
        bubbleValue: source === 'bubble' ? value : 'unknown',
        taskValue: source === 'task' ? value : 'unknown',
        timestamp: Date.now(),
        resolved: false
      };
      migration.conflicts.push(conflict);

      decisionTracer.trace({
        action: 'migration_conflict',
        input: { bubbleId, field, source, value },
        confidence: 0.3,
        reasoning: `Field authority conflict: ${field} updated by ${source} but authority is ${fieldAuth}`,
        metadata: { conflictId: conflict.timestamp }
      });
    }

    // Update field migration state
    migration.fields[field].lastUpdated = Date.now();
    if (source === fieldAuth) {
      migration.fields[field].migrationProgress = 100;
      migration.fields[field].confidence = Math.min(1.0, migration.fields[field].confidence + 0.1);
    }

    this.updateOverallProgress(migration);
  }

  /**
   * Calculate and update overall migration progress
   */
  private updateOverallProgress(migration: MigrationState): void {
    const fields = Object.values(migration.fields);
    const totalProgress = fields.reduce((sum, f) => sum + f.migrationProgress, 0);
    migration.overallProgress = Math.round(totalProgress / fields.length);

    // Auto-finalize if progress is complete
    if (migration.overallProgress >= 95 && migration.conflicts.length === 0) {
      this.finalizeMigration(migration.bubbleId);
    }
  }

  /**
   * Finalize migration - make Task fully authoritative
   */
  finalizeMigration(bubbleId: string): void {
    const migration = this.migrations.get(bubbleId);
    if (!migration) return;

    // Transfer remaining bubble authorities to task
    Object.values(migration.fields).forEach(field => {
      if (field.authority === 'bubble') {
        field.authority = 'task';
        field.migrationProgress = 100;
        this.fieldAuthorities.set(field.field, 'task');
      }
    });

    migration.overallProgress = 100;
    migration.isActive = false;

    decisionTracer.trace({
      action: 'migration_finalized',
      input: { bubbleId },
      confidence: 1.0,
      reasoning: 'Migration completed - Task is now fully authoritative',
      metadata: { fieldCount: Object.keys(migration.fields).length }
    });
  }

  /**
   * Rollback migration to original bubble state
   */
  rollbackMigration(bubbleId: string): boolean {
    const migration = this.migrations.get(bubbleId);
    if (!migration?.rollbackSnapshot) return false;

    // Restore original authorities
    this.initializeFieldAuthorities();

    // Reset migration state
    migration.overallProgress = 0;
    migration.conflicts = [];
    migration.isActive = false;

    decisionTracer.trace({
      action: 'migration_rolled_back',
      input: { bubbleId },
      confidence: 1.0,
      reasoning: 'Migration rolled back to original bubble state',
      metadata: { rollbackTimestamp: migration.rollbackSnapshot.timestamp }
    });

    return true;
  }

  /**
   * Get field parity between bubble and task
   */
  calculateParity(bubbleId: string, bubble: Bubble, task: Task): MigrationParity {
    const fieldParity: Record<string, any> = {};
    const criticalMismatches: string[] = [];
    const warnings: string[] = [];

    // Core field parity checks
    const coreFields = ['title', 'completed', 'priority'];
    
    coreFields.forEach(field => {
      const bubbleValue = (bubble as any)[field];
      const taskValue = (task as any)[field];
      const match = this.deepEqual(bubbleValue, taskValue);
      
      fieldParity[field] = {
        match,
        bubbleValue,
        taskValue,
        confidence: match ? 1.0 : 0.0
      };

      if (!match) {
        criticalMismatches.push(field);
      }
    });

    // Tag parity (more complex)
    const bubbleTagNames = bubble.tags.map(t => t.name).sort();
    const taskTagNames = task.tags.map(t => t.name).sort();
    const tagsMatch = JSON.stringify(bubbleTagNames) === JSON.stringify(taskTagNames);
    
    fieldParity.tags = {
      match: tagsMatch,
      bubbleValue: bubbleTagNames,
      taskValue: taskTagNames,
      confidence: tagsMatch ? 1.0 : 0.5
    };

    if (!tagsMatch) {
      warnings.push('Tag mismatch detected');
    }

    // Calculate overall parity
    const totalFields = Object.keys(fieldParity).length;
    const matchingFields = Object.values(fieldParity).filter(p => p.match).length;
    const overallParity = Math.round((matchingFields / totalFields) * 100);

    return {
      bubbleId,
      fieldParity,
      overallParity,
      criticalMismatches,
      warnings
    };
  }

  /**
   * Get all migration states
   */
  getAllMigrations(): MigrationState[] {
    return Array.from(this.migrations.values());
  }

  /**
   * Get migration state for specific bubble
   */
  getMigration(bubbleId: string): MigrationState | undefined {
    return this.migrations.get(bubbleId);
  }

  /**
   * Finalize all migrations and switch to Task authority
   */
  private finalizeTaskAuthority(): void {
    this.migrations.forEach(migration => {
      if (migration.isActive) {
        this.finalizeMigration(migration.bubbleId);
      }
    });

    // Clear field authorities - Task is now sole authority
    this.fieldAuthorities.clear();
  }

  /**
   * Deep equality check for field values
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      activeMigrations: Array.from(this.migrations.values()).filter(m => m.isActive).length,
      totalMigrations: this.migrations.size,
      avgProgress: this.migrations.size > 0 
        ? Math.round(Array.from(this.migrations.values())
            .reduce((sum, m) => sum + m.overallProgress, 0) / this.migrations.size)
        : 0,
      totalConflicts: Array.from(this.migrations.values())
        .reduce((sum, m) => sum + m.conflicts.filter(c => !c.resolved).length, 0)
    };
  }
}

export const dualWriteMigrationSystem = new DualWriteMigrationSystem();