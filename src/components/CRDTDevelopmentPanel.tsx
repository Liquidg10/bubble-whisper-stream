/**
 * CRDT Development Panel - Testing and monitoring interface
 * P17 Implementation: Development-only UI for CRDT pilot testing
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CheckCircle, Clock, Database, Activity, Zap } from 'lucide-react';
import { crdtTaskRepository, type MergeTestResult } from '@/repositories/crdtTaskRepository';
import { crdtMetricsService } from '@/services/crdtMetricsService';
import { crdtTaskService, type OfflineTestResult } from '@/services/crdtTaskService';
import { isFeatureEnabled } from '@/config/flags';

interface MetricCardProps {
  title: string;
  value: string | number;
  variant?: 'default' | 'success' | 'destructive' | 'warning';
  icon?: React.ReactNode;
}

function MetricCard({ title, value, variant = 'default', icon }: MetricCardProps) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-green-500 bg-green-50',
    destructive: 'border-red-500 bg-red-50',
    warning: 'border-yellow-500 bg-yellow-50'
  };

  return (
    <Card className={`p-3 ${variantStyles[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
    </Card>
  );
}

export function CRDTDevelopmentPanel() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [stats, setStats] = useState(crdtTaskRepository.getStats());
  const [realtimeStats, setRealtimeStats] = useState(crdtMetricsService.getRealtimeStats());
  const [performanceStats, setPerformanceStats] = useState(crdtMetricsService.getPerformanceStats());
  const [syncStats, setSyncStats] = useState(crdtMetricsService.getSyncStats());
  const [lastTestResult, setLastTestResult] = useState<MergeTestResult | null>(null);
  const [lastOfflineTest, setLastOfflineTest] = useState<OfflineTestResult | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Check if CRDT pilot feature is enabled
  const crdtPilotEnabled = isFeatureEnabled('crdtPilot');

  useEffect(() => {
    if (!crdtPilotEnabled) return;

    // Update stats every 5 seconds
    const interval = setInterval(() => {
      setStats(crdtTaskRepository.getStats());
      setRealtimeStats(crdtMetricsService.getRealtimeStats());
      setPerformanceStats(crdtMetricsService.getPerformanceStats());
      setSyncStats(crdtMetricsService.getSyncStats());
    }, 5000);

    return () => clearInterval(interval);
  }, [crdtPilotEnabled]);

  const handleToggleCRDT = () => {
    if (isEnabled) {
      crdtTaskRepository.disable();
      setIsEnabled(false);
    } else {
      crdtTaskRepository.enable();
      setIsEnabled(true);
    }
    setStats(crdtTaskRepository.getStats());
  };

  const handleSimulateOfflineChanges = () => {
    crdtTaskRepository.simulateOfflineChanges();
    setStats(crdtTaskRepository.getStats());
  };

  const handleMergeTest = () => {
    setIsRunningTest(true);
    const result = crdtTaskRepository.triggerMergeTest();
    setLastTestResult(result);
    setIsRunningTest(false);
    setStats(crdtTaskRepository.getStats());
  };

  const handleOfflineTest = async () => {
    setIsRunningTest(true);
    const result = await crdtTaskRepository.runTwoTabOfflineTest();
    setLastOfflineTest(result);
    setIsRunningTest(false);
    setStats(crdtTaskRepository.getStats());
  };

  const handleClearAll = () => {
    crdtTaskRepository.clearAllData();
    setStats(crdtTaskRepository.getStats());
    setLastTestResult(null);
    setLastOfflineTest(null);
  };

  const exportMetrics = () => {
    const metrics = crdtMetricsService.exportMetricsForAnalysis();
    const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crdt-metrics-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!crdtPilotEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CRDT Pilot</CardTitle>
          <Badge variant="outline">Feature Disabled</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The CRDT pilot feature is currently disabled. Enable the <code>crdtPilot</code> feature flag to access this panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                CRDT Pilot Testing
              </CardTitle>
              <CardDescription>
                Local-first multi-device task synchronization using Automerge
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Development Only</Badge>
              <Badge variant={stats.enabled ? 'default' : 'secondary'}>
                {stats.enabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CRDT Controls */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">CRDT Status</h4>
              <p className="text-sm text-muted-foreground">
                {stats.enabled ? 'CRDT operations are active' : 'CRDT operations are disabled'}
              </p>
            </div>
            <Button 
              onClick={handleToggleCRDT}
              variant={stats.enabled ? 'destructive' : 'default'}
            >
              {stats.enabled ? 'Disable CRDT' : 'Enable CRDT'}
            </Button>
          </div>

          {stats.enabled && (
            <>
              <Separator />

              {/* Current Stats */}
              <div>
                <h4 className="font-medium mb-3">Current State</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard 
                    title="CRDT Tasks" 
                    value={stats.taskCount}
                    icon={<Database className="h-4 w-4" />}
                  />
                  <MetricCard 
                    title="Device ID" 
                    value={stats.deviceId ? stats.deviceId.slice(-8) : 'None'}
                    icon={<Activity className="h-4 w-4" />}
                  />
                  <MetricCard 
                    title="Total Conflicts" 
                    value={stats.conflicts}
                    variant={stats.conflicts > 0 ? 'warning' : 'success'}
                    icon={<AlertTriangle className="h-4 w-4" />}
                  />
                  <MetricCard 
                    title="Reliability" 
                    value={`${(realtimeStats.reliabilityScore * 100).toFixed(1)}%`}
                    variant={realtimeStats.reliabilityScore > 0.9 ? 'success' : 'warning'}
                    icon={<CheckCircle className="h-4 w-4" />}
                  />
                </div>
              </div>

              <Separator />

              {/* Performance Metrics */}
              <div>
                <h4 className="font-medium mb-3">Performance (Last Hour)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard 
                    title="Avg Duration" 
                    value={`${performanceStats.averageDuration.toFixed(1)}ms`}
                    icon={<Clock className="h-4 w-4" />}
                  />
                  <MetricCard 
                    title="Max Duration" 
                    value={`${performanceStats.maxDuration.toFixed(1)}ms`}
                    variant={performanceStats.maxDuration > 1000 ? 'warning' : 'success'}
                    icon={<Zap className="h-4 w-4" />}
                  />
                  <MetricCard 
                    title="Operations" 
                    value={performanceStats.operationCount}
                    icon={<Activity className="h-4 w-4" />}
                  />
                  <MetricCard 
                    title="Sync Success" 
                    value={`${(syncStats.successRate * 100).toFixed(1)}%`}
                    variant={syncStats.successRate > 0.95 ? 'success' : 'warning'}
                    icon={<CheckCircle className="h-4 w-4" />}
                  />
                </div>
              </div>

              <Separator />

              {/* Testing Controls */}
              <div>
                <h4 className="font-medium mb-3">Testing & Simulation</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h5 className="font-medium mb-2">Offline Changes</h5>
                    <p className="text-sm text-muted-foreground mb-3">
                      Simulate offline task creation and updates
                    </p>
                    <Button 
                      onClick={handleSimulateOfflineChanges}
                      variant="outline"
                      className="w-full"
                    >
                      Simulate Offline Changes
                    </Button>
                  </Card>

                  <Card className="p-4">
                    <h5 className="font-medium mb-2">Merge Test</h5>
                    <p className="text-sm text-muted-foreground mb-3">
                      Test conflict resolution and data integrity
                    </p>
                    <Button 
                      onClick={handleMergeTest}
                      variant="outline"
                      className="w-full"
                      disabled={isRunningTest}
                    >
                      {isRunningTest ? 'Running...' : 'Run Merge Test'}
                    </Button>
                  </Card>
                </div>
              </div>

              {/* Acceptance Criteria Test */}
              <div>
                <h4 className="font-medium mb-3">Acceptance Criteria: Two-Tab Offline Test</h4>
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h5 className="font-medium">Multi-Tab Offline → Merge Test</h5>
                      <p className="text-sm text-muted-foreground">
                        Simulates two tabs offline → concurrent changes → merge without data loss
                      </p>
                    </div>
                    <Button 
                      onClick={handleOfflineTest}
                      disabled={isRunningTest}
                    >
                      {isRunningTest ? 'Testing...' : 'Run Two-Tab Test'}
                    </Button>
                  </div>

                  {lastOfflineTest && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {lastOfflineTest.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium">
                          {lastOfflineTest.success ? 'Test Passed' : 'Test Failed'}
                        </span>
                        <Badge variant={lastOfflineTest.dataLossOccurred ? 'destructive' : 'default'}>
                          {lastOfflineTest.dataLossOccurred ? 'Data Loss' : 'No Data Loss'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>Conflicts: {lastOfflineTest.conflictsDetected}</div>
                        <div>Merge Time: {lastOfflineTest.mergeTimeMs}ms</div>
                        <div>Final Tasks: {lastOfflineTest.finalTaskCount}</div>
                        <div>Missing: {lastOfflineTest.details.missingTasks.length}</div>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* Test Results */}
              {lastTestResult && (
                <div>
                  <h4 className="font-medium mb-3">Last Test Results</h4>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {lastTestResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">
                        {lastTestResult.success ? 'Test Successful' : 'Test Failed'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div className="text-sm">
                        <div className="text-muted-foreground">Conflicts</div>
                        <div className="font-medium">{lastTestResult.conflicts}</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-muted-foreground">Performance</div>
                        <div className="font-medium">{lastTestResult.performanceMs}ms</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-muted-foreground">Data Integrity</div>
                        <div className="font-medium">
                          {lastTestResult.dataIntegrityCheck ? 'Pass' : 'Fail'}
                        </div>
                      </div>
                    </div>
                    {lastTestResult.details.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-1">Details:</div>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {lastTestResult.details.map((detail, index) => (
                            <li key={index}>• {detail}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </div>
              )}

              <Separator />

              {/* Management Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Data Management</h4>
                  <p className="text-sm text-muted-foreground">
                    Export metrics or clear all CRDT data
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={exportMetrics} variant="outline">
                    Export Metrics
                  </Button>
                  <Button onClick={handleClearAll} variant="destructive">
                    Clear All Data
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}