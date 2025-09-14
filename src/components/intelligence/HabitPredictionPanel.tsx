/**
 * Phase 2: Habit Prediction Panel Component
 * Predictive task creation UI based on learned habits
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain, 
  Target, 
  Clock, 
  Zap, 
  TrendingUp, 
  Plus,
  ChevronRight,
  Lightbulb,
  BarChart3,
  Calendar,
  Timer,
  RefreshCw
} from 'lucide-react';
import { advancedHabitEngine, HabitPrediction } from '@/services/advancedHabitEngine';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface HabitPredictionPanelProps {
  maxPredictions?: number;
  showRhythmInfo?: boolean;
}

export const HabitPredictionPanel: React.FC<HabitPredictionPanelProps> = ({
  maxPredictions = 5,
  showRhythmInfo = true
}) => {
  const [predictions, setPredictions] = useState<HabitPrediction[]>([]);
  const [rhythmInfo, setRhythmInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [acceptingPrediction, setAcceptingPrediction] = useState<string | null>(null);
  const { addBubble, bubbles } = useBubbleStore();
  const { toast } = useToast();

  useEffect(() => {
    loadPredictions();
    loadRhythmInfo();

    // Refresh predictions every 30 minutes
    const interval = setInterval(loadPredictions, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Retrain on bubble changes
    if (bubbles.length > 0) {
      advancedHabitEngine.learnHabitsFromHistory(bubbles);
    }
  }, [bubbles.length]);

  const loadPredictions = async () => {
    try {
      setIsLoading(true);
      
      // Get current context
      const currentContext = {
        energyLevel: getCurrentEnergyLevel(),
        recentActivity: getRecentActivity(),
        timeOfDay: getTimeOfDay()
      };

      const newPredictions = await advancedHabitEngine.generateHabitBasedPredictions(currentContext);
      setPredictions(newPredictions.slice(0, maxPredictions));
    } catch (error) {
      console.error('Failed to load habit predictions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRhythmInfo = () => {
    if (showRhythmInfo) {
      const rhythmRecommendations = advancedHabitEngine.getCurrentRhythmRecommendations();
      setRhythmInfo(rhythmRecommendations);
    }
  };

  const handleAcceptPrediction = async (prediction: HabitPrediction) => {
    setAcceptingPrediction(prediction.id);
    
    try {
      // Create bubble from prediction
      const newBubble = {
        id: crypto.randomUUID(),
        content: prediction.bubbleContent,
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        size: 1,
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        type: 'Task' as const,
        tags: [{
          id: crypto.randomUUID(),
          name: 'habit-prediction',
          emoji: '🧠'
        }]
      };

      await addBubble(newBubble);
      
      // Reinforce the habit patterns
      prediction.habitPatterns.forEach(habit => {
        advancedHabitEngine.reinforceHabit(habit.id, true);
      });
      
      toast({
        title: "Habit task created",
        description: `Added "${prediction.bubbleContent}" based on your patterns`,
      });

      // Remove the accepted prediction
      setPredictions(prev => prev.filter(p => p.id !== prediction.id));
    } catch (error) {
      console.error('Failed to create habit task:', error);
      toast({
        title: "Failed to create task",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setAcceptingPrediction(null);
    }
  };

  const handleDismissPrediction = (predictionId: string, habitId?: string) => {
    // Reinforce habits as unsuccessful
    const prediction = predictions.find(p => p.id === predictionId);
    if (prediction) {
      prediction.habitPatterns.forEach(habit => {
        advancedHabitEngine.reinforceHabit(habit.id, false);
      });
    }

    setPredictions(prev => prev.filter(p => p.id !== predictionId));
    toast({
      title: "Prediction dismissed",
      description: "We'll adjust future suggestions based on this feedback",
    });
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

  const getEnergyIcon = (energy: string) => {
    switch (energy) {
      case 'high': return <Zap className="h-4 w-4 text-orange-500" />;
      case 'medium': return <Target className="h-4 w-4 text-blue-500" />;
      case 'low': return <Clock className="h-4 w-4 text-green-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.round(ms / (60 * 1000));
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>Learning Your Habits...</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Analyzing patterns</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rhythm Information */}
      {showRhythmInfo && rhythmInfo && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Current Productivity Rhythm</CardTitle>
                <CardDescription>
                  {rhythmInfo.currentRhythm?.name || 'No specific rhythm detected'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Energy:</span>
                <Badge variant="outline" className="text-xs">
                  {rhythmInfo.energyLevel}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Focus:</span>
                <Badge variant="outline" className="text-xs">
                  {rhythmInfo.currentRhythm?.type || 'general'}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Context:</span>
                <Badge variant="outline" className="text-xs">
                  {getTimeOfDay()}
                </Badge>
              </div>
            </div>

            {rhythmInfo.recommendations.length > 0 && (
              <Alert>
                <Lightbulb className="h-4 w-4" />
                <AlertDescription>
                  {rhythmInfo.recommendations[0]}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Habit Predictions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Habit-Based Suggestions</CardTitle>
                <CardDescription>
                  Based on your behavioral patterns
                </CardDescription>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPredictions}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {predictions.length === 0 ? (
            <div className="text-center py-6">
              <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                No predictions available yet
              </p>
              <p className="text-xs text-muted-foreground">
                Keep using the app to build habit patterns
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {predictions.map((prediction, index) => (
                <motion.div
                  key={prediction.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                >
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={getPriorityColor(prediction.priority)} className="text-xs">
                                {prediction.priority}
                              </Badge>
                              
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {getEnergyIcon(prediction.energyRequired)}
                                <span>{prediction.energyRequired} energy</span>
                              </div>
                              
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Timer className="h-3 w-3" />
                                <span>{formatDuration(prediction.estimatedDuration)}</span>
                              </div>
                            </div>
                            
                            <h4 className="font-medium line-clamp-2 mb-1">
                              {prediction.bubbleContent}
                            </h4>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleAcceptPrediction(prediction)}
                              disabled={acceptingPrediction === prediction.id}
                              className="flex-shrink-0"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDismissPrediction(prediction.id)}
                              disabled={acceptingPrediction === prediction.id}
                              className="flex-shrink-0"
                            >
                              ×
                            </Button>
                          </div>
                        </div>

                        {/* Confidence indicator */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Confidence</span>
                            <span className="font-medium">{Math.round(prediction.confidence * 100)}%</span>
                          </div>
                          <Progress value={prediction.confidence * 100} className="h-1" />
                        </div>

                        {/* Reasoning */}
                        {prediction.reasoning.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <div className="flex items-start gap-1">
                              <Lightbulb className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span>{prediction.reasoning[0]}</span>
                            </div>
                          </div>
                        )}

                        {/* Context support indicator */}
                        {prediction.contextSupport > 0.7 && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <TrendingUp className="h-3 w-3" />
                            <span>Great timing for this habit</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Helper functions
function getCurrentEnergyLevel(): 'low' | 'medium' | 'high' {
  const hour = new Date().getHours();
  
  if (hour >= 9 && hour <= 11) return 'high'; // Peak morning
  if (hour >= 14 && hour <= 16) return 'high'; // Peak afternoon
  if (hour >= 6 && hour <= 8) return 'medium'; // Early morning
  if (hour >= 12 && hour <= 13) return 'medium'; // Lunch
  if (hour >= 17 && hour <= 19) return 'medium'; // Early evening
  return 'low';
}

function getRecentActivity(): any {
  // Could integrate with behavioral science engine
  return {
    tasksCompleted: 0,
    timeFocused: 0,
    lastTaskTime: Date.now()
  };
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}