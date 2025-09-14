/**
 * Spacing Suggestion Panel - Shows AI-powered spacing recommendations
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BecauseExplanation } from '@/components/privacy/BecauseExplanation';
import { calendarSpacingService, SpacingSuggestion } from '@/services/calendarSpacingService';
import { 
  Clock, 
  TrendingDown, 
  Zap, 
  ChevronRight,
  X,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SpacingSuggestionPanelProps {
  date: Date;
  events: Array<{
    id: string;
    title: string;
    start: Date;
    end: Date;
    priority?: number;
    isFlexible?: boolean;
  }>;
  onApplySuggestion?: (suggestion: SpacingSuggestion) => void;
  className?: string;
}

export const SpacingSuggestionPanel: React.FC<SpacingSuggestionPanelProps> = ({
  date,
  events,
  onApplySuggestion,
  className
}) => {
  const [suggestions, setSuggestions] = useState<SpacingSuggestion[]>([]);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    const newSuggestions = calendarSpacingService.generateSpacingSuggestions(date, events, 3);
    setSuggestions(newSuggestions);
  }, [date, events]);

  const handleApplySuggestion = (suggestion: SpacingSuggestion) => {
    const trace = calendarSpacingService.acceptSuggestion(suggestion.id);
    
    setAppliedSuggestions(prev => new Set([...prev, suggestion.id]));
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    
    onApplySuggestion?.(suggestion);
    
    toast({
      title: "Spacing applied",
      description: `${suggestion.reason} - ${Math.round(suggestion.stressReduction * 100)}% stress reduction`,
      duration: 3000,
    });
  };

  const handleDismissSuggestion = (suggestion: SpacingSuggestion) => {
    calendarSpacingService.dismissSuggestion(suggestion.id);
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    
    toast({
      title: "Suggestion dismissed",
      description: "We'll learn from your preferences",
      duration: 2000,
    });
  };

  if (suggestions.length === 0) {
    return null;
  }

  const getPriorityColor = (priority: SpacingSuggestion['priority']) => {
    switch (priority) {
      case 'high': return 'hsl(var(--destructive))';
      case 'medium': return 'hsl(var(--warning))';
      case 'low': return 'hsl(var(--muted-foreground))';
    }
  };

  const getPriorityIcon = (priority: SpacingSuggestion['priority']) => {
    switch (priority) {
      case 'high': return TrendingDown;
      case 'medium': return Clock;
      case 'low': return Zap;
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Calendar Optimization
      </div>
      
      {suggestions.map((suggestion) => {
        const PriorityIcon = getPriorityIcon(suggestion.priority);
        const isApplied = appliedSuggestions.has(suggestion.id);
        
        return (
          <Card 
            key={suggestion.id} 
            className={cn(
              "transition-all duration-200",
              isApplied && "opacity-50 border-success bg-success/5"
            )}
          >
            <CardContent className="p-3 space-y-3">
              <div className="flex items-start gap-2">
                <PriorityIcon 
                  className="h-4 w-4 mt-0.5 flex-shrink-0" 
                  style={{ color: getPriorityColor(suggestion.priority) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight">
                    {suggestion.reason}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {suggestion.currentTime.toLocaleTimeString()} 
                    <ChevronRight className="h-3 w-3 inline mx-1" />
                    {suggestion.suggestedTime.toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {Math.round(suggestion.confidence * 100)}%
                  </Badge>
                  {suggestion.stressReduction > 0 && (
                    <Badge variant="outline" className="text-xs text-success">
                      -{Math.round(suggestion.stressReduction * 100)}% stress
                    </Badge>
                  )}
                </div>
              </div>

              <BecauseExplanation 
                drivers={[suggestion.becauseText]}
                compact={true}
                className="text-xs"
              />

              {!isApplied && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => handleApplySuggestion(suggestion)}
                    className="h-7 px-3 text-xs"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDismissSuggestion(suggestion)}
                    className="h-7 px-2 text-xs"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {isApplied && (
                <div className="text-xs text-success font-medium flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Applied
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};