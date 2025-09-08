import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, AlertCircle, CheckCircle, Clock, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PlaidConnection {
  id: string;
  item_id: string;
  institution_name: string;
  is_active: boolean;
  created_at: string;
  last_sync_at?: string;
}

interface SyncStatus {
  plaid_item_id: string;
  last_accounts_sync?: string;
  last_transactions_sync?: string;
  last_webhook_received?: string;
  error_count: number;
  last_error?: string;
  is_healthy: boolean;
  next_retry_at?: string;
}

interface PlaidStatusPanelProps {
  connections: PlaidConnection[];
  onRefresh: () => void;
}

export const PlaidStatusPanel: React.FC<PlaidStatusPanelProps> = ({ 
  connections, 
  onRefresh 
}) => {
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const loadSyncStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('plaid_sync_status')
        .select('*');

      if (error) throw error;

      const statusMap = data.reduce((acc, status) => {
        acc[status.plaid_item_id] = status;
        return acc;
      }, {} as Record<string, SyncStatus>);

      setSyncStatuses(statusMap);
    } catch (error) {
      console.error('Failed to load sync statuses:', error);
      toast.error('Failed to load sync status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSyncStatuses();
  }, [connections]);

  const triggerSync = async (connection: PlaidConnection, syncType: 'accounts' | 'transactions') => {
    setSyncing(prev => ({ ...prev, [`${connection.id}-${syncType}`]: true }));

    try {
      const functionName = syncType === 'accounts' ? 'plaid-get-accounts' : 'plaid-get-transactions';
      
      const { error } = await supabase.functions.invoke(functionName, {
        body: { 
          item_id: connection.item_id,
          // For transactions, sync last 30 days
          ...(syncType === 'transactions' && {
            start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          })
        }
      });

      if (error) throw error;

      toast.success(`${syncType} sync completed successfully`);
      await loadSyncStatuses();
    } catch (error: any) {
      console.error(`${syncType} sync failed:`, error);
      toast.error(`${syncType} sync failed: ${error.message}`);
    } finally {
      setSyncing(prev => ({ ...prev, [`${connection.id}-${syncType}`]: false }));
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const getHealthStatus = (status?: SyncStatus) => {
    if (!status) return { label: 'Unknown', color: 'secondary', icon: AlertCircle };
    if (!status.is_healthy) return { label: 'Unhealthy', color: 'destructive', icon: AlertCircle };
    if (status.error_count > 0) return { label: 'Warning', color: 'warning', icon: AlertCircle };
    return { label: 'Healthy', color: 'success', icon: CheckCircle };
  };

  const getConnectionStatus = (connection: PlaidConnection, status?: SyncStatus) => {
    if (!connection.is_active) return { label: 'Disconnected', color: 'destructive', icon: WifiOff };
    if (status?.last_webhook_received) return { label: 'Connected', color: 'success', icon: Wifi };
    return { label: 'Connected', color: 'secondary', icon: Wifi };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Loading Status...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Plaid Sync Status
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {connections.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No Plaid connections found. Connect a bank account to see status information.
          </p>
        ) : (
          connections.map((connection) => {
            const status = syncStatuses[connection.id];
            const health = getHealthStatus(status);
            const connectionStatus = getConnectionStatus(connection, status);
            const HealthIcon = health.icon;
            const ConnectionIcon = connectionStatus.icon;

            return (
              <div key={connection.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{connection.institution_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Connected {formatTimestamp(connection.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={connectionStatus.color as any} className="flex items-center gap-1">
                      <ConnectionIcon className="h-3 w-3" />
                      {connectionStatus.label}
                    </Badge>
                    <Badge variant={health.color as any} className="flex items-center gap-1">
                      <HealthIcon className="h-3 w-3" />
                      {health.label}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="font-medium mb-1">Last Account Sync</p>
                    <p className="text-muted-foreground">
                      {formatTimestamp(status?.last_accounts_sync)}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Last Transaction Sync</p>
                    <p className="text-muted-foreground">
                      {formatTimestamp(status?.last_transactions_sync)}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Last Webhook</p>
                    <p className="text-muted-foreground">
                      {formatTimestamp(status?.last_webhook_received)}
                    </p>
                  </div>
                </div>

                {status?.error_count > 0 && status?.last_error && (
                  <div className="bg-destructive/10 p-3 rounded-md">
                    <p className="text-sm font-medium text-destructive">
                      Recent Error ({status.error_count} total)
                    </p>
                    <p className="text-sm text-destructive/80 mt-1">
                      {status.last_error}
                    </p>
                    {status.next_retry_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Next retry: {formatTimestamp(status.next_retry_at)}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => triggerSync(connection, 'accounts')}
                    disabled={syncing[`${connection.id}-accounts`]}
                  >
                    {syncing[`${connection.id}-accounts`] ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Accounts
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => triggerSync(connection, 'transactions')}
                    disabled={syncing[`${connection.id}-transactions`]}
                  >
                    {syncing[`${connection.id}-transactions`] ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Transactions
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};