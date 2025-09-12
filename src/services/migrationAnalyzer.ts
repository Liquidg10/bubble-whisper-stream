import type { Bubble } from '../types/bubble';
import type { TaskViewMetadata } from '../types/task';

export interface MigrationOpportunity {
  bubbleId: string;
  confidence: number;
  strategies: Array<{
    type: 'horizon' | 'type' | 'position' | 'priority';
    metadata: Partial<TaskViewMetadata>;
    reasoning: string;
  }>;
  warnings: string[];
}

export interface MigrationPlan {
  total: number;
  viable: number;
  strategies: {
    horizon: MigrationOpportunity[];
    type: MigrationOpportunity[];
    position: MigrationOpportunity[];
    hybrid: MigrationOpportunity[];
  };
  recommendations: string[];
}

/**
 * Service for analyzing existing Bubble data to identify migration opportunities
 * to Task view metadata (list, kanban, atomic views)
 */
export class MigrationAnalyzer {
  private readonly horizonTags = new Set(['today', 'week', 'later']);
  private readonly urgencyTags = new Set(['urgent', 'important', 'asap', 'critical']);
  private readonly domainTags = new Set(['work', 'personal', 'health', 'learning', 'finance']);

  /**
   * Analyze a collection of bubbles for migration opportunities
   */
  analyzeBubblesForMigration(bubbles: Bubble[]): MigrationPlan {
    const opportunities = bubbles.map(bubble => this.analyzeBubble(bubble, bubbles));
    
    const viable = opportunities.filter(opp => opp.confidence > 0.3);
    
    const strategies = {
      horizon: opportunities.filter(opp => 
        opp.strategies.some(s => s.type === 'horizon')
      ),
      type: opportunities.filter(opp => 
        opp.strategies.some(s => s.type === 'type')
      ),
      position: opportunities.filter(opp => 
        opp.strategies.some(s => s.type === 'position')
      ),
      hybrid: opportunities.filter(opp => 
        opp.strategies.length > 1
      )
    };

    const recommendations = this.generateRecommendations(bubbles, opportunities);

    return {
      total: bubbles.length,
      viable: viable.length,
      strategies,
      recommendations
    };
  }

  /**
   * Analyze a single bubble for migration opportunities
   */
  private analyzeBubble(bubble: Bubble, allBubbles: Bubble[]): MigrationOpportunity {
    const strategies: Array<{
      type: 'horizon' | 'type' | 'position' | 'priority';
      metadata: Partial<TaskViewMetadata>;
      reasoning: string;
    }> = [];

    const warnings: string[] = [];

    // Check for existing view metadata
    if (bubble.metadata?.list || bubble.metadata?.kanban || bubble.metadata?.atomic) {
      warnings.push('Already has view metadata - migration will merge, not replace');
    }

    // Strategy 1: Horizon-based (tags to atomic view)
    const horizonStrategy = this.analyzeHorizonStrategy(bubble);
    if (horizonStrategy) {
      strategies.push(horizonStrategy);
    }

    // Strategy 2: Type-based (bubble type to list groups)
    const typeStrategy = this.analyzeTypeStrategy(bubble);
    if (typeStrategy) {
      strategies.push(typeStrategy);
    }

    // Strategy 3: Position-based (coordinates to kanban)
    const positionStrategy = this.analyzePositionStrategy(bubble, allBubbles);
    if (positionStrategy) {
      strategies.push(positionStrategy);
    }

    // Calculate overall confidence
    const confidence = this.calculateMigrationConfidence(bubble, strategies);

    return {
      bubbleId: bubble.id,
      confidence,
      strategies,
      warnings
    };
  }

  /**
   * Analyze horizon tag strategy (today/week/later → atomic view)
   */
  private analyzeHorizonStrategy(bubble: Bubble): {
    type: 'horizon';
    metadata: Partial<TaskViewMetadata>;
    reasoning: string;
  } | null {
    const horizonTag = bubble.tags.find(tag => this.horizonTags.has(tag.name));
    if (!horizonTag) return null;

    const domainTag = bubble.tags.find(tag => this.domainTags.has(tag.name));
    const shell = horizonTag.name as 'today' | 'week' | 'later';

    return {
      type: 'horizon',
      metadata: {
        atomic: {
          shell,
          domain: domainTag?.name || this.inferDomainFromContent(bubble.content),
          angle: this.calculateAngleFromBubble(bubble)
        }
      },
      reasoning: `Has "${horizonTag.name}" tag which maps directly to atomic shell "${shell}"`
    };
  }

  /**
   * Analyze type-based strategy (bubble type → list groups)
   */
  private analyzeTypeStrategy(bubble: Bubble): {
    type: 'type';
    metadata: Partial<TaskViewMetadata>;
    reasoning: string;
  } | null {
    const typeGroupMap: Record<string, string> = {
      'Task': 'Tasks',
      'Thought': 'Ideas',
      'Memory': 'References',
      'Mood': 'Reflections',
      'ReminderNote': 'Reminders',
      'Photo': 'Media'
    };

    const group = typeGroupMap[bubble.type];
    if (!group) return null;

    const priority = Math.round(bubble.size * 100);
    
    // Check for urgency tags that might affect ordering
    const hasUrgencyTag = bubble.tags.some(tag => this.urgencyTags.has(tag.name));
    const adjustedOrder = hasUrgencyTag ? Math.min(100, priority + 20) : priority;

    return {
      type: 'type',
      metadata: {
        list: {
          group,
          order: adjustedOrder
        }
      },
      reasoning: `Bubble type "${bubble.type}" maps to list group "${group}" with priority-based ordering`
    };
  }

  /**
   * Analyze position-based strategy (x/y coordinates → kanban)
   */
  private analyzePositionStrategy(bubble: Bubble, allBubbles: Bubble[]): {
    type: 'position';
    metadata: Partial<TaskViewMetadata>;
    reasoning: string;
  } | null {
    if (bubble.x === 0 && bubble.y === 0) return null;

    // Analyze all bubbles to identify column structure
    const positionedBubbles = allBubbles.filter(b => b.x > 0 || b.y > 0);
    if (positionedBubbles.length < 2) return null;

    const columnId = this.determineColumnFromPosition(bubble, positionedBubbles);
    const position = this.calculateKanbanPosition(bubble, positionedBubbles, columnId);

    return {
      type: 'position',
      metadata: {
        kanban: {
          boardId: 'main',
          columnId,
          pos: position
        }
      },
      reasoning: `Position (${bubble.x}, ${bubble.y}) suggests kanban column "${columnId}" at position ${position}`
    };
  }

  /**
   * Calculate overall migration confidence
   */
  private calculateMigrationConfidence(bubble: Bubble, strategies: any[]): number {
    if (strategies.length === 0) return 0;

    let confidence = 0.4; // Base confidence

    // Boost confidence for multiple viable strategies
    if (strategies.length > 1) confidence += 0.2;

    // Boost confidence for clear horizon tags
    if (strategies.some(s => s.type === 'horizon')) confidence += 0.3;

    // Boost confidence for positioned bubbles
    if (strategies.some(s => s.type === 'position')) confidence += 0.2;

    // Reduce confidence for bubbles with existing metadata
    if (bubble.metadata?.list || bubble.metadata?.kanban || bubble.metadata?.atomic) {
      confidence -= 0.3;
    }

    // Reduce confidence for bubbles with no tags
    if (bubble.tags.length === 0) confidence -= 0.2;

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Generate migration recommendations based on analysis
   */
  private generateRecommendations(bubbles: Bubble[], opportunities: MigrationOpportunity[]): string[] {
    const recommendations: string[] = [];

    const totalViable = opportunities.filter(opp => opp.confidence > 0.3).length;
    const horizonCount = opportunities.filter(opp => 
      opp.strategies.some(s => s.type === 'horizon')
    ).length;
    const positionCount = opportunities.filter(opp => 
      opp.strategies.some(s => s.type === 'position')
    ).length;

    if (totalViable / bubbles.length > 0.8) {
      recommendations.push('High migration viability - recommend full migration');
    } else if (totalViable / bubbles.length > 0.5) {
      recommendations.push('Moderate migration viability - recommend selective migration');
    } else {
      recommendations.push('Low migration viability - consider manual organization');
    }

    if (horizonCount / bubbles.length > 0.6) {
      recommendations.push('Strong horizon tag usage - prioritize atomic view migration');
    }

    if (positionCount / bubbles.length > 0.4) {
      recommendations.push('Good position data - consider kanban view migration');
    }

    if (opportunities.some(opp => opp.warnings.length > 0)) {
      recommendations.push('Some bubbles have existing metadata - review merge strategy');
    }

    return recommendations;
  }

  /**
   * Infer domain from bubble content
   */
  private inferDomainFromContent(content: string): string | undefined {
    const workKeywords = ['meeting', 'client', 'project', 'deadline', 'office'];
    const personalKeywords = ['family', 'home', 'personal', 'friend'];
    const healthKeywords = ['doctor', 'exercise', 'health', 'gym'];

    const lowerContent = content.toLowerCase();

    if (workKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'work';
    }
    if (personalKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'personal';
    }
    if (healthKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'health';
    }

    return undefined;
  }

  /**
   * Calculate angle for atomic view from bubble properties
   */
  private calculateAngleFromBubble(bubble: Bubble): number {
    // Use bubble ID hash for consistent angle generation
    let hash = 0;
    for (let i = 0; i < bubble.id.length; i++) {
      const char = bubble.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 360;
  }

  /**
   * Determine kanban column from bubble position
   */
  private determineColumnFromPosition(bubble: Bubble, positionedBubbles: Bubble[]): string {
    // Simple column detection based on x-coordinate clustering
    const xValues = positionedBubbles.map(b => b.x).sort((a, b) => a - b);
    const clusters: number[][] = [];
    const threshold = 100;

    let currentCluster = [xValues[0]];
    for (let i = 1; i < xValues.length; i++) {
      if (xValues[i] - xValues[i - 1] <= threshold) {
        currentCluster.push(xValues[i]);
      } else {
        clusters.push([...currentCluster]);
        currentCluster = [xValues[i]];
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Find which cluster this bubble belongs to
    for (let i = 0; i < clusters.length; i++) {
      const clusterMin = Math.min(...clusters[i]);
      const clusterMax = Math.max(...clusters[i]);
      if (bubble.x >= clusterMin && bubble.x <= clusterMax) {
        return `column-${i}`;
      }
    }

    return 'column-0';
  }

  /**
   * Calculate kanban position within column
   */
  private calculateKanbanPosition(bubble: Bubble, positionedBubbles: Bubble[], columnId: string): number {
    // Find bubbles in the same column and sort by y-coordinate
    const columnBubbles = positionedBubbles.filter(b => 
      this.determineColumnFromPosition(b, positionedBubbles) === columnId
    );

    const sortedByY = columnBubbles.sort((a, b) => a.y - b.y);
    return sortedByY.findIndex(b => b.id === bubble.id);
  }
}

export const migrationAnalyzer = new MigrationAnalyzer();