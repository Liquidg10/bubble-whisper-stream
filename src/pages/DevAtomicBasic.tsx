/**
 * Dev test page for unified atomic interactions
 * Tests: unified renderer, shell snapping with undo, motion toggle, clean multi-select
 */

import React, { useState, useEffect } from 'react';
import { AtomicView } from '@/components/AtomicView';
import { useBubbleStore } from '@/stores/bubbleStore';
import { isMotionEnabled, subscribeToMotionState } from '@/lib/motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { classifyDomain, getAllDomains } from '@/lib/classifyDomain';
import { getAllHorizons } from '@/lib/horizon';
import type { Bubble } from '@/types/bubble';

// Test data with 3 domains, ~15 bubbles for comprehensive testing
const testBubbles: Bubble[] = [
  // Work domain (5 bubbles)
  { id: 'work-1', content: 'Complete quarterly budget analysis for project funding', type: 'Task', completed: false, size: 0.8, x: 120, y: 80, tags: [{ id: 'tag-1', name: 'today', emoji: '🔥' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'work-2', content: 'Team standup meeting at 2pm - discuss sprint goals', type: 'ReminderNote', size: 0.6, x: 180, y: 120, tags: [{ id: 'tag-2', name: 'today', emoji: '🔥' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'work-3', content: 'Review code submissions from junior developers', type: 'Task', completed: false, size: 0.7, x: 140, y: 160, tags: [{ id: 'tag-3', name: 'week', emoji: '📅' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'work-4', content: 'Planning next quarter roadmap and resource allocation', type: 'Thought', size: 0.5, x: 200, y: 200, tags: [{ id: 'tag-4', name: 'week', emoji: '📅' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'work-5', content: 'Career development goals discussion with manager', type: 'ReminderNote', size: 0.4, x: 160, y: 240, tags: [{ id: 'tag-5', name: 'later', emoji: '🌙' }], createdAt: Date.now(), updatedAt: Date.now() },

  // Personal domain (5 bubbles)
  { id: 'personal-1', content: 'Clean the kitchen thoroughly and organize cabinets', type: 'Task', completed: false, size: 0.7, x: 320, y: 100, tags: [{ id: 'tag-6', name: 'today', emoji: '🔥' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'personal-2', content: 'Call mom about weekend family dinner plans', type: 'ReminderNote', size: 0.6, x: 380, y: 140, tags: [{ id: 'tag-7', name: 'today', emoji: '🔥' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'personal-3', content: 'Fix leaky bathroom faucet - buy replacement parts', type: 'Task', completed: false, size: 0.8, x: 340, y: 180, tags: [{ id: 'tag-8', name: 'week', emoji: '📅' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'personal-4', content: 'Plan summer vacation itinerary and book flights', type: 'Thought', size: 0.5, x: 400, y: 220, tags: [{ id: 'tag-9', name: 'later', emoji: '🌙' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'personal-5', content: 'Organize old photo albums and digitize memories', type: 'Task', completed: false, size: 0.4, x: 360, y: 260, tags: [{ id: 'tag-10', name: 'later', emoji: '🌙' }], createdAt: Date.now(), updatedAt: Date.now() },

  // Health domain (5 bubbles)
  { id: 'health-1', content: 'Take daily vitamins and track wellness metrics', type: 'ReminderNote', size: 0.6, x: 520, y: 120, tags: [{ id: 'tag-11', name: 'today', emoji: '🔥' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'health-2', content: 'Morning meditation session - 20 minutes mindfulness', type: 'Task', completed: true, size: 0.7, x: 580, y: 160, tags: [{ id: 'tag-12', name: 'today', emoji: '🔥' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'health-3', content: 'Schedule annual dentist appointment and cleaning', type: 'ReminderNote', size: 0.5, x: 540, y: 200, tags: [{ id: 'tag-13', name: 'week', emoji: '📅' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'health-4', content: 'Research and start yoga practice routine', type: 'Thought', size: 0.6, x: 600, y: 240, tags: [{ id: 'tag-14', name: 'week', emoji: '📅' }], createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'health-5', content: 'Comprehensive nutrition plan research and meal prep', type: 'Task', completed: false, size: 0.4, x: 560, y: 280, tags: [{ id: 'tag-15', name: 'later', emoji: '🌙' }], createdAt: Date.now(), updatedAt: Date.now() }
];

export default function DevAtomicBasic() {
  const { bubbles, addBubble, clearAllBubbles } = useBubbleStore();
  const [initialized, setInitialized] = useState(false);
  const [motionState, setMotionState] = useState(isMotionEnabled());
  const [fps, setFps] = useState(0);

  // Track FPS for performance monitoring
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const updateFps = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(updateFps);
    };
    
    requestAnimationFrame(updateFps);
  }, []);

  // Subscribe to motion state changes
  useEffect(() => {
    return subscribeToMotionState(setMotionState);
  }, []);

  const initializeTestData = async () => {
    await clearAllBubbles();
    
    for (const bubble of testBubbles) {
      addBubble(bubble);
    }
    
    setInitialized(true);
  };

  const resetTestData = async () => {
    await clearAllBubbles();
    setInitialized(false);
  };

  const handleBubbleSelect = (bubbleId: string) => {
    console.log('Selected bubble:', bubbleId);
  };

  const handleBubbleEdit = (bubbleId: string) => {
    console.log('Edit bubble:', bubbleId);
  };

  // Count bubbles by domain for status display
  const domainCounts = getAllDomains().reduce((acc, domain) => {
    acc[domain] = bubbles.filter(b => classifyDomain(b) === domain).length;
    return acc;
  }, {} as Record<string, number>);

  // Count bubbles by horizon for status display
  const horizonCounts = getAllHorizons().reduce((acc, horizon) => {
    acc[horizon] = bubbles.filter(b => b.tags?.some(t => t.name === horizon)).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Status Strip with Test Controls and Performance Metrics */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 border-b">
        <div className="flex gap-2">
          <Button 
            variant={initialized ? "secondary" : "default"}
            size="sm"
            onClick={initializeTestData}
          >
            Initialize Data
          </Button>
          <Button 
            variant="outline"
            size="sm"
            onClick={resetTestData}
          >
            Reset
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Badge variant={motionState ? "default" : "secondary"}>
            Motion: {motionState ? 'ON' : 'OFF'}
          </Badge>
          <Badge variant="outline">
            FPS: {fps}
          </Badge>
          <Badge variant="outline">
            Bubbles: {bubbles.length}
          </Badge>
        </div>

        <div className="flex gap-1 text-xs">
          {Object.entries(domainCounts).map(([domain, count]) => (
            count > 0 && (
              <Badge key={domain} variant="outline" className="text-xs">
                {domain}: {count}
              </Badge>
            )
          ))}
        </div>

        <div className="flex gap-1 text-xs">
          {Object.entries(horizonCounts).map(([horizon, count]) => (
            count > 0 && (
              <Badge key={horizon} variant="outline" className="text-xs">
                {horizon}: {count}
              </Badge>
            )
          ))}
        </div>

        <div className="ml-auto text-sm text-muted-foreground">
          Spacebar: Motion • Shift+Click: Multi-select • Drag electrons: Snap to shell
        </div>
      </div>

      {/* Unified Atomic View */}
      <div className="flex-1">
        <AtomicView
          onBubbleSelect={handleBubbleSelect}
          onBubbleEdit={handleBubbleEdit}
          className="w-full h-full"
        />
      </div>

      {/* Test Instructions */}
      <div className="bg-muted/30 border-t p-4 text-sm space-y-2">
        <h3 className="font-medium">Unified Atomic View Test - Acceptance Criteria:</h3>
        <div className="grid grid-cols-3 gap-4 text-muted-foreground">
          <div>
            <strong>Interactions:</strong>
            <ul className="list-disc list-inside">
              <li>Drag electrons between Today/Week/Later shells</li>
              <li>Toast shows movement with Undo button</li>
              <li>Store updates bubble tags appropriately</li>
            </ul>
          </div>
          <div>
            <strong>Multi-select & Fusion:</strong>
            <ul className="list-disc list-inside">
              <li>Shift+Click for multi-select (ring indicators)</li>
              <li>Fusion requires exactly 2 molecules</li>
              <li>Fission works with Undo support</li>
            </ul>
          </div>
          <div>
            <strong>Expected Behavior:</strong>
            <ul className="list-disc list-inside">
              <li>Single renderer (AtomicRenderer)</li>
              <li>Overlay drag doesn't interfere with pan</li>
              <li>Center-anchored zoom behavior</li>
              <li>No motion conflicts during interactions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}