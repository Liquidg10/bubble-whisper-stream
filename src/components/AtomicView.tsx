import React from 'react';
import AtomicMolecularRenderer from '@/experimental/atomic/AtomicMolecularRenderer';

interface AtomicViewProps {
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  className?: string;
}

export function AtomicView({ onBubbleSelect, onBubbleEdit, className }: AtomicViewProps) {
  return (
    <AtomicMolecularRenderer
      onBubbleSelect={onBubbleSelect}
      onBubbleEdit={onBubbleEdit}
      className={className}
    />
  );
}