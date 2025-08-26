import React from 'react';
import { AtomicRenderer } from '@/experimental/atomic/AtomicRenderer';
import { useBubbleStore } from '@/stores/bubbleStore';
import { updateTimeHorizon, createMoleculeFromDomain, mergeMolecules } from '@/experimental/atomic/atomicAdapter';

interface AtomicViewProps {
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  className?: string;
}

export function AtomicView({ onBubbleSelect, onBubbleEdit, className }: AtomicViewProps) {
  const { bubbles, settings } = useBubbleStore();

  const handleTimeHorizonUpdate = (bubbleId: string, fromRing: number, toRing: number) => {
    updateTimeHorizon(`mol-${bubbleId}`, fromRing, toRing);
  };

  const handleMoleculeCreate = (domain: string) => {
    createMoleculeFromDomain(domain);
  };

  const handleMoleculeMerge = (aId: string, bId: string) => {
    const aBubbleId = aId.replace('mol-', '').split('-')[0];
    const bBubbleId = bId.replace('mol-', '').split('-')[0];
    mergeMolecules(aBubbleId, bBubbleId);
  };

  const handleBubbleSelect = (bubble: any) => {
    onBubbleSelect?.(bubble.id || bubble);
  };

  return (
    <AtomicRenderer
      bubbles={bubbles}
      onBubbleSelect={handleBubbleSelect}
      onTimeHorizonUpdate={handleTimeHorizonUpdate}
      onMoleculeCreate={handleMoleculeCreate}
      onMoleculeMerge={handleMoleculeMerge}
      reducedMotion={settings.reducedMotion}
      highContrast={settings.highContrast}
      className={className}
    />
  );
}