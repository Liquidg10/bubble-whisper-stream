import React, { createContext, useContext, useEffect, useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';

interface AccessibilitySettings {
  dyslexiaFriendly: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  voiceNavigation: boolean;
  largeText: boolean;
  focusIndicators: boolean;
}

interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  updateSetting: (key: keyof AccessibilitySettings, value: boolean) => void;
  announceText: (text: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
};

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const { settings: globalSettings, updateSettings } = useBubbleStore();
  const [settings, setSettings] = useState<AccessibilitySettings>({
    dyslexiaFriendly: false,
    highContrast: globalSettings?.highContrast ?? false,
    reducedMotion: globalSettings?.reducedMotion ?? false,
    voiceNavigation: false,
    largeText: false,
    focusIndicators: true,
  });

  // Sync with system preferences
  useEffect(() => {
    const updateSystemPreferences = () => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
      
      setSettings(prev => ({
        ...prev,
        reducedMotion: globalSettings?.reducedMotion ?? prefersReducedMotion,
        highContrast: globalSettings?.highContrast ?? prefersHighContrast,
      }));
    };

    updateSystemPreferences();

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: high)');
    
    motionQuery.addEventListener('change', updateSystemPreferences);
    contrastQuery.addEventListener('change', updateSystemPreferences);

    return () => {
      motionQuery.removeEventListener('change', updateSystemPreferences);
      contrastQuery.removeEventListener('change', updateSystemPreferences);
    };
  }, [globalSettings]);

  // Apply CSS classes based on accessibility settings
  useEffect(() => {
    const root = document.documentElement;
    
    // Dyslexia-friendly styling
    if (settings.dyslexiaFriendly) {
      root.style.setProperty('--line-height-text', '1.8');
      root.style.setProperty('--letter-spacing-text', '0.05em');
      root.style.setProperty('--font-family-body', 'OpenDyslexic, Arial, sans-serif');
    } else {
      root.style.removeProperty('--line-height-text');
      root.style.removeProperty('--letter-spacing-text');
      root.style.removeProperty('--font-family-body');
    }

    // Large text scaling
    if (settings.largeText) {
      root.style.setProperty('--text-scale-factor', '1.25');
    } else {
      root.style.removeProperty('--text-scale-factor');
    }

    // High contrast mode
    root.classList.toggle('high-contrast', settings.highContrast);
    
    // Reduced motion
    root.classList.toggle('reduce-motion', settings.reducedMotion);
    
    // Enhanced focus indicators
    root.classList.toggle('enhanced-focus', settings.focusIndicators);

  }, [settings]);

  const updateSetting = (key: keyof AccessibilitySettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    
    // Sync certain settings with global store
    if (key === 'highContrast' || key === 'reducedMotion') {
      updateSettings({ [key]: value });
    }
  };

  const announceText = (text: string) => {
    // Create an aria-live region for screen reader announcements
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = text;
    
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  };

  const value: AccessibilityContextValue = {
    settings,
    updateSetting,
    announceText,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}