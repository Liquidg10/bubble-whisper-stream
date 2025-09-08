/**
 * Context Engine Panel
 * Shows context scoring in real-time with signal breakdown
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, ChevronDown, ChevronRight, Info, Settings, RefreshCw } from 'lucide-react';
import { contextEngineService, ContextInput, ContextScore, ContextSignal } from '@/services/contextEngineService';
import { cn } from '@/lib/utils';

interface ContextEnginePanelProps {
  input?: ContextInput;
  className?: string;
}

export const ContextEnginePanel: React.FC<ContextEnginePanelProps> = ({
  input,
  className
}) => {
  const [score, setScore] = useState<ContextScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Generate score when input changes
  useEffect(() => {
    if (input) {
      generateScore(input);
    }
  }, [input]);

  const generateScore = async (contextInput: ContextInput) => {
    setIsLoading(true);
    try {
      const newScore = await contextEngineService.generateScore(contextInput);
      setScore(newScore);
    } catch (error) {
      console.error('Failed to generate context score:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (value: number): string => {
    if (value >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
    if (value >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBadgeVariant = (value: number): "default" | "secondary" | "destructive" | "outline" => {
    if (value >= 0.8) return 'default';
    if (value >= 0.6) return 'secondary';
    return 'destructive';
  };

  const getSignalIcon = (type: ContextSignal['type']): string => {
    const icons = {
      time_pressure: '⏰',
      sender_trust: '🤝',
      location_context: '📍',
      historical_behavior: '📊',
      content_certainty: '📝',
      meeting_density: '📅',
      ambiguity: '❓',
      quiet_hours: '🌙',
      mood_stress: '😊'
    };
    return icons[type] || '📊';
  };

  const formatSignalType = (type: ContextSignal['type']): string => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const sampleInput: ContextInput = {
    content: "Meeting with Sarah at 3:00 PM tomorrow in Conference Room B to review Q1 results",
    sender: "sarah@company.com",
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    eventType: 'calendar'
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5 text-primary" />
          Context Engine
          {score && (
            <Badge 
              variant={getScoreBadgeVariant(score.score)}
              className="ml-auto"
            >
              {Math.round(score.score * 100)}% Confidence
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateScore(input || sampleInput)}
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Brain className="h-3 w-3 mr-1" />
            )}
            {input ? 'Analyze' : 'Demo'}
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-3 w-3" />
          </Button>
        </div>

        {/* Score Display */}
        {score && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Confidence</span>
                <span className={cn("text-sm font-bold", getScoreColor(score.score))}>
                  {Math.round(score.score * 100)}%
                </span>
              </div>
              <Progress value={score.score * 100} className="h-2" />
            </div>

            {/* Because Explanations */}
            {score.because.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Because...
                </h4>
                <ul className="space-y-1">
                  {score.because.map((reason, index) => (
                    <li key={index} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-primary">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Signal Details */}
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between p-0 h-auto">
                  <span className="text-xs font-medium">
                    Signal Details ({score.signals.length})
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="space-y-2 mt-2">
                {score.signals.map((signal, index) => (
                  <div key={index} className="border rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{getSignalIcon(signal.type)}</span>
                        <span className="text-xs font-medium">
                          {formatSignalType(signal.type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs px-1">
                          {Math.round(signal.value * 100)}%
                        </Badge>
                        <Badge variant="secondary" className="text-xs px-1">
                          W: {Math.round(signal.weight * 100)}%
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {signal.reason}
                    </div>
                    
                    <Progress 
                      value={signal.value * 100} 
                      className="h-1" 
                    />
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Confidence: {Math.round(signal.confidence * 100)}%</span>
                      <span>Impact: {Math.round(signal.value * signal.weight * signal.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            {/* Metadata */}
            <div className="text-xs text-muted-foreground border-t pt-2">
              <div className="grid grid-cols-2 gap-2">
                <span>Signals: {score.metadata.signalCount}</span>
                <span>Weight: {Math.round(score.metadata.totalWeight * 100)}%</span>
                <span>Deterministic: {score.metadata.deterministic ? '✓' : '✗'}</span>
                <span>Time: {new Date(score.metadata.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-medium">Signal Weights</h4>
            <div className="space-y-2">
              {Object.entries(contextEngineService.getSignalWeights()).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs">{formatSignalType(key as any)}</span>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(value * 100)}%
                  </Badge>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => contextEngineService.resetSignalWeights()}
              className="w-full"
            >
              Reset to Defaults
            </Button>
          </div>
        )}

        {/* No Score State */}
        {!score && !isLoading && (
          <div className="text-center py-6 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No context analysis yet</p>
            <p className="text-xs">Provide input or click Demo to see scoring</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};