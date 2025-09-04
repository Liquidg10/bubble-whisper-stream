import React, { useState, useMemo } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BecausePill } from '@/components/BecausePill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JoyCard } from '@/components/JoyCard';
import { Heart, Search, Filter, Calendar, Star, Sparkles } from 'lucide-react';
import { Bubble } from '@/types/bubble';

export const Joy: React.FC = () => {
  const { bubbles } = useBubbleStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Filter bubbles to only show Joy-related ones (exclude receipts unless bookmarked)
  const joyBubbles = useMemo(() => {
    return bubbles.filter(bubble => {
      // Exclude receipt bubbles unless they're explicitly bookmarked/favorited
      const isReceipt = bubble.tags?.some(tag => tag.name.toLowerCase().includes('receipt')) ||
                       bubble.metadata?.finance?.receiptProcessed;
      
      if (isReceipt) {
        // Only include receipts if they're explicitly marked as favorites
        const isFavorite = bubble.tags?.some(tag => 
          tag.name.toLowerCase().includes('favorite') || 
          tag.name.toLowerCase().includes('favourite')
        );
        return isFavorite;
      }
      
      // Include Memory type bubbles with joy-related content
      return bubble.type === 'Memory' && ( 
        bubble.tags?.some(tag => tag.name.toLowerCase().includes('joy')) ||
        bubble.content?.toLowerCase().includes('joy') ||
        bubble.content?.toLowerCase().includes('happy') ||
        bubble.content?.toLowerCase().includes('smile') ||
        bubble.content?.toLowerCase().includes('laugh') ||
        bubble.tags?.some(tag => tag.name.toLowerCase().includes('happy'))
      );
    });
  }, [bubbles]);

  // Apply search and time filters
  const filteredJoyBubbles = useMemo(() => {
    let filtered = joyBubbles;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(bubble => 
        bubble.content?.toLowerCase().includes(query) ||
        bubble.tags?.some(tag => tag.name.toLowerCase().includes(query))
      );
    }

    // Apply time filter
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = now - (7 * 24 * 60 * 60 * 1000);
    const monthStart = now - (30 * 24 * 60 * 60 * 1000);

    switch (timeFilter) {
      case 'today':
        filtered = filtered.filter(bubble => bubble.createdAt >= todayStart);
        break;
      case 'week':
        filtered = filtered.filter(bubble => bubble.createdAt >= weekStart);
        break;
      case 'month':
        filtered = filtered.filter(bubble => bubble.createdAt >= monthStart);
        break;
    }

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [joyBubbles, searchQuery, timeFilter]);

  // Group bubbles by time periods
  const groupedBubbles = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = now - (7 * 24 * 60 * 60 * 1000);

    const today = filteredJoyBubbles.filter(bubble => bubble.createdAt >= todayStart);
    const thisWeek = filteredJoyBubbles.filter(bubble => 
      bubble.createdAt >= weekStart && bubble.createdAt < todayStart
    );
    const favorites = filteredJoyBubbles.filter(bubble => 
      bubble.tags?.some(tag => tag.name.toLowerCase().includes('favorite')) ||
      bubble.tags?.some(tag => tag.name.toLowerCase().includes('favourite'))
    );
    
    // Auto-detected Joy candidates from vision analysis
    const auto = filteredJoyBubbles.filter(bubble =>
      bubble.tags?.some(tag => tag.name === 'joy-candidate')
    );

    return { today, thisWeek, favorites, auto, all: filteredJoyBubbles };
  }, [filteredJoyBubbles]);

  const generateBecauseExplanation = (bubble: Bubble): string => {
    const isRecent = Date.now() - bubble.createdAt < (24 * 60 * 60 * 1000);
    const isFavorite = bubble.tags?.some(tag => 
      tag.name.toLowerCase().includes('favorite') || 
      tag.name.toLowerCase().includes('favourite')
    );
    
    if (isRecent && isFavorite) {
      return 'Recent favorite memory';
    } else if (isRecent) {
      return 'Recent joyful moment';
    } else if (isFavorite) {
      return 'Marked as favorite';
    } else {
      return 'Contains joy indicators';
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Heart className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Joy Moments</h1>
        </div>
        <Badge variant="secondary" className="text-xs">
          {filteredJoyBubbles.length} moment{filteredJoyBubbles.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Search and Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search joy moments... (try 'beach + pepper')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Search joy moments"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={timeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('all')}
              >
                All
              </Button>
              <Button
                variant={timeFilter === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('today')}
              >
                Today
              </Button>
              <Button
                variant={timeFilter === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('week')}
              >
                Week
              </Button>
              <Button
                variant={timeFilter === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('month')}
              >
                Month
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            All ({groupedBubbles.all.length})
          </TabsTrigger>
          <TabsTrigger value="auto" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Auto ({groupedBubbles.auto?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="today" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today ({groupedBubbles.today.length})
          </TabsTrigger>
          <TabsTrigger value="week" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            This Week ({groupedBubbles.thisWeek.length})
          </TabsTrigger>
          <TabsTrigger value="favorites" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Favorites ({groupedBubbles.favorites.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="mt-6">
          {groupedBubbles.auto?.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No AI-detected joy moments yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Take photos to let AI find joyful moments!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedBubbles.auto?.map((bubble) => (
                <div key={bubble.id} className="space-y-2">
                  <JoyCard bubble={bubble} />
                  <BecausePill 
                    explanation="AI detected joyful content"
                    variant="pill"
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          {groupedBubbles.all.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Joy Moments Yet</h3>
                <p className="text-muted-foreground">
                  Create bubbles with joy-related content or add 'joy' tags to start building your collection!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedBubbles.all.map((bubble) => (
                <div key={bubble.id} className="space-y-2">
                  <JoyCard bubble={bubble} />
                  <BecausePill 
                    explanation={generateBecauseExplanation(bubble)}
                    variant="pill"
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="today" className="mt-6">
          {groupedBubbles.today.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No joy moments captured today yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedBubbles.today.map((bubble) => (
                <div key={bubble.id} className="space-y-2">
                  <JoyCard bubble={bubble} />
                  <BecausePill 
                    explanation={generateBecauseExplanation(bubble)}
                    variant="pill"
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="week" className="mt-6">
          {groupedBubbles.thisWeek.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No joy moments from this week.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedBubbles.thisWeek.map((bubble) => (
                <div key={bubble.id} className="space-y-2">
                  <JoyCard bubble={bubble} />
                  <BecausePill 
                    explanation={generateBecauseExplanation(bubble)}
                    variant="pill"
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="favorites" className="mt-6">
          {groupedBubbles.favorites.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Star className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No favorite joy moments marked yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedBubbles.favorites.map((bubble) => (
                <div key={bubble.id} className="space-y-2">
                  <JoyCard bubble={bubble} />
                  <BecausePill 
                    explanation="Marked as favorite"
                    variant="pill"
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};