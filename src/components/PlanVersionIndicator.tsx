/**
 * Plan Version Indicator
 * Shows version history and allows switching between plan versions
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { History, RotateCcw } from 'lucide-react';
import { GeneratedPlan } from '@/services/planGenerationService';

interface PlanVersionIndicatorProps {
  plan: GeneratedPlan;
  onVersionSelect?: (version: number) => void;
  className?: string;
}

export const PlanVersionIndicator: React.FC<PlanVersionIndicatorProps> = ({
  plan,
  onVersionSelect,
  className = ''
}) => {
  const currentVersion = plan.version || 1;
  const hasMultipleVersions = currentVersion > 1;

  if (!hasMultipleVersions) {
    return (
      <Badge variant="secondary" className={className}>
        v{currentVersion}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`h-6 px-2 ${className}`}>
          <History className="h-3 w-3 mr-1" />
          v{currentVersion}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Plan Versions
          </p>
          {Array.from({ length: currentVersion }, (_, i) => {
            const version = currentVersion - i;
            const isCurrent = version === currentVersion;
            
            return (
              <Button
                key={version}
                variant={isCurrent ? "default" : "ghost"}
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => onVersionSelect?.(version)}
                disabled={isCurrent}
              >
                <RotateCcw className="h-3 w-3 mr-2" />
                Version {version}
                {isCurrent && " (current)"}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};