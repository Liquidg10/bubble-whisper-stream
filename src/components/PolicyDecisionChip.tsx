import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, Lightbulb, Zap, Hand, AlertTriangle } from 'lucide-react';
import { PolicyDecision } from '@/services/policyDecisionEngine';
import { cn } from '@/lib/utils';

interface PolicyDecisionChipProps {
  decision: PolicyDecision;
  variant?: 'card' | 'inline' | 'pill';
  className?: string;
  compact?: boolean;
}

export function PolicyDecisionChip({
  decision,
  variant = 'pill',
  className,
  compact = false
}: PolicyDecisionChipProps) {
  const getDecisionIcon = () => {
    switch (decision.decision) {
      case 'auto-write':
        return <Zap className="h-3 w-3" />;
      case 'draft':
        return <Hand className="h-3 w-3" />;
      case 'suggest':
        return <Lightbulb className="h-3 w-3" />;
      default:
        return <Info className="h-3 w-3" />;
    }
  };

  const getBadgeVariant = () => {
    switch (decision.decision) {
      case 'auto-write':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'suggest':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getDecisionLabel = () => {
    switch (decision.decision) {
      case 'auto-write':
        return 'Auto-Write';
      case 'draft':
        return 'Draft + Ask';
      case 'suggest':
        return 'Suggestion';
      default:
        return 'Unknown';
    }
  };

  const renderDecisionDetails = () => (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-2">
          {getDecisionIcon()}
          <span className="font-medium">{getDecisionLabel()}</span>
          <Badge variant={getBadgeVariant()} className="text-xs">
            {Math.round(decision.confidence * 100)}%
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{decision.reason}</p>
      </div>

      {decision.appliedOverrides.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Policy Overrides
          </h4>
          <div className="space-y-1">
            {decision.appliedOverrides.map((override, index) => (
              <Badge key={index} variant="outline" className="text-xs mr-1">
                {override.replace(/-/g, ' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Context Score</h4>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Original: {Math.round(decision.contextScore.score * 100)}%</span>
          <span>Adjusted: {Math.round(decision.score * 100)}%</span>
        </div>
      </div>

      {decision.contextScore.explanations && decision.contextScore.explanations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Key Factors</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            {decision.contextScore.explanations.slice(0, 3).map((explanation: string, index: number) => (
              <li key={index} className="flex items-start gap-1">
                <span className="text-primary">•</span>
                <span>{explanation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  if (variant === 'card') {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm mb-1">Policy Decision</h3>
            {renderDecisionDetails()}
          </div>
        </div>
      </Card>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Info className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">{getDecisionLabel()}</span>
        <Popover>
          <PopoverTrigger asChild>
            <Badge variant={getBadgeVariant()} className="cursor-pointer text-xs">
              {Math.round(decision.confidence * 100)}%
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            {renderDecisionDetails()}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Default pill variant
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant={getBadgeVariant()}
          className={cn(
            'cursor-pointer gap-1.5 px-2 py-1',
            compact && 'px-1.5 py-0.5 text-xs',
            className
          )}
        >
          {getDecisionIcon()}
          {compact ? (
            <span>{Math.round(decision.confidence * 100)}%</span>
          ) : (
            <span>Policy: {getDecisionLabel()}</span>
          )}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Policy Decision
          </h3>
          {renderDecisionDetails()}
        </div>
      </PopoverContent>
    </Popover>
  );
}