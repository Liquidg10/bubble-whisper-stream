// Bubble Universe - Personal Cognitive Companion Main Interface

import React, { useEffect, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { JoyMomentumIntegration } from '@/components/JoyMomentumIntegration';
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
import { ProgressiveMilestoneCard } from '@/components/ProgressiveMilestoneCard';

import { FeatureGate } from '@/components/FeatureGate';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';

import { ViewModeToggle } from '@/components/ViewModeToggle';
import { VoiceIntentCapture } from '@/components/VoiceIntentCapture';
import { SmartTaskQuickAdd } from '@/components/SmartTaskQuickAdd';
import { isFeatureEnabled } from '@/config/flags';
import { CBTOnboardingBanner } from '@/components/CBTOnboardingBanner';

import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';

export default function Index() {
  const { isLoading, bubbles, settings } = useBubbleStore();
  const currentViewMode = settings.viewMode || 'bubble';
  
  // Progressive onboarding integration
  const {
    state: onboardingState,
    currentMilestone,
    shouldShowMilestone,
    completeMilestone,
    skipProgression,
    rewindToDay,
    markMilestoneShown,
    remindLater
  } = useProgressiveOnboarding();
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({
    x: 0,
    y: 0,
    scale: 1,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [currentConflict, setCurrentConflict] = useState<
    React.ComponentProps<typeof ConflictResolutionDialog>['conflict']
  >(null);
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
      
      {/* Progressive Milestone Card */}
      {currentMilestone && shouldShowMilestone && (
        <div className="absolute inset-x-2 top-4 z-[60] sm:left-1/2 sm:right-auto sm:top-20 sm:w-96 sm:-translate-x-1/2">
          <ProgressiveMilestoneCard
            milestone={currentMilestone}
            isVisible={shouldShowMilestone}
            onComplete={() => {
              completeMilestone(currentMilestone.day);
              markMilestoneShown(currentMilestone.day);
            }}
            onSkip={() => completeMilestone(currentMilestone.day)}
            onRemindLater={() => remindLater(currentMilestone.day)}
          />
        </div>
      )}

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
      <RadialCapture className="!absolute !bottom-1 !left-4" />
      
      {/* Keep capture available without permanently covering the task field. */}
      <details
        data-panel
        data-shell-control="quick-add"
        className="group absolute bottom-1 left-1/2 z-40 -translate-x-1/2 rounded-md border bg-card/95 text-card-foreground shadow-lg backdrop-blur-sm [@media(max-height:420px)]:left-24 [@media(max-height:420px)]:translate-x-0"
      >
        <summary className="flex min-h-11 cursor-pointer select-none items-center justify-center px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Add task
        </summary>
        <div className="absolute bottom-14 left-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border bg-card/95 p-3 shadow-xl backdrop-blur-sm [@media(max-height:420px)]:left-0 [@media(max-height:420px)]:translate-x-0">
          <SmartTaskQuickAdd />
        </div>
      </details>
      <NotificationSystem />
      <GlimmerNotifications />
      <JoyMomentumIntegration />
      
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
      

      {/* Voice Intent Capture - Floating Bottom Center */}
      {isFeatureEnabled('voiceCapture') && !isMobile && (
        <div
          data-shell-control="voice-capture"
          className="absolute bottom-1 right-4 z-50"
        >
          <VoiceIntentCapture
            compact
            onBubbleCreated={(bubble) => {
              console.log('Voice bubble created:', bubble);
            }}
          />
        </div>
      )}

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

      {/* CBT Onboarding Banner as overlay */}
      <CBTOnboardingBanner />
    </div>
  );
}
