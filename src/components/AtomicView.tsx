import React from 'react';
import { AtomicRenderer } from '@/experimental/atomic/AtomicRendererUnified';
import { useBubbleStore } from '@/stores/bubbleStore';
import { getHorizon, ringIndexToHorizon, setHorizon } from '@/lib/horizon';

interface AtomicViewProps {
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  onEditConnections?: (bubbleId: string) => void;
  className?: string;
}

export function AtomicView({ onBubbleSelect, onBubbleEdit, onEditConnections, className }: AtomicViewProps) {
  const bubbles = useBubbleStore(state => state.bubbles);
  const settings = useBubbleStore(state => state.settings);

  return (
    <AtomicRenderer
      bubbles={bubbles}
      onBubbleSelect={bubble => (onBubbleSelect ?? onBubbleEdit)?.(bubble.id)}
      onEditConnections={onEditConnections ? bubble => onEditConnections(bubble.id) : undefined}
      onTimeHorizonUpdate={async (bubbleId, fromRing, toRing) => {
        const state = useBubbleStore.getState();
        const latest = state.bubbles.find(bubble => bubble.id === bubbleId);
        if (!latest) throw new Error('This task is no longer available.');
        if ((getHorizon(latest) ?? 'today') !== ringIndexToHorizon(fromRing)) {
          throw new Error('This task changed while you were moving it. Try again.');
        }
        await state.updateBubbleStrict(setHorizon(latest, ringIndexToHorizon(toRing)));
      }}
      reducedMotion={settings.reducedMotion}
      highContrast={settings.highContrast}
      className={className}
    />
  );
}
