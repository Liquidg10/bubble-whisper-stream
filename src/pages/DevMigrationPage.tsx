/**
 * /dev/migration Page - Phase 2 Architecture
 * Comprehensive migration dashboard with parity tracking
 */

import React from 'react';
import { MigrationParityDashboard } from '@/components/dev/MigrationParityDashboard';
import { MergeConflictUI } from '@/components/MergeConflictUI';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function DevMigrationPage() {
  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dashboard">Migration Dashboard</TabsTrigger>
          <TabsTrigger value="conflicts">Merge Conflicts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <MigrationParityDashboard />
        </TabsContent>

        <TabsContent value="conflicts">
          <MergeConflictUI />
        </TabsContent>
      </Tabs>
    </div>
  );
}