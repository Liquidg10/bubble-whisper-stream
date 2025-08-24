import React, { createContext, useContext, useEffect, useState } from 'react';

interface FeatureFlags {
  cbtEnabled: boolean;
  glimmersEnabled: boolean;
  adaptiveRemindersEnabled: boolean;
  performanceMonitoringEnabled: boolean;
  debugMode: boolean;
}

interface FeatureFlagsContextValue {
  flags: FeatureFlags;
  updateFlag: (key: keyof FeatureFlags, value: boolean) => void;
  isFeatureEnabled: (feature: keyof FeatureFlags) => boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export const useFeatureFlags = () => {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  }
  return context;
};

interface FeatureFlagsProviderProps {
  children: React.ReactNode;
}

const DEFAULT_FLAGS: FeatureFlags = {
  cbtEnabled: true,
  glimmersEnabled: true,
  adaptiveRemindersEnabled: true,
  performanceMonitoringEnabled: process.env.NODE_ENV === 'development',
  debugMode: process.env.NODE_ENV === 'development',
};

export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  // Load flags from localStorage on mount
  useEffect(() => {
    try {
      const savedFlags = localStorage.getItem('featureFlags');
      if (savedFlags) {
        const parsedFlags = JSON.parse(savedFlags);
        setFlags(prev => ({ ...prev, ...parsedFlags }));
      }
    } catch (error) {
      console.warn('Failed to load feature flags:', error);
    }
  }, []);

  // Save flags to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('featureFlags', JSON.stringify(flags));
    } catch (error) {
      console.warn('Failed to save feature flags:', error);
    }
  }, [flags]);

  const updateFlag = (key: keyof FeatureFlags, value: boolean) => {
    setFlags(prev => ({ ...prev, [key]: value }));
  };

  const isFeatureEnabled = (feature: keyof FeatureFlags) => {
    return flags[feature];
  };

  const value: FeatureFlagsContextValue = {
    flags,
    updateFlag,
    isFeatureEnabled,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// Feature flag HOC for conditional rendering
interface WithFeatureFlagProps {
  feature: keyof FeatureFlags;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function WithFeatureFlag({ feature, fallback = null, children }: WithFeatureFlagProps) {
  const { isFeatureEnabled } = useFeatureFlags();
  
  return isFeatureEnabled(feature) ? <>{children}</> : <>{fallback}</>;
}