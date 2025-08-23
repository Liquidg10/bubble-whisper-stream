// Bubble Universe - Personal Cognitive Companion Main Interface

import React, { useEffect, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { RadialCapture } from '@/components/RadialCapture';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { BubbleDetail } from '@/components/BubbleDetail';
import { Settings, BookOpen, Brain } from 'lucide-react';

export default function Index() {
  const { isLoading, bubbles } = useBubbleStore();
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);

  // Create sample bubbles for first-time users
  useEffect(() => {
    if (!isLoading && bubbles.length === 0) {
      const { addBubble } = useBubbleStore.getState();
      
      const welcomeBubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Thought',
        content: 'Welcome to your Bubble Universe! 🌌 This is where your thoughts come to life.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: 0,
        y: 0,
        size: 1,
        tags: [{ id: '1', name: 'Welcome', emoji: '👋' }],
      };

      addBubble(welcomeBubble);
    }
  }, [isLoading, bubbles.length]);

  return (
    <div className="relative h-full bg-background">
      <BubbleCanvas 
        onBubbleSelect={setSelectedBubble}
        onBubbleEdit={setSelectedBubble}
      />
      <BubbleDetail
        bubble={selectedBubble}
        isOpen={!!selectedBubble}
        onClose={() => setSelectedBubble(null)}
      />
    </div>
  );
}
