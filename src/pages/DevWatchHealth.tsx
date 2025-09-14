/**
 * /dev/watch-health - Extended watch health monitoring
 * Shows Calendar & Gmail watch status, expiration, renewals
 * Includes T-1 day renewal plans and fallback status
 * Enhanced for P0: Calendar-specific metrics and 410 Gone recovery
 */

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, Calendar, Mail, AlertTriangle, CheckCircle } from 'lucide-react';
import { WatchHealthPanel } from '@/components/WatchHealthPanel';
import { WatchHealthControls } from '@/components/WatchHealthControls';
import { calendarHealthService } from '@/services/calendarHealthService';
import { isFeatureEnabled } from '@/config/flags';

interface CalendarWatchMetrics {
  calendarAccounts: number;
  activeWatches: number;
  expiringWithin24h: number;
  syncErrors: number;
  lastSyncSuccess: string | null;
}

export default function DevWatchHealth() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [calendarMetrics, setCalendarMetrics] = useState<CalendarWatchMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    loadCalendarMetrics();
  };

  const loadCalendarMetrics = async () => {
    setLoading(true);
    try {
      const health = await calendarHealthService.getHealthMetrics();
      setCalendarMetrics({
        calendarAccounts: health.totalAccounts,
        activeWatches: health.activeWatches,
        expiringWithin24h: health.expiringSoon,
        syncErrors: health.syncErrors,
        lastSyncSuccess: health.lastOverallSync || null
      });
    } catch (error) {
      console.error('Failed to load calendar metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendarMetrics();
  }, []);

  if (!isFeatureEnabled('watchHealth')) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Watch Health Monitor</h1>
            <p className="text-muted-foreground">
              This feature is currently disabled. Enable the 'watchHealth' flag to access watch monitoring.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Watch Health Monitor</h1>
            <p className="text-muted-foreground">
              Calendar & Gmail watch status, renewals, 410 Gone recovery, and testing
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Metrics
          </Button>
        </div>

        {/* Calendar-Specific Health Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Calendar Accounts</p>
                  <p className="text-2xl font-bold">{calendarMetrics?.calendarAccounts || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {(calendarMetrics?.activeWatches || 0) > 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium">Active Watches</p>
                  <p className="text-2xl font-bold">{calendarMetrics?.activeWatches || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Expiring (24h)</p>
                  <p className="text-2xl font-bold">{calendarMetrics?.expiringWithin24h || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Sync Errors</p>
                  <p className="text-2xl font-bold">{calendarMetrics?.syncErrors || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expiring Watch Alert */}
        {calendarMetrics && calendarMetrics.expiringWithin24h > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {calendarMetrics.expiringWithin24h} watch channel(s) expiring within 24 hours. 
              T-1 day renewal should be triggered automatically.
            </AlertDescription>
          </Alert>
        )}
        
        <Tabs defaultValue="status" className="space-y-6">
          <TabsList>
            <TabsTrigger value="status">Watch Status</TabsTrigger>
            <TabsTrigger value="controls">Recovery & Controls</TabsTrigger>
            <TabsTrigger value="calendar">Calendar Metrics</TabsTrigger>
          </TabsList>
          
          <TabsContent value="status" className="space-y-6">
            <WatchHealthPanel key={refreshKey} />
          </TabsContent>
          
          <TabsContent value="controls" className="space-y-6">
            <WatchHealthControls onRefresh={handleRefresh} />
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Calendar Integration Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Last Sync Success</p>
                    <p className="text-lg">
                      {calendarMetrics?.lastSyncSuccess 
                        ? calendarMetrics.lastSyncSuccess
                        : 'Never'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Watch Health</p>
                    <Badge variant={
                      calendarMetrics?.activeWatches === calendarMetrics?.calendarAccounts 
                        ? "default" 
                        : "destructive"
                    }>
                      {calendarMetrics?.activeWatches === calendarMetrics?.calendarAccounts 
                        ? "All Healthy" 
                        : "Degraded"
                      }
                    </Badge>
                  </div>
                </div>
                
                {calendarMetrics?.syncErrors && calendarMetrics.syncErrors > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {calendarMetrics.syncErrors} accounts have sync errors. Check individual account status.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}