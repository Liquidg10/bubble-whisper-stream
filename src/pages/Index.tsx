// Bubble Universe - Personal Cognitive Companion Main Interface

import React, { useEffect, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { RadialCapture } from '@/components/RadialCapture';
import { NotificationSystem } from '@/components/NotificationSystem';
import { GlimmerNotifications } from '@/components/GlimmerNotifications';
import { MiniMap } from '@/components/MiniMap';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble, CanvasViewport } from '@/types/bubble';
import { BubbleDetail } from '@/components/BubbleDetail';
import { Settings, BookOpen, Brain } from 'lucide-react';

export default function Index() {
  const { isLoading, bubbles } = useBubbleStore();
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({
    x: 0,
    y: 0,
    scale: 1,
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Create sample bubbles for first-time users
  useEffect(() => {
    if (!isLoading && bubbles.length === 0) {
      const { addBubble, updateBubble } = useBubbleStore.getState();
      
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
      
      // Settle positions to prevent stacking
      requestAnimationFrame(() => {
        const { bubbles, updateBubble } = useBubbleStore.getState();
        const MIN_SEP = 0.62;
        const list = [...bubbles];
        for (let iter = 0; iter < 30; iter++) {
          let moved = false;
          for (let i = 0; i < list.length; i++) for (let j = i+1; j < list.length; j++) {
            const a = list[i], b = list[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const d = Math.hypot(dx, dy);
            const minD = (a.size*50 + b.size*50) * MIN_SEP;
            if (d > 0 && d < minD) {
              const f = (minD - d)/d * 0.5;
              a.x += dx * f; a.y += dy * f;
              b.x -= dx * f; b.y -= dy * f;
              moved = true;
            }
          }
          if (!moved) break;
        }
        list.forEach(updateBubble);
      });
    }
  }, [isLoading, bubbles.length]);

  return (
    <div className="relative h-full bg-background">
      <BubbleCanvas 
        onBubbleSelect={setSelectedBubble}
        onBubbleEdit={setSelectedBubble}
      />
      <RadialCapture />
      <NotificationSystem />
      <GlimmerNotifications />
      
      {/* MiniMap positioned in bottom right */}
      <div className="fixed bottom-6 right-6 z-40">
        <MiniMap
          bubbles={bubbles}
          viewport={viewport}
          onViewportChange={setViewport}
        />
      </div>
      
      <BubbleDetail
        bubble={selectedBubble}
        isOpen={!!selectedBubble}
        onClose={() => setSelectedBubble(null)}
      />
    </div>
  );
}
