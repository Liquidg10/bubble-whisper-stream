/**
 * Dev test page for basic atomic interactions
 * Tests: motion toggle, pan/zoom, overlay drag, electron snapping
 */

import React, { useState } from 'react';
import { AtomicView } from '@/components/AtomicView';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { generateId } from '@/utils/atomicHelpers';
import { Bubble } from '@/types/bubble';

const testBubbles: Bubble[] = [
  {
    id: generateId(),
    content: "Finish project report",
    type: "Task",
    x: 100, y: 100,
    size: 0.8,
    tags: [{ id: generateId(), name: "today", emoji: "🔥" }],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: generateId(),
    content: "Schedule dentist appointment",
    type: "Task", 
    x: 200, y: 150,
    size: 0.6,
    tags: [{ id: generateId(), name: "week", emoji: "📅" }],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: generateId(),
    content: "Plan vacation",
    type: "Thought",
    x: 300, y: 200,
    size: 0.4,
    tags: [{ id: generateId(), name: "later", emoji: "🌙" }],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: generateId(),
    content: "Learn about investing",
    type: "Task",
    x: 150, y: 250,
    size: 0.5,
    tags: [{ id: generateId(), name: "later", emoji: "🌙" }],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: generateId(),
    content: "Call mom",
    type: "ReminderNote",
    x: 250, y: 100,
    size: 0.7,
    tags: [{ id: generateId(), name: "today", emoji: "🔥" }],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export default function DevAtomicBasic() {
  const { addBubble, bubbles } = useBubbleStore();
  const [initialized, setInitialized] = useState(false);

  const initializeTestData = async () => {
    if (initialized) return;
    
    // Add test bubbles to store
    for (const bubble of testBubbles) {
      await addBubble(bubble);
    }
    setInitialized(true);
  };

  const resetTestData = () => {
    // Clear and reinit
    setInitialized(false);
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Test Controls */}
      <div className="bg-card border-b p-4 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Atomic View Basic Test</h1>
          <Button onClick={initializeTestData} disabled={initialized}>
            Initialize Test Data
          </Button>
          <Button variant="outline" onClick={resetTestData}>
            Reset
          </Button>
          <div className="text-sm text-muted-foreground">
            Bubbles: {bubbles.length} | Test: Motion toggle, pan/zoom, overlay drag, electron snapping
          </div>
        </div>
      </div>
      
      {/* Atomic View */}
      <div className="flex-1 relative">
        <AtomicView 
          onBubbleSelect={(bubbleId) => console.log('Selected:', bubbleId)}
          onBubbleEdit={(bubbleId) => console.log('Edit:', bubbleId)}
        />
      </div>
      
      {/* Test Instructions */}
      <div className="bg-card border-t p-4 text-sm space-y-2">
        <h3 className="font-medium">Test Instructions:</h3>
        <ul className="space-y-1 text-muted-foreground">
          <li>• <strong>Motion:</strong> Click Play/Pause button or press spacebar to toggle orbital motion</li>
          <li>• <strong>Pan/Zoom:</strong> Drag canvas to pan, scroll to zoom (avoid UI overlays)</li>
          <li>• <strong>Overlay Drag:</strong> Drag the ⋮⋮ handles to move UI panels around</li>
          <li>• <strong>Electron Snap:</strong> Drag electrons between shell rings to change time horizons</li>
          <li>• <strong>Expected:</strong> No accidental motion pauses, smooth interactions, clear feedback</li>
        </ul>
      </div>
    </div>
  );
}