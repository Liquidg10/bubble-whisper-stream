/**
 * Migration Parity Dashboard - /dev/migration
 * Phase 2: Red/yellow/green field-level tracking with visual metrics
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  Settings,
  Layers,
  GitMerge,
  Clock,
  Zap
} from 'lucide-react';
import { dualWriteMigrationSystem, type MigrationState, type MigrationParity } from '@/services/dualWriteMigrationSystem';
import { useBubbleStore } from '@/stores/bubbleStore';
import { bubbleToTask } from '@/adapters/taskAdapter';
import { toast } from 'sonner';

export function MigrationParityDashboard() {
  const { bubbles } = useBubbleStore();
  const [migrations, setMigrations] = useState<MigrationState[]>([]);
  const [parityData, setParityData] = useState<MigrationParity[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedMigration, setSelectedMigration] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState(dualWriteMigrationSystem.getStatus());

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, [bubbles]);

  const refreshData = async () => {
    setIsAnalyzing(true);
    
    try {
      // Get current migration states
      const currentMigrations = dualWriteMigrationSystem.getAllMigrations();
      setMigrations(currentMigrations);

      // Calculate parity for all bubbles
      const parityResults: MigrationParity[] = [];
      for (const bubble of bubbles) {
        const task = bubbleToTask(bubble);
        const parity = dualWriteMigrationSystem.calculateParity(bubble.id, bubble, task);
        parityResults.push(parity);
      }
      
      setParityData(parityResults);
      setSystemStatus(dualWriteMigrationSystem.getStatus());
      
    } catch (error) {
      console.error('Failed to refresh migration data:', error);
      toast.error('Failed to refresh migration data');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startMigration = (bubbleId: string) => {
    const bubble = bubbles.find(b => b.id === bubbleId);
    if (!bubble) return;

    dualWriteMigrationSystem.createMigration(bubbleId, bubble);
    refreshData();
    toast.success(`Started migration for bubble ${bubbleId.substring(0, 8)}...`);
  };

  const finalizeMigration = (bubbleId: string) => {
    dualWriteMigrationSystem.finalizeMigration(bubbleId);
    refreshData();
    toast.success(`Finalized migration for bubble ${bubbleId.substring(0, 8)}...`);
  };

  const rollbackMigration = (bubbleId: string) => {
    const success = dualWriteMigrationSystem.rollbackMigration(bubbleId);
    if (success) {
      refreshData();
      toast.success(`Rolled back migration for bubble ${bubbleId.substring(0, 8)}...`);
    } else {
      toast.error('Failed to rollback migration');
    }
  };

  const getParityColor = (parity: number): string => {
    if (parity >= 90) return 'text-green-600';
    if (parity >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getParityBadgeVariant = (parity: number): "default" | "secondary" | "destructive" | "outline" => {
    if (parity >= 90) return 'default';
    if (parity >= 70) return 'secondary';
    return 'destructive';
  };

  const getFieldStatusIcon = (match: boolean) => {
    return match ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />;
  };

  const selectedMigrationData = selectedMigration ? migrations.find(m => m.bubbleId === selectedMigration) : null;
  const selectedParityData = selectedMigration ? parityData.find(p => p.bubbleId === selectedMigration) : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Migration Parity Dashboard
          </h1>
          <p className="text-muted-foreground">Field-level tracking of Bubble→Task migration progress</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshData} disabled={isAnalyzing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant={systemStatus.enabled ? "default" : "outline"} 
            size="sm"
            onClick={() => {
              if (systemStatus.enabled) {
                dualWriteMigrationSystem.disable();
              } else {
                dualWriteMigrationSystem.enable();
              }
              setSystemStatus(dualWriteMigrationSystem.getStatus());
            }}
          >
            <Settings className="h-4 w-4 mr-2" />
            {systemStatus.enabled ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <div className="text-2xl font-bold">{systemStatus.activeMigrations}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Layers className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <div className="text-2xl font-bold">{systemStatus.totalMigrations}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-6 w-6 mx-auto mb-2 text-purple-600" />
            <div className="text-2xl font-bold">{systemStatus.avgProgress}%</div>
            <div className="text-sm text-muted-foreground">Avg Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
            <div className="text-2xl font-bold">{systemStatus.totalConflicts}</div>
            <div className="text-sm text-muted-foreground">Conflicts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Database className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
            <div className="text-2xl font-bold">{bubbles.length}</div>
            <div className="text-sm text-muted-foreground">Bubbles</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="parity">Field Parity</TabsTrigger>
          <TabsTrigger value="migrations">Active Migrations</TabsTrigger>
          <TabsTrigger value="testing">Offline Testing</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bubble-Task Parity Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {parityData.map((parity) => (
                  <div 
                    key={parity.bubbleId}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedMigration === parity.bubbleId 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedMigration(parity.bubbleId)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm">
                        {parity.bubbleId.substring(0, 8)}...
                      </span>
                      <Badge variant={getParityBadgeVariant(parity.overallParity)}>
                        {parity.overallParity}%
                      </Badge>
                    </div>
                    <Progress value={parity.overallParity} className="mb-2" />
                    <div className="text-xs text-muted-foreground">
                      {parity.criticalMismatches.length > 0 && (
                        <span className="text-red-600">
                          {parity.criticalMismatches.length} critical mismatches
                        </span>
                      )}
                      {parity.warnings.length > 0 && (
                        <span className="text-yellow-600 ml-2">
                          {parity.warnings.length} warnings
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Field Parity Tab */}
        <TabsContent value="parity" className="space-y-4">
          {selectedParityData ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitMerge className="h-5 w-5" />
                  Field Parity: {selectedParityData.bubbleId.substring(0, 8)}...
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(selectedParityData.fieldParity).map(([field, data]) => (
                    <div key={field} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getFieldStatusIcon(data.match)}
                        <span className="font-medium">{field}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground">
                          Bubble: <code className="text-xs">{JSON.stringify(data.bubbleValue)}</code>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Task: <code className="text-xs">{JSON.stringify(data.taskValue)}</code>
                        </div>
                        <Badge variant={data.match ? "default" : "destructive"}>
                          {Math.round(data.confidence * 100)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Select a bubble from the Overview tab to view field parity</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Active Migrations Tab */}
        <TabsContent value="migrations" className="space-y-4">
          {migrations.length > 0 ? (
            <div className="space-y-4">
              {migrations.map((migration) => (
                <Card key={migration.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Migration: {migration.bubbleId.substring(0, 8)}...
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant={migration.isActive ? "default" : "secondary"}>
                          {migration.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className={`font-bold ${getParityColor(migration.overallProgress)}`}>
                          {migration.overallProgress}%
                        </span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Progress value={migration.overallProgress} />
                    
                    {/* Field Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.values(migration.fields).map((field) => (
                        <div key={field.field} className="flex items-center justify-between p-2 border rounded">
                          <span className="text-sm font-medium">{field.field}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {field.authority}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {field.migrationProgress}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Conflicts */}
                    {migration.conflicts.length > 0 && (
                      <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                        <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                          Conflicts ({migration.conflicts.filter(c => !c.resolved).length} unresolved)
                        </h4>
                        {migration.conflicts.slice(0, 3).map((conflict, idx) => (
                          <div key={idx} className="text-sm text-red-700 dark:text-red-300">
                            {conflict.field}: {conflict.resolved ? '✓ Resolved' : '⚠ Pending'}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {!migration.isActive ? (
                        <Button variant="outline" size="sm" onClick={() => startMigration(migration.bubbleId)}>
                          Restart Migration
                        </Button>
                      ) : (
                        <>
                          <Button variant="default" size="sm" onClick={() => finalizeMigration(migration.bubbleId)}>
                            Finalize
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => rollbackMigration(migration.bubbleId)}>
                            Rollback
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No active migrations</p>
                <Button onClick={() => {
                  // Start migration for first bubble
                  if (bubbles.length > 0) {
                    startMigration(bubbles[0].id);
                  }
                }}>
                  Start Test Migration
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Offline Testing Tab */}
        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Offline/Concurrent Edit Testing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="outline" className="h-20 flex-col">
                  <Database className="h-6 w-6 mb-2" />
                  Simulate Two-Tab Conflict
                </Button>
                <Button variant="outline" className="h-20 flex-col">
                  <AlertTriangle className="h-6 w-6 mb-2" />
                  Force Merge Conflict
                </Button>
                <Button variant="outline" className="h-20 flex-col">
                  <RefreshCw className="h-6 w-6 mb-2" />
                  Test Rollback Scenario
                </Button>
                <Button variant="outline" className="h-20 flex-col">
                  <Activity className="h-6 w-6 mb-2" />
                  Performance Stress Test
                </Button>
              </div>
              
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Test Scenarios</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Two browser tabs editing same bubble offline</li>
                  <li>• Concurrent priority updates from different sources</li>
                  <li>• Tag modifications during active migration</li>
                  <li>• Network interruption during dual-write operations</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}