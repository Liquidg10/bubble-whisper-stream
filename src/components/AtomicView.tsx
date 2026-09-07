import React from 'react';
import { AtomicRenderer } from '@/experimental/atomic/AtomicRendererUnified';
import { useBubbleStore } from '@/stores/bubbleStore';
import { ringIndexToHorizon } from '@/lib/horizon';

interface AtomicViewProps {
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  onEditConnections?: (bubbleId: string) => void;
  className?: string;
}

export function AtomicView({ onBubbleSelect, onBubbleEdit, onEditConnections, className }: AtomicViewProps) {
  const bubbles = useBubbleStore(state => state.bubbles);
  const settings = useBubbleStore(state => state.settings);
  const moveBubbleToHorizon = useBubbleStore(state => state.moveBubbleToHorizon);

  return (
    <AtomicRenderer
      bubbles={bubbles}
      onBubbleSelect={bubble => (onBubbleSelect ?? onBubbleEdit)?.(bubble.id)}
      onEditConnections={onEditConnections ? bubble => onEditConnections(bubble.id) : undefined}
      onTimeHorizonUpdate={(bubbleId, _fromRing, toRing) => {
        moveBubbleToHorizon(bubbleId, ringIndexToHorizon(toRing));
      }}
      reducedMotion={settings.reducedMotion}
      highContrast={settings.highContrast}
      className={className}
    />
  );
}
