/**
 * P1 Masonry/Pinboard View - Main Route Component
 * Provides standalone access to the Masonry view from the app navigation
 */

import React from 'react';
import { MasonryViewAdapter } from '@/views/MasonryViewAdapter';
import { isFeatureEnabled } from '@/config/flags';

export function MasonryView() {
  if (!isFeatureEnabled('pinboardView')) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Pinboard View</h1>
            <p className="text-muted-foreground">
              This view is currently disabled. Enable the 'pinboardView' flag to access the Masonry/Pinboard interface.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Pinboard</h1>
              <p className="text-muted-foreground">
                Visualize unscheduled tasks as floating cards sized by priority
              </p>
            </div>
          </div>
          
          <MasonryViewAdapter className="min-h-[600px]" />
        </div>
      </div>
    </div>
  );
}