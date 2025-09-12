export interface KanbanPositioning {
  boardId: string;
  columnId: string;
  pos: number;
}

export interface PositionAnalysis {
  clusters: Array<{
    id: string;
    center: { x: number; y: number };
    bubbles: string[];
    suggestedName: string;
  }>;
  columns: Array<{
    id: string;
    xRange: { min: number; max: number };
    bubbles: string[];
    suggestedName: string;
  }>;
  confidence: number;
}

export class PositionAnalyzer {
  private readonly defaultBoardId = 'main';
  private readonly columnThreshold = 100; // Minimum x-distance to consider separate columns
  private readonly clusterThreshold = 150; // Minimum distance to consider separate clusters

  /**
   * Analyze bubble positioning to determine kanban structure
   */
  analyzeKanbanPosition(bubble: any, allBubbles: any[]): KanbanPositioning | undefined {
    if (bubble.x === 0 && bubble.y === 0) {
      return undefined;
    }

    const positionedBubbles = allBubbles.filter(b => b.x > 0 || b.y > 0);
    if (positionedBubbles.length < 2) {
      return {
        boardId: this.defaultBoardId,
        columnId: 'default',
        pos: 0
      };
    }

    const columns = this.identifyColumns(positionedBubbles);
    const column = this.assignToColumn(bubble, columns);
    const position = this.calculatePosition(bubble, column.bubbles);

    return {
      boardId: this.defaultBoardId,
      columnId: column.id,
      pos: position
    };
  }

  /**
   * Perform comprehensive position analysis for migration planning
   */
  analyzePositionPatterns(bubbles: any[]): PositionAnalysis {
    const positionedBubbles = bubbles.filter(b => b.x > 0 || b.y > 0);
    
    if (positionedBubbles.length === 0) {
      return {
        clusters: [],
        columns: [],
        confidence: 0
      };
    }

    const clusters = this.identifyClusters(positionedBubbles);
    const columns = this.identifyColumns(positionedBubbles);
    const confidence = this.calculatePositionConfidence(positionedBubbles, columns);

    return {
      clusters,
      columns,
      confidence
    };
  }

  /**
   * Identify distinct columns based on x-coordinates
   */
  private identifyColumns(bubbles: any[]): Array<{
    id: string;
    xRange: { min: number; max: number };
    bubbles: any[];
    suggestedName: string;
  }> {
    if (bubbles.length === 0) return [];

    // Sort bubbles by x-coordinate
    const sortedBubbles = [...bubbles].sort((a, b) => a.x - b.x);
    
    const columns: Array<{
      id: string;
      xRange: { min: number; max: number };
      bubbles: any[];
      suggestedName: string;
    }> = [];

    let currentColumn: any[] = [sortedBubbles[0]];
    let columnStart = sortedBubbles[0].x;

    for (let i = 1; i < sortedBubbles.length; i++) {
      const bubble = sortedBubbles[i];
      const prevBubble = sortedBubbles[i - 1];

      // If there's a significant gap, start a new column
      if (bubble.x - prevBubble.x > this.columnThreshold) {
        // Finalize current column
        const columnEnd = prevBubble.x;
        columns.push({
          id: `column-${columns.length}`,
          xRange: { min: columnStart, max: columnEnd },
          bubbles: [...currentColumn],
          suggestedName: this.suggestColumnName(currentColumn, columns.length)
        });

        // Start new column
        currentColumn = [bubble];
        columnStart = bubble.x;
      } else {
        currentColumn.push(bubble);
      }
    }

    // Add the last column
    if (currentColumn.length > 0) {
      const columnEnd = currentColumn[currentColumn.length - 1].x;
      columns.push({
        id: `column-${columns.length}`,
        xRange: { min: columnStart, max: columnEnd },
        bubbles: [...currentColumn],
        suggestedName: this.suggestColumnName(currentColumn, columns.length)
      });
    }

    return columns;
  }

  /**
   * Identify clusters of bubbles for board organization
   */
  private identifyClusters(bubbles: any[]): Array<{
    id: string;
    center: { x: number; y: number };
    bubbles: string[];
    suggestedName: string;
  }> {
    const clusters: Array<{
      id: string;
      center: { x: number; y: number };
      bubbles: string[];
      suggestedName: string;
    }> = [];

    const processed = new Set<string>();

    for (const bubble of bubbles) {
      if (processed.has(bubble.id)) continue;

      const cluster = {
        id: `cluster-${clusters.length}`,
        center: { x: bubble.x, y: bubble.y },
        bubbles: [bubble.id],
        suggestedName: ''
      };

      // Find nearby bubbles
      for (const otherBubble of bubbles) {
        if (otherBubble.id === bubble.id || processed.has(otherBubble.id)) continue;

        const distance = this.calculateDistance(bubble, otherBubble);
        if (distance <= this.clusterThreshold) {
          cluster.bubbles.push(otherBubble.id);
          processed.add(otherBubble.id);
        }
      }

      // Recalculate center
      if (cluster.bubbles.length > 1) {
        const clusterBubbles = bubbles.filter(b => cluster.bubbles.includes(b.id));
        cluster.center = this.calculateCentroid(clusterBubbles);
      }

      cluster.suggestedName = this.suggestClusterName(
        bubbles.filter(b => cluster.bubbles.includes(b.id))
      );

      clusters.push(cluster);
      processed.add(bubble.id);
    }

    return clusters;
  }

  /**
   * Assign a bubble to the most appropriate column
   */
  private assignToColumn(bubble: any, columns: any[]): any {
    if (columns.length === 0) {
      return {
        id: 'default',
        bubbles: [bubble]
      };
    }

    // Find the column whose x-range contains this bubble
    for (const column of columns) {
      if (bubble.x >= column.xRange.min && bubble.x <= column.xRange.max) {
        return column;
      }
    }

    // If not in any existing column, find the closest one
    let closestColumn = columns[0];
    let minDistance = Math.abs(bubble.x - (closestColumn.xRange.min + closestColumn.xRange.max) / 2);

    for (const column of columns) {
      const columnCenter = (column.xRange.min + column.xRange.max) / 2;
      const distance = Math.abs(bubble.x - columnCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestColumn = column;
      }
    }

    return closestColumn;
  }

  /**
   * Calculate position within a column based on y-coordinate
   */
  private calculatePosition(bubble: any, columnBubbles: any[]): number {
    if (!columnBubbles || columnBubbles.length === 0) return 0;

    // Sort column bubbles by y-coordinate
    const sortedBubbles = columnBubbles
      .filter(b => b.id !== bubble.id)
      .sort((a, b) => a.y - b.y);

    // Find position based on y-coordinate
    let position = 0;
    for (const otherBubble of sortedBubbles) {
      if (bubble.y > otherBubble.y) {
        position++;
      } else {
        break;
      }
    }

    return position;
  }

  /**
   * Suggest column name based on bubble content and types
   */
  private suggestColumnName(bubbles: any[], columnIndex: number): string {
    if (bubbles.length === 0) return `Column ${columnIndex + 1}`;

    // Analyze bubble types
    const typeCount: Record<string, number> = {};
    bubbles.forEach(bubble => {
      typeCount[bubble.type] = (typeCount[bubble.type] || 0) + 1;
    });

    const dominantType = Object.entries(typeCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    // Analyze common tags
    const tagCount: Record<string, number> = {};
    bubbles.forEach(bubble => {
      bubble.tags?.forEach((tag: any) => {
        tagCount[tag.name] = (tagCount[tag.name] || 0) + 1;
      });
    });

    const commonTag = Object.entries(tagCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    // Generate name based on analysis
    if (commonTag && ['today', 'week', 'later'].includes(commonTag)) {
      return commonTag.charAt(0).toUpperCase() + commonTag.slice(1);
    }

    if (dominantType) {
      return `${dominantType}s`;
    }

    // Position-based names
    const positions = ['Left', 'Center-Left', 'Center', 'Center-Right', 'Right'];
    return positions[Math.min(columnIndex, positions.length - 1)];
  }

  /**
   * Suggest cluster name based on bubble content
   */
  private suggestClusterName(bubbles: any[]): string {
    if (bubbles.length === 0) return 'Cluster';

    // Find common themes in content
    const words: Record<string, number> = {};
    bubbles.forEach(bubble => {
      const content = bubble.content.toLowerCase();
      const contentWords = content.split(/\s+/).filter(word => word.length > 3);
      contentWords.forEach(word => {
        words[word] = (words[word] || 0) + 1;
      });
    });

    const commonWord = Object.entries(words)
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    if (commonWord) {
      return commonWord.charAt(0).toUpperCase() + commonWord.slice(1);
    }

    return `Cluster of ${bubbles.length}`;
  }

  /**
   * Calculate distance between two bubbles
   */
  private calculateDistance(bubble1: any, bubble2: any): number {
    const dx = bubble1.x - bubble2.x;
    const dy = bubble1.y - bubble2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate centroid of a group of bubbles
   */
  private calculateCentroid(bubbles: any[]): { x: number; y: number } {
    if (bubbles.length === 0) return { x: 0, y: 0 };

    const sum = bubbles.reduce(
      (acc, bubble) => ({
        x: acc.x + bubble.x,
        y: acc.y + bubble.y
      }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / bubbles.length,
      y: sum.y / bubbles.length
    };
  }

  /**
   * Calculate confidence score for position-based migration
   */
  private calculatePositionConfidence(bubbles: any[], columns: any[]): number {
    if (bubbles.length === 0) return 0;

    // Base confidence on positioning spread and column distinctness
    let confidence = 0.3; // Base confidence

    // Higher confidence for well-distributed positions
    const positionSpread = this.calculatePositionSpread(bubbles);
    if (positionSpread > 200) confidence += 0.3;

    // Higher confidence for distinct columns
    if (columns.length >= 2 && columns.length <= 5) confidence += 0.3;

    // Lower confidence for overlapping positions
    const overlapCount = this.countOverlappingPositions(bubbles);
    if (overlapCount > bubbles.length * 0.3) confidence -= 0.2;

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Calculate spread of bubble positions
   */
  private calculatePositionSpread(bubbles: any[]): number {
    const xValues = bubbles.map(b => b.x);
    const yValues = bubbles.map(b => b.y);
    
    const xSpread = Math.max(...xValues) - Math.min(...xValues);
    const ySpread = Math.max(...yValues) - Math.min(...yValues);
    
    return Math.sqrt(xSpread * xSpread + ySpread * ySpread);
  }

  /**
   * Count bubbles with overlapping positions
   */
  private countOverlappingPositions(bubbles: any[]): number {
    let overlapCount = 0;
    const tolerance = 50; // Position tolerance for overlap detection

    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const distance = this.calculateDistance(bubbles[i], bubbles[j]);
        if (distance < tolerance) {
          overlapCount++;
        }
      }
    }

    return overlapCount;
  }
}