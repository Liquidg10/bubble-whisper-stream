import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BecausePillProps {
  explanation: string[];
  className?: string;
  variant?: 'default' | 'outline' | 'secondary';
}

export function BecausePill({ explanation, className, variant = 'outline' }: BecausePillProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!explanation || explanation.length === 0) {
    return null;
  }

  const summaryText = explanation.length === 1 
    ? explanation[0]
    : `${explanation.length} smart defaults applied`;

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "h-auto px-2 py-1 gap-1 text-xs font-normal",
          "hover:bg-muted/50 transition-colors",
          isExpanded && "bg-muted/30"
        )}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Hide explanation" : "Show explanation"}
      >
        <Info className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Because:</span>
        <span className="text-foreground max-w-[200px] truncate">
          {summaryText}
        </span>
        {explanation.length > 1 && (
          <div className="ml-1">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        )}
      </Button>

      {/* Expanded Details */}
      {isExpanded && explanation.length > 1 && (
        <div className="bg-muted/30 rounded-md p-2 border border-border/50 max-w-[300px]">
          <div className="space-y-1">
            {explanation.map((reason, index) => (
              <div key={index} className="flex items-start gap-2 text-xs">
                <Badge
                  variant="secondary"
                  className="text-xs w-5 h-5 rounded-full p-0 flex items-center justify-center flex-shrink-0"
                >
                  {index + 1}
                </Badge>
                <span className="text-muted-foreground leading-relaxed">
                  {reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}