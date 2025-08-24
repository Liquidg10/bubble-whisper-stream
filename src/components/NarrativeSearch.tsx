import React, { useState, useCallback, useEffect } from 'react';
import { Search, Filter, Sparkles, Clock, BookOpen, Hash, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVectorSearch } from '@/hooks/useVectorSearch';
import { SearchFilter } from '@/services/vectorSearchService';
import AIIndicator from '@/components/AIIndicator';

interface NarrativeSearchProps {
  onResultSelect?: (result: any) => void;
  className?: string;
}

const NarrativeSearch: React.FC<NarrativeSearchProps> = ({ 
  onResultSelect,
  className = ''
}) => {
  const {
    isSearching,
    searchResults,
    savedFilters,
    searchHistory,
    search,
    saveFilter,
    applySavedFilter,
    clearResults,
    clearHistory
  } = useVectorSearch();

  const [query, setQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [currentFilter, setCurrentFilter] = useState<SearchFilter>({});
  const [activeTab, setActiveTab] = useState('results');

  // Perform search when query changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        search(query, currentFilter);
      } else {
        clearResults();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, currentFilter, search, clearResults]);

  const handleFilterUpdate = useCallback((newFilter: SearchFilter) => {
    setCurrentFilter(newFilter);
    if (query.trim()) {
      search(query, newFilter);
    }
  }, [query, search]);

  const handleSaveFilter = useCallback(async () => {
    if (!query.trim() && Object.keys(currentFilter).length === 0) return;
    
    const name = prompt('Name this search filter:');
    if (!name) return;
    
    const description = prompt('Description (optional):') || '';
    
    await saveFilter(name, description, currentFilter, query);
  }, [query, currentFilter, saveFilter]);

  const renderSearchResults = () => (
    <ScrollArea className="h-96">
      <div className="space-y-3">
        {searchResults.length === 0 && query && !isSearching && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No results found for "{query}"
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try different keywords or adjust your filters
              </p>
            </CardContent>
          </Card>
        )}
        
        {searchResults.map((result) => (
          <Card 
            key={result.id} 
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => onResultSelect?.(result)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {result.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(result.createdAt).toLocaleDateString()}
                    </span>
                    <AIIndicator model={result.metadata?.source} size="sm" />
                  </div>
                  
                  <p className="text-sm line-clamp-2 mb-2">
                    {result.content}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {result.because}
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-xs font-medium text-primary">
                    {(result.score * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );

  const renderSavedFilters = () => (
    <ScrollArea className="h-96">
      <div className="space-y-2">
        {savedFilters.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Filter className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No saved filters yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Create searches you use often for quick access
              </p>
            </CardContent>
          </Card>
        ) : (
          savedFilters.map((filter) => (
            <Card 
              key={filter.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => applySavedFilter(filter.id, query)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{filter.name}</p>
                    {filter.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {filter.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        Used {filter.useCount} times
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Last: {new Date(filter.lastUsed).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ScrollArea>
  );

  const renderSearchHistory = () => (
    <ScrollArea className="h-96">
      <div className="space-y-2">
        {searchHistory.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No search history yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Recent Searches</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearHistory}
                className="text-xs"
              >
                Clear
              </Button>
            </div>
            {searchHistory.map((historyQuery, index) => (
              <Card 
                key={index}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setQuery(historyQuery)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{historyQuery}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5" />
            Narrative Search
          </CardTitle>
          <div className="flex items-center gap-2">
            <AIIndicator showStatus size="sm" />
            
            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Search Filters</SheetTitle>
                </SheetHeader>
                <SearchFilterPanel 
                  filter={currentFilter}
                  onChange={handleFilterUpdate}
                  onSave={handleSaveFilter}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search your thoughts, memories, and insights..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="results" className="text-xs">
                Results ({searchResults.length})
              </TabsTrigger>
              <TabsTrigger value="filters" className="text-xs">
                Filters ({savedFilters.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="results">
              {renderSearchResults()}
            </TabsContent>
            
            <TabsContent value="filters">
              {renderSavedFilters()}
            </TabsContent>
            
            <TabsContent value="history">
              {renderSearchHistory()}
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
};

// Filter panel component
interface SearchFilterPanelProps {
  filter: SearchFilter;
  onChange: (filter: SearchFilter) => void;
  onSave: () => void;
}

const SearchFilterPanel: React.FC<SearchFilterPanelProps> = ({
  filter,
  onChange,
  onSave
}) => {
  const [timeRange, setTimeRange] = useState({
    start: filter.timeRange?.start || '',
    end: filter.timeRange?.end || ''
  });

  const handleTimeRangeChange = (field: 'start' | 'end', value: string) => {
    const newTimeRange = { ...timeRange, [field]: value };
    setTimeRange(newTimeRange);
    
    if (newTimeRange.start && newTimeRange.end) {
      onChange({ ...filter, timeRange: newTimeRange });
    }
  };

  return (
    <div className="space-y-6 mt-6">
      <div>
        <label className="text-sm font-medium mb-2 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Time Range
        </label>
        <div className="space-y-2">
          <Input
            type="date"
            placeholder="Start date"
            value={timeRange.start}
            onChange={(e) => handleTimeRangeChange('start', e.target.value)}
          />
          <Input
            type="date"
            placeholder="End date"
            value={timeRange.end}
            onChange={(e) => handleTimeRangeChange('end', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 flex items-center gap-2">
          <Hash className="w-4 h-4" />
          Content Types
        </label>
        <div className="flex flex-wrap gap-2">
          {['bubble', 'cbt', 'glimmer', 'pattern'].map((type) => (
            <Badge
              key={type}
              variant={filter.types?.includes(type) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                const types = filter.types || [];
                const newTypes = types.includes(type)
                  ? types.filter(t => t !== type)
                  : [...types, type];
                onChange({ ...filter, types: newTypes });
              }}
            >
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />
      
      <Button onClick={onSave} className="w-full">
        Save Filter
      </Button>
    </div>
  );
};

export default NarrativeSearch;