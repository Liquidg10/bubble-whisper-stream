import { useState, useEffect } from 'react';

export interface AccessibilitySettings {
  announceActions: boolean;
  enforceTargetSize: boolean;
  largeTargets: boolean;
  enforceKeyboardNav: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  auditMode: boolean;
}

/**
 * Hook for managing accessibility settings and enforcement
 */
export const useAccessibilitySettings = () => {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    announceActions: true,
    enforceTargetSize: true,
    largeTargets: false,
    enforceKeyboardNav: true,
    reducedMotion: false,
    highContrast: false,
    auditMode: process.env.NODE_ENV === 'development' // Enable audit mode in development
  });

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('accessibility-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.warn('Failed to parse accessibility settings:', error);
      }
    }

    // Check for system preferences
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setSettings(prev => ({ ...prev, reducedMotion: true }));
    }

    const contrastQuery = window.matchMedia('(prefers-contrast: high)');
    if (contrastQuery.matches) {
      setSettings(prev => ({ ...prev, highContrast: true }));
    }
  }, []);

  const updateSettings = (newSettings: Partial<AccessibilitySettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem('accessibility-settings', JSON.stringify(updated));
      return updated;
    });
  };

  const resetToDefaults = () => {
    const defaults: AccessibilitySettings = {
      announceActions: true,
      enforceTargetSize: true,
      largeTargets: false,
      enforceKeyboardNav: true,
      reducedMotion: false,
      highContrast: false,
      auditMode: process.env.NODE_ENV === 'development'
    };
    setSettings(defaults);
    localStorage.setItem('accessibility-settings', JSON.stringify(defaults));
  };

  return {
    settings,
    updateSettings,
    resetToDefaults
  };
};