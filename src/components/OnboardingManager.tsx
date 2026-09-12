import React, { useEffect, useState } from 'react';
import { OnboardingDataWizard } from './OnboardingDataWizard';
import { userContextService } from '@/services/userContextService';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';
import { useLocation } from 'react-router-dom';
import { useBubbleStore } from '@/stores/bubbleStore';

export const OnboardingManager: React.FC = () => {
  const [showWizard, setShowWizard] = useState(false);
  const { state: onboardingState } = useProgressiveOnboarding();
  const { pathname } = useLocation();
  const dismissed = React.useRef(false);
  const hasGuide = useBubbleStore(state => state.bubbles.some(bubble => bubble.metadata?.bubbleGarden?.pack === 'living-bubbles-v1'));

  useEffect(() => {
    // The canvas now teaches through editable guide bubbles. Keep the older
    // personalization wizard from covering that first action on launch.
    if (pathname === '/' || hasGuide || dismissed.current) { setShowWizard(false); return; }
    let active = true;
    const checkOnboardingStatus = async () => {
      try {
        const hasCompleted = await userContextService.hasCompletedOnboarding();
        
        // Show wizard if:
        // 1. User hasn't completed data onboarding
        // 2. Progressive onboarding is active but user has no personalization data
        if (active && !hasCompleted && onboardingState.isEnabled && !onboardingState.hasSkippedProgression) {
          setShowWizard(true);
        }
      } catch (error) {
        console.warn('Failed to check onboarding status, defaulting to show wizard:', error);
        // Default to showing wizard if we can't check status
        if (active && onboardingState.isEnabled && !onboardingState.hasSkippedProgression) {
          setShowWizard(true);
        }
      }
    };

    checkOnboardingStatus();
    return () => { active = false; };
  }, [onboardingState.isEnabled, onboardingState.hasSkippedProgression, pathname, hasGuide]);

  const handleComplete = async () => {
    // Track completion
    await userContextService.trackActivity('login');
    setShowWizard(false);
  };

  const handleClose = () => {
    dismissed.current = true;
    setShowWizard(false);
  };

  return (
    <OnboardingDataWizard
      isOpen={showWizard}
      onClose={handleClose}
      onComplete={handleComplete}
    />
  );
};
