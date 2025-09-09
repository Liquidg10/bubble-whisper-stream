import React, { createContext, useContext, useEffect, useState } from 'react';
import { calmModeService, CalmModeSettings, AccessibilitySettings } from '@/services/calmModeService';

interface CalmModeContextType {
  calmMode: CalmModeSettings;
  accessibility: AccessibilitySettings;
  updateCalmMode: (settings: Partial<CalmModeSettings>) => void;
  updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
  enableCalmMode: () => void;
  disableCalmMode: () => void;
  getCSSClasses: () => string;
  getButtonSize: () => 'sm' | 'default' | 'lg' | 'xl';
  shouldLimitStimuli: (feature: 'notifications' | 'parallax' | 'autoplay' | 'flashing') => boolean;
}

const CalmModeContext = createContext<CalmModeContextType | null>(null);

export const useCalmMode = () => {
  const context = useContext(CalmModeContext);
  if (!context) {
    throw new Error('useCalmMode must be used within CalmModeProvider');
  }
  return context;
};

interface CalmModeProviderProps {
  children: React.ReactNode;
}

export const CalmModeProvider: React.FC<CalmModeProviderProps> = ({ children }) => {
  const [calmMode, setCalmMode] = useState<CalmModeSettings>(calmModeService.getSettings());
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(calmModeService.getAccessibilitySettings());

  useEffect(() => {
    const handleSettingsChange = (event: CustomEvent) => {
      setCalmMode(event.detail.calmMode);
      setAccessibility(event.detail.accessibility);
    };

    window.addEventListener('calmModeChange', handleSettingsChange as EventListener);
    
    return () => {
      window.removeEventListener('calmModeChange', handleSettingsChange as EventListener);
    };
  }, []);

  const updateCalmMode = (settings: Partial<CalmModeSettings>) => {
    calmModeService.updateSettings(settings);
  };

  const updateAccessibility = (settings: Partial<AccessibilitySettings>) => {
    calmModeService.updateAccessibilitySettings(settings);
  };

  const enableCalmMode = () => {
    calmModeService.enableCalmMode();
  };

  const disableCalmMode = () => {
    calmModeService.disableCalmMode();
  };

  const getCSSClasses = () => {
    return calmModeService.getCSSClasses();
  };

  const getButtonSize = () => {
    return calmModeService.getButtonSize();
  };

  const shouldLimitStimuli = (feature: 'notifications' | 'parallax' | 'autoplay' | 'flashing') => {
    return calmModeService.shouldLimitStimuli(feature);
  };

  const contextValue: CalmModeContextType = {
    calmMode,
    accessibility,
    updateCalmMode,
    updateAccessibility,
    enableCalmMode,
    disableCalmMode,
    getCSSClasses,
    getButtonSize,
    shouldLimitStimuli
  };

  return (
    <CalmModeContext.Provider value={contextValue}>
      {children}
    </CalmModeContext.Provider>
  );
};