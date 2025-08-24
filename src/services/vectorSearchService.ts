import { aiService } from './aiService';

export interface SearchResult {
  id: string;
  type: 'bubble' | 'cbt' | 'glimmer' | 'pattern';
  content: string;
  metadata: any;
  score: number;
  because: string;
  createdAt: string;
  embedding?: number[];
}

export interface SearchFilter {
  timeRange?: { start: string; end: string };
  types?: string[];
  moods?: string[];
  tags?: string[];
  people?: string[];
  minScore?: number;
}

export interface SavedFilter {
  id: string;
  name: string;
  description: string;
  filter: SearchFilter;
  query?: string;
  createdAt: string;
  lastUsed: string;
  useCount: number;
}

class VectorSearchService {
  private db: IDBDatabase | null = null;
  private indexQueue: Map<string, any> = new Map();
  private isIndexing = false;

  async initialize() {
    if (this.db) return;

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('BubbleVectorStore', 2);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Vector embeddings store
        if (!db.objectStoreNames.contains('embeddings')) {
          const embeddingStore = db.createObjectStore('embeddings', { keyPath: 'id' });
          embeddingStore.createIndex('type', 'type');
          embeddingStore.createIndex('createdAt', 'createdAt');
          embeddingStore.createIndex('contentHash', 'contentHash');
        }
        
        // Search index for keyword fallback
        if (!db.objectStoreNames.contains('searchIndex')) {
          const searchStore = db.createObjectStore('searchIndex', { keyPath: 'id' });
          searchStore.createIndex('tokens', 'tokens', { multiEntry: true });
          searchStore.createIndex('type', 'type');
          searchStore.createIndex('createdAt', 'createdAt');
        }
        
        // Saved filters
        if (!db.objectStoreNames.contains('savedFilters')) {
          db.createObjectStore('savedFilters', { keyPath: 'id' });
        }
      };
    });
  }

  // Index content for search
  async indexContent(item: {
    id: string;
    type: 'bubble' | 'cbt' | 'glimmer' | 'pattern';
    content: string;
    metadata: any;
    createdAt: string;
  }): Promise<void> {
    await this.initialize();
    
    // Add to queue for batch processing
    this.indexQueue.set(item.id, item);
    
    // Process queue if not already processing
    if (!this.isIndexing) {
      this.processIndexQueue();
    }
  }

  private async processIndexQueue(): Promise<void> {
    if (this.indexQueue.size === 0) return;
    
    this.isIndexing = true;
    const batch = Array.from(this.indexQueue.values()).slice(0, 10); // Process in batches of 10
    this.indexQueue.clear();

    try {
      // Create keyword index entries
      const keywordEntries = batch.map(item => ({
        id: item.id,
        type: item.type,
        content: item.content,
        metadata: item.metadata,
        createdAt: item.createdAt,
        tokens: this.tokenizeContent(item.content),
        contentHash: this.hashContent(item.content)
      }));

      // Store keyword index
      const transaction = this.db!.transaction(['searchIndex'], 'readwrite');
      const searchStore = transaction.objectStore('searchIndex');
      
      for (const entry of keywordEntries) {
        searchStore.put(entry);
      }

      // Try to get embeddings if AI is available
      if (aiService.isAIAvailable()) {
        try {
          const contents = batch.map(item => item.content);
          const embeddingResponse = await aiService.getEmbeddings(contents);
          
          if (embeddingResponse.success && embeddingResponse.embeddings) {
            const embeddingTransaction = this.db!.transaction(['embeddings'], 'readwrite');
            const embeddingStore = embeddingTransaction.objectStore('embeddings');
            
            for (let i = 0; i < batch.length; i++) {
              const item = batch[i];
              const embedding = embeddingResponse.embeddings[i];
              
              embeddingStore.put({
                id: item.id,
                type: item.type,
                content: item.content,
                metadata: item.metadata,
                createdAt: item.createdAt,
                embedding: embedding.embedding,
                contentHash: this.hashContent(item.content)
              });
            }
          }
        } catch (error) {
          console.warn('Failed to generate embeddings, using keyword search only:', error);
        }
      }

    } catch (error) {
      console.error('Failed to process index queue:', error);
    } finally {
      this.isIndexing = false;
      
      // Process remaining items if any
      if (this.indexQueue.size > 0) {
        setTimeout(() => this.processIndexQueue(), 1000);
      }
    }
  }

  // Search with semantic + keyword hybrid approach
  async search(
    query: string, 
    filter: SearchFilter = {}, 
    limit: number = 20
  ): Promise<SearchResult[]> {
    await this.initialize();
    
    const results: SearchResult[] = [];
    
    // Try semantic search first if AI available
    if (aiService.isAIAvailable() && query.trim().length > 0) {
      try {
        const semanticResults = await this.semanticSearch(query, filter, limit);
        results.push(...semanticResults);
      } catch (error) {
        console.warn('Semantic search failed, falling back to keyword:', error);
      }
    }
    
    // Fallback to keyword search or supplement semantic results
    if (results.length === 0) {
      const keywordResults = await this.keywordSearch(query, filter, limit);
      results.push(...keywordResults);
    }
    
    // Remove duplicates and sort by score
    const uniqueResults = results.filter((result, index, arr) => 
      arr.findIndex(r => r.id === result.id) === index
    );
    
    return uniqueResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async semanticSearch(
    query: string, 
    filter: SearchFilter, 
    limit: number
  ): Promise<SearchResult[]> {
    // Get all embeddings from store
    const transaction = this.db!.transaction(['embeddings'], 'readonly');
    const store = transaction.objectStore('embeddings');
    const allEmbeddings = await this.promisifyRequest(store.getAll());
    
    // Filter by criteria
    const filteredEmbeddings = this.applyFilters(allEmbeddings, filter);
    
    if (filteredEmbeddings.length === 0) return [];
    
    // Get similarity scores from AI service
    const similarityResponse = await aiService.searchSimilar(query, filteredEmbeddings.map(e => ({
      id: e.id,
      text: e.content,
      embedding: e.embedding
    })));
    
    if (!similarityResponse.success || !similarityResponse.results) {
      return [];
    }
    
    return similarityResponse.results.map(result => {
      const originalItem = filteredEmbeddings.find(e => e.id === result.id);
      return {
        id: result.id,
        type: originalItem?.type || 'bubble',
        content: result.text,
        metadata: originalItem?.metadata || {},
        score: result.similarity,
        because: `Semantic similarity: ${(result.similarity * 100).toFixed(1)}% match`,
        createdAt: originalItem?.createdAt || new Date().toISOString()
      };
    });
  }

  private async keywordSearch(
    query: string, 
    filter: SearchFilter, 
    limit: number
  ): Promise<SearchResult[]> {
    const tokens = this.tokenizeContent(query);
    const transaction = this.db!.transaction(['searchIndex'], 'readonly');
    const store = transaction.objectStore('searchIndex');
    
    const allItems = await this.promisifyRequest(store.getAll());
    const filteredItems = this.applyFilters(allItems, filter);
    
    const scoredResults = filteredItems.map(item => {
      const score = this.calculateKeywordScore(tokens, item.tokens, item.content, query);
      return {
        id: item.id,
        type: item.type,
        content: item.content,
        metadata: item.metadata,
        score,
        because: score > 0.8 ? 'Exact match found' : 
                score > 0.5 ? 'Strong keyword match' : 'Partial keyword match',
        createdAt: item.createdAt
      };
    });
    
    return scoredResults
      .filter(r => r.score > (filter.minScore || 0.1))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Save and manage search filters
  async saveFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'lastUsed' | 'useCount'>): Promise<SavedFilter> {
    await this.initialize();
    
    const savedFilter: SavedFilter = {
      ...filter,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      useCount: 0
    };
    
    const transaction = this.db!.transaction(['savedFilters'], 'readwrite');
    const store = transaction.objectStore('savedFilters');
    store.put(savedFilter);
    
    return savedFilter;
  }

  async getSavedFilters(): Promise<SavedFilter[]> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['savedFilters'], 'readonly');
    const store = transaction.objectStore('savedFilters');
    const filters = await this.promisifyRequest(store.getAll());
    
    return filters.sort((a, b) => b.useCount - a.useCount);
  }

  async updateFilterUsage(filterId: string): Promise<void> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['savedFilters'], 'readwrite');
    const store = transaction.objectStore('savedFilters');
    const filter = await this.promisifyRequest(store.get(filterId));
    
    if (filter) {
      filter.lastUsed = new Date().toISOString();
      filter.useCount += 1;
      store.put(filter);
    }
  }

  // Utility methods
  private tokenizeContent(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  private hashContent(content: string): string {
    // Simple hash for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private calculateKeywordScore(queryTokens: string[], itemTokens: string[], content: string, query: string): number {
    if (queryTokens.length === 0) return 0;
    
    // Exact phrase match gets highest score
    if (content.toLowerCase().includes(query.toLowerCase())) {
      return 1.0;
    }
    
    // Calculate token overlap
    const matchedTokens = queryTokens.filter(token => itemTokens.includes(token));
    const tokenScore = matchedTokens.length / queryTokens.length;
    
    // Boost for rare terms
    const rarityBoost = matchedTokens.reduce((boost, token) => {
      const frequency = itemTokens.filter(t => t === token).length;
      return boost + (frequency > 1 ? 0.1 : 0.2);
    }, 0);
    
    return Math.min(1.0, tokenScore + rarityBoost);
  }

  private applyFilters(items: any[], filter: SearchFilter): any[] {
    return items.filter(item => {
      // Time range filter
      if (filter.timeRange) {
        const itemDate = new Date(item.createdAt);
        const start = new Date(filter.timeRange.start);
        const end = new Date(filter.timeRange.end);
        if (itemDate < start || itemDate > end) return false;
      }
      
      // Type filter
      if (filter.types && filter.types.length > 0) {
        if (!filter.types.includes(item.type)) return false;
      }
      
      // Mood filter (for bubbles)
      if (filter.moods && filter.moods.length > 0 && item.metadata?.mood) {
        if (!filter.moods.includes(item.metadata.mood)) return false;
      }
      
      // Tag filter
      if (filter.tags && filter.tags.length > 0 && item.metadata?.tags) {
        const itemTags = item.metadata.tags.map((t: any) => t.name || t);
        if (!filter.tags.some(tag => itemTags.includes(tag))) return false;
      }
      
      return true;
    });
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Cleanup and maintenance
  async vacuum(): Promise<void> {
    await this.initialize();
    
    // Remove old embeddings that no longer have corresponding content
    const embeddingTransaction = this.db!.transaction(['embeddings'], 'readwrite');
    const embeddingStore = embeddingTransaction.objectStore('embeddings');
    
    // Remove entries older than 6 months with low access
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const oldEntries = await this.promisifyRequest(
      embeddingStore.index('createdAt').openCursor(IDBKeyRange.upperBound(sixMonthsAgo.toISOString()))
    );
    
    // Implementation would remove old, unused entries
  }
}

export const vectorSearchService = new VectorSearchService();