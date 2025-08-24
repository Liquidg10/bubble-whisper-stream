// Simple UI control panel with view menu

import React, { useEffect } from 'react';
import { ViewMenu } from '@/components/ViewMenu';
import { useUILayout } from '@/hooks/useUILayout';
import { useTheme } from '@/hooks/use-theme';

export function UIControlPanel() {
  const {
    togglePanel,
    toggleFocusMode,
    isPanelVisible
  } = useUILayout();
  
  const { themes, setTheme, currentTheme } = useTheme();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      
      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault();
          togglePanel('temporal');
          break;
        case 'm':
          e.preventDefault();
          togglePanel('minimap');
          break;
        case 'f':
          e.preventDefault();
          toggleFocusMode();
          break;
        case 'h':
          e.preventDefault();
          // Cycle through themes
          const currentIndex = themes.findIndex(t => t.id === currentTheme.id);
          const nextIndex = (currentIndex + 1) % themes.length;
          setTheme(themes[nextIndex].id);
          break;
        case 'escape':
          // Close all panels on escape
          e.preventDefault();
          if (isPanelVisible('temporal')) togglePanel('temporal');
          if (isPanelVisible('minimap')) togglePanel('minimap');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel, toggleFocusMode, isPanelVisible, themes, currentTheme, setTheme]);

  return (
    <div className="fixed top-4 right-4 z-30">
      <ViewMenu />
    </div>
  );
}