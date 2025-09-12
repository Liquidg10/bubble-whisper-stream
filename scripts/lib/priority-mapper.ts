export interface PriorityMapping {
  listOrder: number;
  kanbanPosition: number;
  atomicPriority: number;
}

export interface PriorityAnalysis {
  distribution: Record<string, number>;
  averagePriority: number;
  prioritySpread: number;
  suggestedThresholds: {
    high: number;
    medium: number;
    low: number;
  };
}

export class PriorityMapper {
  private readonly maxPriority = 100;
  private readonly minPriority = 0;

  /**
   * Map bubble size (0-1) to various priority systems
   */
  mapBubblePriority(bubbleSize: number, context: any = {}): PriorityMapping {
    // Convert bubble size (0-1) to priority scale (0-100)
    const basePriority = Math.round(bubbleSize * this.maxPriority);
    
    // Apply context-based adjustments
    const adjustedPriority = this.applyContextualAdjustments(basePriority, context);
    
    return {
      listOrder: adjustedPriority,
      kanbanPosition: this.priorityToKanbanPosition(adjustedPriority),
      atomicPriority: adjustedPriority
    };
  }

  /**
   * Analyze priority distribution across all bubbles
   */
  analyzePriorityDistribution(bubbles: any[]): PriorityAnalysis {
    if (bubbles.length === 0) {
      return {
        distribution: {},
        averagePriority: 50,
        prioritySpread: 0,
        suggestedThresholds: { high: 75, medium: 50, low: 25 }
      };
    }

    const priorities = bubbles.map(b => Math.round(b.size * this.maxPriority));
    
    // Calculate distribution
    const distribution: Record<string, number> = {
      'high (75-100)': 0,
      'medium (25-75)': 0,
      'low (0-25)': 0
    };

    priorities.forEach(priority => {
      if (priority >= 75) distribution['high (75-100)']++;
      else if (priority >= 25) distribution['medium (25-75)']++;
      else distribution['low (0-25)']++;
    });

    // Calculate statistics
    const averagePriority = priorities.reduce((sum, p) => sum + p, 0) / priorities.length;
    const sortedPriorities = [...priorities].sort((a, b) => a - b);
    const prioritySpread = sortedPriorities[sortedPriorities.length - 1] - sortedPriorities[0];

    // Calculate optimal thresholds based on distribution
    const suggestedThresholds = this.calculateOptimalThresholds(sortedPriorities);

    return {
      distribution,
      averagePriority,
      prioritySpread,
      suggestedThresholds
    };
  }

  /**
   * Convert priority to list ordering (higher priority = lower order number)
   */
  priorityToListOrder(priority: number, groupBubbles: any[] = []): number {
    // In list view, lower order numbers appear first (higher priority)
    const inversePriority = this.maxPriority - priority;
    
    // If we have context about other bubbles in the group, adjust relative ordering
    if (groupBubbles.length > 0) {
      const groupPriorities = groupBubbles.map(b => Math.round(b.size * this.maxPriority));
      const sortedPriorities = [...groupPriorities, priority].sort((a, b) => b - a);
      return sortedPriorities.indexOf(priority);
    }
    
    return inversePriority;
  }

  /**
   * Convert priority to kanban position within a column
   */
  priorityToKanbanPosition(priority: number): number {
    // In kanban, position 0 is top (highest priority should be at top)
    // Scale priority to a reasonable position range (0-20)
    return Math.round((this.maxPriority - priority) / 5);
  }

  /**
   * Apply contextual adjustments to base priority
   */
  private applyContextualAdjustments(basePriority: number, context: any): number {
    let adjustedPriority = basePriority;
    
    // Time-based adjustments
    if (context.tags) {
      const hasUrgentTag = context.tags.some((tag: any) => 
        ['urgent', 'asap', 'critical'].includes(tag.name.toLowerCase())
      );
      if (hasUrgentTag) {
        adjustedPriority = Math.min(this.maxPriority, adjustedPriority + 20);
      }
      
      const hasLowPriorityTag = context.tags.some((tag: any) => 
        ['later', 'someday', 'low'].includes(tag.name.toLowerCase())
      );
      if (hasLowPriorityTag) {
        adjustedPriority = Math.max(this.minPriority, adjustedPriority - 15);
      }
    }
    
    // Deadline-based adjustments
    if (context.due) {
      const daysUntilDue = (context.due - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilDue <= 1) {
        adjustedPriority = Math.min(this.maxPriority, adjustedPriority + 25);
      } else if (daysUntilDue <= 7) {
        adjustedPriority = Math.min(this.maxPriority, adjustedPriority + 10);
      }
    }
    
    // Content-based adjustments
    if (context.content) {
      const urgentKeywords = ['deadline', 'urgent', 'asap', 'critical', 'emergency'];
      const hasUrgentContent = urgentKeywords.some(keyword => 
        context.content.toLowerCase().includes(keyword)
      );
      if (hasUrgentContent) {
        adjustedPriority = Math.min(this.maxPriority, adjustedPriority + 15);
      }
    }
    
    return Math.round(adjustedPriority);
  }

  /**
   * Calculate optimal priority thresholds based on actual data distribution
   */
  private calculateOptimalThresholds(sortedPriorities: number[]): {
    high: number;
    medium: number;
    low: number;
  } {
    if (sortedPriorities.length === 0) {
      return { high: 75, medium: 50, low: 25 };
    }
    
    const length = sortedPriorities.length;
    
    // Use quartiles for more data-driven thresholds
    const highThreshold = sortedPriorities[Math.floor(length * 0.75)];
    const mediumThreshold = sortedPriorities[Math.floor(length * 0.5)];
    const lowThreshold = sortedPriorities[Math.floor(length * 0.25)];
    
    return {
      high: Math.max(70, highThreshold), // Ensure minimum high threshold
      medium: Math.max(40, mediumThreshold), // Ensure minimum medium threshold
      low: Math.max(10, lowThreshold) // Ensure minimum low threshold
    };
  }

  /**
   * Generate priority-based grouping suggestions
   */
  suggestPriorityGroups(bubbles: any[]): Array<{
    name: string;
    threshold: number;
    bubbles: any[];
    suggestedListOrder: number[];
  }> {
    const analysis = this.analyzePriorityDistribution(bubbles);
    const { high, medium, low } = analysis.suggestedThresholds;
    
    const groups = [
      {
        name: 'High Priority',
        threshold: high,
        bubbles: bubbles.filter(b => Math.round(b.size * this.maxPriority) >= high),
        suggestedListOrder: [] as number[]
      },
      {
        name: 'Medium Priority',
        threshold: medium,
        bubbles: bubbles.filter(b => {
          const priority = Math.round(b.size * this.maxPriority);
          return priority >= medium && priority < high;
        }),
        suggestedListOrder: [] as number[]
      },
      {
        name: 'Low Priority',
        threshold: low,
        bubbles: bubbles.filter(b => Math.round(b.size * this.maxPriority) < medium),
        suggestedListOrder: [] as number[]
      }
    ];
    
    // Calculate suggested ordering within each group
    groups.forEach(group => {
      group.suggestedListOrder = group.bubbles
        .map(bubble => ({
          bubble,
          priority: Math.round(bubble.size * this.maxPriority)
        }))
        .sort((a, b) => b.priority - a.priority)
        .map((_, index) => index);
    });
    
    return groups;
  }

  /**
   * Validate priority mapping consistency
   */
  validatePriorityMapping(bubbles: any[], mappings: Record<string, PriorityMapping>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for priority consistency
    bubbles.forEach(bubble => {
      const mapping = mappings[bubble.id];
      if (!mapping) {
        errors.push(`Missing priority mapping for bubble ${bubble.id}`);
        return;
      }
      
      const expectedPriority = Math.round(bubble.size * this.maxPriority);
      const tolerance = 5;
      
      if (Math.abs(mapping.listOrder - expectedPriority) > tolerance) {
        warnings.push(
          `Priority mismatch for bubble ${bubble.id}: ` +
          `expected ~${expectedPriority}, got ${mapping.listOrder}`
        );
      }
      
      // Check kanban position validity
      if (mapping.kanbanPosition < 0 || mapping.kanbanPosition > 20) {
        errors.push(
          `Invalid kanban position for bubble ${bubble.id}: ${mapping.kanbanPosition}`
        );
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate priority migration report
   */
  generatePriorityReport(bubbles: any[]): string {
    const analysis = this.analyzePriorityDistribution(bubbles);
    const groups = this.suggestPriorityGroups(bubbles);
    
    let report = 'Priority Analysis Report\n';
    report += '========================\n\n';
    
    report += `Average Priority: ${analysis.averagePriority.toFixed(1)}\n`;
    report += `Priority Spread: ${analysis.prioritySpread}\n\n`;
    
    report += 'Distribution:\n';
    Object.entries(analysis.distribution).forEach(([range, count]) => {
      const percentage = ((count / bubbles.length) * 100).toFixed(1);
      report += `  ${range}: ${count} bubbles (${percentage}%)\n`;
    });
    
    report += '\nSuggested Priority Groups:\n';
    groups.forEach(group => {
      report += `  ${group.name}: ${group.bubbles.length} bubbles\n`;
    });
    
    report += '\nRecommended Thresholds:\n';
    report += `  High Priority: ≥${analysis.suggestedThresholds.high}\n`;
    report += `  Medium Priority: ${analysis.suggestedThresholds.medium}-${analysis.suggestedThresholds.high - 1}\n`;
    report += `  Low Priority: <${analysis.suggestedThresholds.medium}\n`;
    
    return report;
  }
}