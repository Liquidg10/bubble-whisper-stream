/**
 * Expandable "Because..." explanation component
 * P16 - Privacy & Consent UX Enhancement
 * Provides consistent explainable AI patterns across the application
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BecauseExplanationProps {
  drivers: string[];
  className?: string;
  compact?: boolean;
}

export const BecauseExplanation: React.FC<BecauseExplanationProps> = ({
  drivers,
  className,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!drivers.length) return null;

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleExpanded}
        className={cn("h-auto p-1 text-xs text-muted-foreground hover:text-foreground", className)}
      >
        <Info className="h-3 w-3 mr-1" />
        Because...
        {isExpanded ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
      </Button>
    );
  }

  return (
    <div className={cn("mt-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleExpanded}
        className="h-auto p-2 text-sm text-muted-foreground hover:text-foreground justify-start"
      >
        <Info className="h-4 w-4 mr-2" />
        Because...
        {isExpanded ? <ChevronDown className="h-4 w-4 ml-2" /> : <ChevronRight className="h-4 w-4 ml-2" />}
      </Button>
      
      {isExpanded && (
        <Card className="mt-2 p-3 bg-muted/50">
          <div className="space-y-2">
            {drivers.map((driver, index) => (
              <div key={index} className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span className="text-sm text-muted-foreground">{driver}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};