/**
 * Merge Confirmation Popover - Mobile-First with Full Keyboard Navigation
 * Positioned between overlapping bubbles with ≥44×44px touch targets
 */

import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Bubble } from '@/types/bubble';

interface MergeConfirmPopoverProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bubble1: Bubble;
  bubble2: Bubble;
  position: { x: number; y: number };
  onMerge: () => void;
  onKeepSeparate: () => void;
}

export function MergeConfirmPopover({
  isOpen,
  onOpenChange,
  bubble1,
  bubble2,
  position,
  onMerge,
  onKeepSeparate
}: MergeConfirmPopoverProps) {
  const mergeButtonRef = useRef<HTMLButtonElement>(null);
  const keepSeparateButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus merge button when popover opens
  useEffect(() => {
    if (isOpen && mergeButtonRef.current) {
      mergeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          onMerge();
          break;
        case 'Escape':
          e.preventDefault();
          onKeepSeparate();
          break;
        case 'Tab':
          // Allow natural tab cycling between buttons
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onMerge, onKeepSeparate]);

  // Create invisible trigger positioned at the midpoint
  const triggerStyle = {
    position: 'absolute' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: '1px',
    height: '1px',
    pointerEvents: 'none' as const,
    zIndex: 1000
  };

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div style={triggerStyle} />
      </PopoverTrigger>
      
      <PopoverContent
        className="w-auto p-6 max-w-xs"
        align="center"
        side="top"
        sideOffset={20}
        role="dialog"
        aria-labelledby="merge-title"
        aria-describedby="merge-description"
      >
        <div className="space-y-4">
          <div className="text-center">
            <h3 
              id="merge-title" 
              className="text-base font-medium text-foreground"
            >
              Merge Bubbles?
            </h3>
            <p 
              id="merge-description" 
              className="text-sm text-muted-foreground mt-2"
            >
              Combine "{bubble1.content.slice(0, 20)}..." and "{bubble2.content.slice(0, 20)}..." into one bubble.
            </p>
          </div>
          
          <div className="flex gap-3 justify-center">
            <Button
              ref={mergeButtonRef}
              onClick={onMerge}
              className="min-h-[44px] min-w-[100px] px-6"
              aria-label={`Merge "${bubble1.content.slice(0, 20)}..." and "${bubble2.content.slice(0, 20)}..."`}
            >
              Merge
            </Button>
            
            <Button
              ref={keepSeparateButtonRef}
              variant="outline"
              onClick={onKeepSeparate}
              className="min-h-[44px] min-w-[100px] px-6"
              aria-label="Keep bubbles separate"
            >
              Keep Separate
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground text-center">
            Press Enter to merge, Esc to cancel
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}