/**
 * Progressive Disclosure UX Patterns - UX Master Implementation
 * "One step better" principle with fatigue guards and accessibility
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronRight, 
  ChevronDown, 
  Info, 
  Eye, 
  EyeOff,
  Layers,
  Target,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBubbleStore } from '@/stores/bubbleStore';

interface ProgressiveDisclosureProps {
  title: string;
  summary: string;
  children: React.ReactNode;
  level?: 'surface' | 'context' | 'deep';
  onExpand?: () => void;
  onCollapse?: () => void;
  defaultExpanded?: boolean;
  className?: string;
}

export const ProgressiveDisclosure: React.FC<ProgressiveDisclosureProps> = ({
  title,
  summary,
  children,
  level = 'surface',
  onExpand,
  onCollapse,
  defaultExpanded = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(defaultExpanded);
  const settings = useBubbleStore(state => state.settings);

  // Respect user's privacy layer preferences
  const allowedLayers = settings.selfModelLayers || { surface: true, context: false, deep: false };
  const canShow = allowedLayers[level];

  const handleToggle = () => {
    if (!canShow) return;
    
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    
    if (newExpanded) {
      setHasBeenExpanded(true);
      onExpand?.();
    } else {
      onCollapse?.();
    }
  };

  const getLevelIcon = () => {
    switch (level) {
      case 'surface':
        return <Eye className="h-3 w-3" />;
      case 'context':
        return <Layers className="h-3 w-3" />;
      case 'deep':
        return <Target className="h-3 w-3" />;
    }
  };

  const getLevelColor = () => {
    switch (level) {
      case 'surface':
        return 'text-green-600 dark:text-green-400';
      case 'context':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'deep':
        return 'text-red-600 dark:text-red-400';
    }
  };

  if (!canShow) {
    return (
      <Card className={cn("p-3 opacity-50 border-dashed", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <EyeOff className="h-4 w-4" />
          <span className="text-sm">Content hidden (privacy layer: {level})</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("transition-all duration-200", className)}>
      <div 
        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-1">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {getLevelIcon()}
            </div>
            
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-sm truncate">{title}</h4>
              {!isExpanded && (
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {summary}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge 
              variant="outline" 
              className={cn("text-xs", getLevelColor())}
            >
              {level}
            </Badge>
            {hasBeenExpanded && !isExpanded && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/30">
          <div className="pt-3">
            {children}
          </div>
        </div>
      )}
    </Card>
  );
};

// Fatigue Guard Hook - Prevents information overload
export const useFatigueGuard = () => {
  const [interactions, setInteractions] = useState(0);
  const [startTime] = useState(Date.now());
  const [isFatigued, setIsFatigued] = useState(false);

  useEffect(() => {
    // Check for fatigue every minute
    const interval = setInterval(() => {
      const sessionDuration = Date.now() - startTime;
      const minutesActive = sessionDuration / (1000 * 60);
      
      // Fatigue detection: 20+ interactions in 10 minutes
      if (interactions > 20 && minutesActive < 10) {
        setIsFatigued(true);
      }
      
      // Auto-recovery after 30 minutes of lower activity
      if (minutesActive > 30 && interactions / minutesActive < 1.5) {
        setIsFatigued(false);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [interactions, startTime]);

  const recordInteraction = () => {
    setInteractions(prev => prev + 1);
  };

  const shouldShow = (priority: 'high' | 'medium' | 'low'): boolean => {
    if (!isFatigued) return true;
    return priority === 'high'; // Only show high priority when fatigued
  };

  return {
    isFatigued,
    interactions,
    recordInteraction,
    shouldShow,
    sessionDuration: Date.now() - startTime
  };
};

// One Step Better Pattern
interface OneStepBetterProps {
  currentState: string;
  nextStep: string;
  difficulty: 'easy' | 'medium' | 'hard';
  onTakeStep?: () => void;
  className?: string;
}

export const OneStepBetter: React.FC<OneStepBetterProps> = ({
  currentState,
  nextStep,
  difficulty,
  onTakeStep,
  className = ''
}) => {
  const getDifficultyColor = () => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'hard': return 'bg-red-500';
    }
  };

  const getDifficultyText = () => {
    switch (difficulty) {
      case 'easy': return '2 min step';
      case 'medium': return '5 min step';
      case 'hard': return '15 min step';
    }
  };

  return (
    <Card className={cn("p-4", className)}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getDifficultyColor()}`} />
          <Badge variant="outline" className="text-xs">
            {getDifficultyText()}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Currently: </span>
            {currentState}
          </div>
          
          <div className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {nextStep}
            </span>
          </div>
        </div>

        {onTakeStep && (
          <Button 
            onClick={onTakeStep}
            size="sm"
            className="w-full"
            variant="outline"
          >
            Take this step
          </Button>
        )}
      </div>
    </Card>
  );
};

// Accessibility Helper - Ensures 44px touch targets
export const AccessibleTouchTarget: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}> = ({ children, onClick, className = '', ariaLabel }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-[44px] min-w-[44px] flex items-center justify-center",
        "touch-manipulation", // iOS optimization
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        "hover:bg-muted/50 transition-colors rounded-lg",
        className
      )}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
};

// Information Density Controller - UX Master principle
export const InformationDensity: React.FC<{
  compact?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ compact = false, children, className = '' }) => {
  const settings = useBubbleStore(state => state.settings);
  const prefersReduced = settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div 
      className={cn(
        "transition-all duration-200",
        compact ? "space-y-1" : "space-y-3",
        prefersReduced && "transition-none",
        className
      )}
    >
      {children}
    </div>
  );
};

export default ProgressiveDisclosure;