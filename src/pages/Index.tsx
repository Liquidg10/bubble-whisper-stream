// Bubble Universe - Personal Cognitive Companion Main Interface

import React, { useEffect, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { AtomicView } from '@/components/AtomicView';
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
import { VoiceAIInterface } from '@/components/VoiceAIInterface';
import { ViewModeToggle } from '@/components/ViewModeToggle';

import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';

export default function Index() {
  const { isLoading, bubbles, settings } = useBubbleStore();
  const currentViewMode = settings.viewMode || 'bubble';
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

  // Clean start - no auto-generated welcome bubbles

  return (
    <div className="relative h-full bg-background">
      {/* View Mode Toggle */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
        <ViewModeToggle />
      </div>

      {currentViewMode === 'bubble' ? (
        <BubbleCanvas 
          onBubbleSelect={setSelectedBubble}
          onBubbleEdit={setSelectedBubble}
        />
      ) : (
        <AtomicView 
          onBubbleSelect={(bubbleId) => {
            const bubble = bubbles.find(b => b.id === bubbleId);
            if (bubble) setSelectedBubble(bubble);
          }}
          onBubbleEdit={(bubbleId) => {
            const bubble = bubbles.find(b => b.id === bubbleId);
            if (bubble) setSelectedBubble(bubble);
          }}
        />
      )}
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


      {/* Collaboration Hub Access */}
      <div className="fixed top-20 right-4 z-10">
        <CollaborationHub isOpen={false} onClose={() => {}} />
      </div>
      
      {/* Voice AI Interface */}
      <div className="fixed bottom-20 right-4 z-10">
        <VoiceAIInterface />
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
