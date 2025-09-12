/**
 * P19: Telemetry Dashboard Development Page
 * Unified metrics and canary monitoring
 */

import React from 'react';
import { TelemetryDashboard } from '@/components/TelemetryDashboard';
import { isFeatureEnabled } from '@/config/flags';

export default function DevP19Dashboard() {
  if (!isFeatureEnabled('cbtDevRoutes')) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">P19 Telemetry Dashboard</h1>
            <p className="text-muted-foreground">
              This development page is currently disabled. Enable the 'cbtDevRoutes' flag to access telemetry monitoring.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <TelemetryDashboard />
      </div>
    </div>
  );
}