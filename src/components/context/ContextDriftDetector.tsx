/**
 * Context Drift Detector - Soft Rollback System
 * Detects when AI assistance becomes unhelpful and offers gentle rollback
 */

import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Undo2, AlertTriangle, Info } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { polishCopy } from '@/utils/copyPolish';

interface DriftEvent {
  id: string;
  timestamp: number;
  type: 'suggestion_rejection' | 'rapid_undo' | 'preference_conflict' | 'stress_spike';
  confidence: number;
  context: string;
  affectedFeatures: string[];
  suggestedActions: string[];
}

interface DriftState {
  isActive: boolean;
  severity: 'low' | 'medium' | 'high';
  events: DriftEvent[];
  lastDetection: number;
  rollbackAvailable: boolean;
}

const DRIFT_THRESHOLDS = {
  suggestion_rejection: { count: 3, timeWindow: 10 * 60 * 1000 }, // 3 rejections in 10 minutes
  rapid_undo: { count: 2, timeWindow: 5 * 60 * 1000 }, // 2 rapid undos in 5 minutes
  preference_conflict: { count: 1, timeWindow: 60 * 1000 }, // Immediate
  stress_spike: { count: 2, timeWindow: 15 * 60 * 1000 } // 2 stress indicators in 15 minutes
};

export const ContextDriftDetector: React.FC = () => {
  const { bubbles } = useBubbleStore();
  const { toast } = useToast();
  const [driftState, setDriftState] = useState<DriftState>({
    isActive: false,
    severity: 'low',
    events: [],
    lastDetection: 0,
    rollbackAvailable: false
  });
  const [showRollbackPrompt, setShowRollbackPrompt] = useState(false);

  // Monitor for drift events
  useEffect(() => {
    const checkForDrift = () => {
      const now = Date.now();
      const events = loadRecentEvents();
      
      const driftDetected = analyzeEvents(events);
      
      if (driftDetected && !driftState.isActive) {
        handleDriftDetection(driftDetected);
      } else if (!driftDetected && driftState.isActive) {
        // Clear drift state if no longer detected
        setDriftState(prev => ({ ...prev, isActive: false }));
        setShowRollbackPrompt(false);
      }
    };

    const interval = setInterval(checkForDrift, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [driftState.isActive]);

  const loadRecentEvents = (): DriftEvent[] => {
    try {
      const stored = localStorage.getItem('drift_events');
      if (!stored) return [];
      
      const events: DriftEvent[] = JSON.parse(stored);
      const cutoff = Date.now() - (60 * 60 * 1000); // Last hour
      
      return events.filter(event => event.timestamp > cutoff);
    } catch (error) {
      console.warn('Failed to load drift events:', error);
      return [];
    }
  };

  const recordDriftEvent = (event: Omit<DriftEvent, 'id' | 'timestamp'>) => {
    const newEvent: DriftEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };

    const events = loadRecentEvents();
    events.push(newEvent);
    
    // Keep only last 50 events
    const trimmed = events.slice(-50);
    localStorage.setItem('drift_events', JSON.stringify(trimmed));
    
    return newEvent;
  };

  const analyzeEvents = (events: DriftEvent[]): DriftEvent | null => {
    for (const [type, threshold] of Object.entries(DRIFT_THRESHOLDS)) {
      const relevantEvents = events.filter(e => 
        e.type === type && 
        Date.now() - e.timestamp < threshold.timeWindow
      );

      if (relevantEvents.length >= threshold.count) {
        // Calculate confidence based on pattern consistency
        const confidence = Math.min(0.9, 0.5 + (relevantEvents.length * 0.1));
        
        return {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: type as DriftEvent['type'],
          confidence,
          context: determineContext(relevantEvents),
          affectedFeatures: determineAffectedFeatures(relevantEvents),
          suggestedActions: generateSuggestions(type as DriftEvent['type'], relevantEvents)
        };
      }
    }
    
    return null;
  };

  const determineContext = (events: DriftEvent[]): string => {
    const contexts = events.map(e => e.context).filter(Boolean);
    const mostCommon = contexts.reduce((acc, context) => {
      acc[context] = (acc[context] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.keys(mostCommon).sort((a, b) => mostCommon[b] - mostCommon[a])[0] || 'general';
  };

  const determineAffectedFeatures = (events: DriftEvent[]): string[] => {
    const features = new Set<string>();
    events.forEach(e => e.affectedFeatures?.forEach(f => features.add(f)));
    return Array.from(features);
  };

  const generateSuggestions = (type: DriftEvent['type'], events: DriftEvent[]): string[] => {
    switch (type) {
      case 'suggestion_rejection':
        return [
          'Reduce suggestion frequency',
          'Adjust suggestion timing',
          'Review suggestion relevance'
        ];
      case 'rapid_undo':
        return [
          'Increase confirmation steps',
          'Reduce automatic actions',
          'Review recent changes'
        ];
      case 'preference_conflict':
        return [
          'Reset to previous preferences',
          'Clear conflicting settings',
          'Review personalization data'
        ];
      case 'stress_spike':
        return [
          'Enter minimal mode',
          'Reduce notifications',
          'Focus on essential features only'
        ];
      default:
        return ['Review recent interactions'];
    }
  };

  const handleDriftDetection = (event: DriftEvent) => {
    const severity = event.confidence > 0.8 ? 'high' : event.confidence > 0.6 ? 'medium' : 'low';
    
    setDriftState({
      isActive: true,
      severity,
      events: [event],
      lastDetection: Date.now(),
      rollbackAvailable: true
    });

    // Only show prompt for medium/high confidence drift
    if (severity !== 'low') {
      setShowRollbackPrompt(true);
    }
  };

  const handleSoftRollback = async () => {
    try {
      // Get rollback state from last known good state
      const rollbackData = localStorage.getItem('last_good_state');
      if (rollbackData) {
        const previousState = JSON.parse(rollbackData);
        
        // Apply rollback (this would integrate with your state management)
        // For now, just clear problematic settings
        localStorage.removeItem('ai_suggestions_cache');
        localStorage.removeItem('personalization_overrides');
        
        toast({
          title: "Settings restored",
          description: polishCopy("AI assistance has been reset to a more helpful state", 'notification')
        });
      }
      
      // Clear drift state
      setDriftState(prev => ({ ...prev, isActive: false, rollbackAvailable: false }));
      setShowRollbackPrompt(false);
      
      // Record successful rollback
      recordDriftEvent({
        type: 'suggestion_rejection', // Placeholder
        confidence: 1.0,
        context: 'rollback_completed',
        affectedFeatures: ['ai_suggestions', 'personalization'],
        suggestedActions: []
      });
      
    } catch (error) {
      toast({
        title: "Rollback failed",
        description: "Please try again or contact support",
        variant: "destructive"
      });
    }
  };

  const dismissDrift = () => {
    setShowRollbackPrompt(false);
    // Keep drift state active but don't show prompt again for a while
    setTimeout(() => {
      setDriftState(prev => ({ ...prev, isActive: false }));
    }, 15 * 60 * 1000); // 15 minutes
  };

  // Public methods for other components to report drift events
  const reportSuggestionRejection = (context: string, features: string[]) => {
    recordDriftEvent({
      type: 'suggestion_rejection',
      confidence: 0.7,
      context,
      affectedFeatures: features,
      suggestedActions: []
    });
  };

  const reportRapidUndo = (context: string, features: string[]) => {
    recordDriftEvent({
      type: 'rapid_undo',
      confidence: 0.8,
      context,
      affectedFeatures: features,
      suggestedActions: []
    });
  };

  // Expose reporting methods globally
  useEffect(() => {
    (window as any).__contextDrift = {
      reportSuggestionRejection,
      reportRapidUndo
    };
  }, []);

  if (!showRollbackPrompt) return null;

  const { severity, events } = driftState;
  const latestEvent = events[0];

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div>
            <CardTitle className="text-base">AI assistance needs adjustment</CardTitle>
            <CardDescription>
              {polishCopy("We noticed some suggestions might not be helpful right now", 'notification')}
            </CardDescription>
          </div>
          <Badge variant={severity === 'high' ? 'destructive' : 'secondary'}>
            {severity} confidence
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <p><strong>What we noticed:</strong></p>
          <ul className="mt-1 space-y-1">
            {latestEvent.suggestedActions.map((action, index) => (
              <li key={index}>• {polishCopy(action, 'notification')}</li>
            ))}
          </ul>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {polishCopy("We can gently reset AI suggestions to be more helpful. Your tasks and data stay exactly the same.", 'notification')}
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button 
            onClick={handleSoftRollback}
            className="flex items-center gap-2"
          >
            <Undo2 className="h-4 w-4" />
            Reset AI assistance
          </Button>
          <Button 
            variant="outline" 
            onClick={dismissDrift}
          >
            Keep current settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Hook for other components to interact with drift detection
export const useContextDrift = () => {
  const reportSuggestionRejection = (context: string, features: string[] = []) => {
    if ((window as any).__contextDrift) {
      (window as any).__contextDrift.reportSuggestionRejection(context, features);
    }
  };

  const reportRapidUndo = (context: string, features: string[] = []) => {
    if ((window as any).__contextDrift) {
      (window as any).__contextDrift.reportRapidUndo(context, features);
    }
  };

  return {
    reportSuggestionRejection,
    reportRapidUndo
  };
};
