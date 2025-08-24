// Bubble Universe - Personal Cognitive Companion Main Interface

import React, { useEffect, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { RadialCapture } from '@/components/RadialCapture';
import { NotificationSystem } from '@/components/NotificationSystem';
import { GlimmerNotifications } from '@/components/GlimmerNotifications';
import { MiniMap } from '@/components/MiniMap';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useUILayout } from '@/hooks/useUILayout';
import { Bubble, CanvasViewport } from '@/types/bubble';
import { BubbleDetail } from '@/components/BubbleDetail';
import TemporalNavigation from '@/components/TemporalNavigation';
import { ConflictResolutionDialog } from '@/components/ConflictResolutionDialog';
import { CollaborationHub } from '@/components/CollaborationHub';
import { EnhancedVoiceCapture } from '@/components/EnhancedVoiceCapture';
import { EnhancedPhotoCapture } from '@/components/EnhancedPhotoCapture';

import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';

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
  const [currentConflict, setCurrentConflict] = useState<any>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  // UI Layout management
  const {
    togglePanel,
    toggleMinimize,
    toggleFocusMode,
    getPanelStyle,
    isPanelVisible,
    isPanelMinimized,
    focusMode,
    isMobile
  } = useUILayout();

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
      
      {/* MiniMap */}
      {isPanelVisible('minimap') && (
        <div style={getPanelStyle('minimap')}>
          <MiniMap
            bubbles={bubbles}
            viewport={viewport}
            onViewportChange={setViewport}
            isVisible={isPanelVisible('minimap')}
            isMinimized={isPanelMinimized('minimap')}
            onToggleMinimize={() => toggleMinimize('minimap')}
            onToggleVisibility={() => togglePanel('minimap')}
          />
        </div>
      )}
      
      <BubbleDetail
        bubble={selectedBubble}
        isOpen={!!selectedBubble}
        onClose={() => setSelectedBubble(null)}
      />

      {/* Temporal Navigation */}
      {isPanelVisible('temporal') && (
        <div style={getPanelStyle('temporal')}>
          <TemporalNavigation 
            onTimeRangeChange={() => {}}
            isVisible={isPanelVisible('temporal')}
            isMinimized={isPanelMinimized('temporal')}
            onToggleMinimize={() => toggleMinimize('temporal')}
            onClose={() => togglePanel('temporal')}
          />
        </div>
      )}


      {/* Collaboration Hub Access */}
      <div className="fixed top-20 right-4 z-10">
        <CollaborationHub isOpen={false} onClose={() => {}} />
      </div>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        conflict={currentConflict}
        isOpen={showConflictDialog}
        onClose={() => {
          setShowConflictDialog(false);
          setCurrentConflict(null);
        }}
        onResolve={(conflictId, resolution, mergedData) => {
          crossDeviceSyncService.resolveConflict(conflictId, resolution, mergedData);
          setShowConflictDialog(false);
          setCurrentConflict(null);
        }}
      />
    </div>
  );
}
