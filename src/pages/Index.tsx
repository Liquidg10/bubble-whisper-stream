// Bubble Universe - Personal Cognitive Companion Main Interface

import React, { useEffect, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { RadialCapture } from '@/components/RadialCapture';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { Settings, BookOpen, Brain } from 'lucide-react';

const Index = () => {
  const { initializeStore, isLoading, bubbles } = useBubbleStore();
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);

  // Initialize the store on app load
  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  // Create some sample bubbles for first-time users
  useEffect(() => {
    if (!isLoading && bubbles.length === 0) {
      const { addBubble } = useBubbleStore.getState();
      
      // Welcome bubble
      const welcomeBubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Thought',
        content: 'Welcome to your Bubble Universe! 🌌 This is where your thoughts come to life.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: 0,
        y: 0,
        size: 1,
        moodColor: 'hsl(var(--accent-void))',
        tags: [{ id: '1', name: 'Welcome', emoji: '👋' }],
      };

      // Quick start bubble
      const quickStartBubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Task',
        content: 'Tap the + button to capture your first thought',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: 200,
        y: -150,
        size: 0.8,
        moodColor: 'hsl(var(--accent-flow))',
        tags: [{ id: '2', name: 'Getting Started', emoji: '🚀' }],
      };

      // Privacy bubble
      const privacyBubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Memory',
        content: 'Your thoughts stay private on your device 🔒',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: -200,
        y: 100,
        size: 0.7,
        moodColor: 'hsl(var(--accent-growth))',
        tags: [{ id: '3', name: 'Privacy', emoji: '🔒' }],
      };

      addBubble(welcomeBubble);
      addBubble(quickStartBubble);
      addBubble(privacyBubble);
    }
  }, [isLoading, bubbles.length]);

  // Handle bubble selection
  const handleBubbleSelect = (bubble: Bubble) => {
    setSelectedBubble(bubble);
    console.log('Selected bubble:', bubble);
  };

  // Handle bubble edit
  const handleBubbleEdit = (bubble: Bubble) => {
    console.log('Editing bubble:', bubble);
    // TODO: Open edit modal
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-universe-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-accent-void/20 border-t-accent-void rounded-full animate-spin mx-auto mb-4" />
          <p className="text-speak text-text-primary">Initializing your universe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-universe-bg text-text-primary overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 p-4 bg-gradient-to-b from-universe-bg/80 to-transparent backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-aurora flex items-center justify-center">
              <Brain size={16} className="text-text-primary" />
            </div>
            <h1 className="text-call font-medium">Bubble Universe</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg bg-bubble-active/60 hover:bg-bubble-selected/60 
                             transition-colors duration-gentle border border-accent-void/20">
              <BookOpen size={18} />
            </button>
            <button className="p-2 rounded-lg bg-bubble-active/60 hover:bg-bubble-selected/60 
                             transition-colors duration-gentle border border-accent-void/20">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="absolute inset-0 pt-16">
        <BubbleCanvas
          onBubbleSelect={handleBubbleSelect}
          onBubbleEdit={handleBubbleEdit}
        />
      </main>

      {/* Floating Action Button for Capture */}
      <RadialCapture onCapture={handleBubbleSelect} />

      {/* Stats overlay for development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 left-4 text-xs text-text-secondary bg-bubble-idle/80 
                       backdrop-blur px-3 py-2 rounded-lg border border-accent-void/20">
          <div>Bubbles: {bubbles.length}</div>
          <div>Selected: {selectedBubble?.content?.substring(0, 20) || 'None'}</div>
        </div>
      )}

      {/* Ambient background effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Floating particles */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-accent-void/20 rounded-full animate-pulse" 
             style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-accent-flow/30 rounded-full animate-pulse" 
             style={{ animationDelay: '1s', animationDuration: '4s' }} />
        <div className="absolute bottom-1/3 left-2/3 w-1.5 h-1.5 bg-accent-growth/25 rounded-full animate-pulse" 
             style={{ animationDelay: '2s', animationDuration: '5s' }} />
      </div>
    </div>
  );
};

export default Index;
