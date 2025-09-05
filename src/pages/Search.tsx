import React, { useState, useEffect } from 'react';
import { SearchFacets } from '@/components/SearchFacets';
import { SearchBecausePill } from '@/components/SearchBecausePill';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchMatch } from '@/types/search';
import { useBubbleStore } from '@/stores/bubbleStore';
import { enhancedSearchService } from '@/services/enhancedSearchService';
import { narrativeSearchService } from '@/services/narrativeSearchService';
import { Search, ArrowLeft, Target, Clock, Tag, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { isFeatureEnabled } from '@/config/flags';

export default function SearchPage() {
  const { bubbles } = useBubbleStore();
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [indexStats, setIndexStats] = useState({
    bubblesIndexed: 0,
    lastBuilt: new Date(),
    isBuilding: false,
    avgSearchTime: 0,
    cacheHitRate: 0
  });

  useEffect(() => {
    // Initialize enhanced search service when searchV2 is enabled
    const searchService = isFeatureEnabled('searchV2') ? enhancedSearchService : narrativeSearchService;
    searchService.initialize();
    
    // Update index stats periodically
    const updateStats = () => {
      setIndexStats(searchService.getIndexStats());
    };
    
    updateStats();
    const interval = setInterval(updateStats, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (matches: SearchMatch[]) => {
    setSearchMatches(matches);
  };

  const renderBubblePreview = (match: SearchMatch) => {
    const { bubble } = match;
    const createdDate = new Date(bubble.createdAt);

    return (
      <Card key={bubble.id} className="w-full hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {bubble.type}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {format(createdDate, 'MMM d, yyyy HH:mm')}
              </span>
            </div>
            <Badge variant="secondary" className="text-xs">
              Score: {match.score.toFixed(1)}
            </Badge>
          </div>
          
          {/* Tags */}
          {bubble.tags && bubble.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {bubble.tags.slice(0, 5).map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  <Tag className="h-3 w-3 mr-1" />
                  {typeof tag === 'string' ? tag : tag.name}
                </Badge>
              ))}
              {bubble.tags.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{bubble.tags.length - 5} more
                </Badge>
              )}
            </div>
          )}
        </CardHeader>
        
        <CardContent className="space-y-3">
          {/* Content preview */}
          <p className="text-sm text-foreground line-clamp-3">
            {bubble.content}
          </p>

          {/* Because pill */}
          <SearchBecausePill reasons={match.reasons} score={match.score} />

          {/* Metadata */}
          {bubble.metadata && Object.keys(bubble.metadata).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {bubble.metadata.source && (
                <Badge variant="outline" className="text-xs">
                  Source: {bubble.metadata.source}
                </Badge>
              )}
              {bubble.metadata.originalSender && (
                <Badge variant="outline" className="text-xs">
                  From: {bubble.metadata.originalSender}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Canvas
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Search className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Search</h1>
                <p className="text-sm text-muted-foreground">
                  Find bubbles with explainable matches
                </p>
              </div>
            </div>
          </div>
          
          {/* Enhanced index stats for searchV2 */}
          <div className="text-right">
            {isFeatureEnabled('searchV2') && (
              <Badge variant="secondary" className="mb-2">
                <Zap className="h-3 w-3 mr-1" />
                Enhanced Search v2
              </Badge>
            )}
            <div className="text-sm text-muted-foreground">
              {indexStats.bubblesIndexed} bubbles indexed
            </div>
            <div className="text-xs text-muted-foreground">
              {indexStats.isBuilding ? 'Building...' : 
                `Last built: ${format(indexStats.lastBuilt, 'HH:mm:ss')}`}
            </div>
            {isFeatureEnabled('searchV2') && indexStats.avgSearchTime > 0 && (
              <div className="text-xs text-muted-foreground">
                Avg: {indexStats.avgSearchTime.toFixed(1)}ms
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <SearchFacets 
              onSearch={handleSearch}
              onFiltersChange={setHasActiveFilters}
            />
          </div>

          {/* Results */}
          <div className="lg:col-span-3 space-y-4">
            {/* Results header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {hasActiveFilters ? (
                  <>
                    <Target className="h-5 w-5 mr-2 inline" />
                    {searchMatches.length} results found
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 mr-2 inline" />
                    Recent bubbles
                  </>
                )}
              </h2>
              
              {searchMatches.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Showing top {Math.min(searchMatches.length, 100)} matches
                </div>
              )}
            </div>

            {/* Results list */}
            {hasActiveFilters ? (
              searchMatches.length > 0 ? (
                <div className="space-y-4">
                  {searchMatches.map((match) => renderBubblePreview(match))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      No matches found
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Try adjusting your search query or filters to find relevant bubbles.
                    </p>
                  </CardContent>
                </Card>
              )
            ) : (
              // Show recent bubbles when no filters are active
              <div className="space-y-4">
                {bubbles
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .slice(0, 20)
                  .map((bubble) => renderBubblePreview({
                    bubble,
                    score: 0.1,
                    reasons: [{
                      field: 'timeRange',
                      value: 'recent',
                      weight: 0.1
                    }]
                  }))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}