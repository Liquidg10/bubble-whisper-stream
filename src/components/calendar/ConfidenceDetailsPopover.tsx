/**
 * Confidence Details Popover - Shows decision trace and confidence breakdown
 * for calendar events with AI-generated scheduling
 */

import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BecauseExplanation } from '@/components/privacy/BecauseExplanation';
import { DecisionTrace } from '@/types/decisionTrace';
import { 
  Brain, 
  Info, 
  Activity, 
  Zap, 
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfidenceDetailsPopoverProps {
  decisionTrace: DecisionTrace;
  calendarMetadata?: {
    stressLevelBefore: number;
    stressLevelAfter: number;
    energyAlignment: number;
    habitMatch: number;
    densityImpact: number;
  };
  children: React.ReactNode;
  className?: string;
}

export const ConfidenceDetailsPopover: React.FC<ConfidenceDetailsPopoverProps> = ({
  decisionTrace,
  calendarMetadata,
  children,
  className
}) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "hsl(var(--success))";
    if (confidence >= 0.6) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.6) return "Medium";
    return "Low";
  };

  const formatPercentage = (value: number) => `${Math.round(value * 100)}%`;

  const drivers = decisionTrace.rules.map(rule => {
    switch (rule) {
      case 'energy_alignment':
        return 'Scheduled during your peak energy window';
      case 'habit_pattern':
        return 'Matches your typical scheduling patterns';
      case 'stress_optimization':
        return 'Positioned to minimize daily stress load';
      case 'calendar_density':
        return 'Considers existing calendar density';
      default:
        return `Applied ${rule.replace(/_/g, ' ')} optimization`;
    }
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn("h-auto p-1 hover:bg-accent/50", className)}
        >
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-4" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">AI Confidence Details</span>
            <Badge 
              variant="outline" 
              className="ml-auto text-xs"
              style={{ color: getConfidenceColor(decisionTrace.confidence) }}
            >
              {getConfidenceLabel(decisionTrace.confidence)}
            </Badge>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Overall Confidence</span>
              <span>{formatPercentage(decisionTrace.confidence)}</span>
            </div>
            <Progress 
              value={decisionTrace.confidence * 100} 
              className="h-2"
              style={{
                '--progress-foreground': getConfidenceColor(decisionTrace.confidence)
              } as React.CSSProperties}
            />
          </div>
        </div>

        {calendarMetadata && (
          <div className="space-y-3 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Calendar Intelligence Breakdown
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Zap className="h-3 w-3" />
                  <span>Energy Match</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={calendarMetadata.energyAlignment * 100} className="h-1 flex-1" />
                  <span className="text-xs font-mono">
                    {formatPercentage(calendarMetadata.energyAlignment)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Habit Fit</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={calendarMetadata.habitMatch * 100} className="h-1 flex-1" />
                  <span className="text-xs font-mono">
                    {formatPercentage(calendarMetadata.habitMatch)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Stress Impact</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {calendarMetadata.stressLevelBefore > calendarMetadata.stressLevelAfter ? (
                      <span className="text-success">-{formatPercentage(calendarMetadata.stressLevelBefore - calendarMetadata.stressLevelAfter)}</span>
                    ) : (
                      <span className="text-warning">+{formatPercentage(calendarMetadata.stressLevelAfter - calendarMetadata.stressLevelBefore)}</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Density</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={calendarMetadata.densityImpact * 100} 
                    className="h-1 flex-1"
                    style={{
                      '--progress-foreground': calendarMetadata.densityImpact > 0.7 ? 
                        'hsl(var(--destructive))' : 'hsl(var(--success))'
                    } as React.CSSProperties}
                  />
                  <span className="text-xs font-mono">
                    {formatPercentage(calendarMetadata.densityImpact)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <BecauseExplanation 
            drivers={drivers}
            compact={true}
            className="text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
          <Clock className="h-3 w-3" />
          <span>
            Scheduled {new Date(decisionTrace.timestamp).toLocaleTimeString()}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={decisionTrace.revertHook}
            className="ml-auto h-6 px-2 text-xs"
          >
            Undo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};