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
import { SyncConflictNotification } from '@/components/SyncConflictNotification';
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

/**
 * One conflict, in the shape <ConflictResolutionDialog/> consumes.
 *
 * Four incompatible representations of a sync conflict exist in this codebase:
 * crossDeviceSyncService's (localVersion/remoteVersion/timestamp),
 * enhancedSyncService's (local_data/remote_data as JSON strings, snake_case
 * timestamps), the dialog's own ConflictData, and the E2E fixture's hybrid.
 * Normalizing here -- at the single consumer -- rather than changing either
 * service keeps this additive and unable to regress an existing caller.
 */
type PendingConflict = {
  id: string;
  entityType: string;
  entityId: string;
  localData: unknown;
  remoteData: unknown;
  localTimestamp: string;
  remoteTimestamp: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function normalizeConflict(raw: unknown): PendingConflict | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) return null;
  return {
    id: raw.id,
    entityType: firstString(raw, 'entityType', 'entity_type') ?? 'unknown',
    entityId: firstString(raw, 'entityId', 'entity_id') ?? '',
    localData: raw.localData ?? raw.localVersion ?? raw.local_data,
    remoteData: raw.remoteData ?? raw.remoteVersion ?? raw.remote_data,
    localTimestamp: firstString(raw, 'localTimestamp', 'local_timestamp', 'timestamp') ?? '',
    remoteTimestamp: firstString(raw, 'remoteTimestamp', 'remote_timestamp', 'timestamp') ?? '',
  };
}

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
  const [pendingConflicts, setPendingConflicts] = useState<PendingConflict[]>([]);
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

  // Surface cross-device sync conflicts. Two independent paths feed this:
  //   1. conflicts persisted from a previous session (localStorage), read once
  //      on mount -- the `sync-conflict` event only announces *new* ones, so
  //      without this a conflict raised before a reload would stay invisible;
  //   2. live conflicts announced while the app is open, via the `sync-conflict`
  //      window event dispatched by crossDeviceSyncService.handleConflict and
  //      enhancedSyncService.notifyConflict (which disagree on payload shape --
  //      bare `detail` vs `detail.conflict` -- so both are accepted here).
  useEffect(() => {
    try {
      // The production service returns an array. Keep the nullish fallback for
      // older/incomplete test doubles and corrupted runtime replacements.
      const stored = crossDeviceSyncService.getStoredConflicts() ?? [];
      const hydrated = stored
        .filter((conflict) => !conflict.resolved)
        .map(normalizeConflict)
        .filter((c): c is PendingConflict => c !== null);
      if (hydrated.length > 0) setPendingConflicts(hydrated);
    } catch (error) {
      console.error('Failed to read stored sync conflicts:', error);
    }

    const handleSyncConflict = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const payload = isRecord(detail) && 'conflict' in detail ? detail.conflict : detail;
      const next = normalizeConflict(payload);
      if (!next) return;
      setPendingConflicts((prev) =>
        prev.some((c) => c.id === next.id) ? prev : [...prev, next]
      );
    };

    window.addEventListener('sync-conflict', handleSyncConflict);
    return () => window.removeEventListener('sync-conflict', handleSyncConflict);
  }, []);

  // Cross-device sync: resume/refresh sync when connectivity is restored
  // after being offline. crossDeviceSyncService.initialize() was previously
  // never called anywhere in production code (only referenced here for
  // conflict resolution/hydration) -- see REVIVE Run 137/138.
  useEffect(() => {
    const handleOnline = () => {
      crossDeviceSyncService.initialize();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

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

      {/* Sync Conflict Notification - the entry point into resolution */}
      <SyncConflictNotification
        count={pendingConflicts.length}
        onResolve={() => {
          setCurrentConflict(pendingConflicts[0] ?? null);
          setShowConflictDialog(true);
        }}
      />

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        conflict={currentConflict}
        isOpen={showConflictDialog}
        onClose={() => {
          setShowConflictDialog(false);
          setCurrentConflict(null);
        }}
        onResolve={(conflictId, resolution, mergedData) => {
          // Only forward mergedData when there is one: 'keep-local'/'keep-remote'
          // legitimately have no merged payload, and passing an explicit
          // `undefined` third argument is a different call than a two-argument one.
          const pending =
            mergedData === undefined
              ? crossDeviceSyncService.resolveConflict(conflictId, resolution)
              : crossDeviceSyncService.resolveConflict(conflictId, resolution, mergedData);
          void Promise.resolve(pending).catch((error) =>
            console.error('Failed to resolve sync conflict:', error)
          );

          setPendingConflicts((prev) => prev.filter((c) => c.id !== conflictId));
          setShowConflictDialog(false);
          setCurrentConflict(null);
        }}
      />

      {/* CBT Onboarding Banner as overlay */}
      <CBTOnboardingBanner />
    </div>
  );
}
