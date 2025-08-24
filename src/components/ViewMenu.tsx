// Hamburger menu for toggling UI panels and views

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { 
  Menu, 
  Clock, 
  Map, 
  Eye, 
  BarChart3,
  Focus,
  Settings,
  Layers,
  Palette
} from 'lucide-react';
import { useUILayout } from '@/hooks/useUILayout';
import { useTheme } from '@/hooks/use-theme';

export function ViewMenu() {
  const {
    togglePanel,
    toggleFocusMode,
    isPanelVisible,
    focusMode
  } = useUILayout();
  
  const { currentTheme, themes, setTheme } = useTheme();

  const panels = [
    {
      id: 'temporal',
      label: 'Timeline Navigation',
      icon: Clock,
      description: 'View temporal patterns and navigate through time'
    },
    {
      id: 'minimap',
      label: 'Mini Map',
      icon: Map,
      description: 'Overview of bubble universe with navigation'
    }
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-card/80 backdrop-blur-sm border-border/50 hover:bg-accent/20"
        >
          <Menu className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-64 bg-card/95 backdrop-blur-sm border-border/50"
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <Layers className="w-4 h-4" />
          View Options
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        {/* Panel toggles */}
        {panels.map(({ id, label, icon: Icon, description }) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={isPanelVisible(id)}
            onCheckedChange={() => togglePanel(id)}
            className="flex items-start gap-3 p-3"
          >
            <Icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {description}
              </div>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
        
        <DropdownMenuSeparator />
        
        {/* Theme Selection */}
        <DropdownMenuLabel className="flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Theme
        </DropdownMenuLabel>
        {themes.map((theme) => (
          <DropdownMenuCheckboxItem
            key={theme.id}
            checked={currentTheme.id === theme.id}
            onCheckedChange={() => setTheme(theme.id)}
            className="flex items-start gap-3 p-3"
          >
            <div 
              className="w-4 h-4 rounded border mt-0.5 bg-primary"
            />
            <div className="flex-1">
              <div className="font-medium text-sm">{theme.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {theme.description}
              </div>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
        
        <DropdownMenuSeparator />
        
        {/* View modes */}
        <DropdownMenuCheckboxItem
          checked={focusMode}
          onCheckedChange={toggleFocusMode}
          className="flex items-start gap-3 p-3"
        >
          <Focus className="w-4 h-4 mt-0.5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium text-sm">Focus Mode</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Hide non-essential UI elements for distraction-free experience
            </div>
          </div>
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuSeparator />
        
        {/* Keyboard shortcuts info */}
        <div className="px-3 py-2">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Keyboard Shortcuts:
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Timeline</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">T</kbd>
            </div>
            <div className="flex justify-between">
              <span>Mini Map</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">M</kbd>
            </div>
            <div className="flex justify-between">
              <span>Focus Mode</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F</kbd>
            </div>
            <div className="flex justify-between">
              <span>Theme</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">H</kbd>
            </div>
            <div className="flex justify-between">
              <span>Hide All</span>
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">ESC</kbd>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}