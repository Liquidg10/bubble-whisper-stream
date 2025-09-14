/**
 * Production Monitor Dashboard - Phase 5 Infrastructure
 * Real-time monitoring of performance, sync, and system health
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Cpu, 
  Wifi, 
  Database, 
  Monitor,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  Users,
  Zap,
  Timer,
  HardDrive
} from 'lucide-react';
import { performanceManager, usePerformanceMetrics } from '@/services/performanceManager';
import { realTimeCRDT, useCRDTSync } from '@/services/realTimeCRDT';

export function ProductionMonitor() {
  const { metrics, currentLOD, generateReport } = usePerformanceMetrics();
  const { syncState, connectedDevices, pendingOperations, forceSyncNow } = useCRDTSync();
  const [systemAlerts, setSystemAlerts] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Generate system alerts based on metrics
    const alerts = [];
    
    if (metrics.averageFps < 45) {
      alerts.push({
        type: 'warning',
        message: `Low FPS detected: ${metrics.averageFps}fps (target: 60fps)`,
        action: 'Consider reducing visual effects'
      });
    }

    if (metrics.memory.percentage > 85) {
      alerts.push({
        type: 'error',
        message: `High memory usage: ${metrics.memory.percentage}%`,
        action: 'Memory cleanup recommended'
      });
    }

    if (!syncState.connected) {
      alerts.push({
        type: 'warning',
        message: 'Offline mode - changes queued for sync',
        action: `${pendingOperations.length} operations pending`
      });
    }

    if (pendingOperations.length > 10) {
      alerts.push({
        type: 'error',
        message: `Large sync queue: ${pendingOperations.length} operations`,
        action: 'Manual sync recommended'
      });
    }

    setSystemAlerts(alerts);
  }, [metrics, syncState, pendingOperations]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (syncState.connected) {
        await forceSyncNow();
      }
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const downloadReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      performance: generateReport(),
      sync: {
        state: syncState,
        devices: connectedDevices,
        pendingOps: pendingOperations.length
      },
      alerts: systemAlerts
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getHealthColor = (status: 'excellent' | 'good' | 'fair' | 'poor') => {
    switch (status) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getHealthIcon = (status: 'excellent' | 'good' | 'fair' | 'poor') => {
    switch (status) {
      case 'excellent': 
      case 'good': 
        return <CheckCircle2 className="h-4 w-4" />;
      case 'fair': 
        return <AlertTriangle className="h-4 w-4" />;
      case 'poor': 
        return <XCircle className="h-4 w-4" />;
      default: 
        return <Activity className="h-4 w-4" />;
    }
  };

  const overallHealth = generateReport().performance.overall;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" />
            Production Monitor
          </h1>
          <p className="text-muted-foreground">Real-time system health and performance monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={downloadReport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className={`flex items-center justify-center mb-2 ${getHealthColor(overallHealth)}`}>
              {getHealthIcon(overallHealth)}
            </div>
            <div className="text-2xl font-bold capitalize">{overallHealth}</div>
            <div className="text-sm text-muted-foreground">Overall Health</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <div className="text-2xl font-bold">{metrics.fps}</div>
            <div className="text-sm text-muted-foreground">Current FPS</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <HardDrive className="h-6 w-6 mx-auto mb-2 text-purple-600" />
            <div className="text-2xl font-bold">{metrics.memory.percentage}%</div>
            <div className="text-sm text-muted-foreground">Memory Usage</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Wifi className={`h-6 w-6 mx-auto mb-2 ${syncState.connected ? 'text-green-600' : 'text-red-600'}`} />
            <div className="text-2xl font-bold">{syncState.connected ? 'Online' : 'Offline'}</div>
            <div className="text-sm text-muted-foreground">Sync Status</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
            <div className="text-2xl font-bold">{connectedDevices.length}</div>
            <div className="text-sm text-muted-foreground">Connected Devices</div>
          </CardContent>
        </Card>
      </div>

      {/* System Alerts */}
      {systemAlerts.length > 0 && (
        <div className="space-y-2">
          {systemAlerts.map((alert, idx) => (
            <Alert 
              key={idx} 
              className={`${
                alert.type === 'error' 
                  ? 'border-red-200 bg-red-50 dark:bg-red-950/20' 
                  : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  <strong>{alert.message}</strong>
                  {alert.action && <span className="ml-2 text-sm">• {alert.action}</span>}
                </span>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Tabs defaultValue="performance" className="w-full">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="sync">Sync & CRDT</TabsTrigger>
          <TabsTrigger value="devices">Connected Devices</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Current FPS</span>
                    <span className={metrics.fps >= 55 ? 'text-green-600' : 'text-red-600'}>
                      {metrics.fps}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (metrics.fps / 60) * 100)} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Average FPS</span>
                    <span>{metrics.averageFps}</span>
                  </div>
                  <Progress value={Math.min(100, (metrics.averageFps / 60) * 100)} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Memory Usage</span>
                    <span className={metrics.memory.percentage > 80 ? 'text-red-600' : 'text-green-600'}>
                      {metrics.memory.percentage}%
                    </span>
                  </div>
                  <Progress value={metrics.memory.percentage} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Frame Drops:</span>
                    <span className="ml-2 font-medium">{metrics.frameDrops}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Render Time:</span>
                    <span className="ml-2 font-medium">{metrics.renderTime.toFixed(1)}ms</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Active Animations:</span>
                    <span className="ml-2 font-medium">{metrics.activeAnimations}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">LOD Level:</span>
                    <Badge variant="outline" className="ml-2">{currentLOD}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Level of Detail (LOD)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Current LOD: <Badge variant="outline">{currentLOD}</Badge>
                </div>
                
                <div className="space-y-2">
                  {['high', 'medium', 'low', 'minimal'].map((level) => (
                    <Button
                      key={level}
                      variant={currentLOD === level ? "default" : "outline"}
                      size="sm"
                      className="w-full capitalize"
                      onClick={() => performanceManager.setLOD(level)}
                    >
                      {level} Quality
                    </Button>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground">
                  LOD automatically adjusts based on performance. Manual override available.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sync & CRDT Tab */}
        <TabsContent value="sync" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Sync Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Connection</span>
                  <Badge variant={syncState.connected ? "default" : "destructive"}>
                    {syncState.connected ? 'Connected' : 'Offline'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Pending Operations</span>
                  <Badge variant={pendingOperations.length === 0 ? "default" : "secondary"}>
                    {pendingOperations.length}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Conflicts Detected</span>
                  <Badge variant={syncState.conflictsDetected === 0 ? "default" : "destructive"}>
                    {syncState.conflictsDetected}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Last Sync</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(syncState.lastSync).toLocaleTimeString()}
                  </span>
                </div>

                {!syncState.connected && pendingOperations.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={forceSyncNow}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Force Sync Now
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Operation Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {pendingOperations.slice(0, 10).map((op) => (
                    <div key={op.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {op.type}
                        </Badge>
                        <span className="font-mono text-xs">
                          {op.entityId.substring(0, 8)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {op.offline && <Badge variant="secondary" className="text-xs">Offline</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {new Date(op.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {pendingOperations.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No pending operations
                    </div>
                  )}
                  
                  {pendingOperations.length > 10 && (
                    <div className="text-center text-xs text-muted-foreground">
                      ... and {pendingOperations.length - 10} more
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Connected Devices Tab */}
        <TabsContent value="devices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Connected Devices ({connectedDevices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {connectedDevices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Monitor className="h-4 w-4 text-blue-600" />
                      <div>
                        <div className="font-medium text-sm">{device.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {device.id.substring(0, 16)}...
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={device.isOnline ? "default" : "secondary"}>
                        {device.isOnline ? 'Online' : 'Offline'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(device.lastSeen).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}

                {connectedDevices.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No connected devices detected
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{Math.round(metrics.averageFps)}</div>
                  <div className="text-muted-foreground">Avg FPS (Last 60 frames)</div>
                </div>
                
                <div className="p-3 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {((Date.now() - syncState.lastSync) / 1000 / 60).toFixed(1)}m
                  </div>
                  <div className="text-muted-foreground">Last Sync</div>
                </div>
                
                <div className="p-3 border rounded-lg text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(metrics.memory.used / 1024 / 1024)}MB
                  </div>
                  <div className="text-muted-foreground">Memory Used</div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Performance Summary</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>• System health: <span className="capitalize font-medium">{overallHealth}</span></div>
                  <div>• Current LOD: <span className="font-medium">{currentLOD}</span> quality</div>
                  <div>• Sync queue: <span className="font-medium">{pendingOperations.length}</span> operations</div>
                  <div>• Frame drops: <span className="font-medium">{metrics.frameDrops}</span> in current session</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}