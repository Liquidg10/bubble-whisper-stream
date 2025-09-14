/**
 * P5: Calendar Performance Development Page
 * Unified calendar and Masonry performance metrics dashboard
 */

import React from 'react';
import { CalendarPerformancePanel } from '@/components/calendar/CalendarPerformancePanel';
import { PrivacyLayerInspector } from '@/components/privacy/PrivacyLayerInspector';
import { AutoWriteRateLimitPanel } from '@/components/calendar/AutoWriteRateLimitPanel';
import { WatchHealthPanel } from '@/components/WatchHealthPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isFeatureEnabled } from '@/config/flags';

export default function DevPerfCalendar() {
  if (!isFeatureEnabled('cbtDevRoutes')) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Calendar Performance Dashboard</h1>
            <p className="text-muted-foreground">
              This development page is currently disabled. Enable the 'cbtDevRoutes' flag to access calendar performance monitoring.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Calendar Performance Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor calendar performance, privacy layers, auto-write usage, and watch health
            </p>
          </div>
        </div>

        <Tabs defaultValue="performance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="rate-limits">Rate Limits</TabsTrigger>
            <TabsTrigger value="watch-health">Watch Health</TabsTrigger>
          </TabsList>

          <TabsContent value="performance">
            <CalendarPerformancePanel />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyLayerInspector />
          </TabsContent>

          <TabsContent value="rate-limits">
            <AutoWriteRateLimitPanel />
          </TabsContent>

          <TabsContent value="watch-health">
            <WatchHealthPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}