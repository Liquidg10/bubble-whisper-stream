import { Bubble } from '@/types/bubble';
import { SearchIndex, SearchMatch, MatchReason, SearchFilter } from '@/types/search';
import { storageService } from './storage';

class NarrativeSearchService {
  private index: SearchIndex = {
    textIndex: new Map(),
    tagIndex: new Map(),
    typeIndex: new Map(),
    timeIndex: new Map(),
    peopleIndex: new Map(),
    domainIndex: new Map(),
    lastBuilt: new Date(0),
    bubbleCount: 0
  };

  private savedFilters: SearchFilter[] = [];
  private isIndexBuilding = false;

  async initialize() {
    try {
      const filters = await this.loadSavedFilters();
      this.savedFilters = filters;
    } catch (error) {
      console.error('Failed to load saved filters:', error);
    }
  }

  private async loadSavedFilters(): Promise<SearchFilter[]> {
    try {
      const settings = await storageService.getSettings();
      return (settings as any)?.savedSearchFilters || [];
    } catch (error) {
      console.error('Error loading saved filters:', error);
      return [];
    }
  }

  async saveFilter(filter: Omit<SearchFilter, 'id' | 'createdAt'>): Promise<SearchFilter> {
    const newFilter: SearchFilter = {
      ...filter,
      id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date()
    };

    this.savedFilters.push(newFilter);
    await this.persistSavedFilters();
    return newFilter;
  }

  async deleteFilter(filterId: string): Promise<void> {
    this.savedFilters = this.savedFilters.filter(f => f.id !== filterId);
    await this.persistSavedFilters();
  }

  getSavedFilters(): SearchFilter[] {
    return [...this.savedFilters];
  }

  private async persistSavedFilters(): Promise<void> {
    try {
      const settings = await storageService.getSettings() || {
        ttsEnabled: false,
        reducedMotion: false,
        highContrast: false,
        bubbleDensity: 'medium',
        biometricLock: false
      };
      (settings as any).savedSearchFilters = this.savedFilters;
      await storageService.updateSettings(settings);
    } catch (error) {
      console.error('Failed to persist saved filters:', error);
    }
  }

  async buildIndex(bubbles: Bubble[]): Promise<void> {
    if (this.isIndexBuilding) return;
    
    this.isIndexBuilding = true;
    const startTime = performance.now();
    
    try {
      // Clear existing index
      this.index = {
        textIndex: new Map(),
        tagIndex: new Map(),
        typeIndex: new Map(),
        timeIndex: new Map(),
        peopleIndex: new Map(),
        domainIndex: new Map(),
        lastBuilt: new Date(),
        bubbleCount: bubbles.length
      };

      for (const bubble of bubbles) {
        this.indexBubble(bubble);
      }

      const buildTime = performance.now() - startTime;
      console.log(`Search index built in ${buildTime.toFixed(2)}ms for ${bubbles.length} bubbles`);
    } finally {
      this.isIndexBuilding = false;
    }
  }

  private indexBubble(bubble: Bubble): void {
    // Index text content
    const words = this.extractWords(bubble.content);
    words.forEach(word => {
      if (!this.index.textIndex.has(word)) {
        this.index.textIndex.set(word, new Set());
      }
      this.index.textIndex.get(word)!.add(bubble.id);
    });

    // Index tags
    bubble.tags?.forEach(tag => {
      const tagName = typeof tag === 'string' ? tag : tag.name;
      if (!this.index.tagIndex.has(tagName.toLowerCase())) {
        this.index.tagIndex.set(tagName.toLowerCase(), new Set());
      }
      this.index.tagIndex.get(tagName.toLowerCase())!.add(bubble.id);
    });

    // Index type
    if (!this.index.typeIndex.has(bubble.type)) {
      this.index.typeIndex.set(bubble.type, new Set());
    }
    this.index.typeIndex.get(bubble.type)!.add(bubble.id);

    // Index time (by day)
    const dateKey = new Date(bubble.createdAt).toISOString().split('T')[0];
    if (!this.index.timeIndex.has(dateKey)) {
      this.index.timeIndex.set(dateKey, new Set());
    }
    this.index.timeIndex.get(dateKey)!.add(bubble.id);

    // Index people (extract from content and metadata)
    const people = this.extractPeople(bubble);
    people.forEach(person => {
      if (!this.index.peopleIndex.has(person)) {
        this.index.peopleIndex.set(person, new Set());
      }
      this.index.peopleIndex.get(person)!.add(bubble.id);
    });

    // Index domains (classify content domain)
    const domain = this.classifyDomain(bubble);
    if (domain) {
      if (!this.index.domainIndex.has(domain)) {
        this.index.domainIndex.set(domain, new Set());
      }
      this.index.domainIndex.get(domain)!.add(bubble.id);
    }
  }

  private extractWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 100); // Limit words per bubble for performance
  }

  private extractPeople(bubble: Bubble): string[] {
    const people: string[] = [];
    
    // Extract from metadata
    if (bubble.metadata?.originalSender) {
      people.push(bubble.metadata.originalSender);
    }

    // Simple name extraction from content
    const namePattern = /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g;
    const names = bubble.content.match(namePattern) || [];
    people.push(...names.map(name => name.toLowerCase()));

    return [...new Set(people)]; // Deduplicate
  }

  private classifyDomain(bubble: Bubble): string | null {
    const content = bubble.content.toLowerCase();
    
    if (content.includes('work') || content.includes('meeting') || content.includes('project')) return 'work';
    if (content.includes('family') || content.includes('home') || content.includes('personal')) return 'personal';
    if (content.includes('health') || content.includes('exercise') || content.includes('wellness')) return 'health';
    if (content.includes('finance') || content.includes('money') || content.includes('budget')) return 'finance';
    if (content.includes('travel') || content.includes('vacation') || content.includes('trip')) return 'travel';
    if (content.includes('learning') || content.includes('education') || content.includes('study')) return 'learning';
    
    return null;
  }

  async search(
    bubbles: Bubble[],
    query: string = '',
    filters: Partial<SearchFilter> = {}
  ): Promise<SearchMatch[]> {
    const startTime = performance.now();
    
    // Rebuild index if needed
    if (this.index.bubbleCount !== bubbles.length || 
        Date.now() - this.index.lastBuilt.getTime() > 300000) { // 5 minutes
      await this.buildIndex(bubbles);
    }

    const results: SearchMatch[] = [];
    const bubbleMap = new Map(bubbles.map(b => [b.id, b]));

    for (const bubble of bubbles) {
      const match = this.scoreBubble(bubble, query, filters);
      if (match.score > 0) {
        results.push(match);
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const searchTime = performance.now() - startTime;
    console.log(`Search completed in ${searchTime.toFixed(2)}ms, ${results.length} results`);

    return results.slice(0, 100); // Limit results for performance
  }

  private scoreBubble(bubble: Bubble, query: string, filters: Partial<SearchFilter>): SearchMatch {
    const reasons: MatchReason[] = [];
    let totalScore = 0;

    // Text query matching
    if (query.trim()) {
      const queryWords = this.extractWords(query);
      const contentWords = this.extractWords(bubble.content);
      
      for (const queryWord of queryWords) {
        if (contentWords.includes(queryWord)) {
          const weight = 1.0;
          totalScore += weight;
          reasons.push({
            field: 'content',
            value: queryWord,
            context: this.getWordContext(bubble.content, queryWord),
            weight
          });
        }
      }
    }

    // Type filter
    if (filters.types?.length && filters.types.includes(bubble.type)) {
      const weight = 0.8;
      totalScore += weight;
      reasons.push({
        field: 'type',
        value: bubble.type,
        weight
      });
    }

    // Tag filter
    if (filters.tags?.length) {
      const bubbleTags = bubble.tags?.map(tag => 
        typeof tag === 'string' ? tag : tag.name
      ) || [];
      
      for (const filterTag of filters.tags) {
        if (bubbleTags.some(tag => tag.toLowerCase().includes(filterTag.toLowerCase()))) {
          const weight = 0.9;
          totalScore += weight;
          reasons.push({
            field: 'tags',
            value: filterTag,
            weight
          });
        }
      }
    }

    // Time range filter
    if (filters.timeRange) {
      const bubbleDate = new Date(bubble.createdAt);
      let inRange = true;
      
      if (filters.timeRange.preset) {
        const now = new Date();
        const ranges = {
          today: { start: new Date(now.setHours(0, 0, 0, 0)), end: new Date(now.setHours(23, 59, 59, 999)) },
          thisWeek: { start: new Date(now.setDate(now.getDate() - now.getDay())), end: new Date() },
          thisMonth: { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date() },
          lastMonth: { 
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1), 
            end: new Date(now.getFullYear(), now.getMonth(), 0)
          }
        };
        
        const range = ranges[filters.timeRange.preset];
        inRange = bubbleDate >= range.start && bubbleDate <= range.end;
      } else {
        if (filters.timeRange.start && bubbleDate < filters.timeRange.start) inRange = false;
        if (filters.timeRange.end && bubbleDate > filters.timeRange.end) inRange = false;
      }
      
      if (inRange) {
        const weight = 0.6;
        totalScore += weight;
        reasons.push({
          field: 'timeRange',
          value: filters.timeRange.preset || 'custom range',
          weight
        });
      } else if (filters.timeRange.preset || filters.timeRange.start || filters.timeRange.end) {
        // If time filter is active but doesn't match, return no match
        return { bubble, score: 0, reasons: [] };
      }
    }

    // If no filters and no query, include all with base score
    if (!query.trim() && !filters.types?.length && !filters.tags?.length && !filters.timeRange) {
      totalScore = 0.1; // Base relevance
    }

    return { bubble, score: totalScore, reasons };
  }

  private getWordContext(content: string, word: string): string {
    const index = content.toLowerCase().indexOf(word.toLowerCase());
    if (index === -1) return '';
    
    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + word.length + 30);
    
    return content.slice(start, end);
  }

  getIndexStats(): { 
    bubblesIndexed: number; 
    lastBuilt: Date; 
    isBuilding: boolean;
    avgSearchTime: number;
    cacheHitRate: number;
  } {
    return {
      bubblesIndexed: this.index.bubbleCount,
      lastBuilt: this.index.lastBuilt,
      isBuilding: this.isIndexBuilding,
      avgSearchTime: 0, // Legacy service doesn't track this
      cacheHitRate: 0    // Legacy service doesn't have caching
    };
  }
}

export const narrativeSearchService = new NarrativeSearchService();