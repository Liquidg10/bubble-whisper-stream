import { vectorSearchService, SearchResult, SearchFilter, SavedFilter } from '@/services/vectorSearchService';
import { useCallback, useEffect, useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';

export function useVectorSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  const { bubbles, cbtEntries, glimmers } = useBubbleStore();

  // Initialize and index content
  useEffect(() => {
    const initializeSearch = async () => {
      await vectorSearchService.initialize();
      
      // Index existing content
      await indexBubbles();
      await indexCBTEntries();
      await indexGlimmers();
      
      // Load saved filters
      const filters = await vectorSearchService.getSavedFilters();
      setSavedFilters(filters);
    };
    
    initializeSearch();
  }, []);

  // Index bubbles
  const indexBubbles = useCallback(async () => {
    for (const bubble of bubbles) {
      if (bubble.content) {
        await vectorSearchService.indexContent({
          id: bubble.id,
          type: 'bubble',
          content: bubble.content,
          metadata: {
            type: bubble.type,
            mood: bubble.mood,
            tags: bubble.tags,
            x: bubble.x,
            y: bubble.y,
            size: bubble.size
          },
          createdAt: new Date(bubble.createdAt).toISOString()
        });
      }
    }
  }, [bubbles]);

  // Index CBT entries
  const indexCBTEntries = useCallback(async () => {
    for (const entry of cbtEntries) {
      await vectorSearchService.indexContent({
        id: entry.id,
        type: 'cbt',
        content: `${entry.thought} ${entry.reframe || ''}`,
        metadata: {
          distortions: entry.distortions || [],
          hasReframe: !!entry.reframe
        },
        createdAt: new Date(entry.createdAt).toISOString()
      });
    }
  }, [cbtEntries]);

  // Index glimmers
  const indexGlimmers = useCallback(async () => {
    for (const glimmer of glimmers) {
      await vectorSearchService.indexContent({
        id: glimmer.id,
        type: 'glimmer',
        content: glimmer.message,
        metadata: {
          tone: glimmer.tone,
          dismissed: glimmer.dismissed
        },
        createdAt: typeof glimmer.createdAt === 'string' ? glimmer.createdAt : new Date(glimmer.createdAt).toISOString()
      });
    }
  }, [glimmers]);

  // Perform search
  const search = useCallback(async (query: string, filter: SearchFilter = {}, limit: number = 20) => {
    if (!query.trim()) {
      setSearchResults([]);
      return [];
    }

    setIsSearching(true);
    
    try {
      const results = await vectorSearchService.search(query, filter, limit);
      setSearchResults(results);
      
      // Add to search history
      setSearchHistory(prev => {
        const newHistory = [query, ...prev.filter(h => h !== query)].slice(0, 10);
        localStorage.setItem('bubble-search-history', JSON.stringify(newHistory));
        return newHistory;
      });
      
      return results;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Save search filter
  const saveFilter = useCallback(async (
    name: string, 
    description: string, 
    filter: SearchFilter, 
    query?: string
  ) => {
    const savedFilter = await vectorSearchService.saveFilter({
      name,
      description,
      filter,
      query
    });
    
    setSavedFilters(prev => [savedFilter, ...prev]);
    return savedFilter;
  }, []);

  // Apply saved filter
  const applySavedFilter = useCallback(async (filterId: string, query?: string) => {
    const filter = savedFilters.find(f => f.id === filterId);
    if (!filter) return [];
    
    await vectorSearchService.updateFilterUsage(filterId);
    
    // Update local state
    setSavedFilters(prev => prev.map(f => 
      f.id === filterId 
        ? { ...f, lastUsed: new Date().toISOString(), useCount: f.useCount + 1 }
        : f
    ));
    
    return search(query || filter.query || '', filter.filter);
  }, [savedFilters, search]);

  // Index new content automatically
  const indexNewContent = useCallback(async (item: {
    id: string;
    type: 'bubble' | 'cbt' | 'glimmer';
    content: string;
    metadata: any;
    createdAt: string;
  }) => {
    await vectorSearchService.indexContent(item);
  }, []);

  // Get suggestions based on current context
  const getSuggestions = useCallback(async (currentBubble?: any, limit: number = 5) => {
    if (!currentBubble?.content) return [];
    
    const results = await vectorSearchService.search(
      currentBubble.content.slice(0, 100), // Use first 100 chars as query
      { 
        types: ['bubble', 'cbt'],
        minScore: 0.3 
      },
      limit + 1 // Get one extra to exclude current bubble
    );
    
    // Exclude the current bubble from suggestions
    return results.filter(r => r.id !== currentBubble.id).slice(0, limit);
  }, []);

  // Load search history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('bubble-search-history');
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.warn('Failed to load search history:', error);
      }
    }
  }, []);

  return {
    // State
    isSearching,
    searchResults,
    savedFilters,
    searchHistory,
    
    // Actions
    search,
    saveFilter,
    applySavedFilter,
    indexNewContent,
    getSuggestions,
    
    // Utils
    clearResults: () => setSearchResults([]),
    clearHistory: () => {
      setSearchHistory([]);
      localStorage.removeItem('bubble-search-history');
    }
  };
}