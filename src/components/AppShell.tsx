import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Calendar, Bell, Home, Flower, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CompactThemeToggle } from '@/components/ThemeToggle';
import { useBubbleStore } from '@/stores/bubbleStore';
import { GlimmerNotificationSystem } from '@/components/GlimmerNotificationSystem';
import { OfflineDetector } from '@/components/OfflineDetector';
import { OfflineStatusBanner } from '@/components/OfflineStatusBanner';
import { PerformanceMonitor } from '@/components/PerformanceMonitor';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const { intelligenceEnabled } = useBubbleStore();
  const isDev = import.meta.env.DEV;

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
      {/* Theme Toggle Header */}
      <header className="flex justify-end p-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <CompactThemeToggle />
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
        <PerformanceMonitor show={isDev} />
      </main>

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