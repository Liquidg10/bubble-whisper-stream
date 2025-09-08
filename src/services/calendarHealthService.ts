import { supabase } from "@/integrations/supabase/client";

export interface CalendarHealthStatus {
  id: string;
  accountEmail: string;
  calendarId: string;
  calendarName?: string;
  syncStatus: 'idle' | 'syncing' | 'error' | 'complete';
  watchStatus: 'inactive' | 'active' | 'expired' | 'failed';
  lastSyncAt?: string;
  lastSyncError?: string;
  watchExpiresAt?: string;
  watchChannelId?: string;
  eventsCount?: number;
  isHealthy: boolean;
  issues: string[];
}

export interface CalendarHealthMetrics {
  totalAccounts: number;
  activeWatches: number;
  expiringSoon: number;
  syncErrors: number;
  lastOverallSync?: string;
}

class CalendarHealthService {
  async getAccountHealthStatus(): Promise<CalendarHealthStatus[]> {
    const { data: accounts, error } = await supabase
      .from('calendar_accounts')
      .select(`
        id,
        account_email,
        calendar_id,
        calendar_name,
        sync_status,
        watch_status,
        last_sync_at,
        last_sync_error,
        watch_expires_at,
        watch_channel_id
      `);

    if (error) {
      console.error('Error fetching calendar accounts:', error);
      throw new Error('Failed to fetch calendar health status');
    }

    // Get event counts for each account
    const healthStatuses: CalendarHealthStatus[] = await Promise.all(
      (accounts || []).map(async (account) => {
        const { count: eventsCount } = await supabase
          .from('calendar_events')
          .select('*', { count: 'exact', head: true })
          .eq('calendar_account_id', account.id);

        const issues: string[] = [];
        let isHealthy = true;

        // Check for issues
        if (account.sync_status === 'error') {
          issues.push('Sync failed');
          isHealthy = false;
        }

        if (account.watch_status === 'failed') {
          issues.push('Watch channel failed');
          isHealthy = false;
        }

        if (account.watch_status === 'expired') {
          issues.push('Watch channel expired');
          isHealthy = false;
        }

        if (account.watch_status === 'active' && account.watch_expires_at) {
          const expiresAt = new Date(account.watch_expires_at);
          const now = new Date();
          const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
          
          if (hoursUntilExpiry < 24) {
            issues.push(`Watch expires in ${Math.round(hoursUntilExpiry)} hours`);
          }
        }

        if (account.last_sync_at) {
          const lastSync = new Date(account.last_sync_at);
          const now = new Date();
          const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceSync > 48) {
            issues.push('No sync in 48+ hours');
            isHealthy = false;
          }
        } else {
          issues.push('Never synced');
          isHealthy = false;
        }

        return {
          id: account.id,
          accountEmail: account.account_email,
          calendarId: account.calendar_id || 'primary',
          calendarName: account.calendar_name || undefined,
          syncStatus: account.sync_status as 'idle' | 'syncing' | 'error' | 'complete',
          watchStatus: account.watch_status as 'inactive' | 'active' | 'expired' | 'failed',
          lastSyncAt: account.last_sync_at || undefined,
          lastSyncError: account.last_sync_error || undefined,
          watchExpiresAt: account.watch_expires_at || undefined,
          watchChannelId: account.watch_channel_id || undefined,
          eventsCount: eventsCount || 0,
          isHealthy,
          issues,
        };
      })
    );

    return healthStatuses;
  }

  async getHealthMetrics(): Promise<CalendarHealthMetrics> {
    const healthStatuses = await this.getAccountHealthStatus();

    const totalAccounts = healthStatuses.length;
    const activeWatches = healthStatuses.filter(s => s.watchStatus === 'active').length;
    const syncErrors = healthStatuses.filter(s => s.syncStatus === 'error').length;

    // Count accounts with watches expiring in next 24 hours
    const now = new Date();
    const expiringSoon = healthStatuses.filter(s => {
      if (!s.watchExpiresAt) return false;
      const expiresAt = new Date(s.watchExpiresAt);
      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursUntilExpiry < 24 && hoursUntilExpiry > 0;
    }).length;

    // Find most recent sync
    const lastOverallSync = healthStatuses
      .filter(s => s.lastSyncAt)
      .map(s => s.lastSyncAt!)
      .sort()
      .pop();

    return {
      totalAccounts,
      activeWatches,
      expiringSoon,
      syncErrors,
      lastOverallSync,
    };
  }

  async triggerSync(calendarAccountId: string, fullSync: boolean = false): Promise<void> {
    const { error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        calendarAccountId,
        fullSync,
      },
    });

    if (error) {
      console.error('Error triggering calendar sync:', error);
      throw new Error(`Failed to trigger sync: ${error.message}`);
    }
  }

  async setupWatchChannel(calendarAccountId: string): Promise<void> {
    const { error } = await supabase.functions.invoke('calendar-watch', {
      body: {
        calendarAccountId,
        action: 'setup',
      },
    });

    if (error) {
      console.error('Error setting up watch channel:', error);
      throw new Error(`Failed to setup watch channel: ${error.message}`);
    }
  }

  async renewWatchChannel(calendarAccountId: string): Promise<void> {
    const { error } = await supabase.functions.invoke('calendar-watch', {
      body: {
        calendarAccountId,
        action: 'renew',
      },
    });

    if (error) {
      console.error('Error renewing watch channel:', error);
      throw new Error(`Failed to renew watch channel: ${error.message}`);
    }
  }

  async stopWatchChannel(calendarAccountId: string): Promise<void> {
    const { error } = await supabase.functions.invoke('calendar-watch', {
      body: {
        calendarAccountId,
        action: 'stop',
      },
    });

    if (error) {
      console.error('Error stopping watch channel:', error);
      throw new Error(`Failed to stop watch channel: ${error.message}`);
    }
  }

  async renewAllExpiringChannels(): Promise<void> {
    const { error } = await supabase.functions.invoke('calendar-watch', {
      body: {
        calendarAccountId: '', // Not used for renew action
        action: 'renew',
      },
    });

    if (error) {
      console.error('Error renewing expiring channels:', error);
      throw new Error(`Failed to renew expiring channels: ${error.message}`);
    }
  }

  async getRecentSyncLogs(limit: number = 10): Promise<any[]> {
    const { data: logs, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('provider', 'google')
      .eq('service_type', 'calendar')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching sync logs:', error);
      throw new Error('Failed to fetch sync logs');
    }

    return logs || [];
  }
}

export const calendarHealthService = new CalendarHealthService();