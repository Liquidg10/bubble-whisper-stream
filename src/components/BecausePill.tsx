import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Lightbulb, Info } from 'lucide-react';
// Using inline type instead of import to avoid circular dependencies
interface ReminderExplanation {
  reason: string;
  factors: string[];
  confidence: number;
}

interface BecausePillProps {
  explanation: ReminderExplanation | string;
  variant?: 'pill' | 'inline' | 'card';
  className?: string;
  compact?: boolean;
}

export function BecausePill({ 
  explanation, 
  variant = 'pill', 
  className = '',
  compact = false 
}: BecausePillProps) {
  const explanationData = typeof explanation === 'string' 
    ? { reason: explanation, factors: [], confidence: 1 }
    : explanation;

  if (variant === 'card') {
    return (
      <Card className={`p-4 border-accent/20 bg-accent/5 ${className}`}>
        <div className="flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-foreground">
              {explanationData.reason}
            </p>
            {explanationData.factors && explanationData.factors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Contributing factors:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {explanationData.factors.map((factor, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-accent rounded-full" />
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {explanationData.confidence && explanationData.confidence < 1 && (
              <p className="text-xs text-muted-foreground">
                Confidence: {Math.round(explanationData.confidence * 100)}%
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Info className="h-3 w-3 text-accent" />
        <span className="text-xs text-muted-foreground">
          {explanationData.reason}
        </span>
        {(explanationData.factors?.length || explanationData.confidence < 1) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-auto p-0 text-xs text-accent hover:text-accent/80"
              >
                Details
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2">
                {explanationData.factors && explanationData.factors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1">
                      Contributing factors:
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {explanationData.factors.map((factor, index) => (
                        <li key={index} className="flex items-center gap-1">
                          <span className="w-1 h-1 bg-accent rounded-full" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {explanationData.confidence && explanationData.confidence < 1 && (
                  <p className="text-xs text-muted-foreground">
                    Confidence: {Math.round(explanationData.confidence * 100)}%
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }

  // Default pill variant
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge 
          variant="secondary" 
          className={`cursor-pointer bg-accent/10 text-accent border-accent/20 hover:bg-accent/20 transition-colors ${
            compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1'
          } ${className}`}
        >
          <Lightbulb className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} mr-1`} />
          Because...
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <p className="text-sm font-medium text-foreground">
                {explanationData.reason}
              </p>
              
              {explanationData.factors && explanationData.factors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    This decision was based on:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {explanationData.factors.map((factor, index) => (
                      <li key={index} className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-accent rounded-full" />
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {explanationData.confidence && explanationData.confidence < 1 && (
                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Confidence: {Math.round(explanationData.confidence * 100)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}