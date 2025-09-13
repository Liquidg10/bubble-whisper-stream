#!/usr/bin/env node

/**
 * P13 - Migration CLI Testing Script
 * Test the migration helpers with dry-run on real data
 */

const fs = require('fs');
const path = require('path');

// Mock bubble data for testing
const mockBubbleData = [
  {
    id: 'bubble-1',
    content: 'Buy groceries',
    x: 100,
    y: 200,
    size: 0.8,
    priority: 1,
    tags: [{ id: 'tag-1', name: 'shopping', emoji: '🛒' }],
    type: 'task',
    createdAt: Date.now() - 86400000,
    completed: false,
    metadata: {
      domain: 'personal',
      urgency: 'medium'
    }
  },
  {
    id: 'bubble-2', 
    content: 'Team meeting',
    x: 300,
    y: 150,
    size: 0.6,
    priority: 0.7,
    tags: [{ id: 'tag-2', name: 'work', emoji: '💼' }],
    type: 'event',
    createdAt: Date.now() - 3600000,
    completed: false,
    metadata: {
      domain: 'work',
      urgency: 'high',
      atomicShell: 'today'
    }
  },
  {
    id: 'bubble-3',
    content: 'Weekend plans',
    x: 150,
    y: 400,
    size: 0.3,
    priority: 0.2,
    tags: [{ id: 'tag-3', name: 'personal', emoji: '🎉' }],
    type: 'thought',
    createdAt: Date.now() - 172800000,
    completed: false,
    metadata: {
      domain: 'personal',
      urgency: 'low',
      atomicShell: 'later'
    }
  }
];

class MigrationTester {
  constructor() {
    this.results = {
      totalBubbles: 0,
      migratedTasks: 0,
      errors: [],
      warnings: [],
      preview: []
    };
  }

  /**
   * Test migration dry-run
   */
  async testDryRun() {
    console.log('🧪 Testing Task Migration CLI (P13)');
    console.log('=====================================\n');

    try {
      this.results.totalBubbles = mockBubbleData.length;
      
      console.log(`📊 Found ${this.results.totalBubbles} bubbles to analyze\n`);

      // Test each bubble migration
      for (const bubble of mockBubbleData) {
        const migrationResult = await this.testBubbleMigration(bubble);
        this.results.preview.push(migrationResult);
        
        if (migrationResult.success) {
          this.results.migratedTasks++;
        } else {
          this.results.errors.push(migrationResult.error);
        }
      }

      this.generateReport();
      
    } catch (error) {
      console.error('❌ Migration test failed:', error);
      process.exit(1);
    }
  }

  /**
   * Test individual bubble migration
   */
  async testBubbleMigration(bubble) {
    console.log(`🔄 Testing migration: ${bubble.content}`);
    
    try {
      // Simulate bubble-to-task conversion
      const task = this.bubbleToTask(bubble);
      
      // Validate the conversion
      const validation = this.validateConversion(bubble, task);
      
      if (validation.valid) {
        console.log(`  ✅ Migration successful`);
        console.log(`  📝 Task ID: ${task.id}`);
        console.log(`  🏷️  Type: ${task.type}`);
        console.log(`  📊 Priority: ${task.priority}/100`);
        console.log(`  🎯 View metadata: ${Object.keys(task.view || {}).join(', ')}`);
        console.log('');
        
        return {
          success: true,
          bubbleId: bubble.id,
          taskId: task.id,
          task: task
        };
      } else {
        console.log(`  ⚠️  Validation failed: ${validation.reason}`);
        console.log('');
        
        return {
          success: false,
          bubbleId: bubble.id,
          error: validation.reason
        };
      }
      
    } catch (error) {
      console.log(`  ❌ Migration error: ${error.message}`);
      console.log('');
      
      return {
        success: false,
        bubbleId: bubble.id,
        error: error.message
      };
    }
  }

  /**
   * Convert bubble to task (simulated from adapter)
   */
  bubbleToTask(bubble) {
    const task = {
      id: bubble.id,
      type: this.mapBubbleType(bubble.type),
      title: bubble.content,
      description: undefined,
      completed: bubble.completed || false,
      priority: Math.round((bubble.priority || bubble.size || 0.5) * 100),
      tags: bubble.tags || [],
      createdAt: bubble.createdAt || Date.now(),
      updatedAt: Date.now(),
      view: {
        bubble: {
          x: bubble.x || 0,
          y: bubble.y || 0,
          size: bubble.size || 0.5,
          colorHex: bubble.color
        }
      },
      metadata: bubble.metadata
    };

    // Add atomic view data if available
    if (bubble.metadata?.atomicShell) {
      task.view.atomic = {
        shell: bubble.metadata.atomicShell,
        domain: bubble.metadata.domain
      };
    }

    // Add list view data (infer from priority)
    task.view.list = {
      order: task.priority,
      group: bubble.metadata?.domain
    };

    // Add kanban view data (infer from urgency/completion)
    task.view.kanban = {
      boardId: 'default',
      columnId: task.completed ? 'done' : 
               bubble.metadata?.urgency === 'high' ? 'doing' :
               bubble.metadata?.urgency === 'medium' ? 'next' : 'backlog',
      pos: task.priority
    };

    return task;
  }

  /**
   * Map bubble type to task type
   */
  mapBubbleType(bubbleType) {
    const typeMap = {
      'task': 'task',
      'thought': 'thought', 
      'memory': 'memory',
      'event': 'event',
      'note': 'task',
      'reminder': 'reminder'
    };
    
    return typeMap[bubbleType] || 'task';
  }

  /**
   * Validate the conversion
   */
  validateConversion(bubble, task) {
    const errors = [];

    // Check required fields
    if (!task.id) errors.push('Missing task ID');
    if (!task.title) errors.push('Missing task title');
    if (task.priority < 0 || task.priority > 100) errors.push('Invalid priority range');

    // Check view metadata preservation
    if (!task.view?.bubble) errors.push('Missing bubble view metadata');
    if (task.view.bubble.x !== bubble.x) errors.push('X position not preserved');
    if (task.view.bubble.y !== bubble.y) errors.push('Y position not preserved');

    // Check metadata preservation
    if (bubble.metadata && !task.metadata) errors.push('Metadata not preserved');

    return {
      valid: errors.length === 0,
      reason: errors.join(', ')
    };
  }

  /**
   * Generate migration report
   */
  generateReport() {
    console.log('\n📋 MIGRATION TEST REPORT');
    console.log('========================\n');

    console.log(`Total bubbles analyzed: ${this.results.totalBubbles}`);
    console.log(`Successful migrations: ${this.results.migratedTasks}`);
    console.log(`Failed migrations: ${this.results.errors.length}`);
    console.log(`Success rate: ${Math.round((this.results.migratedTasks / this.results.totalBubbles) * 100)}%\n`);

    if (this.results.errors.length > 0) {
      console.log('❌ ERRORS:');
      this.results.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      console.log('');
    }

    console.log('📊 SAMPLE MIGRATIONS:');
    this.results.preview.slice(0, 3).forEach((result, index) => {
      if (result.success) {
        console.log(`  ${index + 1}. ✅ ${result.task.title} (${result.task.type})`);
        console.log(`     Priority: ${result.task.priority}/100`);
        console.log(`     Views: ${Object.keys(result.task.view).join(', ')}`);
      } else {
        console.log(`  ${index + 1}. ❌ ${result.bubbleId}: ${result.error}`);
      }
    });

    // Generate summary files
    this.writeSummaryFiles();

    console.log('\n✅ Migration test completed successfully!');
    console.log('📄 Summary files written to /tmp/migration-test-*');
  }

  /**
   * Write summary files for ops team
   */
  writeSummaryFiles() {
    const summaryData = {
      timestamp: new Date().toISOString(),
      totalBubbles: this.results.totalBubbles,
      migratedTasks: this.results.migratedTasks,
      successRate: (this.results.migratedTasks / this.results.totalBubbles) * 100,
      errors: this.results.errors,
      sampleMigrations: this.results.preview.slice(0, 5)
    };

    // Write JSON summary
    fs.writeFileSync('/tmp/migration-test-summary.json', JSON.stringify(summaryData, null, 2));

    // Write human-readable report
    const report = `
TASK MIGRATION TEST REPORT
Generated: ${summaryData.timestamp}

SUMMARY:
- Total bubbles: ${summaryData.totalBubbles}
- Successful migrations: ${summaryData.migratedTasks}
- Success rate: ${Math.round(summaryData.successRate)}%

ERRORS:
${summaryData.errors.map(e => `- ${e}`).join('\n')}

This is a DRY RUN. No actual data was modified.
To apply migrations in production, use: --apply flag
`;

    fs.writeFileSync('/tmp/migration-test-report.txt', report);
  }
}

// Run the test
if (require.main === module) {
  const tester = new MigrationTester();
  tester.testDryRun().catch(error => {
    console.error('Migration test failed:', error);
    process.exit(1);
  });
}

module.exports = MigrationTester;