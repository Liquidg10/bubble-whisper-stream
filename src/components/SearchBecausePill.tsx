import React, { useState } from 'react';
import { MatchReason } from '@/types/search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

interface SearchBecausePillProps {
  reasons: MatchReason[];
  score: number;
}

export function SearchBecausePill({ reasons, score }: SearchBecausePillProps) {
  const [expanded, setExpanded] = useState(false);

  if (reasons.length === 0) return null;

  const primaryReason = reasons.reduce((prev, current) => 
    current.weight > prev.weight ? current : prev
  );

  const getFieldLabel = (field: string): string => {
    switch (field) {
      case 'content': return 'text';
      case 'tags': return 'tag';
      case 'type': return 'type';
      case 'timeRange': return 'time';
      case 'metadata': return 'metadata';
      default: return field;
    }
  };

  const getReasonDescription = (reason: MatchReason): string => {
    if (reason.field === 'content' && reason.context) {
      return `"${reason.context.trim()}"`;
    }
    return reason.value;
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge 
        variant="secondary" 
        className="text-xs cursor-pointer flex items-center gap-1 bg-primary/10 text-primary border-primary/20"
        onClick={() => setExpanded(!expanded)}
      >
        Because {getFieldLabel(primaryReason.field)}: {primaryReason.value}
        {reasons.length > 1 && (
          <span className="text-xs opacity-70">+{reasons.length - 1}</span>
        )}
        <Button variant="ghost" size="sm" className="h-3 w-3 p-0 ml-1">
          {expanded ? <EyeOff className="h-2 w-2" /> : <Eye className="h-2 w-2" />}
        </Button>
      </Badge>
      
      {expanded && reasons.length > 1 && (
        <div className="flex flex-wrap gap-1 w-full mt-1">
          {reasons.slice(1).map((reason, index) => (
            <Badge 
              key={index} 
              variant="outline" 
              className="text-xs bg-muted/50"
            >
              {getFieldLabel(reason.field)}: {getReasonDescription(reason)}
            </Badge>
          ))}
        </div>
      )}
      
      <Badge variant="outline" className="text-xs ml-1">
        {score.toFixed(1)}
      </Badge>
    </div>
  );
}