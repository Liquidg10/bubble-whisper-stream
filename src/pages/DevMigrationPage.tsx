/**
 * /dev/migration Page - Phase 2 Architecture
 * Comprehensive migration dashboard with parity tracking
 */

import React from 'react';
import { MigrationParityDashboard } from '@/components/dev/MigrationParityDashboard';
import { MergeConflictUI } from '@/components/MergeConflictUI';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SplitViewComposer } from '@/components/SplitViewComposer';
import { ProductionMonitor } from '@/components/ProductionMonitor';

export function DevMigrationPage() {
  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Migration Dashboard</TabsTrigger>
          <TabsTrigger value="conflicts">Merge Conflicts</TabsTrigger>
          <TabsTrigger value="composer">Split Views</TabsTrigger>
          <TabsTrigger value="monitor">Production Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <MigrationParityDashboard />
        </TabsContent>

        <TabsContent value="conflicts">
          <MergeConflictUI />
        </TabsContent>

        <TabsContent value="composer">
          <SplitViewComposer />
        </TabsContent>

        <TabsContent value="monitor">
          <ProductionMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}