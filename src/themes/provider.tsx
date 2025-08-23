/**
 * Theme Provider - React context for theme management
 * Integrates with CSS custom properties and localStorage persistence
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { themeRegistry, getDefaultTheme } from './registry';
import type { Theme, ThemeContextValue, ThemeProviderProps } from './ThemeTypes';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'bubble-universe-theme';
const MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

export function ThemeProvider({
  children,
  defaultTheme = 'iridescent-soap',
  storageKey = STORAGE_KEY,
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    // SSR-safe initialization
    if (typeof window === 'undefined') {
      return getDefaultTheme();
    }
    
    // Try to load from localStorage
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const theme = themeRegistry.get(saved);
        if (theme) return theme;
      }
    } catch (error) {
      console.warn('Failed to load theme from localStorage:', error);
    }
    
    // Fallback to default
    return themeRegistry.get(defaultTheme) || getDefaultTheme();
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [motionReduced, setMotionReduced] = useState(false);

  // Monitor motion preferences
  useEffect(() => {
    const mediaQuery = window.matchMedia(MOTION_MEDIA_QUERY);
    setMotionReduced(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setMotionReduced(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme to DOM
  const applyTheme = React.useCallback((theme: Theme, skipTransition = false) => {
    const root = document.documentElement;
    
    // Disable transitions temporarily to prevent flash
    if (skipTransition || disableTransitionOnChange) {
      root.style.setProperty('--transition-duration', '0ms');
    }
    
    // Apply CSS custom properties
    Object.entries(theme.tokens).forEach(([key, value]) => {
      // Convert camelCase to kebab-case for CSS variables
      const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVar, value);
    });
    
    // Apply theme class
    root.className = root.className
      .split(' ')
      .filter(cls => !cls.startsWith('theme-'))
      .concat(theme.className || '')
      .filter(Boolean)
      .join(' ');
    
    // Apply motion preferences to behavior flags
    if (motionReduced) {
      root.style.setProperty('--transition-gentle', 'none');
      root.style.setProperty('--transition-bubble', 'none');
      root.style.setProperty('--transition-flow', 'none');
    } else {
      root.style.setProperty('--transition-gentle', theme.tokens.transitionGentle);
      root.style.setProperty('--transition-bubble', theme.tokens.transitionBubble);
      root.style.setProperty('--transition-flow', theme.tokens.transitionFlow);
    }
    
    // Call theme lifecycle hook
    try {
      theme.onApply?.(document);
    } catch (error) {
      console.warn('Theme onApply hook failed:', error);
    }
    
    // Re-enable transitions
    if (skipTransition || disableTransitionOnChange) {
      // Use requestAnimationFrame to ensure the property change is applied
      requestAnimationFrame(() => {
        root.style.removeProperty('--transition-duration');
      });
    }
  }, [motionReduced, disableTransitionOnChange]);

  // Remove theme from DOM
  const removeTheme = React.useCallback((theme: Theme) => {
    try {
      theme.onRemove?.(document);
    } catch (error) {
      console.warn('Theme onRemove hook failed:', error);
    }
  }, []);

  // Theme setter with persistence
  const setTheme = React.useCallback((themeId: string) => {
    const newTheme = themeRegistry.get(themeId);
    if (!newTheme) {
      console.warn(`Theme "${themeId}" not found`);
      return;
    }
    
    // Remove current theme
    removeTheme(currentTheme);
    
    // Apply new theme
    setCurrentTheme(newTheme);
    
    // Persist to localStorage
    try {
      localStorage.setItem(storageKey, themeId);
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error);
    }
  }, [currentTheme, removeTheme, storageKey]);

  // Initialize theme on mount
  useEffect(() => {
    applyTheme(currentTheme, true);
    setIsLoading(false);
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    if (!isLoading) {
      applyTheme(currentTheme);
    }
  }, [currentTheme, applyTheme, isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      removeTheme(currentTheme);
    };
  }, [currentTheme, removeTheme]);

  const contextValue: ThemeContextValue = {
    currentTheme,
    themes: themeRegistry.list(),
    setTheme,
    isLoading,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Convenience hook for theme behavior flags
export function useThemeBehavior() {
  const { currentTheme } = useTheme();
  return currentTheme.behavior;
}

// Convenience hook for motion preferences
export function useMotionPreference() {
  const [motionReduced, setMotionReduced] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(MOTION_MEDIA_QUERY);
    setMotionReduced(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setMotionReduced(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  return motionReduced;
}