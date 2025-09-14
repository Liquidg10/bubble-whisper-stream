/**
 * MicroPrompt Component
 * Displays throttled micro-prompts with tone-aware copy
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Info } from 'lucide-react';
import { microPromptPolicy, type PromptContext } from '@/services/microPromptPolicy';
import { toneSystem, type CopyContext } from '@/services/toneSystem';
import { cn } from '@/lib/utils';

interface MicroPromptProps {
  context: PromptContext;
  viewId: string;
  content: string;
  copyContext?: CopyContext;
  onAccept?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function MicroPrompt({
  context,
  viewId,
  content,
  copyContext = 'suggestion',
  onAccept,
  onDismiss,
  className
}: MicroPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (!hasShown && microPromptPolicy.canShowPrompt(context, viewId)) {
      setIsVisible(true);
      setHasShown(true);
      microPromptPolicy.recordPromptShown(context, viewId);
    }
  }, [context, viewId, hasShown]);

  const handleAccept = () => {
    setIsVisible(false);
    onAccept?.();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    microPromptPolicy.recordPromptDismissed(viewId);
    onDismiss?.();
  };

  if (!isVisible) {
    return null;
  }

  const tonedContent = toneSystem.getCopy(copyContext, undefined, content);

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 z-50 w-80 p-3 border border-border/50 bg-card/95 backdrop-blur-sm",
      "animate-in slide-in-from-bottom-2 duration-300",
      className
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {context.replace('-', ' ')}
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {tonedContent}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {onAccept && (
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleAccept}
            className="flex-1"
          >
            Yes, helpful
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            className="flex-1"
          >
            No thanks
          </Button>
        </div>
      )}
      
      <div className="mt-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Surface • Privacy settings</span>
          <span>{microPromptPolicy.getStatus().globalCount}/3 today</span>
        </div>
      </div>
    </Card>
  );
}