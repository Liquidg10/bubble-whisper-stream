import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Calendar, Bell, Home, Flower, Brain, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CompactThemeToggle } from '@/components/ThemeToggle';
import { useBubbleStore } from '@/stores/bubbleStore';
import { GlimmerNotificationSystem } from '@/components/GlimmerNotificationSystem';
import { OfflineDetector } from '@/components/OfflineDetector';
import { OfflineStatusBanner } from '@/components/OfflineStatusBanner';
import { AudioQueueIndicator } from '@/components/AudioQueueIndicator';
import { PhotoDebugPanel } from '@/components/PhotoDebugPanel';

import NarrativeSearch from '@/components/NarrativeSearch';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { intelligenceEnabled } = useBubbleStore();
  
  const [showSearch, setShowSearch] = useState(false);

  const navItems = [
    { path: '/', icon: Home, label: 'Canvas' },
    { path: '/timeline', icon: Calendar, label: 'Timeline' },
    { path: '/reminders', icon: Bell, label: 'Reminders' },
    { path: '/reflection', icon: Flower, label: 'Reflect' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    ...(intelligenceEnabled ? [
      { path: '/cbt-worksheet', icon: Brain, label: 'CBT' },
    ] : []),
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border/50 bg-card/50 backdrop-blur">
        <h1 className="text-lg font-semibold text-foreground">Bubble Universe</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(true)}
            className="h-8 w-8 p-0"
          >
            <Search className="h-4 w-4" />
          </Button>
          <CompactThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="container mx-auto p-4 flex-shrink-0">
            <OfflineStatusBanner />
          </div>
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
        <GlimmerNotificationSystem />
        <OfflineDetector />
        <AudioQueueIndicator />
        {process.env.NODE_ENV === 'development' && <PhotoDebugPanel />}
      </main>

      {/* Narrative Search Modal */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <NarrativeSearch />
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation */}
      <nav className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className={`grid items-center py-2 px-2 ${intelligenceEnabled ? 'grid-cols-6' : 'grid-cols-5'}`}>
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link key={path} to={path} className="flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`w-full flex flex-col items-center gap-1 h-12 ${
                    isActive 
                      ? 'text-primary bg-primary/10' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{label}</span>
                </Button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};