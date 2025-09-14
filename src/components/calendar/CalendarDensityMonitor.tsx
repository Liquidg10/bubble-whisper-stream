/**
 * Calendar Density Monitor - Integrates with BehavioralScienceEngine
 * Shows stress indicators and density warnings for packed days
 */

import React, { useEffect, useState } from 'react';
import { behavioralScienceEngine } from '@/services/behavioralScienceEngine';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Brain, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarDensityMonitorProps {
  date: Date;
  events: Array<{ start: Date; end: Date; title: string }>;
  className?: string;
}

export const CalendarDensityMonitor: React.FC<CalendarDensityMonitorProps> = ({
  date,
  events,
  className
}) => {
  const [densityMetrics, setDensityMetrics] = useState<{
    totalHours: number;
    stressLevel: number;
    isPacked: boolean;
    suggestions: string[];
  }>({
    totalHours: 0,
    stressLevel: 0,
    isPacked: false,
    suggestions: []
  });

  useEffect(() => {
    // Calculate total hours for the day
    const totalMinutes = events.reduce((sum, event) => {
      const duration = event.end.getTime() - event.start.getTime();
      return sum + duration / (1000 * 60);
    }, 0);
    
    const totalHours = totalMinutes / 60;
    const isPacked = totalHours > 6; // Configurable threshold
    
    // Get current stress level from behavioral engine
    const stressLevel = behavioralScienceEngine.detectStressLevel();
    
    // Add stress indicator based on density
    if (isPacked) {
      behavioralScienceEngine.addStressIndicator({
        source: 'calendar_density',
        level: Math.min(1, totalHours / 8), // Normalize to 8-hour workday
        timestamp: Date.now(),
        context: { date: date.toISOString(), totalHours, eventCount: events.length }
      });
    }

    // Generate suggestions for packed days
    const suggestions = [];
    if (isPacked) {
      suggestions.push("Consider spacing tasks throughout the day");
      if (stressLevel > 0.7) {
        suggestions.push("Move non-urgent meetings to less busy days");
      }
      if (totalHours > 8) {
        suggestions.push("This exceeds recommended daily calendar load");
      }
    }

    setDensityMetrics({
      totalHours,
      stressLevel,
      isPacked,
      suggestions
    });
  }, [date, events]);

  // Don't render if day isn't packed
  if (!densityMetrics.isPacked && densityMetrics.stressLevel < 0.5) {
    return null;
  }

  const getStressColor = (level: number) => {
    if (level < 0.3) return "hsl(var(--success))";
    if (level < 0.7) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  const shouldEnterCalmMode = behavioralScienceEngine.shouldEnterCalmMode();

  return (
    <div className={cn(
      "rounded-lg border bg-background/50 backdrop-blur-sm p-3 space-y-2",
      shouldEnterCalmMode && "bg-muted/30",
      className
    )}>
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="font-medium">
          Packed day—{densityMetrics.totalHours.toFixed(1)}h scheduled
        </span>
        <Badge variant="outline" className="ml-auto">
          <Brain className="h-3 w-3 mr-1" />
          Stress: {Math.round(densityMetrics.stressLevel * 100)}%
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Daily load</span>
        </div>
        <Progress 
          value={(densityMetrics.totalHours / 12) * 100} 
          className="h-1.5"
          style={{
            '--progress-foreground': getStressColor(densityMetrics.stressLevel)
          } as React.CSSProperties}
        />
      </div>

      {densityMetrics.suggestions.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1">
          {densityMetrics.suggestions.slice(0, 2).map((suggestion, index) => (
            <div key={index} className="flex items-start gap-1">
              <span className="text-accent">•</span>
              <span>{suggestion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};