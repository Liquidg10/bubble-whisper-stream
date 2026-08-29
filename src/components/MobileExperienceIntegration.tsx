/**
 * Phase 1 & 2: Mobile Experience Integration Component
 * Integrates all mobile and AI enhancements into the bubble canvas
 */

import React, { useEffect } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { SeasonalSuggestionCard } from '@/components/intelligence/SeasonalSuggestionCard';
import { HabitPredictionPanel } from '@/components/intelligence/HabitPredictionPanel';
import { seasonalPatternService } from '@/services/seasonalPatternService';
import { advancedHabitEngine } from '@/services/advancedHabitEngine';
import { mobilePerformanceManager } from '@/services/mobilePerformanceManager';
import { useIsMobile } from '@/hooks/use-mobile';

export const MobileExperienceIntegration: React.FC = () => {
  const { bubbles, settings } = useBubbleStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    // Initialize mobile optimizations if on mobile
    if (isMobile) {
      // Enable mobile performance optimizations
      mobilePerformanceManager.updateConfig({
        gestureDebounceMs: 16,
        virtualScrollThreshold: 100,
        lowPowerMode: false,
        hapticFeedback: true
      });
    }

    // Learn from existing bubble history for AI features
    if (settings.intelligenceEnabled && bubbles.length > 0) {
      seasonalPatternService.learnFromBubbleHistory(bubbles);
      advancedHabitEngine.learnHabitsFromHistory(bubbles);
    }
  }, [isMobile, bubbles.length, settings.intelligenceEnabled]);

  return (
    <>
      {/* Mobile-specific enhancements are handled by individual components */}
      {/* AI intelligence components are rendered elsewhere in the app */}
    </>
  );
};
