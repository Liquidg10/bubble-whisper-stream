/**
 * Silent Day Toggle
 * User control for disabling micro-prompts
 */

import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Moon, Sun } from 'lucide-react';
import { microPromptPolicy } from '@/services/microPromptPolicy';

interface SilentDayToggleProps {
  className?: string;
}

export function SilentDayToggle({ className }: SilentDayToggleProps) {
  const [isSilent, setIsSilent] = useState(false);
  const [silentUntil, setSilentUntil] = useState<number | undefined>();

  useEffect(() => {
    const status = microPromptPolicy.getStatus();
    setIsSilent(!status.canShowPrompts);
    setSilentUntil(status.silentUntil);
  }, []);

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      microPromptPolicy.setSilentDay(24); // 24 hours
    } else {
      microPromptPolicy.clearSilentDay();
    }
    
    const status = microPromptPolicy.getStatus();
    setIsSilent(!status.canShowPrompts);
    setSilentUntil(status.silentUntil);
  };

  const quickSilent = (hours: number) => {
    microPromptPolicy.setSilentDay(hours);
    const status = microPromptPolicy.getStatus();
    setIsSilent(!status.canShowPrompts);
    setSilentUntil(status.silentUntil);
  };

  const formatTimeRemaining = (until: number): string => {
    const diff = until - Date.now();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isSilent ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          <Label htmlFor="silent-mode" className="text-sm font-medium">
            Silent Day
          </Label>
        </div>
        <Switch
          id="silent-mode"
          checked={isSilent}
          onCheckedChange={handleToggle}
        />
      </div>
      
      {isSilent && silentUntil && (
        <div className="mt-2 text-xs text-muted-foreground">
          {formatTimeRemaining(silentUntil)}
        </div>
      )}
      
      {!isSilent && (
        <div className="mt-2 flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickSilent(2)}
            className="text-xs h-6 px-2"
          >
            2h
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickSilent(8)}
            className="text-xs h-6 px-2"
          >
            8h
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickSilent(24)}
            className="text-xs h-6 px-2"
          >
            24h
          </Button>
        </div>
      )}
    </div>
  );
}