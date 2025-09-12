/**
 * Gmail Health Service
 * Manages Gmail watch health monitoring and renewal
 */

import { supabase } from '@/integrations/supabase/client';

export interface GmailHealthStatus {
  id: string;
  accountEmail: string;
  watchStatus: 'active' | 'expired' | 'expiring' | 'inactive';
  watchExpiresAt?: string;
  historyId?: string;
  lastSyncAt?: string;
  syncErrors: number;
  health: 'healthy' | 'warning' | 'error';
  labelFilters?: string[];
}

export interface GmailHealthMetrics {
  totalAccounts: number;
  activeWatches: number;
  expiringWatches: number;
  syncErrors: number;
  lastSyncAt?: string;
}

class GmailHealthService {
  /**
   * Get health status for all Gmail accounts
   */
  async getAccountHealthStatus(): Promise<GmailHealthStatus[]> {
    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select(`
        id,
        account_email,
        watch_expiration,
        watch_channel_id,
        watch_resource_id,
        last_sync_at
      `)
      .eq('provider', 'gmail');

    if (error) {
      console.error('Error fetching Gmail accounts:', error);
      throw error;
    }

    if (!accounts) return [];

    // Get sync error counts
    const { data: syncLogs } = await supabase
      .from('sync_logs')
      .select('account_id, status')
      .eq('service_type', 'gmail')
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const errorCounts = (syncLogs || []).reduce((acc, log) => {
      if (log.status === 'error') {
        acc[log.account_id] = (acc[log.account_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return accounts.map(account => {
      const syncErrors = errorCounts[account.id] || 0;
      const expiresAt = account.watch_expiration;
      let watchStatus: GmailHealthStatus['watchStatus'] = 'inactive';

      if (expiresAt && account.watch_channel_id) {
        const expiryTime = new Date(expiresAt).getTime();
        const now = Date.now();
        const hoursUntilExpiry = (expiryTime - now) / (1000 * 60 * 60);

        if (hoursUntilExpiry <= 0) {
          watchStatus = 'expired';
        } else if (hoursUntilExpiry <= 168) { // Gmail: ≤7 days
          watchStatus = 'expiring';
        } else {
          watchStatus = 'active';
        }
      }

      let health: GmailHealthStatus['health'] = 'healthy';
      if (syncErrors > 5) {
        health = 'error';
      } else if (syncErrors > 2 || watchStatus === 'expiring') {
        health = 'warning';
      }

      return {
        id: account.id,
        accountEmail: account.account_email,
        watchStatus,
        watchExpiresAt: expiresAt,
        historyId: undefined, // Will be added when history_id column exists
        lastSyncAt: account.last_sync_at,
        syncErrors,
        health,
        labelFilters: undefined // Will be added when label_filters column exists
      };
    });
  }

  /**
   * Get aggregated health metrics
   */
  async getHealthMetrics(): Promise<GmailHealthMetrics> {
    const statuses = await this.getAccountHealthStatus();

    const metrics = statuses.reduce(
      (acc, status) => {
        acc.totalAccounts++;
        if (status.watchStatus === 'active') acc.activeWatches++;
        if (status.watchStatus === 'expiring' || status.watchStatus === 'expired') acc.expiringWatches++;
        acc.syncErrors += status.syncErrors;
        
        if (status.lastSyncAt && (!acc.lastSyncAt || status.lastSyncAt > acc.lastSyncAt)) {
          acc.lastSyncAt = status.lastSyncAt;
        }
        
        return acc;
      },
      {
        totalAccounts: 0,
        activeWatches: 0,
        expiringWatches: 0,
        syncErrors: 0,
        lastSyncAt: undefined as string | undefined
      }
    );

    return metrics;
  }

  /**
   * Renew Gmail watch for specific account
   */
  async renewWatchChannel(accountId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gmail-watch', {
      body: {
        action: 'renew',
        accountId
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Set up Gmail watch for specific account
   */
  async setupWatchChannel(accountId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gmail-watch', {
      body: {
        action: 'start',
        accountId
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Stop Gmail watch for specific account
   */
  async stopWatchChannel(accountId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gmail-watch', {
      body: {
        action: 'stop',
        accountId
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Trigger Gmail sync with 410 Gone recovery
   */
  async triggerSyncWithRecovery(accountId: string, fullSync = false): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gmail-sync', {
      body: {
        accountId,
        fullSync,
        handle410: true // Enable 410 Gone recovery
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Update label filters for Gmail account
   */
  async updateLabelFilters(accountId: string, labelFilters: string[]): Promise<void> {
    // Note: This will need label_filters column to be added to email_accounts table
    // For now, we'll store in a placeholder way
    console.log('Label filters would be updated:', { accountId, labelFilters });
    
    // TODO: Once label_filters column exists, uncomment:
    // const { error } = await supabase
    //   .from('email_accounts')
    //   .update({
    //     label_filters: labelFilters,
    //     updated_at: new Date().toISOString()
    //   })
    //   .eq('id', accountId);
    // if (error) throw error;
  }

  /**
   * Get recent sync logs for Gmail
   */
  async getRecentSyncLogs(limit = 50): Promise<any[]> {
    const { data, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('service_type', 'gmail')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Simulate 410 Gone error for testing
   */
  async simulate410Gone(accountId: string): Promise<void> {
    // Mark watch as expired to simulate 410 Gone
    const { error } = await supabase
      .from('email_accounts')
      .update({
        watch_expiration: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
        // Note: history_id column doesn't exist yet, will be added in future migration
      })
      .eq('id', accountId);

    if (error) throw error;

    // Log the simulation
    await supabase
      .from('sync_logs')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        provider: 'google',
        service_type: 'gmail',
        operation: '410_simulation',
        status: 'completed',
        account_id: accountId,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });
  }
}

export const gmailHealthService = new GmailHealthService();