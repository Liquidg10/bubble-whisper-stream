// Because Pill Component
// Shows explainability information for adaptive decisions

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, Lightbulb, ChevronDown } from 'lucide-react';
import { ReminderExplanation } from '@/types/bubble';

interface BecausePillProps {
  explanation: ReminderExplanation | string;
  variant?: 'pill' | 'inline' | 'card';
  className?: string;
  compact?: boolean;
}

export const BecausePill: React.FC<BecausePillProps> = ({
  explanation,
  variant = 'pill',
  className = '',
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Handle both string and ReminderExplanation types
  const explanationObj = typeof explanation === 'string' 
    ? { reason: explanation, factors: [], confidence: 0.8 }
    : explanation;

  const confidenceColor = explanationObj.confidence >= 0.8 
    ? 'text-green-600 dark:text-green-400'
    : explanationObj.confidence >= 0.6
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400';

  if (variant === 'card') {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-medium text-sm">Why this happened</h4>
              <p className="text-sm text-muted-foreground">{explanationObj.reason}</p>
              
              {explanationObj.factors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Contributing factors:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {explanationObj.factors.map((factor, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Confidence:</span>
                <span className={`text-xs font-medium ${confidenceColor}`}>
                  {Math.round(explanationObj.confidence * 100)}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Info className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{explanationObj.reason}</span>
        {explanationObj.factors.length > 0 && (
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-4 px-1">
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">More details</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {explanationObj.factors.map((factor, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Confidence:</span>
                  <span className={`text-xs font-medium ${confidenceColor}`}>
                    {Math.round(explanationObj.confidence * 100)}%
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }

  // Default pill variant
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge 
          variant="secondary" 
          className={`cursor-pointer hover:bg-secondary/80 transition-colors ${className}`}
        >
          <Lightbulb className="h-3 w-3 mr-1" />
          Because...
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Why this happened</h4>
          </div>
          
          <p className="text-sm text-muted-foreground">{explanationObj.reason}</p>
          
          {explanationObj.factors.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Contributing factors:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {explanationObj.factors.map((factor, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <span className={`text-xs font-medium ${confidenceColor}`}>
                {Math.round(explanationObj.confidence * 100)}%
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsOpen(false)}
              className="h-6 px-2 text-xs"
            >
              Got it
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};