import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Undo2, Sparkles } from 'lucide-react';
import { Bubble } from '@/types/bubble';
import { TimeHorizon } from '@/types/atomic';
import { prioritizerService, PriorityScore, PriorityContext } from '@/services/prioritizer';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/config/flags';
import { BecausePill } from './BecausePill';

interface PrioritizedBubble extends Bubble {
  priority: PriorityScore;
}

export const IntelligenceDashboard: React.FC = () => {
  const { bubbles, moveBubbleToHorizon } = useBubbleStore();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<PrioritizedBubble[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastMoves, setLastMoves] = useState<Array<{ bubbleId: string; from: TimeHorizon; to: TimeHorizon }>>([]);

  // Don't render if prioritizer is disabled
  if (!isFeatureEnabled('prioritizer')) {
    return null;
  }

  const generateSuggestions = async () => {
    setIsLoading(true);
    try {
      const context: PriorityContext = {
        timeOfDay: new Date().getHours(),
        sessionType: 'planning',
        recentCompletions: bubbles.filter(b => b.completed).slice(-5),
        userEnergyLevel: inferCurrentEnergyLevel()
      };

      // Get bubbles that could benefit from prioritization
      const candidateBubbles = bubbles.filter(bubble => 
        !bubble.completed && 
        (bubble.type === 'Task' || 
        (bubble.reminderId && bubble.type !== 'Mood'))
      );

      const prioritized = await prioritizerService.generateSuggestions(candidateBubbles, context);
      
      // Only show suggestions where the AI recommends a different horizon
      const meaningfulSuggestions = prioritized.filter(bubble => 
        bubble.priority.score > 0.6 || 
        bubble.priority.confidence > 0.7
      ).slice(0, 8); // Limit to top 8 suggestions

      setSuggestions(meaningfulSuggestions);
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      toast({
        title: "Failed to generate suggestions",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveBubble = (bubble: PrioritizedBubble, newHorizon: TimeHorizon) => {
    const currentHorizon = getCurrentHorizon(bubble);
    
    // Record the move for undo
    setLastMoves(prev => [
      { bubbleId: bubble.id, from: currentHorizon, to: newHorizon },
      ...prev.slice(0, 4) // Keep last 5 moves
    ]);

    // Record the correction for learning
    prioritizerService.recordCorrection(
      bubble.id,
      bubble.priority.suggestedHorizon,
      newHorizon,
      {
        timeOfDay: new Date().getHours(),
        sessionType: 'planning',
        recentCompletions: []
      }
    );

    // Move the bubble
    moveBubbleToHorizon(bubble.id, newHorizon);

    // Remove from suggestions
    setSuggestions(prev => prev.filter(s => s.id !== bubble.id));

    toast({
      title: `Moved to ${newHorizon}`,
      description: bubble.content?.substring(0, 50) || "Task moved"
    });
  };

  const handleUndo = (move: { bubbleId: string; from: TimeHorizon; to: TimeHorizon }) => {
    moveBubbleToHorizon(move.bubbleId, move.from);
    setLastMoves(prev => prev.filter(m => m.bubbleId !== move.bubbleId));
    
    toast({
      title: "Move undone",
      description: "Bubble restored to original position"
    });
  };

  const getCurrentHorizon = (bubble: Bubble): TimeHorizon => {
    // This is a simplified determination - in a real app you'd check the actual horizon
    if (bubble.reminderId) return TimeHorizon.Today;
    if (bubble.metadata?.outliner) return TimeHorizon.Week;
    return TimeHorizon.Later;
  };

  const inferCurrentEnergyLevel = (): 'low' | 'medium' | 'high' => {
    const hour = new Date().getHours();
    if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) return 'high';
    if ((hour >= 6 && hour <= 9) || (hour >= 19 && hour <= 22)) return 'medium';
    return 'low';
  };

  const getHorizonColor = (horizon: TimeHorizon) => {
    switch (horizon) {
      case TimeHorizon.Today: return 'bg-red-100 text-red-800 border-red-200';
      case TimeHorizon.Week: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case TimeHorizon.Later: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  useEffect(() => {
    generateSuggestions();
  }, []);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Intelligent Priority Suggestions
          <Sparkles className="h-4 w-4 text-primary/60" />
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            onClick={generateSuggestions} 
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? 'Analyzing...' : 'Plan My Day'}
          </Button>
          {lastMoves.length > 0 && (
            <div className="flex gap-1">
              {lastMoves.slice(0, 3).map((move, index) => (
                <Button
                  key={`${move.bubbleId}-${index}`}
                  variant="outline"
                  size="sm"
                  onClick={() => handleUndo(move)}
                  className="text-xs"
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  Undo
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {suggestions.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Click "Plan My Day" to get personalized priority suggestions</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Analyzing your tasks and context...</p>
          </div>
        )}

        <div className="space-y-3">
          {suggestions.map((bubble) => (
            <div
              key={bubble.id}
              className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {bubble.type}
                    </Badge>
                    <Badge 
                      className={`text-xs ${getHorizonColor(bubble.priority.suggestedHorizon)}`}
                    >
                      Suggested: {bubble.priority.suggestedHorizon}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Score: {Math.round(bubble.priority.score * 100)}%
                    </span>
                  </div>
                  
                  <p className="text-sm font-medium mb-2 line-clamp-2">
                    {bubble.content || 'Untitled task'}
                  </p>
                  
                  <div className="flex flex-wrap gap-1 mb-3">
                    {bubble.priority.why.map((reason, index) => (
                      <BecausePill key={index} explanation={reason} />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveBubble(bubble, TimeHorizon.Today)}
                    className="text-xs h-8"
                  >
                    🔥 Today
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveBubble(bubble, TimeHorizon.Week)}
                    className="text-xs h-8"
                  >
                    📅 Week
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveBubble(bubble, TimeHorizon.Later)}
                    className="text-xs h-8"
                  >
                    🌙 Later
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {suggestions.length > 0 && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">
              💡 <strong>Learning from your choices:</strong> The AI adapts based on your decisions
            </p>
            <p className="text-xs text-muted-foreground">
              Current energy level: <strong>{inferCurrentEnergyLevel()}</strong> • 
              Time: <strong>{new Date().getHours()}:00</strong> • 
              Suggestions based on your patterns and context
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};