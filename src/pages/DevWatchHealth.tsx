/**
 * /dev/watch-health - Extended watch health monitoring
 * Shows Calendar & Gmail watch status, expiration, renewals
 * Includes T-1 day renewal plans and fallback status
 */

import React from 'react';
import { WatchHealthPanel } from '@/components/WatchHealthPanel';

export default function DevWatchHealth() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Watch Health Monitor</h1>
          <p className="text-muted-foreground">
            Calendar & Gmail watch status, renewals, and T-1 day renewal plans
          </p>
        </div>
        
        <WatchHealthPanel />
      </div>
    </div>
  );
}