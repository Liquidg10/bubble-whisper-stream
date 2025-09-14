import React, { useEffect, useCallback } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { momentumBurstService } from '@/services/momentumBurstService';
import { microCelebrationService } from '@/services/microCelebrationService';
import { CelebrationToast } from '@/components/CelebrationToast';
import type { GlimmerTone } from '@/types/glimmer';
import type { MomentumBurst } from '@/services/momentumBurstService';

export function useMicroCelebrations() {
  const { bubbles, settings } = useBubbleStore();
  const { toast } = useToast();

  const showMicroCelebration = useCallback((
    burst: MomentumBurst, 
    tone: GlimmerTone
  ) => {
    if (!microCelebrationService.canShowCelebration(tone)) {
      return;
    }

    const message = microCelebrationService.selectCelebrationMessage(burst, tone);
    
    // Show enhanced celebration toast
    toast({
      title: message,
      description: `✨ ${tone} celebration`,
      duration: 4000,
      className: `celebration-toast tone-${tone.toLowerCase().replace(' ', '-')} bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20`
    });
    
    // Record the celebration
    microCelebrationService.recordCelebrationShown(tone, burst.type);
  }, [toast]);

  const checkForCelebrations = useCallback(async () => {
    if (!settings.intelligenceEnabled) return;
    
    try {
      // Get recent bubbles (last 2 hours for more responsive detection)
      const recentCutoff = Date.now() - (2 * 60 * 60 * 1000);
      const recentBubbles = bubbles.filter(b => b.createdAt > recentCutoff);
      
      if (recentBubbles.length === 0) return;

      // Check for momentum burst
      const burst = await momentumBurstService.checkForMomentumBurst(recentBubbles);
      
      if (burst && burst.celebrationEligible) {
        // Use preferred glimmer tone or default to Friend
        const tone = (settings.preferredGlimmerTone || 'supportive') as GlimmerTone;
        
        // Enhanced celebration check
        if (microCelebrationService.canShowCelebration(tone)) {
          showMicroCelebration(burst, tone);
        }
      }
    } catch (error) {
      console.error('Failed to check for celebrations:', error);
    }
  }, [bubbles, settings.intelligenceEnabled, settings.preferredGlimmerTone, showMicroCelebration]);

  // Check for celebrations when bubbles change
  useEffect(() => {
    // Debounce the check to avoid too frequent calls
    const timeoutId = setTimeout(checkForCelebrations, 2000);
    return () => clearTimeout(timeoutId);
  }, [bubbles.length, checkForCelebrations]);

  return {
    showMicroCelebration,
    checkForCelebrations,
    getSettings: () => microCelebrationService.getSettings(),
    updateSettings: (settings: any) => microCelebrationService.updateSettings(settings),
    muteTone: (tone: GlimmerTone) => microCelebrationService.muteTone(tone),
    unmuteTone: (tone: GlimmerTone) => microCelebrationService.unmuteTone(tone),
    getDailyStats: () => microCelebrationService.getDailyStats(),
  };
}