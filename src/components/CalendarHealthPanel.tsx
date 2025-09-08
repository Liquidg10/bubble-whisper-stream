import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Play,
  Square,
  RotateCcw,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { calendarHealthService, CalendarHealthStatus, CalendarHealthMetrics } from '@/services/calendarHealthService';

export const CalendarHealthPanel: React.FC = () => {
  const [healthStatuses, setHealthStatuses] = useState<CalendarHealthStatus[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<CalendarHealthMetrics | null>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHealthData = async () => {
    try {
      const [statuses, metrics, logs] = await Promise.all([
        calendarHealthService.getAccountHealthStatus(),
        calendarHealthService.getHealthMetrics(),
        calendarHealthService.getRecentSyncLogs(20),
      ]);

      setHealthStatuses(statuses);
      setHealthMetrics(metrics);
      setSyncLogs(logs);
    } catch (error) {
      console.error('Error loading calendar health data:', error);
      toast.error('Failed to load calendar health data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadHealthData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadHealthData();
  };

  const handleTriggerSync = async (accountId: string, fullSync = false) => {
    try {
      await calendarHealthService.triggerSync(accountId, fullSync);
      toast.success(`${fullSync ? 'Full' : 'Incremental'} sync triggered`);
      // Refresh data after a short delay
      setTimeout(() => loadHealthData(), 2000);
    } catch (error: any) {
      toast.error(`Sync failed: ${error.message}`);
    }
  };

  const handleSetupWatch = async (accountId: string) => {
    try {
      await calendarHealthService.setupWatchChannel(accountId);
      toast.success('Watch channel setup initiated');
      setTimeout(() => loadHealthData(), 1000);
    } catch (error: any) {
      toast.error(`Watch setup failed: ${error.message}`);
    }
  };

  const handleStopWatch = async (accountId: string) => {
    try {
      await calendarHealthService.stopWatchChannel(accountId);
      toast.success('Watch channel stopped');
      setTimeout(() => loadHealthData(), 1000);
    } catch (error: any) {
      toast.error(`Watch stop failed: ${error.message}`);
    }
  };

  const handleRenewAllChannels = async () => {
    try {
      await calendarHealthService.renewAllExpiringChannels();
      toast.success('Channel renewal process initiated');
      setTimeout(() => loadHealthData(), 2000);
    } catch (error: any) {
      toast.error(`Channel renewal failed: ${error.message}`);
    }
  };

  const getStatusIcon = (status: CalendarHealthStatus) => {
    if (status.isHealthy) {
      return <CheckCircle className="h-4 w-4 text-success" />;
    }
    if (status.syncStatus === 'error' || status.watchStatus === 'failed') {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  };

  const getSyncStatusBadge = (syncStatus: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'idle': 'outline',
      'syncing': 'default',
      'complete': 'secondary',
      'error': 'destructive',
    };
    return <Badge variant={variants[syncStatus] || 'outline'}>{syncStatus}</Badge>;
  };

  const getWatchStatusBadge = (watchStatus: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'inactive': 'outline',
      'active': 'secondary',
      'expired': 'destructive',
      'failed': 'destructive',
    };
    return <Badge variant={variants[watchStatus] || 'outline'}>{watchStatus}</Badge>;
  };

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendar Health Monitor
            </CardTitle>
            <CardDescription>
              Real-time calendar sync and watch channel status
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRenewAllChannels}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Renew All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="logs">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {healthMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{healthMetrics.totalAccounts}</div>
                    <p className="text-xs text-muted-foreground">Total Accounts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-success">{healthMetrics.activeWatches}</div>
                    <p className="text-xs text-muted-foreground">Active Watches</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-warning">{healthMetrics.expiringSoon}</div>
                    <p className="text-xs text-muted-foreground">Expiring Soon</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-destructive">{healthMetrics.syncErrors}</div>
                    <p className="text-xs text-muted-foreground">Sync Errors</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {healthStatuses.length === 0 ? (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  No calendar accounts connected. Connect a Google Calendar account to start monitoring.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {healthStatuses.map((status) => (
                  <Card key={status.id} className={status.isHealthy ? '' : 'border-warning'}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(status)}
                          <div>
                            <p className="font-medium">{status.accountEmail}</p>
                            <p className="text-sm text-muted-foreground">
                              {status.calendarName || status.calendarId} • {status.eventsCount} events
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getSyncStatusBadge(status.syncStatus)}
                          {getWatchStatusBadge(status.watchStatus)}
                        </div>
                      </div>
                      {status.issues.length > 0 && (
                        <div className="mt-3 p-2 bg-warning/10 rounded-md">
                          <p className="text-sm text-warning-foreground">
                            Issues: {status.issues.join(', ')}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {healthStatuses.map((status) => (
                  <Card key={status.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{status.accountEmail}</h4>
                          <p className="text-sm text-muted-foreground">
                            {status.calendarName || status.calendarId}
                          </p>
                        </div>
                        {getStatusIcon(status)}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Sync Status</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getSyncStatusBadge(status.syncStatus)}
                            <span className="text-xs">
                              {formatTimeAgo(status.lastSyncAt)}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Watch Status</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getWatchStatusBadge(status.watchStatus)}
                            {status.watchExpiresAt && (
                              <span className="text-xs">
                                expires {formatTimeAgo(status.watchExpiresAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4" />
                        <span>{status.eventsCount} events</span>
                        {status.lastSyncError && (
                          <Badge variant="destructive" className="ml-2">
                            Error: {status.lastSyncError}
                          </Badge>
                        )}
                      </div>

                      <Separator className="my-3" />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTriggerSync(status.id, false)}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Sync
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTriggerSync(status.id, true)}
                            className="flex items-center gap-2"
                          >
                            <Zap className="h-3 w-3" />
                            Full Sync
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          {status.watchStatus === 'active' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStopWatch(status.id)}
                              className="flex items-center gap-2"
                            >
                              <Square className="h-3 w-3" />
                              Stop Watch
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetupWatch(status.id)}
                              className="flex items-center gap-2"
                            >
                              <Eye className="h-3 w-3" />
                              Setup Watch
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {syncLogs.map((log, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {log.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {log.operation} ({log.items_processed} items)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(log.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'}>
                        {log.status}
                      </Badge>
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1">
                          {log.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {syncLogs.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No sync activity recorded yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};