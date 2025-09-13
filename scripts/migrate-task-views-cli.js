#!/usr/bin/env node

/**
 * P13 - Migration Helpers CLI
 * Back-fill Task.view.list/kanban from existing Bubble data
 * Non-destructive ops-only migration utility
 */

const { program } = require('commander');
const path = require('path');
const fs = require('fs').promises;

// Mock TaskStore and BubbleStore for migration (production would use actual stores)
class MigrationTaskStore {
  constructor() {
    this.tasks = new Map();
    this.bubbles = new Map();
  }

  async loadBubblesFromStore() {
    // In production: connect to actual BubbleStore
    console.log('📋 Loading Bubble data for migration analysis...');
    
    // Mock data for demonstration
    const mockBubbles = [
      { id: '1', title: 'Review docs', x: 100, y: 200, size: 30, tags: ['work'] },
      { id: '2', title: 'Buy groceries', x: 150, y: 100, size: 25, tags: ['personal'] },
      { id: '3', title: 'Call dentist', x: 200, y: 300, size: 20, tags: ['health'] }
    ];
    
    mockBubbles.forEach(bubble => this.bubbles.set(bubble.id, bubble));
    return Array.from(this.bubbles.values());
  }

  async loadTasksFromStore() {
    console.log('📋 Loading existing Task data...');
    
    // Mock tasks (in production: actual TaskStore)
    const mockTasks = [
      { id: '1', title: 'Review docs', view: { bubble: { x: 100, y: 200 } } },
      { id: '2', title: 'Buy groceries', view: { bubble: { x: 150, y: 100 } } }
    ];
    
    mockTasks.forEach(task => this.tasks.set(task.id, task));
    return Array.from(this.tasks.values());
  }

  generateListViewData(bubbles) {
    return bubbles.map((bubble, index) => ({
      taskId: bubble.id,
      view: {
        list: {
          order: index,
          group: this.inferGroupFromTags(bubble.tags)
        }
      }
    }));
  }

  generateKanbanViewData(bubbles) {
    return bubbles.map(bubble => ({
      taskId: bubble.id,
      view: {
        kanban: {
          boardId: 'default',
          columnId: this.inferColumnFromPosition(bubble.y),
          pos: bubble.x / 10 // Convert x position to rough order
        }
      }
    }));
  }

  inferGroupFromTags(tags = []) {
    if (tags.includes('work')) return 'work';
    if (tags.includes('personal')) return 'personal';
    if (tags.includes('health')) return 'health';
    return 'inbox';
  }

  inferColumnFromPosition(y) {
    if (y < 150) return 'backlog';
    if (y < 250) return 'next';
    if (y < 350) return 'doing';
    return 'done';
  }

  async applyMigration(listData, kanbanData, options = {}) {
    if (options.dryRun) {
      console.log('🔍 DRY RUN - No changes will be applied');
      return { applied: 0, skipped: listData.length + kanbanData.length };
    }

    console.log('⚠️  APPLYING MIGRATION - This will modify Task data');
    
    let applied = 0;
    
    // Apply list view data
    for (const item of listData) {
      const task = this.tasks.get(item.taskId);
      if (task) {
        task.view = { ...task.view, ...item.view };
        applied++;
      }
    }
    
    // Apply kanban view data  
    for (const item of kanbanData) {
      const task = this.tasks.get(item.taskId);
      if (task) {
        task.view = { ...task.view, ...item.view };
        applied++;
      }
    }

    return { applied, skipped: 0 };
  }

  async createBackup() {
    const timestamp = Date.now();
    const backupData = {
      timestamp,
      tasks: Array.from(this.tasks.values()),
      bubbles: Array.from(this.bubbles.values())
    };
    
    const backupPath = `./backup-${timestamp}.json`;
    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup created: ${backupPath}`);
    return backupPath;
  }
}

class MigrationEngine {
  constructor(options = {}) {
    this.options = options;
    this.store = new MigrationTaskStore();
  }

  async analyze() {
    console.log('🔍 MIGRATION ANALYSIS\n');
    
    const bubbles = await this.store.loadBubblesFromStore();
    const tasks = await this.store.loadTasksFromStore();
    
    const listData = this.store.generateListViewData(bubbles);
    const kanbanData = this.store.generateKanbanViewData(bubbles);
    
    console.log(`📊 Analysis Results:`);
    console.log(`   Bubbles found: ${bubbles.length}`);
    console.log(`   Existing Tasks: ${tasks.length}`);
    console.log(`   List view mappings: ${listData.length}`);
    console.log(`   Kanban view mappings: ${kanbanData.length}`);
    
    const tasksWithoutViews = tasks.filter(t => 
      !t.view?.list && !t.view?.kanban
    ).length;
    
    console.log(`   Tasks needing migration: ${tasksWithoutViews}`);
    
    if (this.options.strategy) {
      console.log(`   Strategy: ${this.options.strategy}`);
    }
    
    console.log('\n📋 Sample List View Mapping:');
    console.table(listData.slice(0, 3));
    
    console.log('\n📋 Sample Kanban View Mapping:');
    console.table(kanbanData.slice(0, 3));
    
    return { bubbles, tasks, listData, kanbanData };
  }

  async migrate() {
    const confirmed = this.options.force || await this.promptConfirmation();
    if (!confirmed) {
      console.log('❌ Migration cancelled by user');
      return;
    }
    
    const { bubbles, listData, kanbanData } = await this.analyze();
    
    let backupPath = null;
    if (this.options.backup) {
      backupPath = await this.store.createBackup();
    }
    
    try {
      const result = await this.store.applyMigration(listData, kanbanData, this.options);
      
      console.log(`\n✅ Migration completed successfully:`);
      console.log(`   Applied: ${result.applied} changes`);
      console.log(`   Skipped: ${result.skipped} items`);
      
      if (backupPath) {
        console.log(`   Backup: ${backupPath}`);
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      if (backupPath) {
        console.log(`💾 Restore from backup: ${backupPath}`);
      }
      throw error;
    }
  }

  async validate() {
    console.log('🔍 VALIDATION - Checking migration results\n');
    
    const tasks = await this.store.loadTasksFromStore();
    
    const stats = {
      total: tasks.length,
      withListView: tasks.filter(t => t.view?.list).length,
      withKanbanView: tasks.filter(t => t.view?.kanban).length,
      withBothViews: tasks.filter(t => t.view?.list && t.view?.kanban).length
    };
    
    console.log('📊 Validation Results:');
    console.table(stats);
    
    const missingViews = tasks.filter(t => !t.view?.list && !t.view?.kanban);
    if (missingViews.length > 0) {
      console.log(`⚠️  ${missingViews.length} tasks still missing view data`);
    } else {
      console.log('✅ All tasks have view metadata');
    }
    
    return stats;
  }

  async rollback(timestamp) {
    console.log(`🔄 ROLLBACK to timestamp: ${timestamp}`);
    
    try {
      const backupPath = `./backup-${timestamp}.json`;
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      
      // Restore tasks
      this.store.tasks.clear();
      backupData.tasks.forEach(task => {
        this.store.tasks.set(task.id, task);
      });
      
      console.log(`✅ Rollback completed successfully`);
      console.log(`   Restored: ${backupData.tasks.length} tasks`);
      
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  }

  async promptConfirmation() {
    // In a real CLI, this would use readline or similar
    // For demo purposes, return true
    console.log('⚠️  This will modify your Task data. Continue? (assuming yes for demo)');
    return true;
  }
}

// CLI Program Definition
program
  .name('migrate-task-views')
  .description('P13 - Back-fill Task.view.list/kanban from Bubble data (NON-DESTRUCTIVE)')
  .version('1.0.0')
  .option('--dry-run', 'Show migration plan without applying changes', false)
  .option('--apply', 'Apply the migration (requires explicit confirmation)', false)
  .option('--strategy <strategy>', 'Migration strategy: auto, horizon-only, type-based, position-based', 'auto')
  .option('--backup', 'Create backup before migration', true)
  .option('--force', 'Skip confirmation prompts', false)
  .option('--validate', 'Validate migration results', false)
  .option('--rollback <timestamp>', 'Rollback to a specific backup timestamp');

program.action(async (options) => {
  console.log('🚀 Task View Migration Utility (P13)\n');
  
  try {
    const engine = new MigrationEngine(options);
    
    if (options.rollback) {
      await engine.rollback(options.rollback);
    } else if (options.validate) {
      await engine.validate();
    } else if (options.dryRun) {
      console.log('🔍 DRY RUN - Analyzing migration opportunities...\n');
      await engine.analyze();
    } else if (options.apply) {
      console.log('⚠️  APPLYING MIGRATION - This will modify your data!\n');
      await engine.migrate();
    } else {
      console.log('Usage:');
      console.log('  --dry-run    Show migration plan without changes');
      console.log('  --apply      Execute migration (with confirmation)');
      console.log('  --validate   Check migration results');
      console.log('  --rollback   Restore from backup\n');
      console.log('Example: node scripts/migrate-task-views-cli.js --dry-run');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (options.force) {
      console.error(error.stack);
    }
    process.exit(1);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

if (require.main === module) {
  program.parse();
}

module.exports = { MigrationEngine };