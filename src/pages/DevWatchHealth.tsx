/**
 * /dev/watch-health - Extended watch health monitoring
 * Shows Calendar & Gmail watch status, expiration, renewals
 * Includes T-1 day renewal plans and fallback status
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WatchHealthPanel } from '@/components/WatchHealthPanel';
import { WatchHealthControls } from '@/components/WatchHealthControls';
import { isFeatureEnabled } from '@/config/flags';

export default function DevWatchHealth() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (!isFeatureEnabled('watchHealth')) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Watch Health Monitor</h1>
            <p className="text-muted-foreground">
              This feature is currently disabled. Enable the 'watchHealth' flag to access watch monitoring.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Watch Health Monitor</h1>
          <p className="text-muted-foreground">
            Calendar & Gmail watch status, renewals, 410 Gone recovery, and testing
          </p>
        </div>
        
        <Tabs defaultValue="status" className="space-y-6">
          <TabsList>
            <TabsTrigger value="status">Watch Status</TabsTrigger>
            <TabsTrigger value="controls">Recovery & Controls</TabsTrigger>
          </TabsList>
          
          <TabsContent value="status" className="space-y-6">
            <WatchHealthPanel key={refreshKey} />
          </TabsContent>
          
          <TabsContent value="controls" className="space-y-6">
            <WatchHealthControls onRefresh={handleRefresh} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}