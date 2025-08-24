// UI Layout management hook for preventing overlaps and managing panel states

import { useState, useEffect, useCallback } from 'react';

interface PanelState {
  id: string;
  isVisible: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  priority: number; // Higher priority panels stay visible in conflicts
}

interface UILayoutState {
  panels: Record<string, PanelState>;
  focusMode: boolean;
  isMobile: boolean;
}

const DEFAULT_PANELS: Record<string, Omit<PanelState, 'id'>> = {
  temporal: {
    isVisible: true,
    isMinimized: false,
    position: { x: 20, y: 20 },
    size: { width: 320, height: 400 },
    priority: 5
  },
  minimap: {
    isVisible: false,
    isMinimized: false,
    position: { x: -100, y: 20 }, // Negative x means right edge
    size: { width: 96, height: 96 },
    priority: 3
  },
  controls: {
    isVisible: true,
    isMinimized: false,
    position: { x: 20, y: -120 }, // Negative y means bottom edge
    size: { width: 200, height: 100 },
    priority: 4
  },
  performance: {
    isVisible: false,
    isMinimized: false,
    position: { x: -220, y: -120 },
    size: { width: 200, height: 100 },
    priority: 1
  }
};

export function useUILayout() {
  const [uiState, setUIState] = useState<UILayoutState>({
    panels: Object.entries(DEFAULT_PANELS).reduce((acc, [id, panel]) => {
      acc[id] = { ...panel, id };
      return acc;
    }, {} as Record<string, PanelState>),
    focusMode: false,
    isMobile: false
  });

  // Detect mobile and update layout
  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      setUIState(prev => ({ ...prev, isMobile }));
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Toggle panel visibility
  const togglePanel = useCallback((panelId: string) => {
    setUIState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelId]: {
          ...prev.panels[panelId],
          isVisible: !prev.panels[panelId]?.isVisible
        }
      }
    }));
  }, []);

  // Minimize/maximize panel
  const toggleMinimize = useCallback((panelId: string) => {
    setUIState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelId]: {
          ...prev.panels[panelId],
          isMinimized: !prev.panels[panelId]?.isMinimized
        }
      }
    }));
  }, []);

  // Focus mode - hide low priority panels
  const toggleFocusMode = useCallback(() => {
    setUIState(prev => {
      const newFocusMode = !prev.focusMode;
      const updatedPanels = { ...prev.panels };
      
      if (newFocusMode) {
        // Hide panels with priority < 3 in focus mode
        Object.keys(updatedPanels).forEach(id => {
          if (updatedPanels[id].priority < 3) {
            updatedPanels[id] = { ...updatedPanels[id], isVisible: false };
          }
        });
      }
      
      return {
        ...prev,
        focusMode: newFocusMode,
        panels: updatedPanels
      };
    });
  }, []);

  // Get panel style with collision detection
  const getPanelStyle = useCallback((panelId: string) => {
    const panel = uiState.panels[panelId];
    if (!panel) return {};

    const { position, size, isMinimized } = panel;
    
    // Calculate actual position (handle negative values as right/bottom offsets)
    const actualX = position.x < 0 ? `calc(100vw + ${position.x}px)` : `${position.x}px`;
    const actualY = position.y < 0 ? `calc(100vh + ${position.y}px)` : `${position.y}px`;
    
    // Minimized size
    const actualSize = isMinimized 
      ? { width: '48px', height: '48px' }
      : { width: `${size.width}px`, height: `${size.height}px` };

    return {
      position: 'fixed' as const,
      left: actualX,
      top: actualY,
      ...actualSize,
      zIndex: 10 + panel.priority,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      pointerEvents: 'auto' as const
    };
  }, [uiState.panels]);

  // Check if panel should be shown
  const isPanelVisible = useCallback((panelId: string) => {
    const panel = uiState.panels[panelId];
    if (!panel) return false;

    // Hide in focus mode if priority is too low
    if (uiState.focusMode && panel.priority < 3) return false;
    
    // Hide non-essential panels on mobile
    if (uiState.isMobile && panel.priority < 2 && !panel.isVisible) return false;
    
    return panel.isVisible;
  }, [uiState.panels, uiState.focusMode, uiState.isMobile]);

  // Check if panel is minimized
  const isPanelMinimized = useCallback((panelId: string) => {
    return uiState.panels[panelId]?.isMinimized || false;
  }, [uiState.panels]);

  return {
    togglePanel,
    toggleMinimize,
    toggleFocusMode,
    getPanelStyle,
    isPanelVisible,
    isPanelMinimized,
    focusMode: uiState.focusMode,
    isMobile: uiState.isMobile
  };
}