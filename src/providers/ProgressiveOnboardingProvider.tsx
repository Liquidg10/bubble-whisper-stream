import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  ProgressiveOnboardingState, 
  progressiveOnboardingService,
  MilestoneConfig 
} from '@/services/progressiveOnboardingService';
import { useBubbleStore } from '@/stores/bubbleStore';

interface ProgressiveOnboardingContextType {
  state: ProgressiveOnboardingState;
  currentMilestone: MilestoneConfig | null;
  shouldShowMilestone: boolean;
  isFeatureUnlocked: (feature: string) => boolean;
  completeMilestone: (day: number) => void;
  skipProgression: () => void;
  rewindToDay: (day: number) => void;
  markMilestoneShown: (day: number) => void;
  remindLater: (day: number) => void;
}

const ProgressiveOnboardingContext = createContext<ProgressiveOnboardingContextType | null>(null);

export const useProgressiveOnboarding = () => {
  const context = useContext(ProgressiveOnboardingContext);
  if (!context) {
    throw new Error('useProgressiveOnboarding must be used within ProgressiveOnboardingProvider');
  }
  return context;
};

interface ProgressiveOnboardingProviderProps {
  children: React.ReactNode;
}

export const ProgressiveOnboardingProvider: React.FC<ProgressiveOnboardingProviderProps> = ({
  children
}) => {
  const { settings, updateSettings } = useBubbleStore();
  
  // Initialize onboarding state from settings or default
  const [state, setState] = useState<ProgressiveOnboardingState>(
    settings.progressiveOnboarding || progressiveOnboardingService.getDefaultState()
  );

  // Sync state to bubble store
  useEffect(() => {
    updateSettings({ progressiveOnboarding: state });
  }, [state, updateSettings]);

  // Calculate current milestone and visibility
  const currentDay = progressiveOnboardingService.getCurrentDay(state);
  const currentMilestone = progressiveOnboardingService.getMilestoneForDay(currentDay);
  const shouldShowMilestone = currentMilestone 
    ? progressiveOnboardingService.shouldShowMilestone(state, currentDay)
    : false;

  const isFeatureUnlocked = (feature: string): boolean => {
    return progressiveOnboardingService.isFeatureUnlocked(state, feature);
  };

  const completeMilestone = (day: number) => {
    setState(prev => progressiveOnboardingService.completeMilestone(prev, day));
  };

  const skipProgression = () => {
    setState(prev => progressiveOnboardingService.skipProgression(prev));
  };

  const rewindToDay = (day: number) => {
    setState(prev => progressiveOnboardingService.rewindToDay(prev, day));
  };

  const markMilestoneShown = (day: number) => {
    setState(prev => progressiveOnboardingService.markMilestoneShown(prev, day));
  };

  const remindLater = (day: number) => {
    // Mark as shown but don't complete, will show again next day
    markMilestoneShown(day);
  };

  const contextValue: ProgressiveOnboardingContextType = {
    state,
    currentMilestone,
    shouldShowMilestone,
    isFeatureUnlocked,
    completeMilestone,
    skipProgression,
    rewindToDay,
    markMilestoneShown,
    remindLater
  };

  return (
    <ProgressiveOnboardingContext.Provider value={contextValue}>
      {children}
    </ProgressiveOnboardingContext.Provider>
  );
};