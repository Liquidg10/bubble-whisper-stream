// Central UI control panel for managing panel visibility and layout

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Clock, Eye, Map, Settings, BarChart3 } from 'lucide-react';
import { useUILayout } from '@/hooks/useUILayout';

export function UIControlPanel() {
  const {
    togglePanel,
    toggleFocusMode,
    isPanelVisible,
    focusMode
  } = useUILayout();

  const panels = [
    {
      id: 'temporal',
      icon: Clock,
      label: 'Timeline',
      shortcut: 'T'
    },
    {
      id: 'minimap',
      icon: Map,
      label: 'MiniMap',
      shortcut: 'M'
    }
  ];

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
        case 'escape':
          // Close all panels on escape
          e.preventDefault();
          panels.forEach(panel => {
            if (isPanelVisible(panel.id)) {
              togglePanel(panel.id);
            }
          });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel, toggleFocusMode, isPanelVisible, panels]);

  return (
    <div className="fixed top-4 right-4 flex flex-col gap-2 z-30">
      <div className="flex gap-2">
        {panels.map(({ id, icon: Icon, label, shortcut }) => (
          <Button
            key={id}
            variant={isPanelVisible(id) ? "default" : "outline"}
            size="sm"
            onClick={() => togglePanel(id)}
            className="bg-card/80 backdrop-blur-sm border-border/50 hover:bg-accent/20"
            title={`${label} (${shortcut})`}
          >
            <Icon className="w-4 h-4" />
          </Button>
        ))}
        
        <div className="w-px bg-border/50 my-1" />
        
        <Button
          variant={focusMode ? "default" : "outline"}
          size="sm"
          onClick={toggleFocusMode}
          className="bg-card/80 backdrop-blur-sm border-border/50 hover:bg-accent/20"
          title="Focus Mode (F)"
        >
          <Eye className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}