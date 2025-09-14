import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Calendar, Bell, Home, Flower, Brain, Search, Heart, Inbox, Wrench, Bot, MapPin, List, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CompactThemeToggle } from '@/components/ThemeToggle';
import { useBubbleStore } from '@/stores/bubbleStore';
import { GlimmerNotificationSystem } from '@/components/GlimmerNotificationSystem';
import { OfflineDetector } from '@/components/OfflineDetector';
import { OfflineStatusBanner } from '@/components/OfflineStatusBanner';
import { AudioQueueIndicator } from '@/components/AudioQueueIndicator';
import { PhotoDebugPanel } from '@/components/PhotoDebugPanel';
import { CleanHouseHeaderTimer } from '@/components/CleanHouseHeaderTimer';
import { PomodoroHeaderTimer } from '@/components/PomodoroHeaderTimer';
import { HeaderVoiceCapture } from '@/components/HeaderVoiceCapture';
import { OnboardingProgressIndicator } from '@/components/OnboardingProgressIndicator';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';
import { SmartAIAssistant } from '@/components/SmartAIAssistant';
import { ViewModeToggle } from '@/components/ViewModeToggle';

import NarrativeSearch from '@/components/NarrativeSearch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { settings } = useBubbleStore();
  const { state: onboardingState, skipProgression, rewindToDay } = useProgressiveOnboarding();
  
  const [showSearch, setShowSearch] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  const navItems = [
    { path: '/', icon: Home, label: 'Canvas' },
    { path: '/timeline', icon: Calendar, label: 'Timeline' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/email', icon: Inbox, label: 'Email' },
    { path: '/reminders', icon: Bell, label: 'Reminders' },
    { path: '/joy', icon: Heart, label: 'Joy' },
    { path: '/intelligence', icon: MapPin, label: 'Intelligence' },
    { path: '/tools', icon: Wrench, label: 'Tools' },
    { path: '/inbox', icon: Inbox, label: 'Inbox' },
    { path: '/reflection', icon: Flower, label: 'Reflect' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    ...(settings.intelligenceEnabled ? [
      { path: '/cbt-worksheet', icon: Brain, label: 'CBT' },
    ] : []),
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border/50 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">Bubble Universe</h1>
          <OnboardingProgressIndicator 
            onboardingState={onboardingState}
            onSkipProgression={skipProgression}
            onRewindToDay={rewindToDay}
          />
        </div>
        
        {/* View Mode Toggle - Center */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <ViewModeToggle />
        </div>
        
        <div className="flex items-center gap-2">
            <CleanHouseHeaderTimer />
            <PomodoroHeaderTimer />
            <HeaderVoiceCapture />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAIAssistant(true)}
            className="h-8 w-8 p-0"
            title="AI Assistant"
          >
            <Bot className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = '/search'}
            className="h-8 w-8 p-0"
          >
            <Search className="h-4 w-4" />
          </Button>
          <CompactThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="h-full flex flex-col">
          <div className="container mx-auto p-4 flex-shrink-0">
            <OfflineStatusBanner />
          </div>
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
        <GlimmerNotificationSystem />
        <OfflineDetector />
        <AudioQueueIndicator />
      </main>

      {/* AI Assistant Modal */}
      <Dialog open={showAIAssistant} onOpenChange={setShowAIAssistant}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] flex flex-col p-0">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border">
              <DialogTitle>AI Assistant</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Your empathetic AI companion, always ready to help
              </p>
            </div>
            <div className="flex-1 overflow-hidden">
              <SmartAIAssistant />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Narrative Search Modal - kept for compatibility */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Search is now available as a dedicated page with more features!
            </p>
            <Button onClick={() => {
              setShowSearch(false);
              window.location.href = '/search';
            }}>
              Go to Search Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation */}
      <nav className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-center py-2 px-4 gap-1 overflow-x-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link key={path} to={path}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`flex flex-col items-center gap-1 h-12 px-3 min-w-[60px] ${
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