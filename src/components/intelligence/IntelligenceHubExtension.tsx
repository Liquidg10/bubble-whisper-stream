/**
 * Phase 2: Intelligence Hub Integration
 * Adds seasonal and habit-based intelligence to the Intelligence page
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, 
  Calendar, 
  TrendingUp, 
  Clock,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { SeasonalSuggestionCard } from '@/components/intelligence/SeasonalSuggestionCard';
import { HabitPredictionPanel } from '@/components/intelligence/HabitPredictionPanel';
import { seasonalPatternService, SeasonalSuggestion } from '@/services/seasonalPatternService';
import { useBubbleStore } from '@/stores/bubbleStore';

export const IntelligenceHubExtension: React.FC = () => {
  const [seasonalSuggestions, setSeasonalSuggestions] = useState<SeasonalSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { settings } = useBubbleStore();

  useEffect(() => {
    if (settings.intelligenceEnabled) {
      loadSeasonalSuggestions();
    }
  }, [settings.intelligenceEnabled]);

  const loadSeasonalSuggestions = async () => {
    try {
      setIsLoading(true);
      const suggestions = await seasonalPatternService.generateSeasonalSuggestions(5);
      setSeasonalSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to load seasonal suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionAccept = (suggestion: SeasonalSuggestion) => {
    // Remove accepted suggestion from list
    setSeasonalSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  };

  const handleSuggestionDismiss = (suggestion: SeasonalSuggestion) => {
    // Remove dismissed suggestion from list
    setSeasonalSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  };

  if (!settings.intelligenceEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-muted-foreground" />
            Intelligence Features Disabled
          </CardTitle>
          <CardDescription>
            Enable intelligence features in settings to see AI-powered suggestions
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Advanced Intelligence</CardTitle>
                <CardDescription>
                  Seasonal patterns and habit-based predictions
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Phase 2</Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="seasonal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="seasonal" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Seasonal Intelligence
          </TabsTrigger>
          <TabsTrigger value="habits" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Habit Predictions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="seasonal" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Seasonal Suggestions</CardTitle>
                  <CardDescription>
                    Time-based task recommendations using seasonal intelligence
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSeasonalSuggestions}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading suggestions...</span>
                    </div>
                  ) : seasonalSuggestions.length === 0 ? (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No seasonal suggestions available yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create more tasks to build temporal patterns
                      </p>
                    </div>
                  ) : (
                    seasonalSuggestions.map((suggestion) => (
                      <SeasonalSuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onAccept={handleSuggestionAccept}
                        onDismiss={handleSuggestionDismiss}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="habits" className="space-y-4">
          <HabitPredictionPanel 
            maxPredictions={8}
            showRhythmInfo={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};