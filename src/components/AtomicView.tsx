/**
 * Atomic View - Wrapper component that integrates AtomicRenderer with real data
 */

import { useCallback } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import AtomicRenderer from '@/experimental/atomic/AtomicRenderer';
import { Bubble } from '@/types/bubble';

interface AtomicViewProps {
  onBubbleSelect?: (bubble: Bubble) => void;
  onBubbleEdit?: (bubble: Bubble) => void;
  className?: string;
}

export function AtomicView({ onBubbleSelect, onBubbleEdit, className }: AtomicViewProps) {
  const { bubbles, updateBubble, addBubble, mergeBubbles, settings } = useBubbleStore();
  const { toast } = useToast();

  // Convert bubbles to molecules for the atomic renderer
  const moleculeData = bubbles.map(bubble => ({
    id: bubble.id,
    content: bubble.content || '',
    type: bubble.type,
    size: bubble.size,
    x: bubble.x,
    y: bubble.y,
    tags: bubble.tags,
    createdAt: bubble.createdAt,
    updatedAt: bubble.updatedAt,
    // Map time horizon based on tags or content
    timeHorizon: bubble.tags.some(tag => tag.name === 'today') ? 0 : 
                 bubble.tags.some(tag => tag.name === 'week') ? 1 : 2,
  }));

  const handleBubbleSelect = useCallback((bubble: Bubble) => {
    onBubbleSelect?.(bubble);
  }, [onBubbleSelect]);

  const handleTimeHorizonUpdate = useCallback(async (bubbleId: string, fromRing: number, toRing: number) => {
    const bubble = bubbles.find(b => b.id === bubbleId);
    if (!bubble) return;

    // Update bubble tags based on time horizon
    const timeHorizonTags = ['today', 'week', 'later'];
    const newTags = bubble.tags.filter(tag => !timeHorizonTags.includes(tag.name));
    newTags.push({ id: crypto.randomUUID(), name: timeHorizonTags[toRing], emoji: '⏰' });

    const updatedBubble = {
      ...bubble,
      tags: newTags,
      updatedAt: Date.now()
    };

    await updateBubble(updatedBubble);
    
    toast({
      title: "Time horizon updated",
      description: `Moved to ${timeHorizonTags[toRing]}`,
      duration: 2000,
    });
  }, [bubbles, updateBubble, toast]);

  const handleMoleculeCreation = useCallback(async (domain: string) => {
    const newBubble: Bubble = {
      id: crypto.randomUUID(),
      content: `New ${domain} item`,
      type: 'Thought',
      size: 1,
      x: Math.random() * 200 - 100,
      y: Math.random() * 200 - 100,
      tags: [
        { id: crypto.randomUUID(), name: domain.toLowerCase(), emoji: '🏷️' }, 
        { id: crypto.randomUUID(), name: 'today', emoji: '⏰' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addBubble(newBubble);
    
    toast({
      title: "New molecule created",
      description: `Added ${domain} molecule`,
      duration: 2000,
    });
  }, [addBubble, toast]);

  const handleMoleculeMerge = useCallback(async (aId: string, bId: string) => {
    const bubbleA = bubbles.find(b => b.id === aId);
    const bubbleB = bubbles.find(b => b.id === bId);
    
    if (bubbleA && bubbleB) {
      mergeBubbles(bubbleA, bubbleB);
      
      toast({
        title: "Molecules fused",
        description: "Combined into a single bubble",
        duration: 3000,
      });
    }
  }, [bubbles, mergeBubbles, toast]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gradient-canvas ${className}`}>
      <AtomicRenderer
        bubbles={moleculeData}
        onBubbleSelect={handleBubbleSelect}
        onTimeHorizonUpdate={handleTimeHorizonUpdate}
        onMoleculeCreate={handleMoleculeCreation}
        onMoleculeMerge={handleMoleculeMerge}
        reducedMotion={settings.reducedMotion}
        highContrast={settings.highContrast}
      />
    </div>
  );
}