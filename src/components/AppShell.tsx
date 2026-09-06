import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Calendar, Bell, Home, Flower, Brain, Search, Heart, Inbox, Wrench, Bot, MapPin, Sun, Moon, MoreHorizontal, SlidersHorizontal, Plug } from 'lucide-react';
import { CompactThemeToggle } from '@/components/ThemeToggle';
import { useBubbleStore } from '@/stores/bubbleStore';
import { GlimmerNotificationSystem } from '@/components/GlimmerNotificationSystem';
import { GlimmerNotifications } from '@/components/GlimmerNotifications';
import { OfflineDetector } from '@/components/OfflineDetector';
import { OfflineStatusBanner } from '@/components/OfflineStatusBanner';
import { AudioQueueIndicator } from '@/components/AudioQueueIndicator';
import { CleanHouseHeaderTimer } from '@/components/CleanHouseHeaderTimer';
import { PomodoroHeaderTimer } from '@/components/PomodoroHeaderTimer';
import { HeaderVoiceCapture } from '@/components/HeaderVoiceCaptureUnified';
import { OnboardingProgressIndicator } from '@/components/OnboardingProgressIndicator';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';
import { SmartAIAssistant } from '@/components/SmartAIAssistant';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { AuthStatus } from '@/components/AuthStatus';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const CANVAS_PATHS = new Set(['/', '/list', '/kanban', '/kankav', '/matrix', '/pinboard']);
const PRIMARY_NAV = [
  { path: '/', icon: Home, label: 'Canvas' },
  { path: '/calendar', icon: Calendar, label: 'Calendar' },
  { path: '/inbox', icon: Inbox, label: 'Inbox' },
  { path: '/reflection', icon: Flower, label: 'Reflect' },
];

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { settings } = useBubbleStore();
  const { state: onboardingState, skipProgression, rewindToDay } = useProgressiveOnboarding();
  const [showQuickTools, setShowQuickTools] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [isLight, setIsLight] = useState(() => {
    if (typeof document === 'undefined') return false;
    const saved = localStorage.getItem('mm-color-mode');
    if (saved) return saved === 'light';
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
  });

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', !isLight);
    localStorage.setItem('mm-color-mode', isLight ? 'light' : 'dark');
  }, [isLight]);

  const isCanvasPage = CANVAS_PATHS.has(location.pathname);
  const moreGroups = [
    {
      label: 'Plan & connect',
      items: [
        { path: '/timeline', icon: Calendar, label: 'Timeline' },
        { path: '/reminders', icon: Bell, label: 'Reminders' },
        { path: '/email', icon: Inbox, label: 'Email' },
      ],
    },
    {
      label: 'Explore & support',
      items: [
        { path: '/joy', icon: Heart, label: 'Joy' },
        { path: '/intelligence', icon: MapPin, label: 'Intelligence' },
        { path: '/tools', icon: Wrench, label: 'Tools' },
        ...(settings.intelligenceEnabled ? [{ path: '/cbt-worksheet', icon: Brain, label: 'CBT worksheet' }] : []),
      ],
    },
    {
      label: 'Make it yours',
      items: [{ path: '/settings', icon: Settings, label: 'Settings' }],
    },
  ];
  const isMoreActive = moreGroups.some(group => group.items.some(item => item.path === location.pathname));

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col bg-background">
      <header className="z-20 shrink-0 border-b border-border/50 bg-card/80 px-3 py-2.5 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3">
          <Link to="/" aria-label="Mind Manual home" className="flex min-h-11 min-w-0 items-center rounded-md font-display text-xl tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2xl">
            <h1 className="whitespace-nowrap">Mind <em className="italic text-accent-void">Manual</em></h1>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" asChild className="h-11 w-11 rounded-xl">
              <Link to="/search" aria-label="Search"><Search className="h-[18px] w-[18px]" aria-hidden="true" /></Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowAIAssistant(true)} className="h-11 w-11 rounded-xl" aria-label="Open AI assistant">
              <Bot className="h-[18px] w-[18px]" aria-hidden="true" />
            </Button>
            <Button
              variant={showQuickTools ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setShowQuickTools(value => !value)}
              className="h-11 w-11 rounded-xl"
              aria-label="Quick tools"
              aria-expanded={showQuickTools}
              aria-controls="shell-quick-tools"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* In flow, so the view switcher and active timers never cover the title or actions. */}
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-2 pt-2 empty:hidden [&_button]:min-h-11 [&_button]:min-w-11">
          {isCanvasPage && <ViewModeToggle />}
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
            <CleanHouseHeaderTimer />
            <PomodoroHeaderTimer />
          </div>
        </div>

        {/* Keep capture mounted for its global shortcut while its controls are tucked away. */}
        <section id="shell-quick-tools" aria-label="Quick tools" hidden={!showQuickTools} className="mx-auto mt-3 max-h-[40dvh] max-w-screen-2xl overflow-y-auto border-t border-border/60 pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&_button]:min-h-11 [&_button]:min-w-11 [&_a]:min-h-11">
            <div className="min-w-0 rounded-xl bg-background/60 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Capture a thought</p>
              <HeaderVoiceCapture className="flex-wrap" />
            </div>
            <div className="min-w-0 rounded-xl bg-background/60 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Your space</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsLight(value => !value)} className="gap-2" aria-label="Toggle light and dark mode">
                  {isLight ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
                  {isLight ? 'Dark mode' : 'Light mode'}
                </Button>
                <CompactThemeToggle />
                <Button variant="ghost" size="sm" asChild className="gap-2">
                  <Link to="/settings?tab=accessibility"><Settings className="h-4 w-4" aria-hidden="true" />Accessibility</Link>
                </Button>
              </div>
            </div>
            <div className="min-w-0 rounded-xl bg-background/60 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Account & learning</p>
              <div className="flex flex-wrap items-center gap-2">
                <AuthStatus />
                <Button variant="ghost" size="sm" asChild className="gap-2">
                  <Link to="/settings?tab=integrations"><Plug className="h-4 w-4" aria-hidden="true" />Integrations</Link>
                </Button>
                <OnboardingProgressIndicator onboardingState={onboardingState} onSkipProgression={skipProgression} onRewindToDay={rewindToDay} />
              </div>
            </div>
          </div>
        </section>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-auto" aria-label="Main content">
        <div className={`${location.pathname === '/settings' ? 'min-h-full' : 'h-full'} flex flex-col`}>
          <div className="container mx-auto shrink-0 px-4 [&:has(>*)]:py-2">
            <OfflineStatusBanner />
          </div>
          <div className="min-h-0 min-w-0 flex-1"><Outlet /></div>
        </div>
        {/* Notices remain scrollable content, preserving the home-only saved-message mount. */}
        <aside aria-label="Assistant messages" className="space-y-4">
          <GlimmerNotificationSystem />
          {location.pathname === '/' && <GlimmerNotifications />}
        </aside>
        <OfflineDetector />
        <AudioQueueIndicator />
      </main>

      <Dialog open={showAIAssistant} onOpenChange={setShowAIAssistant}>
        <DialogContent className="flex h-[min(88dvh,850px)] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
            <DialogTitle>AI Assistant</DialogTitle>
            <DialogDescription>A little space to think things through.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden"><SmartAIAssistant /></div>
        </DialogContent>
      </Dialog>

      <nav aria-label="Primary navigation" className="z-20 shrink-0 border-t border-border/60 bg-card/90 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {PRIMARY_NAV.map(({ path, icon: Icon, label }) => {
            const isActive = path === '/' ? isCanvasPage : location.pathname === path;
            return (
              <Link key={path} to={path} aria-current={isActive ? 'page' : undefined} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label="More destinations" className={`h-auto min-h-14 min-w-0 flex-col gap-1 rounded-xl px-1 text-xs font-medium ${isMoreActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'}`}>
                <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" /><span>More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" sideOffset={10} className="max-h-[min(70dvh,560px)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl p-2">
              {moreGroups.map((group, index) => (
                <React.Fragment key={group.label}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{group.label}</DropdownMenuLabel>
                  {group.items.map(({ path, icon: Icon, label }) => (
                    <DropdownMenuItem key={path} asChild className="min-h-11 gap-3 rounded-lg">
                      <Link to={path} aria-current={location.pathname === path ? 'page' : undefined}>
                        <Icon className="h-4 w-4" aria-hidden="true" />{label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </div>
  );
};
