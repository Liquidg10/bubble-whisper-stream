/**
 * Phase 2: Seasonal Suggestion Card Component
 * Displays time-based task suggestions with seasonal intelligence
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  Calendar, 
  Sparkles, 
  TrendingUp, 
  Brain,
  Plus,
  Info,
  Lightbulb,
  Timer
} from 'lucide-react';
import { SeasonalSuggestion } from '@/services/seasonalPatternService';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

interface SeasonalSuggestionCardProps {
  suggestion: SeasonalSuggestion;
  onAccept?: (suggestion: SeasonalSuggestion) => void;
  onDismiss?: (suggestion: SeasonalSuggestion) => void;
  compact?: boolean;
}

export const SeasonalSuggestionCard: React.FC<SeasonalSuggestionCardProps> = ({
  suggestion,
  onAccept,
  onDismiss,
  compact = false
}) => {
  const [isAccepting, setIsAccepting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { addBubble } = useBubbleStore();
  const { toast } = useToast();

  const handleAcceptSuggestion = async () => {
    setIsAccepting(true);
    
    try {
      // Create bubble from suggestion
      const newBubble = {
        id: crypto.randomUUID(),
        content: suggestion.content,
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        size: 1,
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        type: 'Task' as const,
        tags: Array.isArray(suggestion.tags) ? suggestion.tags.map(tag => ({
          id: crypto.randomUUID(),
          name: tag,
          emoji: getTagEmoji(tag)
        })) : []
      };

      await addBubble(newBubble);
      
      toast({
        title: "Task created",
        description: `Added "${suggestion.content}" to your workspace`,
      });

      onAccept?.(suggestion);
    } catch (error) {
      console.error('Failed to create task from suggestion:', error);
      toast({
        title: "Failed to create task",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsAccepting(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <TrendingUp className="h-3 w-3" />;
      case 'high': return <Sparkles className="h-3 w-3" />;
      case 'medium': return <Clock className="h-3 w-3" />;
      case 'low': return <Calendar className="h-3 w-3" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  const getTimeContextDisplay = () => {
    const { timeOfDay, season, isWeekend, holidayName } = suggestion.timeContext;
    
    const contexts = [];
    if (holidayName) contexts.push(holidayName);
    else if (isWeekend) contexts.push('Weekend');
    
    contexts.push(season.charAt(0).toUpperCase() + season.slice(1));
    contexts.push(timeOfDay);
    
    return contexts.join(' • ');
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.round(ms / (60 * 1000));
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  };

  if (compact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full"
      >
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="h-4 w-4 text-primary flex-shrink-0" />
                  <Badge variant={getPriorityColor(suggestion.priority)} className="text-xs">
                    {getPriorityIcon(suggestion.priority)}
                    <span className="ml-1">{suggestion.priority}</span>
                  </Badge>
                </div>
                
                <p className="text-sm font-medium line-clamp-2 mb-1">
                  {suggestion.content}
                </p>
                
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {suggestion.reasoning[0]}
                </p>
              </div>
              
              <Button
                size="sm"
                onClick={handleAcceptSuggestion}
                disabled={isAccepting}
                className="flex-shrink-0"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <Card className="hover:shadow-lg transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">{suggestion.title}</CardTitle>
                <CardDescription className="text-sm">
                  {getTimeContextDisplay()}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant={getPriorityColor(suggestion.priority)}>
                {getPriorityIcon(suggestion.priority)}
                <span className="ml-1">{suggestion.priority}</span>
              </Badge>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Confidence indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-medium">{Math.round(suggestion.confidence * 100)}%</span>
            </div>
            <Progress value={suggestion.confidence * 100} className="h-1" />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main suggestion content */}
          <div className="space-y-2">
            <p className="font-medium">{suggestion.content}</p>
            
            {suggestion.reasoning.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  {suggestion.reasoning[0]}
                  {suggestion.reasoning.length > 1 && showDetails && (
                    <ul className="mt-2 space-y-1">
                      {suggestion.reasoning.slice(1).map((reason, index) => (
                        <li key={index}>• {reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Additional details */}
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <Separator />
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">~30m</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Energy:</span>
                  <span className="font-medium capitalize">medium</span>
                </div>
              </div>

              {/* Pattern information */}
              {suggestion.patterns.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Based on your patterns:</h5>
                  <div className="flex flex-wrap gap-1">
                    {suggestion.patterns.map((pattern, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {pattern.type}: {pattern.pattern}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {suggestion.tags.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Tags:</h5>
                  <div className="flex flex-wrap gap-1">
                    {suggestion.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {getTagEmoji(tag)} {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleAcceptSuggestion}
              disabled={isAccepting}
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-2" />
              {isAccepting ? 'Adding...' : 'Add Task'}
            </Button>
            
            {onDismiss && (
              <Button
                variant="outline"
                onClick={() => onDismiss(suggestion)}
                disabled={isAccepting}
              >
                Dismiss
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

// Helper function to get emoji for tags
function getTagEmoji(tag: string): string {
  const emojiMap: Record<string, string> = {
    'morning': '🌅',
    'afternoon': '☀️',
    'evening': '🌆',
    'night': '🌙',
    'daily': '📅',
    'weekly': '📊',
    'monthly': '🗓️',
    'yearly': '📆',
    'spring': '🌸',
    'summer': '☀️',
    'fall': '🍂',
    'winter': '❄️',
    'seasonal': '🔄',
    'energy': '⚡',
    'focus': '🎯',
    'creative': '🎨',
    'admin': '📋',
    'work': '💼',
    'personal': '👤',
    'health': '💪',
    'learning': '📚'
  };
  
  return emojiMap[tag.toLowerCase()] || '🏷️';
}