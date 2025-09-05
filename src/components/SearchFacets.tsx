import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Save, 
  X, 
  Calendar,
  Tag,
  User,
  Clock,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { narrativeSearchService } from '@/services/narrativeSearchService';
import { enhancedSearchService } from '@/services/enhancedSearchService';
import { isFeatureEnabled } from '@/config/flags';
import { SearchMatch, SearchFilter } from '@/types/search';
import { BecausePill } from '@/components/BecausePill';
import { format } from 'date-fns';

interface SearchFacetsProps {
  onSearch: (matches: SearchMatch[]) => void;
  onFiltersChange?: (hasActiveFilters: boolean) => void;
}

export function SearchFacets({ onSearch, onFiltersChange }: SearchFacetsProps) {
  const { bubbles } = useBubbleStore();
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SearchFilter[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');

  // Filter states
  const [timeRange, setTimeRange] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedHorizons, setSelectedHorizons] = useState<string[]>([]);

  // Get unique values for facets
  const availableTypes = [...new Set(bubbles.map(b => b.type))];
  const availableTags = [...new Set(bubbles.flatMap(b => 
    (b.tags || []).map(tag => typeof tag === 'string' ? tag : tag.name)
  ))];
  const availableDomains = ['work', 'personal', 'health', 'finance', 'travel', 'learning'];
  const availableHorizons = ['today', 'thisWeek', 'thisMonth', 'someday'];

  useEffect(() => {
    const loadSavedFilters = async () => {
      try {
        const searchService = isFeatureEnabled('searchV2') ? enhancedSearchService : narrativeSearchService;
        const filters = searchService.getSavedFilters();
        setSavedFilters(filters);
      } catch (error) {
        console.error('Failed to load saved filters:', error);
      }
    };
    
    loadSavedFilters();
  }, []);

  useEffect(() => {
    const hasActiveFilters = !!(
      query.trim() || 
      timeRange || 
      selectedTypes.length || 
      selectedTags.length || 
      selectedDomains.length || 
      selectedHorizons.length
    );
    onFiltersChange?.(hasActiveFilters);
  }, [query, timeRange, selectedTypes, selectedTags, selectedDomains, selectedHorizons, onFiltersChange]);

  const performSearch = async () => {
    setIsSearching(true);
    try {
      const searchService = isFeatureEnabled('searchV2') ? enhancedSearchService : narrativeSearchService;
      const filters: Partial<SearchFilter> = {
        timeRange: timeRange ? { preset: timeRange as any } : undefined,
        types: selectedTypes.length ? selectedTypes : undefined,
        tags: selectedTags.length ? selectedTags : undefined,
        domains: selectedDomains.length ? selectedDomains : undefined,
        horizon: selectedHorizons.length ? selectedHorizons : undefined,
      };

      const matches = await searchService.search(bubbles, query, filters);
      onSearch(matches);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, timeRange, selectedTypes, selectedTags, selectedDomains, selectedHorizons]);

  const clearAllFilters = () => {
    setQuery('');
    setTimeRange('');
    setSelectedTypes([]);
    setSelectedTags([]);
    setSelectedDomains([]);
    setSelectedHorizons([]);
  };

  const saveCurrentFilter = async () => {
    if (!saveFilterName.trim()) return;

    const filter: Omit<SearchFilter, 'id' | 'createdAt'> = {
      name: saveFilterName,
      query: query || undefined,
      timeRange: timeRange ? { preset: timeRange as any } : undefined,
      types: selectedTypes.length ? selectedTypes : undefined,
      tags: selectedTags.length ? selectedTags : undefined,
      domains: selectedDomains.length ? selectedDomains : undefined,
      horizon: selectedHorizons.length ? selectedHorizons : undefined,
    };

    const searchService = isFeatureEnabled('searchV2') ? enhancedSearchService : narrativeSearchService;
    const saved = await searchService.saveFilter(filter);
    setSavedFilters([...savedFilters, saved]);
    setSaveFilterName('');
    setShowSaveDialog(false);
  };

  const applySavedFilter = (filter: SearchFilter) => {
    setQuery(filter.query || '');
    setTimeRange(filter.timeRange?.preset || '');
    setSelectedTypes(filter.types || []);
    setSelectedTags(filter.tags || []);
    setSelectedDomains(filter.domains || []);
    setSelectedHorizons(filter.horizon || []);
  };

  const deleteSavedFilter = async (filterId: string) => {
    const searchService = isFeatureEnabled('searchV2') ? enhancedSearchService : narrativeSearchService;
    await searchService.deleteFilter(filterId);
    setSavedFilters(savedFilters.filter(f => f.id !== filterId));
  };

  const toggleArrayValue = (array: string[], setter: (arr: string[]) => void, value: string) => {
    if (array.includes(value)) {
      setter(array.filter(v => v !== value));
    } else {
      setter([...array, value]);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filters
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              disabled={!query && !timeRange && !selectedTypes.length && !selectedTags.length}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <Filter className="h-4 w-4 mr-1" />
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bubbles..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Saved filters dropdown */}
        {savedFilters.length > 0 && (
          <Select onValueChange={(value) => {
            const filter = savedFilters.find(f => f.id === value);
            if (filter) applySavedFilter(filter);
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Load saved filter..." />
            </SelectTrigger>
            <SelectContent>
              {savedFilters.map((filter) => (
                <div key={filter.id} className="flex items-center justify-between p-2 hover:bg-muted">
                  <SelectItem value={filter.id} className="flex-1">
                    <div className="flex flex-col">
                      <span className="font-medium">{filter.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(filter.createdAt, 'MMM d, yyyy')}
                      </span>
                    </div>
                  </SelectItem>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedFilter(filter.id);
                    }}
                    className="h-6 w-6 p-0 ml-2"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Time Range */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4" />
                Time Range
              </Label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="thisWeek">This Week</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Types */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4" />
                Bubble Types
              </Label>
              <div className="flex flex-wrap gap-2">
                {availableTypes.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${type}`}
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={() => toggleArrayValue(selectedTypes, setSelectedTypes, type)}
                    />
                    <Label htmlFor={`type-${type}`} className="text-sm">
                      {type}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Tags */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4" />
                Tags
              </Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {availableTags.slice(0, 20).map((tag) => (
                  <div key={tag} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tag-${tag}`}
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={() => toggleArrayValue(selectedTags, setSelectedTags, tag)}
                    />
                    <Label htmlFor={`tag-${tag}`} className="text-sm">
                      {tag}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Domains */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4" />
                Domains
              </Label>
              <div className="flex flex-wrap gap-2">
                {availableDomains.map((domain) => (
                  <div key={domain} className="flex items-center space-x-2">
                    <Checkbox
                      id={`domain-${domain}`}
                      checked={selectedDomains.includes(domain)}
                      onCheckedChange={() => toggleArrayValue(selectedDomains, setSelectedDomains, domain)}
                    />
                    <Label htmlFor={`domain-${domain}`} className="text-sm capitalize">
                      {domain}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Horizons */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" />
                Horizons
              </Label>
              <div className="flex flex-wrap gap-2">
                {availableHorizons.map((horizon) => (
                  <div key={horizon} className="flex items-center space-x-2">
                    <Checkbox
                      id={`horizon-${horizon}`}
                      checked={selectedHorizons.includes(horizon)}
                      onCheckedChange={() => toggleArrayValue(selectedHorizons, setSelectedHorizons, horizon)}
                    />
                    <Label htmlFor={`horizon-${horizon}`} className="text-sm">
                      {horizon}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Save Filter */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveDialog(!showSaveDialog)}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Filter
              </Button>
              
              {showSaveDialog && (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    placeholder="Filter name..."
                    value={saveFilterName}
                    onChange={(e) => setSaveFilterName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()}
                  />
                  <Button
                    size="sm"
                    onClick={saveCurrentFilter}
                    disabled={!saveFilterName.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSaveDialog(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {isSearching && (
              <div className="text-sm text-muted-foreground">
                Searching...
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}