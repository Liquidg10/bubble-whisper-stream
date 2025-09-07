/**
 * PROMPT 10: CBT Metrics Development Page
 * Comprehensive metrics dashboard for dev testing
 */

import React from 'react';
import { CBTMetricsDashboard } from '@/components/CBTMetricsDashboard';

export default function DevCBTMetrics() {
  return (
    <div className="container mx-auto p-6">
      <CBTMetricsDashboard />
    </div>
  );
}