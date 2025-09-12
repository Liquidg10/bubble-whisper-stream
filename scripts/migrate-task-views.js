#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs').promises;

// Import migration engine
const { MigrationEngine } = require('./lib/migration-engine');

program
  .name('migrate-task-views')
  .description('Back-fill Task.view.list/kanban from Bubble data')
  .version('1.0.0')
  .option('--dry-run', 'Show migration plan without applying changes', false)
  .option('--apply', 'Apply the migration (requires explicit confirmation)', false)
  .option('--strategy <strategy>', 'Migration strategy: auto, horizon-only, type-based, position-based', 'auto')
  .option('--backup', 'Create backup before migration', true)
  .option('--force', 'Skip confirmation prompts', false)
  .option('--validate', 'Validate migration results', false)
  .option('--rollback <timestamp>', 'Rollback to a specific backup timestamp')
  .action(async (options) => {
    try {
      console.log('🔄 Mind Manual - Task View Migration Utility');
      console.log('============================================\n');

      const engine = new MigrationEngine(options);
      
      if (options.rollback) {
        console.log(`📦 Rolling back to backup: ${options.rollback}`);
        await engine.rollback(options.rollback);
        return;
      }
      
      if (options.validate) {
        console.log('✅ Validating migration results...');
        await engine.validate();
        return;
      }
      
      if (options.dryRun) {
        console.log('🔍 Analyzing current data (dry run mode)...\n');
        await engine.analyzeAndReport();
      } else if (options.apply) {
        console.log('⚠️  APPLYING MIGRATION - This will modify your data!\n');
        await engine.migrate();
      } else {
        console.log('Usage:');
        console.log('  --dry-run    Show migration plan without changes');
        console.log('  --apply      Execute migration (with confirmation)');
        console.log('  --validate   Check migration results');
        console.log('  --rollback   Restore from backup\n');
        console.log('Example: node scripts/migrate-task-views.js --dry-run');
      }
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      if (options.force) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

program.parse();