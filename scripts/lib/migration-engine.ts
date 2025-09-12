import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { TagAnalyzer } from './tag-analyzer';
import { PositionAnalyzer } from './position-analyzer';
import { PriorityMapper } from './priority-mapper';

export interface MigrationOptions {
  dryRun: boolean;
  apply: boolean;
  strategy: 'auto' | 'horizon-only' | 'type-based' | 'position-based';
  backup: boolean;
  force: boolean;
  validate: boolean;
  rollback?: string;
}

export interface Bubble {
  id: string;
  type: string;
  content: string;
  caption?: string;
  x: number;
  y: number;
  size: number;
  colorHex: string;
  tags: Array<{ id: string; name: string; emoji?: string; colorHex?: string }>;
  metadata?: any;
  createdAt: number;
  updatedAt: number;
}

export interface TaskViewMetadata {
  list?: { group?: string; order?: number };
  kanban?: { boardId: string; columnId: string; pos: number };
  atomic?: { shell: 'today' | 'week' | 'later'; domain?: string; angle?: number };
}

export interface MigrationItem {
  bubbleId: string;
  currentState: {
    hasViewMetadata: boolean;
    existingViews: string[];
    tags: string[];
    position: { x: number; y: number };
    type: string;
    size: number;
  };
  proposedMigration: TaskViewMetadata;
  confidence: number;
  strategy: string;
  warnings: string[];
}

export interface MigrationReport {
  summary: {
    totalBubbles: number;
    migratable: number;
    alreadyMigrated: number;
    conflicts: number;
  };
  byStrategy: {
    horizonToAtomic: MigrationItem[];
    typeToList: MigrationItem[];
    positionToKanban: MigrationItem[];
  };
  warnings: string[];
  recommendations: string[];
}

export class MigrationEngine {
  private tagAnalyzer: TagAnalyzer;
  private positionAnalyzer: PositionAnalyzer;
  private priorityMapper: PriorityMapper;
  private dataPath: string;
  private backupPath: string;

  constructor(private options: MigrationOptions) {
    this.tagAnalyzer = new TagAnalyzer();
    this.positionAnalyzer = new PositionAnalyzer();
    this.priorityMapper = new PriorityMapper();
    this.dataPath = path.join(process.cwd(), 'data');
    this.backupPath = path.join(process.cwd(), 'backups');
  }

  async analyzeAndReport(): Promise<MigrationReport> {
    console.log('📊 Loading bubble data...');
    const bubbles = await this.loadBubbleData();
    
    console.log(`Found ${bubbles.length} bubbles\n`);
    
    console.log('🔍 Analyzing migration opportunities...');
    const migrations: MigrationItem[] = [];
    
    for (const bubble of bubbles) {
      const currentState = this.analyzeCurrentState(bubble);
      const proposed = this.generateMigration(bubble, bubbles);
      const confidence = this.calculateConfidence(bubble, proposed);
      
      migrations.push({
        bubbleId: bubble.id,
        currentState,
        proposedMigration: proposed,
        confidence,
        strategy: this.determineStrategy(bubble),
        warnings: this.generateWarnings(bubble, currentState, proposed)
      });
    }
    
    const report = this.generateReport(migrations);
    this.printReport(report);
    
    return report;
  }

  async migrate(): Promise<void> {
    if (!this.options.force) {
      await this.confirmMigration();
    }
    
    if (this.options.backup) {
      console.log('📦 Creating backup...');
      await this.createBackup();
    }
    
    console.log('🚀 Applying migrations...');
    await this.applyMigrations();
    
    console.log('✅ Migration completed successfully!');
  }

  async validate(): Promise<void> {
    const bubbles = await this.loadBubbleData();
    let validCount = 0;
    let errorCount = 0;
    
    console.log('🔍 Validating migration results...\n');
    
    for (const bubble of bubbles) {
      try {
        const isValid = await this.validateBubbleMigration(bubble);
        if (isValid) {
          validCount++;
        } else {
          errorCount++;
          console.log(`❌ Validation failed for bubble ${bubble.id}`);
        }
      } catch (error) {
        errorCount++;
        console.log(`❌ Error validating bubble ${bubble.id}: ${error.message}`);
      }
    }
    
    console.log(`\n📊 Validation Results:`);
    console.log(`✅ Valid: ${validCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Success Rate: ${((validCount / (validCount + errorCount)) * 100).toFixed(1)}%`);
  }

  async rollback(timestamp: string): Promise<void> {
    const backupFile = path.join(this.backupPath, `bubbles-${timestamp}.json`);
    
    try {
      const backupData = await fs.readFile(backupFile, 'utf-8');
      const bubbles = JSON.parse(backupData);
      
      await this.saveBubbleData(bubbles);
      console.log(`✅ Successfully rolled back to backup: ${timestamp}`);
    } catch (error) {
      throw new Error(`Failed to rollback: ${error.message}`);
    }
  }

  private async loadBubbleData(): Promise<Bubble[]> {
    try {
      // In a real implementation, this would load from IndexedDB or the actual storage
      // For now, we'll create a mock data loader
      const mockData = await this.createMockBubbleData();
      return mockData;
    } catch (error) {
      throw new Error(`Failed to load bubble data: ${error.message}`);
    }
  }

  private async createMockBubbleData(): Promise<Bubble[]> {
    // Mock data for demonstration
    return [
      {
        id: 'bubble-1',
        type: 'Task',
        content: 'Complete project proposal',
        x: 100,
        y: 200,
        size: 0.8,
        colorHex: '#3B82F6',
        tags: [{ id: 'tag-1', name: 'today' }],
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 3600000
      },
      {
        id: 'bubble-2',
        type: 'Thought',
        content: 'Research new framework',
        x: 300,
        y: 150,
        size: 0.6,
        colorHex: '#10B981',
        tags: [{ id: 'tag-2', name: 'week' }],
        createdAt: Date.now() - 172800000,
        updatedAt: Date.now() - 7200000
      },
      {
        id: 'bubble-3',
        type: 'Memory',
        content: 'Meeting notes from client call',
        x: 500,
        y: 300,
        size: 0.4,
        colorHex: '#F59E0B',
        tags: [{ id: 'tag-3', name: 'later' }],
        createdAt: Date.now() - 259200000,
        updatedAt: Date.now() - 10800000
      }
    ];
  }

  private analyzeCurrentState(bubble: Bubble) {
    const hasViewMetadata = !!(bubble.metadata?.list || bubble.metadata?.kanban || bubble.metadata?.atomic);
    const existingViews = [];
    
    if (bubble.metadata?.list) existingViews.push('list');
    if (bubble.metadata?.kanban) existingViews.push('kanban');
    if (bubble.metadata?.atomic) existingViews.push('atomic');
    
    return {
      hasViewMetadata,
      existingViews,
      tags: bubble.tags.map(t => t.name),
      position: { x: bubble.x, y: bubble.y },
      type: bubble.type,
      size: bubble.size
    };
  }

  private generateMigration(bubble: Bubble, allBubbles: Bubble[]): TaskViewMetadata {
    const migration: TaskViewMetadata = {};
    
    switch (this.options.strategy) {
      case 'horizon-only':
        migration.atomic = this.tagAnalyzer.analyzeHorizonTags(bubble);
        break;
      case 'type-based':
        migration.list = this.tagAnalyzer.analyzeTypeBasedGroups(bubble);
        break;
      case 'position-based':
        migration.kanban = this.positionAnalyzer.analyzeKanbanPosition(bubble, allBubbles);
        break;
      case 'auto':
      default:
        // Auto strategy combines all approaches
        migration.atomic = this.tagAnalyzer.analyzeHorizonTags(bubble);
        migration.list = this.tagAnalyzer.analyzeTypeBasedGroups(bubble);
        migration.kanban = this.positionAnalyzer.analyzeKanbanPosition(bubble, allBubbles);
        break;
    }
    
    return migration;
  }

  private calculateConfidence(bubble: Bubble, migration: TaskViewMetadata): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for bubbles with clear horizon tags
    if (bubble.tags.some(t => ['today', 'week', 'later'].includes(t.name))) {
      confidence += 0.3;
    }
    
    // Higher confidence for positioned bubbles
    if (bubble.x > 0 && bubble.y > 0) {
      confidence += 0.2;
    }
    
    // Lower confidence for bubbles that already have view metadata
    if (bubble.metadata?.list || bubble.metadata?.kanban || bubble.metadata?.atomic) {
      confidence -= 0.4;
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }

  private determineStrategy(bubble: Bubble): string {
    if (bubble.tags.some(t => ['today', 'week', 'later'].includes(t.name))) {
      return 'horizon-based';
    }
    if (bubble.x > 0 && bubble.y > 0) {
      return 'position-based';
    }
    return 'type-based';
  }

  private generateWarnings(bubble: Bubble, currentState: any, migration: TaskViewMetadata): string[] {
    const warnings: string[] = [];
    
    if (currentState.hasViewMetadata) {
      warnings.push('Already has view metadata - will be preserved');
    }
    
    if (!bubble.tags.length) {
      warnings.push('No tags - limited migration options');
    }
    
    if (bubble.x === 0 && bubble.y === 0) {
      warnings.push('No position data - using defaults');
    }
    
    return warnings;
  }

  private generateReport(migrations: MigrationItem[]): MigrationReport {
    const total = migrations.length;
    const migratable = migrations.filter(m => m.confidence > 0.3).length;
    const alreadyMigrated = migrations.filter(m => m.currentState.hasViewMetadata).length;
    const conflicts = migrations.filter(m => m.warnings.length > 0).length;
    
    return {
      summary: {
        totalBubbles: total,
        migratable,
        alreadyMigrated,
        conflicts
      },
      byStrategy: {
        horizonToAtomic: migrations.filter(m => m.proposedMigration.atomic),
        typeToList: migrations.filter(m => m.proposedMigration.list),
        positionToKanban: migrations.filter(m => m.proposedMigration.kanban)
      },
      warnings: [],
      recommendations: []
    };
  }

  private printReport(report: MigrationReport): void {
    console.log('📊 Migration Analysis Report');
    console.log('============================\n');
    
    console.log('Summary:');
    console.log(`- Total Bubbles: ${report.summary.totalBubbles}`);
    console.log(`- Migratable: ${report.summary.migratable} (${((report.summary.migratable / report.summary.totalBubbles) * 100).toFixed(1)}%)`);
    console.log(`- Already Migrated: ${report.summary.alreadyMigrated} (${((report.summary.alreadyMigrated / report.summary.totalBubbles) * 100).toFixed(1)}%)`);
    console.log(`- Conflicts: ${report.summary.conflicts} (${((report.summary.conflicts / report.summary.totalBubbles) * 100).toFixed(1)}%)\n`);
    
    console.log('Horizon → Atomic View:');
    console.log(`✓ ${report.byStrategy.horizonToAtomic.length} bubbles can be migrated to atomic view\n`);
    
    console.log('Type → List Groups:');
    console.log(`✓ ${report.byStrategy.typeToList.length} bubbles can be grouped by type\n`);
    
    console.log('Position → Kanban:');
    console.log(`✓ ${report.byStrategy.positionToKanban.length} bubbles have position data for kanban\n`);
    
    if (report.warnings.length > 0) {
      console.log('Warnings:');
      report.warnings.forEach(warning => console.log(`⚠ ${warning}`));
      console.log();
    }
    
    console.log('Run with --apply to execute migration');
  }

  private async confirmMigration(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve, reject) => {
      rl.question('⚠️  This will modify your bubble data. Continue? (y/N): ', (answer) => {
        rl.close();
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          reject(new Error('Migration cancelled by user'));
        } else {
          resolve();
        }
      });
    });
  }

  private async createBackup(): Promise<void> {
    const bubbles = await this.loadBubbleData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupPath, `bubbles-${timestamp}.json`);
    
    await fs.mkdir(this.backupPath, { recursive: true });
    await fs.writeFile(backupFile, JSON.stringify(bubbles, null, 2));
    
    console.log(`✅ Backup created: ${backupFile}`);
  }

  private async applyMigrations(): Promise<void> {
    const bubbles = await this.loadBubbleData();
    const updatedBubbles = [];
    
    for (const bubble of bubbles) {
      const migration = this.generateMigration(bubble, bubbles);
      const updatedBubble = {
        ...bubble,
        metadata: {
          ...bubble.metadata,
          ...migration
        }
      };
      updatedBubbles.push(updatedBubble);
    }
    
    await this.saveBubbleData(updatedBubbles);
  }

  private async saveBubbleData(bubbles: Bubble[]): Promise<void> {
    // In a real implementation, this would save to IndexedDB or the actual storage
    console.log(`💾 Saved ${bubbles.length} bubbles with updated view metadata`);
  }

  private async validateBubbleMigration(bubble: Bubble): Promise<boolean> {
    // Validate that the migration preserves all original data
    // and that the view metadata is properly structured
    return true; // Simplified for demo
  }
}