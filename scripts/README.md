# Migration Scripts

This directory contains ops-only migration utilities for Mind Manual / Bubble OS.

## Task View Migration

The `migrate-task-views.js` script back-fills `Task.view.list/kanban` metadata from existing Bubble data.

### Usage

```bash
# Analyze migration opportunities (dry run)
npm run migrate:task-views -- --dry-run

# Apply migration with backup
npm run migrate:task-views -- --apply --backup

# Apply specific strategy
npm run migrate:task-views -- --apply --strategy horizon-only

# Validate migration results
npm run migrate:task-views -- --validate

# Rollback to backup
npm run migrate:task-views -- --rollback 2024-01-15T10-30-45-123Z
```

### Strategies

- **auto** (default): Combines all strategies for comprehensive migration
- **horizon-only**: Maps horizon tags (today/week/later) to atomic view only
- **type-based**: Groups bubbles by type for list view
- **position-based**: Uses x/y coordinates for kanban layout

### Safety Features

- **Non-destructive**: Only adds view metadata, never removes Bubble fields
- **Backup creation**: Automatic backup before migration
- **Dry-run mode**: Analyze without making changes
- **Validation**: Round-trip testing ensures data integrity
- **Rollback**: Restore from backup if needed

### Migration Sources

The script analyzes existing Bubble data:

- **Tags**: `today`, `week`, `later` → atomic shell mapping
- **Type**: Bubble type → list group classification  
- **Position**: x/y coordinates → kanban column/position
- **Priority**: Bubble size → ordering within groups

### Example Output

```
Migration Analysis Report
========================

Summary:
- Total Bubbles: 147
- Migratable: 132 (89.8%)
- Already Migrated: 8 (5.4%)
- Conflicts: 7 (4.8%)

Horizon → Atomic View:
✓ 89 bubbles have horizon tags (today: 34, week: 28, later: 27)
✓ All can be migrated to Task.view.atomic safely

Type → List Groups:
✓ 132 bubbles can be grouped by type
  - Tasks: 67 → "Tasks" group
  - Thoughts: 31 → "Ideas" group  
  - Memories: 19 → "References" group

Position → Kanban:
⚠ 94 bubbles have position data
⚠ Detected 4 potential columns based on x-coordinates
⚠ Confidence: MEDIUM (may need manual review)

Run with --apply to execute migration
```

### Architecture

- **CLI Interface**: Commander.js with comprehensive options
- **Migration Engine**: Core analysis and transformation logic
- **Strategy Analyzers**: Specialized analysis for different migration approaches
- **Safety Systems**: Backup, validation, and rollback capabilities

### Development

The migration scripts are TypeScript-based but compiled to JavaScript for execution:

```bash
# Compile TypeScript (if modified)
tsc scripts/lib/*.ts --outDir scripts/lib/ --target es2020 --module commonjs

# Test migration logic
npm test -- scripts/
```

### Security

⚠️ **Ops-Only Tool**: This script is not included in user builds and requires direct file system access. Use only in development/admin environments with proper data backups.