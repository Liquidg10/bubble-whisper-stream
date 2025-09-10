import React from 'react';
import { AtomicRenderer } from '@/experimental/atomic/AtomicRendererUnified';
import { useBubbleStore } from '@/stores/bubbleStore';
import { createMoleculeFromDomain, mergeMolecules } from '@/experimental/atomic/atomicAdapter';
import { ringIndexToHorizon } from '@/lib/horizon';

interface AtomicViewProps {
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  className?: string;
}

export function AtomicView({ onBubbleSelect, onBubbleEdit, className }: AtomicViewProps) {
  const { bubbles, settings, moveBubbleToHorizon } = useBubbleStore();

  const handleTimeHorizonUpdate = (bubbleId: string, fromRing: number, toRing: number) => {
    const horizon = ringIndexToHorizon(toRing);
    console.log('AtomicView handling time horizon update:', {
      bubbleId,
      fromRing,
      toRing,
      horizon
    });
    moveBubbleToHorizon(bubbleId, horizon);
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