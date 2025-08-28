/**
 * Dev test page for unified atomic interactions
 * Tests: Motion toggle, pan/zoom, shell-snap, store mapping, verification
 */

import React, { useState, useEffect } from 'react';
import { AtomicView } from '@/components/AtomicView';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { generateId } from '@/utils/atomicHelpers';
import { Bubble } from '@/types/bubble';
import { Play, Pause, RotateCcw } from 'lucide-react';

const testBubbles: Bubble[] = [
  // Work domain
  {
    id: generateId(),
    content: "Finish quarterly report",
    type: "Task",
    x: 100, y: 100,
    size: 0.8,
    tags: [
      { id: generateId(), name: "work", emoji: "💼" },
      { id: generateId(), name: "today", emoji: "🔥" }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: generateId(),
    content: "Team meeting prep",
    type: "Task", 
    x: 150, y: 120,
    size: 0.6,
    tags: [
      { id: generateId(), name: "work", emoji: "💼" },
      { id: generateId(), name: "week", emoji: "📅" }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  
  // Personal domain
  {
    id: generateId(),
    content: "Call dentist",
    type: "ReminderNote",
    x: 300, y: 150,
    size: 0.7,
    tags: [
      { id: generateId(), name: "personal", emoji: "🏠" },
      { id: generateId(), name: "today", emoji: "🔥" }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: generateId(),
    content: "Plan vacation",
    type: "Thought",
    x: 350, y: 200,
    size: 0.5,
    tags: [
      { id: generateId(), name: "personal", emoji: "🏠" },
      { id: generateId(), name: "later", emoji: "🌙" }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  
  // Finance domain
  {
    id: generateId(),
    content: "Review budget",
    type: "Task",
    x: 200, y: 300,
    size: 0.6,
    tags: [
      { id: generateId(), name: "finance", emoji: "💰" },
      { id: generateId(), name: "week", emoji: "📅" }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export default function DevAtomicUnified() {
  const { addBubble, bubbles, deleteBubble } = useBubbleStore();
  const [initialized, setInitialized] = useState(false);
  const [dragEvents, setDragEvents] = useState<string[]>([]);
  const [motionState, setMotionState] = useState('OFF');

  const initializeTestData = async () => {
    if (initialized) return;
    
    // Clear existing data
    const currentBubbles = useBubbleStore.getState().bubbles;
    for (const bubble of currentBubbles) {
      deleteBubble(bubble.id);
    }
    
    // Add test bubbles to store
    for (const bubble of testBubbles) {
      await addBubble(bubble);
    }
    setInitialized(true);
    addDragEvent('Test data initialized');
  };

  const resetTestData = () => {
    const currentBubbles = useBubbleStore.getState().bubbles;
    for (const bubble of currentBubbles) {
      deleteBubble(bubble.id);
    }
    setInitialized(false);
    setDragEvents([]);
    addDragEvent('Test data reset');
  };

  const addDragEvent = (event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDragEvents(prev => [`${timestamp}: ${event}`, ...prev.slice(0, 9)]);
  };

  // Monitor for motion changes
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setMotionState(prev => prev === 'ON' ? 'OFF' : 'ON');
        addDragEvent(`Motion toggled: ${motionState === 'ON' ? 'OFF' : 'ON'}`);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [motionState]);

  const handleBubbleSelect = (bubbleId: string) => {
    addDragEvent(`Bubble selected: ${bubbleId.slice(0, 8)}...`);
  };

  const handleBubbleEdit = (bubbleId: string) => {
    addDragEvent(`Bubble edit: ${bubbleId.slice(0, 8)}...`);
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Test Controls */}
      <div className="bg-card border-b p-4 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Atomic View Unified Test</h1>
          <Button onClick={initializeTestData} disabled={initialized}>
            Initialize Test Data
          </Button>
          <Button variant="outline" onClick={resetTestData}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Badge variant="outline">
            Bubbles: {bubbles.length}
          </Badge>
          <Badge variant={motionState === 'ON' ? 'default' : 'outline'}>
            Motion: {motionState}
          </Badge>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex gap-4 p-4">
        {/* Atomic View */}
        <div className="flex-1 relative bg-muted rounded-lg overflow-hidden">
          <AtomicView 
            onBubbleSelect={handleBubbleSelect}
            onBubbleEdit={handleBubbleEdit}
          />
        </div>
        
        {/* Debug Panel */}
        <div className="w-80 space-y-4">
          {/* Event Log */}
          <Card className="p-4">
            <h3 className="font-medium mb-2">Event Log</h3>
            <div className="space-y-1 text-sm max-h-40 overflow-y-auto">
              {dragEvents.length === 0 ? (
                <div className="text-muted-foreground">No events yet...</div>
              ) : (
                dragEvents.map((event, i) => (
                  <div key={i} className="font-mono text-xs">
                    {event}
                  </div>
                ))
              )}
            </div>
          </Card>
          
          {/* Test Checklist */}
          <Card className="p-4">
            <h3 className="font-medium mb-2">Test Checklist</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="motion" />
                <label htmlFor="motion">Motion toggle (Space/button)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pan" />
                <label htmlFor="pan">Pan canvas (drag empty space)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="zoom" />
                <label htmlFor="zoom">Zoom (wheel/buttons)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="electron" />
                <label htmlFor="electron">Electron shell snap</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="toast" />
                <label htmlFor="toast">Toast + Undo on move</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="domain" />
                <label htmlFor="domain">Domain classification</label>
              </div>
            </div>
          </Card>
          
          {/* Domain Mapping */}
          <Card className="p-4">
            <h3 className="font-medium mb-2">Domain Mapping</h3>
            <div className="space-y-1 text-xs">
              <div>💼 Work: {bubbles.filter(b => b.tags?.some(t => t.name === 'work')).length}</div>
              <div>🏠 Personal: {bubbles.filter(b => b.tags?.some(t => t.name === 'personal')).length}</div>
              <div>💰 Finance: {bubbles.filter(b => b.tags?.some(t => t.name === 'finance')).length}</div>
            </div>
          </Card>
          
          {/* Horizon Mapping */}
          <Card className="p-4">
            <h3 className="font-medium mb-2">Time Horizons</h3>
            <div className="space-y-1 text-xs">
              <div>🔥 Today: {bubbles.filter(b => b.tags?.some(t => t.name === 'today')).length}</div>
              <div>📅 Week: {bubbles.filter(b => b.tags?.some(t => t.name === 'week')).length}</div>
              <div>🌙 Later: {bubbles.filter(b => b.tags?.some(t => t.name === 'later')).length}</div>
            </div>
          </Card>
        </div>
      </div>
      
      {/* Test Instructions */}
      <div className="bg-card border-t p-4 text-sm space-y-2">
        <h3 className="font-medium">Unified Test Instructions:</h3>
        <div className="grid grid-cols-2 gap-4 text-muted-foreground">
          <div>
            <strong>Motion Control:</strong> 
            <ul className="list-disc list-inside">
              <li>Spacebar or Play/Pause button toggles orbital motion</li>
              <li>Motion should NOT pause when clicking/dragging</li>
              <li>Status badge shows current motion state</li>
            </ul>
          </div>
          <div>
            <strong>Pan/Zoom:</strong>
            <ul className="list-disc list-inside">
              <li>Drag empty space (8px threshold) to pan</li>
              <li>Mouse wheel or +/- buttons to zoom</li>
              <li>Should not conflict with electron/molecule drag</li>
            </ul>
          </div>
          <div>
            <strong>Electron Shell Snap:</strong>
            <ul className="list-disc list-inside">
              <li>Drag electrons between Today/Week/Later shells</li>
              <li>Toast shows movement with Undo button</li>
              <li>Store updates bubble tags appropriately</li>
            </ul>
          </div>
          <div>
            <strong>Expected Behavior:</strong>
            <ul className="list-disc list-inside">
              <li>Single renderer (AtomicRenderer)</li>
              <li>Deterministic domain classification</li>
              <li>Canonical horizon representation via tags</li>
              <li>No motion conflicts during interactions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}