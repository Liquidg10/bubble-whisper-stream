/**
 * Phase 4: /dev/offline-lab page
 * Development page for offline simulation and conflict testing
 */

import React from 'react';
import { OfflineLab } from '@/components/dev/OfflineLab';
import { PerfOverlay } from '@/components/dev/PerfOverlay';

export function DevOfflineLabPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Offline Lab</h1>
        <p className="text-muted-foreground">
          Simulate network conditions, test offline scenarios, and validate CRDT conflict resolution.
        </p>
      </div>
      
      <OfflineLab />
      <PerfOverlay />
    </div>
  );
}