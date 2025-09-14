/**
 * Implementation Intention Chip - Positive Psychology Integration
 * MCII/WOOP micro-prompts for friction-light planning
 */

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImplementationIntentionChipProps {
  ifThen: string;
  context?: 'planning' | 'obstacle' | 'goal-setting';
  expanded?: boolean;
  onDismiss?: () => void;
  onApply?: (intention: string) => void;
  className?: string;
}

export const ImplementationIntentionChip: React.FC<ImplementationIntentionChipProps> = ({
  ifThen,
  context = 'planning',
  expanded = false,
  onDismiss,
  onApply,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [customIntention, setCustomIntention] = useState(ifThen);

  // Parse if-then structure
  const parseIfThen = (intention: string) => {
    const match = intention.match(/^if\s+(.+?),?\s+then\s+(.+)$/i);
    if (match) {
      return {
        condition: match[1].trim(),
        action: match[2].trim()
      };
    }
    return {
      condition: '',
      action: intention
    };
  };

  const { condition, action } = parseIfThen(ifThen);

  const getContextIcon = () => {
    switch (context) {
      case 'obstacle':
        return <Lightbulb className="h-3 w-3 text-orange-500" />;
      case 'goal-setting':
        return <Lightbulb className="h-3 w-3 text-green-500" />;
      default:
        return <Lightbulb className="h-3 w-3 text-blue-500" />;
    }
  };

  const getContextLabel = () => {
    switch (context) {
      case 'obstacle':
        return 'Obstacle plan';
      case 'goal-setting':
        return 'Goal strategy';
      default:
        return 'If-then plan';
    }
  };

  const getContextDescription = () => {
    switch (context) {
      case 'obstacle':
        return 'Research shows if-then plans help overcome common obstacles.';
      case 'goal-setting':
        return 'Implementation intentions increase goal achievement by 2-3x.';
      default:
        return 'Having a plan for "if this, then that" makes follow-through easier.';
    }
  };

  const handleApply = () => {
    onApply?.(customIntention);
  };

  const formatDisplayIntention = (intention: string) => {
    const parsed = parseIfThen(intention);
    if (parsed.condition && parsed.action) {
      return (
        <span>
          <span className="text-muted-foreground">If </span>
          <span className="font-medium text-foreground">{parsed.condition}</span>
          <span className="text-muted-foreground">, then </span>
          <span className="font-medium text-foreground">{parsed.action}</span>
        </span>
      );
    }
    return <span className="font-medium text-foreground">{intention}</span>;
  };

  if (!isExpanded) {
    return (
      <div className={cn("flex items-center gap-2 max-w-md", className)}>
        <Card className="flex-1 p-2 bg-background/50 border-primary/20 hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => setIsExpanded(true)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {getContextIcon()}
              <span className="text-xs text-muted-foreground truncate">
                {formatDisplayIntention(ifThen)}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          </div>
        </Card>
        
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0 flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("p-4 max-w-md border-primary/20 bg-background/50", className)}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getContextIcon()}
            <Badge variant="outline" className="text-xs">
              {getContextLabel()}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              className="h-6 w-6 p-0"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <div className="text-sm">
            {formatDisplayIntention(ifThen)}
          </div>
          
          <p className="text-xs text-muted-foreground">
            {getContextDescription()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border/30">
          <Button
            size="sm"
            variant="outline"
            onClick={handleApply}
            className="flex-1 text-xs"
          >
            Use this plan
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(false)}
            className="text-xs text-muted-foreground"
          >
            Not now
          </Button>
        </div>
      </div>
    </Card>
  );
};

// Utility function to generate common implementation intentions
export const generateImplementationIntention = (
  context: string,
  userGoal?: string,
  anticipatedObstacle?: string
): string => {
  
  // Common patterns based on MCII/WOOP research
  const patterns = {
    overwhelm: "If I feel overwhelmed, then I'll write down just the next single step.",
    procrastination: "If I catch myself avoiding this, then I'll set a 5-minute timer and start anyway.",
    interruption: "If someone interrupts me, then I'll politely say I need 20 minutes to finish this thought.",
    fatigue: "If I feel too tired to continue, then I'll take a 2-minute breath break and reassess.",
    distraction: "If I get distracted, then I'll gently note it and return to what I was doing.",
    perfectionism: "If I start perfectionism spiraling, then I'll remind myself that done is better than perfect.",
    timeEstimation: "If this takes longer than expected, then I'll break it into smaller pieces.",
    planning: "If I don't know where to start, then I'll spend 2 minutes writing down everything I know about this.",
    motivation: "If I lose motivation, then I'll remind myself why this matters to me.",
    stuckness: "If I get stuck, then I'll ask myself: what would the next smallest step be?"
  };

  // Try to match context to pattern
  const contextLower = context.toLowerCase();
  for (const [key, pattern] of Object.entries(patterns)) {
    if (contextLower.includes(key)) {
      return pattern;
    }
  }

  // Custom intention based on goal and obstacle
  if (userGoal && anticipatedObstacle) {
    return `If ${anticipatedObstacle}, then I'll ${userGoal} in a smaller way.`;
  }

  // Default fallback
  return "If I feel stuck, then I'll break this into a 5-minute step.";
};

export default ImplementationIntentionChip;