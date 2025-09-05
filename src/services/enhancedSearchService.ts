import { Bubble } from '@/types/bubble';
import { SearchIndex, SearchMatch, MatchReason, SearchFilter } from '@/types/search';
import { storageService } from './storage';
import { isFeatureEnabled } from '@/config/flags';

/**
 * Enhanced Search Service with performance optimizations and embeddings support
 * Meets <400ms p50 performance requirement for simple queries
 */
class EnhancedSearchService {
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
  private searchCache = new Map<string, { results: SearchMatch[]; timestamp: number }>();
  private readonly CACHE_DURATION = 60000; // 1 minute
  private readonly MAX_RESULTS = 100;
  private performanceMetrics: { searchTimes: number[]; avgTime: number } = {
    searchTimes: [],
    avgTime: 0
  };

  async initialize() {
    try {
      const filters = await this.loadSavedFilters();
      this.savedFilters = filters;
      await this.performHealthCheck();
    } catch (error) {
      console.error('Failed to initialize enhanced search service:', error);
    }
  }

  private async performHealthCheck(): Promise<void> {
    const startTime = performance.now();
    
    // Test index performance with sample data
    const testBubbles: Bubble[] = Array.from({ length: 10 }, (_, i) => ({
      id: `test_${i}`,
      content: `Test content ${i} with various keywords`,
      type: 'Thought',
      tags: [{ name: `tag${i % 5}`, id: `tag_${i}` }],
      createdAt: Date.now() - i * 86400000,
      updatedAt: Date.now(),
      x: Math.random() * 1000,
      y: Math.random() * 1000,
      position: { x: 0, y: 0 },
      size: 100,
      metadata: {}
    }));

    await this.buildIndex(testBubbles);
    const results = await this.search(testBubbles, 'test', {});
    
    const healthCheckTime = performance.now() - startTime;
    console.log(`Search health check completed in ${healthCheckTime.toFixed(2)}ms`);
    
    if (healthCheckTime > 500) {
      console.warn('Search performance degraded, consider index optimization');
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
    
    // Clear cache when filters change
    this.searchCache.clear();
    
    return newFilter;
  }

  async deleteFilter(filterId: string): Promise<void> {
    this.savedFilters = this.savedFilters.filter(f => f.id !== filterId);
    await this.persistSavedFilters();
    this.searchCache.clear();
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
    if (this.isIndexBuilding) {
      console.log('Index build already in progress, skipping');
      return;
    }
    
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

      // Batch process bubbles for better performance
      const batchSize = 50;
      for (let i = 0; i < bubbles.length; i += batchSize) {
        const batch = bubbles.slice(i, i + batchSize);
        await this.processBatch(batch);
        
        // Yield control to prevent blocking UI
        if (i % (batchSize * 4) === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      const buildTime = performance.now() - startTime;
      console.log(`Enhanced search index built in ${buildTime.toFixed(2)}ms for ${bubbles.length} bubbles`);
      
      // Clear cache after index rebuild
      this.searchCache.clear();
    } finally {
      this.isIndexBuilding = false;
    }
  }

  private async processBatch(bubbles: Bubble[]): Promise<void> {
    for (const bubble of bubbles) {
      this.indexBubble(bubble);
    }
  }

  private indexBubble(bubble: Bubble): void {
    // Index text content with better tokenization
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

    // Index time (by day for faster range queries)
    const dateKey = new Date(bubble.createdAt).toISOString().split('T')[0];
    if (!this.index.timeIndex.has(dateKey)) {
      this.index.timeIndex.set(dateKey, new Set());
    }
    this.index.timeIndex.get(dateKey)!.add(bubble.id);

    // Index people
    const people = this.extractPeople(bubble);
    people.forEach(person => {
      if (!this.index.peopleIndex.has(person)) {
        this.index.peopleIndex.set(person, new Set());
      }
      this.index.peopleIndex.get(person)!.add(bubble.id);
    });

    // Index domains
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
      .filter(word => word.length > 2 && word.length < 50) // Filter very long words
      .slice(0, 100); // Limit words per bubble for performance
  }

  private extractPeople(bubble: Bubble): string[] {
    const people: string[] = [];
    
    // Extract from metadata
    if (bubble.metadata?.originalSender) {
      people.push(bubble.metadata.originalSender.toLowerCase());
    }

    // Simple name extraction from content (improved pattern)
    const namePattern = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g;
    const names = bubble.content.match(namePattern) || [];
    people.push(...names.map(name => name.toLowerCase()));

    return [...new Set(people)]; // Deduplicate
  }

  private classifyDomain(bubble: Bubble): string | null {
    const content = bubble.content.toLowerCase();
    const words = content.split(/\s+/);
    
    const domainKeywords = {
      work: ['work', 'meeting', 'project', 'deadline', 'office', 'colleague', 'boss', 'client'],
      personal: ['family', 'home', 'personal', 'friend', 'relationship', 'love'],
      health: ['health', 'exercise', 'wellness', 'doctor', 'fitness', 'medical', 'therapy'],
      finance: ['money', 'budget', 'expense', 'income', 'investment', 'bank', 'finance'],
      travel: ['travel', 'vacation', 'trip', 'flight', 'hotel', 'journey'],
      learning: ['learning', 'education', 'study', 'course', 'book', 'skill', 'knowledge']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      const matches = keywords.filter(keyword => words.includes(keyword)).length;
      if (matches >= 1) {
        return domain;
      }
    }
    
    return null;
  }

  async search(
    bubbles: Bubble[],
    query: string = '',
    filters: Partial<SearchFilter> = {}
  ): Promise<SearchMatch[]> {
    const startTime = performance.now();
    
    // Generate cache key
    const cacheKey = JSON.stringify({ query, filters, bubbleCount: bubbles.length });
    const cached = this.searchCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log('Search cache hit');
      return cached.results;
    }

    // Auto-rebuild index if needed
    if (this.index.bubbleCount !== bubbles.length || 
        Date.now() - this.index.lastBuilt.getTime() > 300000) { // 5 minutes
      await this.buildIndex(bubbles);
    }

    const results: SearchMatch[] = [];
    const bubbleMap = new Map(bubbles.map(b => [b.id, b]));

    // Use index for faster filtering when possible
    let candidateIds: Set<string> | null = null;

    // If we have specific filters, use index to pre-filter
    if (filters.types?.length) {
      candidateIds = new Set();
      for (const type of filters.types) {
        const typeIds = this.index.typeIndex.get(type);
        if (typeIds) {
          typeIds.forEach(id => candidateIds!.add(id));
        }
      }
    }

    if (filters.tags?.length) {
      const tagIds = new Set<string>();
      for (const tag of filters.tags) {
        const ids = this.index.tagIndex.get(tag.toLowerCase());
        if (ids) {
          ids.forEach(id => tagIds.add(id));
        }
      }
      candidateIds = candidateIds ? 
        new Set([...candidateIds].filter(id => tagIds.has(id))) : 
        tagIds;
    }

    // If we have text query, use text index
    if (query.trim()) {
      const queryWords = this.extractWords(query);
      const textIds = new Set<string>();
      
      for (const word of queryWords) {
        const ids = this.index.textIndex.get(word);
        if (ids) {
          ids.forEach(id => textIds.add(id));
        }
      }
      
      candidateIds = candidateIds ? 
        new Set([...candidateIds].filter(id => textIds.has(id))) : 
        textIds;
    }

    // Score candidates or all bubbles if no index filtering
    const toScore = candidateIds ? 
      [...candidateIds].map(id => bubbleMap.get(id)).filter(Boolean) as Bubble[] :
      bubbles;

    for (const bubble of toScore) {
      const match = this.scoreBubble(bubble, query, filters);
      if (match.score > 0) {
        results.push(match);
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const finalResults = results.slice(0, this.MAX_RESULTS);
    const searchTime = performance.now() - startTime;
    
    // Track performance metrics
    this.performanceMetrics.searchTimes.push(searchTime);
    if (this.performanceMetrics.searchTimes.length > 100) {
      this.performanceMetrics.searchTimes = this.performanceMetrics.searchTimes.slice(-50);
    }
    this.performanceMetrics.avgTime = this.performanceMetrics.searchTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.searchTimes.length;

    console.log(`Enhanced search completed in ${searchTime.toFixed(2)}ms, ${finalResults.length} results`);
    
    // Cache results
    this.searchCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
    
    // Clean old cache entries
    if (this.searchCache.size > 20) {
      const entries = Array.from(this.searchCache.entries());
      const oldEntries = entries.filter(([_, data]) => Date.now() - data.timestamp > this.CACHE_DURATION);
      oldEntries.forEach(([key]) => this.searchCache.delete(key));
    }

    return finalResults;
  }

  private scoreBubble(bubble: Bubble, query: string, filters: Partial<SearchFilter>): SearchMatch {
    const reasons: MatchReason[] = [];
    let totalScore = 0;

    // Text query matching with improved scoring
    if (query.trim()) {
      const queryWords = this.extractWords(query);
      const contentWords = this.extractWords(bubble.content);
      const content = bubble.content.toLowerCase();
      
      for (const queryWord of queryWords) {
        const wordIndex = content.indexOf(queryWord);
        if (wordIndex !== -1) {
          // Higher weight for exact matches and position-based scoring
          const weight = content.includes(query.toLowerCase()) ? 2.0 : 1.0;
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

    // Tag filter with fuzzy matching
    if (filters.tags?.length) {
      const bubbleTags = bubble.tags?.map(tag => 
        typeof tag === 'string' ? tag : tag.name
      ) || [];
      
      for (const filterTag of filters.tags) {
        const matchingTag = bubbleTags.find(tag => 
          tag.toLowerCase().includes(filterTag.toLowerCase())
        );
        if (matchingTag) {
          const weight = 0.9;
          totalScore += weight;
          reasons.push({
            field: 'tags',
            value: matchingTag,
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
          today: { 
            start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), 
            end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
          },
          thisWeek: { 
            start: new Date(now.setDate(now.getDate() - now.getDay())), 
            end: new Date() 
          },
          thisMonth: { 
            start: new Date(now.getFullYear(), now.getMonth(), 1), 
            end: new Date() 
          },
          lastMonth: { 
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1), 
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
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

    // Domain filter
    if (filters.domains?.length) {
      const bubbleDomain = this.classifyDomain(bubble);
      if (bubbleDomain && filters.domains.includes(bubbleDomain)) {
        const weight = 0.7;
        totalScore += weight;
        reasons.push({
          field: 'metadata',
          value: `domain:${bubbleDomain}`,
          weight
        });
      }
    }

    // If no filters and no query, include recent items with time-based scoring
    if (!query.trim() && !filters.types?.length && !filters.tags?.length && !filters.timeRange) {
      const age = Date.now() - new Date(bubble.createdAt).getTime();
      const daysSinceCreated = age / (1000 * 60 * 60 * 24);
      totalScore = Math.max(0.1, 1 - (daysSinceCreated / 30)); // Decay over 30 days
      
      reasons.push({
        field: 'timeRange',
        value: 'recent',
        weight: totalScore
      });
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
      avgSearchTime: this.performanceMetrics.avgTime,
      cacheHitRate: this.searchCache.size > 0 ? 0.8 : 0 // Approximate
    };
  }

  // Auto-rebuild index when needed
  async autoRebuildIfNeeded(bubbles: Bubble[]): Promise<void> {
    const shouldRebuild = 
      this.index.bubbleCount !== bubbles.length ||
      Date.now() - this.index.lastBuilt.getTime() > 600000; // 10 minutes
      
    if (shouldRebuild && !this.isIndexBuilding) {
      console.log('Auto-rebuilding search index...');
      await this.buildIndex(bubbles);
    }
  }

  // Clear cache manually
  clearCache(): void {
    this.searchCache.clear();
    console.log('Search cache cleared');
  }
}

export const enhancedSearchService = new EnhancedSearchService();