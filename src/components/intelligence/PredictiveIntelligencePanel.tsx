/**
 * Phase 4B: Predictive Intelligence Panel
 * Shows anticipatory suggestions and proactive insights
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Clock, TrendingUp, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { predictiveIntelligence } from '@/services/predictiveIntelligence';
import { burnoutPreventionEngine } from '@/services/burnoutPreventionEngine';
import { useToast } from '@/hooks/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';

interface PredictiveIntelligencePanelProps {
  className?: string;
}

export function PredictiveIntelligencePanel({ className }: PredictiveIntelligencePanelProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [burnoutRisk, setBurnoutRisk] = useState<any>(null);
  const [earlyWarnings, setEarlyWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { addBubble, settings } = useBubbleStore();

  useEffect(() => {
    if (settings.intelligenceEnabled) {
      loadPredictiveInsights();
    }
  }, [settings.intelligenceEnabled]);

  const loadPredictiveInsights = async () => {
    setIsLoading(true);
    try {
      const [newSuggestions, risk, warnings] = await Promise.all([
        predictiveIntelligence.analyzeAndPredict(),
        burnoutPreventionEngine.assessBurnoutRisk(),
        burnoutPreventionEngine.getEarlyWarnings()
      ]);

      setSuggestions(newSuggestions);
      setBurnoutRisk(risk);
      setEarlyWarnings(warnings);
    } catch (error) {
      console.error('Failed to load predictive insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion: any) => {
    try {
      // Execute suggestion actions
      for (const action of suggestion.actions) {
        if (action.type === 'create_task') {
          addBubble({
            id: crypto.randomUUID(),
            content: action.content,
            x: 400,
            y: 300,
            size: 120,
            type: 'Task',
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tags: []
          });
        }
      }

      // Learn from acceptance
      await predictiveIntelligence.learnFromBehavior('accepted_suggestion', {
        type: suggestion.type,
        confidence: suggestion.confidence,
        timing: suggestion.timing
      });

      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

      toast({
        title: "Suggestion applied",
        description: suggestion.content,
      });
    } catch (error) {
      toast({
        title: "Failed to apply suggestion",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleDismissSuggestion = async (suggestion: any) => {
    // Learn from dismissal
    await predictiveIntelligence.learnFromBehavior('dismissed_suggestion', {
      type: suggestion.type,
      confidence: suggestion.confidence,
      timing: suggestion.timing
    });

    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  };

  const getTimingColor = (timing: string) => {
    switch (timing) {
      case 'immediate': return 'destructive';
      case 'within_hour': return 'secondary';
      case 'today': return 'outline';
      case 'this_week': return 'secondary';
      default: return 'secondary';
    }
  };

  const getRiskColor = (level: number) => {
    if (level >= 0.7) return 'text-destructive';
    if (level >= 0.4) return 'text-orange-500';
    return 'text-green-500';
  };

  if (!settings.intelligenceEnabled) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Brain className="h-5 w-5" />
          <span>Predictive Intelligence</span>
        </CardTitle>
        <CardDescription>
          Anticipatory insights and proactive suggestions
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Burnout Risk Assessment */}
        {burnoutRisk && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Burnout Risk</span>
              <span className={`text-sm font-bold ${getRiskColor(burnoutRisk.overall)}`}>
                {Math.round(burnoutRisk.overall * 100)}%
              </span>
            </div>
            
            <div className="w-full bg-background rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  burnoutRisk.overall >= 0.7 ? 'bg-destructive' :
                  burnoutRisk.overall >= 0.4 ? 'bg-orange-500' : 'bg-green-500'
                }`}
                style={{ width: `${burnoutRisk.overall * 100}%` }}
              />
            </div>
            
            <div className="text-xs text-muted-foreground mt-1">
              Assessment timeframe: {burnoutRisk.timeframe}
            </div>
          </div>
        )}

        {/* Early Warnings */}
        {earlyWarnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Early Warnings
            </h4>
            
            {earlyWarnings.map((warning, index) => (
              <div key={index} className="flex items-start space-x-2 p-2 bg-orange-50 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                <span className="text-sm text-orange-700">{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Predictive Suggestions */}
        {suggestions.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Anticipatory Suggestions
            </h4>
            
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="p-3 border rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Badge variant={getTimingColor(suggestion.timing)}>
                        {suggestion.timing.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </span>
                    </div>
                    
                    <p className="text-sm font-medium">{suggestion.content}</p>
                    <p className="text-xs text-muted-foreground">{suggestion.reasoning}</p>
                  </div>
                  
                  <div className="flex space-x-1">
                    <Button
                      onClick={() => handleAcceptSuggestion(suggestion)}
                      size="sm"
                      variant="default"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </Button>
                    <Button
                      onClick={() => handleDismissSuggestion(suggestion)}
                      size="sm"
                      variant="outline"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                {/* Actions Preview */}
                {suggestion.actions.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Actions: {suggestion.actions.map((a: any) => a.content).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Analyzing patterns...' : 'No predictions needed right now'}
            </p>
          </div>
        )}

        {/* Refresh Button */}
        <Button
          onClick={loadPredictiveInsights}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="w-full"
        >
          <Clock className="h-4 w-4 mr-2" />
          {isLoading ? 'Analyzing...' : 'Refresh Insights'}
        </Button>
      </CardContent>
    </Card>
  );
}