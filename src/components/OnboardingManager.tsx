import React, { useEffect, useState } from 'react';
import { OnboardingDataWizard } from './OnboardingDataWizard';
import { userContextService } from '@/services/userContextService';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';

export const OnboardingManager: React.FC = () => {
  const [showWizard, setShowWizard] = useState(false);
  const { state: onboardingState } = useProgressiveOnboarding();

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const hasCompleted = await userContextService.hasCompletedOnboarding();
        
        // Show wizard if:
        // 1. User hasn't completed data onboarding
        // 2. Progressive onboarding is active but user has no personalization data
        if (!hasCompleted && onboardingState.isEnabled && !onboardingState.hasSkippedProgression) {
          setShowWizard(true);
        }
      } catch (error) {
        console.warn('Failed to check onboarding status, defaulting to show wizard:', error);
        // Default to showing wizard if we can't check status
        if (onboardingState.isEnabled && !onboardingState.hasSkippedProgression) {
          setShowWizard(true);
        }
      }
    };

    checkOnboardingStatus();
  }, [onboardingState.isEnabled, onboardingState.hasSkippedProgression]);

  const handleComplete = async (data: any) => {
    // Track completion
    await userContextService.trackActivity('login');
    setShowWizard(false);
  };

  const handleClose = () => {
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