/**
 * Dev test page for atomic stress testing
 * Tests: performance with many molecules and electrons
 */

import React, { useState, useEffect } from 'react';
import { AtomicView } from '@/components/AtomicView';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { generateId } from '@/utils/atomicHelpers';
import { Bubble, BubbleType } from '@/types/bubble';
import { Badge } from '@/components/ui/badge';

const DOMAINS = ['Work', 'Personal', 'Health', 'Learning', 'Relationships', 'Finance', 'Mental', 'Home'];
const TYPES: BubbleType[] = ['Task', 'Thought', 'Memory', 'Mood', 'ReminderNote'];
const TIME_HORIZONS = ['today', 'week', 'later'];

function generateTestBubbles(count: number): Bubble[] {
  const bubbles: Bubble[] = [];
  
  for (let i = 0; i < count; i++) {
    const domain = DOMAINS[i % DOMAINS.length];
    const type = TYPES[i % TYPES.length];
    const horizon = TIME_HORIZONS[i % TIME_HORIZONS.length];
    
    bubbles.push({
      id: generateId(),
      content: `${domain} ${type} #${i + 1}: Sample content for testing performance`,
      type,
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100,
      size: Math.random() * 0.8 + 0.2, // 0.2 to 1.0
      tags: [{ id: generateId(), name: horizon, emoji: horizon === 'today' ? '🔥' : horizon === 'week' ? '📅' : '🌙' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  
  return bubbles;
}

export default function DevAtomicStress() {
  const { addBubble, bubbles, deleteBubble } = useBubbleStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [performanceMode, setPerformanceMode] = useState<'motion-on' | 'motion-off'>('motion-off');

  const generateBubbles = async (count: number) => {
    setIsGenerating(true);
    const testBubbles = generateTestBubbles(count);
    
    for (const bubble of testBubbles) {
      await addBubble(bubble);
    }
    
    setIsGenerating(false);
  };

  const clearAllBubbles = async () => {
    setIsGenerating(true);
    for (const bubble of bubbles) {
      await deleteBubble(bubble.id);
    }
    setIsGenerating(false);
  };

  // Performance monitoring
  const [fps, setFps] = useState(0);
  
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    const animationId = requestAnimationFrame(measureFPS);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Test Controls */}
      <div className="bg-card border-b p-4 z-50 space-y-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Atomic View Stress Test</h1>
          <div className="flex gap-2">
            <Button 
              onClick={() => generateBubbles(50)} 
              disabled={isGenerating}
              size="sm"
            >
              Add 50 Bubbles
            </Button>
            <Button 
              onClick={() => generateBubbles(100)} 
              disabled={isGenerating}
              size="sm"
            >
              Add 100 Bubbles
            </Button>
            <Button 
              variant="outline" 
              onClick={clearAllBubbles}
              disabled={isGenerating}
              size="sm"
            >
              Clear All
            </Button>
          </div>
        </div>
        
        {/* Performance Metrics */}
        <div className="flex items-center gap-4">
          <Badge variant="outline">
            Bubbles: {bubbles.length}
          </Badge>
          <Badge variant="outline">
            Domains: {new Set(bubbles.map(b => b.type)).size}
          </Badge>
          <Badge variant={fps >= 55 ? "default" : fps >= 30 ? "secondary" : "destructive"}>
            FPS: {fps}
          </Badge>
          <Badge variant="outline">
            Performance Mode: {performanceMode}
          </Badge>
        </div>
        
        {/* Performance Tips */}
        <div className="text-sm text-muted-foreground">
          <strong>Target:</strong> ≥55 FPS typical usage, ≥45 FPS with 100+ electrons. 
          Use motion toggle and reduced motion settings for better performance.
        </div>
      </div>
      
      {/* Atomic View */}
      <div className="flex-1 relative">
        <AtomicView 
          onBubbleSelect={(bubbleId) => console.log('Selected:', bubbleId)}
          onBubbleEdit={(bubbleId) => console.log('Edit:', bubbleId)}
        />
      </div>
      
      {/* Performance Guidelines */}
      <div className="bg-card border-t p-4 text-sm space-y-2">
        <h3 className="font-medium">Performance Test Guidelines:</h3>
        <div className="grid grid-cols-2 gap-4 text-muted-foreground">
          <div>
            <strong>Motion ON Test:</strong>
            <ul className="space-y-1 mt-1">
              <li>• Should maintain ≥45 FPS with 50+ bubbles</li>
              <li>• Electron orbits should be smooth</li>
              <li>• Pan/zoom should remain responsive</li>
            </ul>
          </div>
          <div>
            <strong>Motion OFF Test:</strong>
            <ul className="space-y-1 mt-1">
              <li>• Should maintain ≥55 FPS with 100+ bubbles</li>
              <li>• All interactions should be instant</li>
              <li>• No animation lag during electron dragging</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}