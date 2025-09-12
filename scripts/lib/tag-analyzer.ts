export interface HorizonTagMapping {
  shell: 'today' | 'week' | 'later';
  domain?: string;
  angle?: number;
}

export interface ListGroupMapping {
  group: string;
  order: number;
}

export class TagAnalyzer {
  private readonly horizonTags = new Set(['today', 'week', 'later']);
  private readonly domainTags = new Set(['work', 'personal', 'health', 'learning', 'finance']);
  
  private readonly typeGroupMap: Record<string, string> = {
    'Task': 'Tasks',
    'Thought': 'Ideas',
    'Memory': 'References',
    'Mood': 'Reflections',
    'ReminderNote': 'Reminders',
    'Photo': 'Media'
  };

  /**
   * Analyze horizon tags (today, week, later) and map to atomic view
   */
  analyzeHorizonTags(bubble: any): HorizonTagMapping | undefined {
    const horizonTag = bubble.tags.find((tag: any) => this.horizonTags.has(tag.name));
    
    if (!horizonTag) {
      return undefined;
    }
    
    const domainTag = bubble.tags.find((tag: any) => this.domainTags.has(tag.name));
    
    return {
      shell: horizonTag.name as 'today' | 'week' | 'later',
      domain: domainTag?.name || this.inferDomainFromContent(bubble.content),
      angle: this.calculateAngleFromTags(bubble.tags)
    };
  }

  /**
   * Analyze bubble type and tags to create list groups
   */
  analyzeTypeBasedGroups(bubble: any): ListGroupMapping {
    const baseGroup = this.typeGroupMap[bubble.type] || 'Other';
    const priority = Math.round(bubble.size * 100);
    
    // Check for special grouping tags
    const projectTag = bubble.tags.find((tag: any) => tag.name.startsWith('#'));
    if (projectTag) {
      return {
        group: `${baseGroup} - ${projectTag.name}`,
        order: priority
      };
    }
    
    // Check for priority/urgency tags
    const urgencyTag = bubble.tags.find((tag: any) => 
      ['urgent', 'important', 'low', 'medium', 'high'].includes(tag.name.toLowerCase())
    );
    
    if (urgencyTag) {
      const urgencyMultiplier = this.getUrgencyMultiplier(urgencyTag.name);
      return {
        group: baseGroup,
        order: Math.round(priority * urgencyMultiplier)
      };
    }
    
    return {
      group: baseGroup,
      order: priority
    };
  }

  /**
   * Analyze all tags to suggest optimal grouping strategies
   */
  analyzeTagPatterns(bubbles: any[]): {
    horizonCoverage: number;
    typeDistribution: Record<string, number>;
    commonTags: Array<{ name: string; count: number }>;
    suggestedStrategy: 'horizon' | 'type' | 'hybrid';
  } {
    const horizonCount = bubbles.filter(b => 
      b.tags.some((t: any) => this.horizonTags.has(t.name))
    ).length;
    
    const typeDistribution: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    
    bubbles.forEach(bubble => {
      typeDistribution[bubble.type] = (typeDistribution[bubble.type] || 0) + 1;
      
      bubble.tags.forEach((tag: any) => {
        tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
      });
    });
    
    const commonTags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const horizonCoverage = horizonCount / bubbles.length;
    
    let suggestedStrategy: 'horizon' | 'type' | 'hybrid';
    if (horizonCoverage > 0.7) {
      suggestedStrategy = 'horizon';
    } else if (Object.keys(typeDistribution).length > 3) {
      suggestedStrategy = 'type';
    } else {
      suggestedStrategy = 'hybrid';
    }
    
    return {
      horizonCoverage,
      typeDistribution,
      commonTags,
      suggestedStrategy
    };
  }

  /**
   * Extract domain classification from bubble content
   */
  private inferDomainFromContent(content: string): string | undefined {
    const workKeywords = ['meeting', 'client', 'project', 'deadline', 'office', 'team'];
    const personalKeywords = ['family', 'home', 'personal', 'friend', 'hobby'];
    const healthKeywords = ['doctor', 'exercise', 'health', 'gym', 'medication'];
    const learningKeywords = ['learn', 'study', 'course', 'book', 'research'];
    
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
    if (learningKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'learning';
    }
    
    return undefined;
  }

  /**
   * Calculate angle for atomic view based on tags
   */
  private calculateAngleFromTags(tags: any[]): number {
    // Use tag hash to generate consistent angle
    const tagString = tags.map(t => t.name).sort().join('');
    let hash = 0;
    for (let i = 0; i < tagString.length; i++) {
      const char = tagString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert hash to angle (0-360 degrees)
    return Math.abs(hash) % 360;
  }

  /**
   * Get priority multiplier based on urgency tag
   */
  private getUrgencyMultiplier(urgencyTag: string): number {
    const multipliers: Record<string, number> = {
      'urgent': 1.5,
      'important': 1.3,
      'high': 1.2,
      'medium': 1.0,
      'low': 0.8
    };
    
    return multipliers[urgencyTag.toLowerCase()] || 1.0;
  }

  /**
   * Validate that tag-based migration preserves semantic meaning
   */
  validateTagMigration(originalTags: any[], migratedView: any): boolean {
    // Ensure horizon tags are preserved in atomic view
    const horizonTag = originalTags.find(tag => this.horizonTags.has(tag.name));
    if (horizonTag && migratedView.atomic?.shell !== horizonTag.name) {
      return false;
    }
    
    // Ensure domain tags are preserved
    const domainTag = originalTags.find(tag => this.domainTags.has(tag.name));
    if (domainTag && migratedView.atomic?.domain !== domainTag.name) {
      return false;
    }
    
    return true;
  }
}