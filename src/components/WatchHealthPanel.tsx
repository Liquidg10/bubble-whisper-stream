/**
 * Watch Health Panel - Monitor Calendar and Gmail watch renewals
 * Shows expiration countdowns and manual renewal options
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, RefreshCw, AlertTriangle, CheckCircle, Calendar, Mail } from 'lucide-react';
import { calendarHealthService, type CalendarHealthStatus } from '@/services/calendarHealthService';
import { gmailHealthService, type GmailHealthStatus } from '@/services/gmailHealthService';
import { isFeatureEnabled } from '@/config/flags';
import { toast } from 'sonner';

interface WatchStatus {
  id: string;
  type: 'calendar' | 'gmail';
  accountEmail: string;
  serviceName: string;
  status: 'active' | 'expired' | 'expiring' | 'inactive';
  expiresAt?: string;
  timeUntilExpiry?: number;
  hoursUntilExpiry?: number;
  renewalThreshold?: number; // hours
}

export function WatchHealthPanel() {
  const [watchStatuses, setWatchStatuses] = useState<WatchStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadWatchStatuses = async () => {
    try {
      setLoading(true);
      
      const statuses: WatchStatus[] = [];

      // Check if watch health feature is enabled
      if (!isFeatureEnabled('watchHealth')) {
        setWatchStatuses([]);
        return;
      }
      
      // Get calendar account statuses
      const calendarStatuses = await calendarHealthService.getAccountHealthStatus();
      
      const calendarWatches: WatchStatus[] = calendarStatuses.map(account => {
        const expiresAt = account.watchExpiresAt;
        let status: WatchStatus['status'] = 'inactive';
        let hoursUntilExpiry: number | undefined;
        
        if (expiresAt && account.watchStatus === 'active') {
          const expiryTime = new Date(expiresAt).getTime();
          const now = Date.now();
          hoursUntilExpiry = (expiryTime - now) / (1000 * 60 * 60);
          
          if (hoursUntilExpiry <= 0) {
            status = 'expired';
          } else if (hoursUntilExpiry <= 24) { // Calendar: T-1 day
            status = 'expiring';
          } else {
            status = 'active';
          }
        }
        
        return {
          id: account.id,
          type: 'calendar',
          accountEmail: account.accountEmail,
          serviceName: account.calendarName || 'Primary Calendar',
          status,
          expiresAt,
          hoursUntilExpiry,
          renewalThreshold: 24, // Calendar renewal at T-1 day
        };
      });

      statuses.push(...calendarWatches);

      // Get Gmail watch statuses
      try {
        const gmailStatuses = await gmailHealthService.getAccountHealthStatus();
        
        const gmailWatches: WatchStatus[] = gmailStatuses.map(account => {
          const expiresAt = account.watchExpiresAt;
          let status: WatchStatus['status'] = 'inactive';
          let hoursUntilExpiry: number | undefined;
          
          if (expiresAt && account.watchStatus === 'active') {
            const expiryTime = new Date(expiresAt).getTime();
            const now = Date.now();
            hoursUntilExpiry = (expiryTime - now) / (1000 * 60 * 60);
            
            if (hoursUntilExpiry <= 0) {
              status = 'expired';
            } else if (hoursUntilExpiry <= 168) { // Gmail: ≤7 days
              status = 'expiring';
            } else {
              status = 'active';
            }
          }
          
          return {
            id: account.id,
            type: 'gmail',
            accountEmail: account.accountEmail,
            serviceName: `Gmail (${account.labelFilters?.join(', ') || 'All labels'})`,
            status,
            expiresAt,
            hoursUntilExpiry,
            renewalThreshold: 168, // Gmail renewal at ≤7 days
          };
        });

        statuses.push(...gmailWatches);
      } catch (error) {
        console.warn('Gmail health service not available:', error);
      }
      
      setWatchStatuses(statuses);
    } catch (error) {
      console.error('Error loading watch statuses:', error);
      toast.error('Failed to load watch statuses');
    } finally {
      setLoading(false);
    }
  };

  const renewWatch = async (watchStatus: WatchStatus) => {
    try {
      setRefreshing(true);
      
      if (watchStatus.type === 'calendar') {
        await calendarHealthService.renewWatchChannel(watchStatus.id);
        toast.success(`Calendar watch renewed for ${watchStatus.accountEmail}`);
      } else if (watchStatus.type === 'gmail') {
        await gmailHealthService.renewWatchChannel(watchStatus.id);
        toast.success(`Gmail watch renewed for ${watchStatus.accountEmail}`);
      }
      
      await loadWatchStatuses();
    } catch (error) {
      console.error('Error renewing watch:', error);
      toast.error(`Failed to renew watch for ${watchStatus.accountEmail}`);
    } finally {
      setRefreshing(false);
    }
  };

  const renewAllExpiring = async () => {
    try {
      setRefreshing(true);
      await calendarHealthService.renewAllExpiringChannels();
      toast.success('All expiring channels renewed');
      await loadWatchStatuses();
    } catch (error) {
      console.error('Error renewing all channels:', error);
      toast.error('Failed to renew expiring channels');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWatchStatuses();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadWatchStatuses, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: WatchStatus['status']) => {
    switch (status) {
      case 'active': return 'default';
      case 'expiring': return 'destructive';
      case 'expired': return 'destructive';
      case 'inactive': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (type: WatchStatus['type']) => {
    return type === 'calendar' ? Calendar : Mail;
  };

  const formatTimeUntilExpiry = (hours: number) => {
    if (hours < 1) {
      const minutes = Math.floor(hours * 60);
      return `${minutes}m`;
    } else if (hours < 24) {
      return `${Math.floor(hours)}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.floor(hours % 24);
      return `${days}d ${remainingHours}h`;
    }
  };

  const getProgressValue = (watchStatus: WatchStatus) => {
    if (!watchStatus.hoursUntilExpiry || !watchStatus.renewalThreshold) return 0;
    
    const progress = (watchStatus.hoursUntilExpiry / watchStatus.renewalThreshold) * 100;
    return Math.max(0, Math.min(100, progress));
  };

  const expiringCount = watchStatuses.filter(w => w.status === 'expiring' || w.status === 'expired').length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Watch Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading watch statuses...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Watch Health
            {expiringCount > 0 && (
              <Badge variant="destructive">{expiringCount} expiring</Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadWatchStatuses}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            {expiringCount > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={renewAllExpiring}
                disabled={refreshing}
              >
                Renew All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {watchStatuses.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No active watches found
          </div>
        ) : (
          <div className="space-y-4">
            {watchStatuses.map((watchStatus) => {
              const StatusIcon = getStatusIcon(watchStatus.type);
              
              return (
                <div key={watchStatus.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon className="h-4 w-4" />
                      <span className="font-medium">{watchStatus.serviceName}</span>
                      <Badge variant={getStatusColor(watchStatus.status)}>
                        {watchStatus.status}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => renewWatch(watchStatus)}
                      disabled={refreshing}
                    >
                      Renew
                    </Button>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mb-2">
                    {watchStatus.accountEmail}
                  </div>
                  
                  {watchStatus.hoursUntilExpiry !== undefined && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Time until expiry:</span>
                        <span className={watchStatus.status === 'expiring' ? 'text-destructive font-medium' : ''}>
                          {formatTimeUntilExpiry(watchStatus.hoursUntilExpiry)}
                        </span>
                      </div>
                      
                      <Progress 
                        value={getProgressValue(watchStatus)} 
                        className="h-2"
                      />
                      
                      <div className="text-xs text-muted-foreground">
                        Renewal threshold: {watchStatus.renewalThreshold}h 
                        ({watchStatus.type === 'calendar' ? 'T-1 day' : '≤7 days'})
                      </div>
                    </div>
                  )}
                  
                  {watchStatus.status === 'expired' && (
                    <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      Watch has expired and needs immediate renewal
                    </div>
                  )}
                  
                  {watchStatus.status === 'active' && watchStatus.hoursUntilExpiry && watchStatus.hoursUntilExpiry > 48 && (
                    <div className="flex items-center gap-2 mt-2 text-green-600 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Watch is healthy
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}