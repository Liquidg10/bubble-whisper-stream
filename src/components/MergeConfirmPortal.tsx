import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

interface MergeConfirmPortalProps {
  isOpen: boolean;
  screenPosition: { x: number; y: number };
  onMerge: () => void;
  onCancel: () => void;
  bubble1Label: string;
  bubble2Label: string;
}

export function MergeConfirmPortal({
  isOpen,
  screenPosition,
  onMerge,
  onCancel,
  bubble1Label,
  bubble2Label
}: MergeConfirmPortalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed z-[9999] bg-card/95 backdrop-blur-sm border border-border 
                 rounded-lg p-4 shadow-glow-strong pointer-events-auto"
      style={{
        left: Math.max(16, Math.min(screenPosition.x - 140, window.innerWidth - 296)),
        top: Math.max(16, Math.min(screenPosition.y - 48, window.innerHeight - 112)),
        minWidth: '280px'
      }}
    >
      <div className="text-center">
        <p className="text-sm text-text-primary mb-3">
          Merge "{bubble1Label}" with "{bubble2Label}"?
        </p>
        <div className="flex gap-2 justify-center">
          <Button
            onClick={onMerge}
            size="sm"
            className="bg-accent-void hover:bg-accent-void/80 text-text-primary min-h-[44px] px-6"
            autoFocus
          >
            Merge
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            size="sm"
            className="min-h-[44px] px-4"
          >
            Keep separate
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}