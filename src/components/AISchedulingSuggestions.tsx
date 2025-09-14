/**
 * AI-Powered Scheduling Suggestions
 * 
 * Provides high-confidence suggestions based on habits and seasonal patterns
 * with privacy-aware explanations and decision tracing.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, 
  Calendar, 
  Clock, 
  CheckCircle, 
  X, 
  TrendingUp,
  Sparkles,
  RotateCcw,
  Info
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { seasonalPatternService, type SeasonalSuggestion } from '@/services/seasonalPatternService';
import { advancedHabitEngine, type HabitPrediction } from '@/services/advancedHabitEngine';
import { behavioralScienceEngine } from '@/services/behavioralScienceEngine';
import { Task } from '@/types/task';
import { useTaskStore } from '@/stores/taskStore';
import { decisionTraceService } from '@/services/decisionTraceService';
import { cn } from '@/lib/utils';

interface AISchedulingSuggestion {
  id: string;
  type: 'seasonal' | 'habit' | 'energy';
  title: string;
  description: string;
  suggestedTime: Date;
  confidence: number;
  reasoning: string[];
  priority: 'low' | 'medium' | 'high';
  energyRequired: 'low' | 'medium' | 'high';
  estimatedDuration: number;
  tags: string[];
  sourceData: SeasonalSuggestion | HabitPrediction | any;
  privacyLayer: 'surface' | 'context' | 'deep';
}

interface SuggestionCooldown {
  suggestionId: string;
  dismissedAt: number;
  cooldownUntil: number;
  reason?: string;
}

interface AISchedulingSuggestionsProps {
  maxSuggestions?: number;
  onSuggestionAccepted?: (suggestion: AISchedulingSuggestion, scheduledTask: Task) => void;
  onSuggestionDismissed?: (suggestion: AISchedulingSuggestion) => void;
  className?: string;
}

export function AISchedulingSuggestions({ 
  maxSuggestions = 3, 
  onSuggestionAccepted,
  onSuggestionDismissed,
  className 
}: AISchedulingSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<AISchedulingSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldowns, setCooldowns] = useState<SuggestionCooldown[]>([]);
  const { addTask } = useTaskStore();
  const { toast } = useToast();

  // Load cooldowns from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai-suggestion-cooldowns');
      if (stored) {
        const parsed: SuggestionCooldown[] = JSON.parse(stored);
        // Filter out expired cooldowns
        const active = parsed.filter(c => c.cooldownUntil > Date.now());
        setCooldowns(active);
      }
    } catch (error) {
      console.warn('Failed to load suggestion cooldowns:', error);
    }
  }, []);

  // Save cooldowns to localStorage
  const saveCooldowns = useCallback((newCooldowns: SuggestionCooldown[]) => {
    try {
      localStorage.setItem('ai-suggestion-cooldowns', JSON.stringify(newCooldowns));
      setCooldowns(newCooldowns);
    } catch (error) {
      console.warn('Failed to save suggestion cooldowns:', error);
    }
  }, []);

  // Generate suggestions from AI engines
  const generateSuggestions = useCallback(async () => {
    setIsLoading(true);
    const allSuggestions: AISchedulingSuggestion[] = [];

    try {
      // Get seasonal suggestions
      const seasonalSuggestions = await seasonalPatternService.generateSeasonalSuggestions(5);
      const seasonalMapped = seasonalSuggestions.map((s): AISchedulingSuggestion => ({
        id: `seasonal-${s.id}`,
        type: 'seasonal',
        title: s.title,
        description: s.content,
        suggestedTime: new Date(Date.now() + (s.timeContext.hour * 60 * 60 * 1000)),
        confidence: s.confidence,
        reasoning: s.reasoning,
        priority: s.priority,
        energyRequired: s.timeContext.energyLevel,
        estimatedDuration: 30, // Default 30 minutes
        tags: s.tags,
        sourceData: s,
        privacyLayer: 'context'
      }));

      // Get habit predictions
      const habitPredictions = await advancedHabitEngine.generateHabitBasedPredictions({
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        recentCompletions: []
      });
      const habitMapped = habitPredictions.map((h): AISchedulingSuggestion => ({
        id: `habit-${h.id}`,
        type: 'habit',
        title: h.bubbleContent,
        description: `Based on your habit patterns: ${h.reasoning.join(', ')}`,
        suggestedTime: new Date(h.suggestedTime),
        confidence: h.confidence,
        reasoning: h.reasoning,
        priority: h.priority === 'urgent' ? 'high' : h.priority,
        energyRequired: h.energyRequired,
        estimatedDuration: h.estimatedDuration,
        tags: h.habitPatterns.map(hp => hp.name),
        sourceData: h,
        privacyLayer: 'deep'
      }));

      // Get energy window suggestions
      const stressLevel = behavioralScienceEngine.detectStressLevel();
      const energyContext = behavioralScienceEngine.getNeuromodulatorContext();
      
      if (stressLevel < 0.3 && energyContext.recommendedStimuli !== 'reduce') {
        allSuggestions.push({
          id: `energy-${Date.now()}`,
          type: 'energy',
          title: 'Optimal Energy Window',
          description: 'Your current energy levels are ideal for focused work',
          suggestedTime: new Date(),
          confidence: 0.8,
          reasoning: ['Low stress detected', 'Good attention state', 'Optimal time for productivity'],
          priority: 'medium',
          energyRequired: 'medium',
          estimatedDuration: 45,
          tags: ['focus', 'productivity'],
          sourceData: { stressLevel, energyContext },
          privacyLayer: 'surface'
        });
      }

      allSuggestions.push(...seasonalMapped, ...habitMapped);

      // Filter out suggestions that are in cooldown
      const activeSuggestionIds = new Set(cooldowns.map(c => c.suggestionId));
      const filtered = allSuggestions.filter(s => !activeSuggestionIds.has(s.id));

      // Sort by confidence and priority, limit to maxSuggestions
      const sorted = filtered
        .sort((a, b) => {
          const priorityWeight = { high: 3, medium: 2, low: 1 };
          const aPriorityScore = priorityWeight[a.priority] * a.confidence;
          const bPriorityScore = priorityWeight[b.priority] * b.confidence;
          return bPriorityScore - aPriorityScore;
        })
        .slice(0, maxSuggestions);

      setSuggestions(sorted);
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
      toast({
        title: "Suggestion Error",
        description: "Failed to generate scheduling suggestions",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [maxSuggestions, cooldowns, toast]);

  // Auto-refresh suggestions every 15 minutes
  useEffect(() => {
    generateSuggestions();
    const interval = setInterval(generateSuggestions, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [generateSuggestions]);

  const handleAcceptSuggestion = useCallback(async (suggestion: AISchedulingSuggestion) => {
    try {
      // Create task from suggestion
      const newTask: Omit<Task, 'id'> = {
        title: suggestion.title,
        description: suggestion.description,
        type: 'task',
        priority: suggestion.confidence * 100,
        completed: false,
        tags: suggestion.tags.map(name => ({
          id: crypto.randomUUID(),
          name,
          emoji: suggestion.type === 'seasonal' ? '🌱' : suggestion.type === 'habit' ? '🔄' : '⚡'
        })),
        due: suggestion.suggestedTime.getTime(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        view: {
          calendar: {
            startTime: suggestion.suggestedTime.toISOString(),
            durationMin: suggestion.estimatedDuration
          }
        }
      };

      await addTask(newTask);
      const taskWithId = { ...newTask, id: crypto.randomUUID() } as Task;

      // Add decision trace
      decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [
          {
            type: suggestion.type,
            value: suggestion.title,
            confidence: suggestion.confidence,
            source: 'ai-suggestion',
            privacyLayer: suggestion.privacyLayer
          }
        ],
        confidenceThreshold: 0.6,
        finalConfidence: suggestion.confidence,
        decision: 'draft',
        action: 'schedule_suggestion',
        becauseText: `Because ${suggestion.reasoning.slice(0, 2).join(' and ')} • ${suggestion.privacyLayer.toUpperCase()}`,
        privacyWatermark: suggestion.privacyLayer,
        metadata: { suggestionId: suggestion.id, suggestionType: suggestion.type },
        undoable: true
      });

      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

      toast({
        title: "Task Scheduled",
        description: `"${suggestion.title}" scheduled as draft`,
        action: (
          <Button variant="outline" size="sm" onClick={() => {
            // Implement undo functionality
            console.log('Undo scheduling');
          }}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Undo
          </Button>
        )
      });

      onSuggestionAccepted?.(suggestion, taskWithId);
    } catch (error) {
      console.error('Failed to accept suggestion:', error);
      toast({
        title: "Scheduling Failed",
        description: "Could not schedule the suggested task",
        variant: "destructive"
      });
    }
  }, [addTask, toast, onSuggestionAccepted]);

  const handleDismissSuggestion = useCallback((suggestion: AISchedulingSuggestion) => {
    // Add to cooldown list (1 week cooldown)
    const cooldown: SuggestionCooldown = {
      suggestionId: suggestion.id,
      dismissedAt: Date.now(),
      cooldownUntil: Date.now() + (7 * 24 * 60 * 60 * 1000), // 1 week
      reason: 'user_dismissed'
    };

    const newCooldowns = [...cooldowns, cooldown];
    saveCooldowns(newCooldowns);

    // Remove from suggestions
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

    toast({
      title: "Suggestion Dismissed",
      description: "Similar suggestions won't appear for a week"
    });

    onSuggestionDismissed?.(suggestion);
  }, [cooldowns, saveCooldowns, toast, onSuggestionDismissed]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <TrendingUp className="h-3 w-3 text-red-500" />;
      case 'medium': return <Clock className="h-3 w-3 text-yellow-500" />;
      default: return <Info className="h-3 w-3 text-blue-500" />;
    }
  };

  if (suggestions.length === 0 && !isLoading) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Scheduling Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No suggestions available right now</p>
          <p className="text-xs mt-1">Check back in a few minutes</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Scheduling Suggestions
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={generateSuggestions}
            disabled={isLoading}
            className="h-6 w-6 p-0"
          >
            <RotateCcw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[400px]">
          {suggestions.map((suggestion, index) => (
            <div key={suggestion.id}>
              <div className="space-y-3 p-3 rounded-lg border">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getPriorityIcon(suggestion.priority)}
                      <h4 className="font-medium text-sm">{suggestion.title}</h4>
                      <Badge variant="outline" className="text-xs">
                        {suggestion.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {suggestion.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className={cn('text-xs font-medium', getConfidenceColor(suggestion.confidence))}>
                            {Math.round(suggestion.confidence * 100)}%
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Confidence level</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Timing and Context */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {suggestion.suggestedTime.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {suggestion.estimatedDuration}m
                  </div>
                  <Badge variant="secondary" className="text-xs px-1 py-0">
                    {suggestion.energyRequired} energy
                  </Badge>
                </div>

                {/* Because Explanation */}
                <div className="text-xs bg-muted/30 p-2 rounded">
                  <span className="font-medium">Because:</span>{' '}
                  {suggestion.reasoning.slice(0, 2).join(' and ')}
                  <span className="text-muted-foreground ml-1">
                    • {suggestion.privacyLayer.toUpperCase()}
                  </span>
                </div>

                {/* Tags */}
                {suggestion.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {suggestion.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs px-1 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {suggestion.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        +{suggestion.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => handleAcceptSuggestion(suggestion)}
                    className="flex-1 h-7 text-xs"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Schedule as Draft
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDismissSuggestion(suggestion)}
                    className="h-7 w-7 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {index < suggestions.length - 1 && <Separator className="my-3" />}
            </div>
          ))}
        </ScrollArea>

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center pt-2">
          Suggestions refresh every 15 minutes • Up to {maxSuggestions} per day
        </div>
      </CardContent>
    </Card>
  );
}