/**
 * Watch Renewal Service
 * Handles automated renewal of Gmail and Calendar push notification watches
 */

import { supabase } from '@/integrations/supabase/client';

interface WatchChannel {
  id: string;
  user_id: string;
  provider: 'google-calendar' | 'gmail';
  resource_id: string;
  channel_id: string;
  expires_at: string;
  account_id: string;
  calendar_id?: string; // For calendar watches
}

class WatchRenewalService {
  private renewalTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start watch renewal monitoring
   */
  async startWatchRenewal(): Promise<void> {
    console.log('Starting watch renewal service...');
    
    // Check for expiring watches every hour
    setInterval(() => {
      this.checkExpiringWatches();
    }, 60 * 60 * 1000); // 1 hour

    // Initial check
    await this.checkExpiringWatches();
  }

  /**
   * Check for watches that need renewal
   */
  private async checkExpiringWatches(): Promise<void> {
    try {
      // Get calendar watches expiring in the next 24 hours
      const { data: calendarWatches } = await supabase
        .rpc('get_expiring_watch_channels', { hours_ahead: 24 });

      // Get Gmail watches expiring in the next 7 days
      const { data: gmailAccounts } = await supabase
        .from('email_accounts')
        .select('*')
        .not('watch_expiration', 'is', null)
        .lt('watch_expiration', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

      // Schedule calendar watch renewals
      if (calendarWatches) {
        for (const watch of calendarWatches) {
          await this.scheduleWatchRenewal({
            id: watch.id,
            user_id: watch.user_id,
            provider: 'google-calendar',
            resource_id: watch.watch_resource_id,
            channel_id: watch.watch_channel_id,
            expires_at: watch.watch_expires_at,
            account_id: watch.id,
            calendar_id: watch.calendar_id
          });
        }
      }

      // Schedule Gmail watch renewals
      if (gmailAccounts) {
        for (const account of gmailAccounts) {
          await this.scheduleWatchRenewal({
            id: account.id,
            user_id: account.user_id,
            provider: 'gmail',
            resource_id: account.watch_resource_id,
            channel_id: account.watch_channel_id,
            expires_at: account.watch_expiration,
            account_id: account.id
          });
        }
      }

      console.log(`Scheduled renewal for ${(calendarWatches?.length || 0) + (gmailAccounts?.length || 0)} watches`);
    } catch (error) {
      console.error('Error checking expiring watches:', error);
    }
  }

  /**
   * Schedule renewal for a specific watch
   */
  private async scheduleWatchRenewal(watch: WatchChannel): Promise<void> {
    const watchKey = `${watch.provider}-${watch.account_id}`;
    
    // Clear existing timer if any
    if (this.renewalTimers.has(watchKey)) {
      clearTimeout(this.renewalTimers.get(watchKey)!);
    }

    const expiresAt = new Date(watch.expires_at);
    const now = new Date();
    
    // Calculate renewal time based on provider
    let renewalTime: Date;
    if (watch.provider === 'google-calendar') {
      // Renew 1 day before expiry
      renewalTime = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);
    } else {
      // Gmail: renew 1 day before expiry (minimum)
      renewalTime = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);
    }

    // If renewal time has already passed, renew immediately
    if (renewalTime <= now) {
      await this.renewWatch(watch);
      return;
    }

    // Schedule the renewal
    const timeUntilRenewal = renewalTime.getTime() - now.getTime();
    const timer = setTimeout(async () => {
      await this.renewWatch(watch);
      this.renewalTimers.delete(watchKey);
    }, timeUntilRenewal);

    this.renewalTimers.set(watchKey, timer);
    
    console.log(`Scheduled ${watch.provider} watch renewal for ${renewalTime.toISOString()}`);
  }

  /**
   * Renew a specific watch
   */
  private async renewWatch(watch: WatchChannel): Promise<void> {
    console.log(`Renewing ${watch.provider} watch for account ${watch.account_id}`);

    try {
      if (watch.provider === 'google-calendar') {
        await this.renewCalendarWatch(watch);
      } else if (watch.provider === 'gmail') {
        await this.renewGmailWatch(watch);
      }
    } catch (error) {
      console.error(`Failed to renew ${watch.provider} watch:`, error);
      
      // Log the failure for manual intervention
      await supabase
        .from('sync_logs')
        .insert({
          user_id: watch.user_id,
          provider: 'google',
          service_type: watch.provider === 'google-calendar' ? 'calendar' : 'gmail',
          operation: 'watch_renewal',
          status: 'error',
          error_message: error.message,
          account_id: watch.account_id,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        });
    }
  }

  /**
   * Renew calendar watch
   */
  private async renewCalendarWatch(watch: WatchChannel): Promise<void> {
    const { data, error } = await supabase.functions.invoke('calendar-watch', {
      body: {
        action: 'renew',
        accountId: watch.account_id,
        calendarId: watch.calendar_id,
        oldChannelId: watch.channel_id,
        oldResourceId: watch.resource_id
      }
    });

    if (error) throw error;
    
    console.log('Calendar watch renewed successfully:', data);
  }

  /**
   * Renew Gmail watch
   */
  private async renewGmailWatch(watch: WatchChannel): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gmail-watch', {
      body: {
        action: 'renew',
        accountId: watch.account_id,
        oldChannelId: watch.channel_id,
        oldResourceId: watch.resource_id
      }
    });

    if (error) throw error;
    
    console.log('Gmail watch renewed successfully:', data);
  }

  /**
   * Stop watch renewal service
   */
  stopWatchRenewal(): void {
    console.log('Stopping watch renewal service...');
    
    // Clear all timers
    for (const timer of this.renewalTimers.values()) {
      clearTimeout(timer);
    }
    this.renewalTimers.clear();
  }

  /**
   * Get renewal status for all watches
   */
  async getWatchRenewalStatus(): Promise<{
    calendarWatches: number;
    gmailWatches: number;
    scheduledRenewals: number;
    nextRenewal?: Date;
  }> {
    const { data: calendarWatches } = await supabase
      .from('calendar_accounts')
      .select('id')
      .eq('watch_status', 'active')
      .not('watch_expires_at', 'is', null);

    const { data: gmailWatches } = await supabase
      .from('email_accounts')
      .select('id')
      .not('watch_expiration', 'is', null);

    // Find the next scheduled renewal
    let nextRenewal: Date | undefined;
    for (const timer of this.renewalTimers.values()) {
      // Note: We can't get the exact time from setTimeout, 
      // so this would need additional tracking in a real implementation
    }

    return {
      calendarWatches: calendarWatches?.length || 0,
      gmailWatches: gmailWatches?.length || 0,
      scheduledRenewals: this.renewalTimers.size,
      nextRenewal
    };
  }
}

export const watchRenewalService = new WatchRenewalService();