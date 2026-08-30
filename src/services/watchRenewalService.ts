/**
 * Watch Renewal Service
 * Handles automated renewal of Gmail and Calendar push notification watches
 */

import { supabase } from '@/integrations/supabase/client';

interface WatchChannel {
  id: string;
  user_id: string;
  provider: 'google-calendar' | 'gmail';
  resource_id?: string;
  channel_id?: string;
  expires_at: string;
  account_id: string;
  calendar_id?: string; // For calendar watches
}

class WatchRenewalService {
  private renewalTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private scanInFlight: { generation: number; promise: Promise<void> } | null = null;
  // Stop cannot cancel a provider request already admitted. Keep accounting for
  // it across restarts so a new scan cannot overlap the same account's request.
  private activeRenewals = new Set<string>();
  // An invocation error does not prove the provider mutation was rejected.
  // Do not automatically retry that account in this browser session. These
  // holds are not durable receipts: reloading is not reconciliation or proof
  // that a source is drained, and other clients/schedulers remain independent.
  private unresolvedRenewals = new Set<string>();

  /**
   * Start watch renewal monitoring
   */
  startWatchRenewal(): Promise<void> {
    if (this.scanInterval !== null) {
      return this.scanInFlight?.promise ?? Promise.resolve();
    }
    console.log('Starting watch renewal service...');
    const generation = ++this.generation;
    
    // Check for expiring watches every hour
    this.scanInterval = setInterval(() => {
      void this.checkExpiringWatches(generation);
    }, 60 * 60 * 1000); // 1 hour

    // Initial check
    return this.checkExpiringWatches(generation);
  }

  /**
   * Let other background monitors request a fresh inventory through the same
   * scan and per-account admission. This never starts a stopped service and
   * cannot bypass an in-flight request or a session-local uncertainty hold.
   */
  refreshRenewalSchedule(): Promise<void> {
    return this.checkExpiringWatches(this.generation);
  }

  private isCurrentGeneration(generation: number): boolean {
    return this.scanInterval !== null && generation === this.generation;
  }

  private checkExpiringWatches(generation: number): Promise<void> {
    if (!this.isCurrentGeneration(generation)) return Promise.resolve();
    if (this.scanInFlight?.generation === generation) return this.scanInFlight.promise;

    const promise = this.scanExpiringWatches(generation).finally(() => {
      if (this.scanInFlight?.promise === promise) this.scanInFlight = null;
    });
    this.scanInFlight = { generation, promise };
    return promise;
  }

  /**
   * Check for watches that need renewal
   */
  private async scanExpiringWatches(generation: number): Promise<void> {
    try {
      // Get calendar watches expiring in the next 24 hours
      const { data: calendarWatches } = await supabase
        .rpc('get_expiring_watch_channels', { hours_ahead: 24 });
      if (!this.isCurrentGeneration(generation)) return;

      // Gmail's canonical Pub/Sub watch state is separate from the legacy
      // email_accounts/Calendar-channel shape.
      const { data: gmailAccounts } = await supabase
        .from('gmail_watch_subscriptions')
        .select('id,user_id,oauth_account_id,watch_expires_at')
        .eq('status', 'active')
        .not('watch_expires_at', 'is', null)
        .lt('watch_expires_at', new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString());
      if (!this.isCurrentGeneration(generation)) return;

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
          }, generation);
          if (!this.isCurrentGeneration(generation)) return;
        }
      }

      // Schedule Gmail watch renewals
      if (gmailAccounts) {
        for (const account of gmailAccounts) {
          await this.scheduleWatchRenewal({
            id: account.id,
            user_id: account.user_id,
            provider: 'gmail',
            expires_at: account.watch_expires_at!,
            account_id: account.oauth_account_id
          }, generation);
          if (!this.isCurrentGeneration(generation)) return;
        }
      }

      console.log(`Reviewed ${(calendarWatches?.length || 0) + (gmailAccounts?.length || 0)} watches for renewal`);
    } catch {
      if (this.isCurrentGeneration(generation)) console.error('Unable to inventory watch renewals');
    }
  }

  /**
   * Schedule renewal for a specific watch
   */
  private async scheduleWatchRenewal(watch: WatchChannel, generation: number): Promise<void> {
    if (!this.isCurrentGeneration(generation)) return;
    const watchKey = `${watch.provider}-${watch.account_id}`;
    if (this.activeRenewals.has(watchKey) || this.unresolvedRenewals.has(watchKey)) return;
    
    // Clear existing timer if any
    if (this.renewalTimers.has(watchKey)) {
      clearTimeout(this.renewalTimers.get(watchKey)!);
      this.renewalTimers.delete(watchKey);
    }

    const expiresAt = new Date(watch.expires_at);
    if (!Number.isFinite(expiresAt.getTime())) return;
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
      await this.renewWatch(watch, generation);
      return;
    }

    // Schedule the renewal
    const timeUntilRenewal = renewalTime.getTime() - now.getTime();
    const timer = setTimeout(async () => {
      if (this.renewalTimers.get(watchKey) !== timer) return;
      this.renewalTimers.delete(watchKey);
      await this.renewWatch(watch, generation);
    }, timeUntilRenewal);

    this.renewalTimers.set(watchKey, timer);
    
    console.log(`Scheduled ${watch.provider} watch renewal for ${renewalTime.toISOString()}`);
  }

  /**
   * Renew a specific watch
   */
  private async renewWatch(watch: WatchChannel, generation: number): Promise<void> {
    if (!this.isCurrentGeneration(generation)) return;
    const watchKey = `${watch.provider}-${watch.account_id}`;
    if (this.activeRenewals.has(watchKey) || this.unresolvedRenewals.has(watchKey)) return;
    this.activeRenewals.add(watchKey);
    console.log(`Renewing ${watch.provider} watch`);

    try {
      if (watch.provider === 'google-calendar') {
        await this.renewCalendarWatch(watch);
      } else if (watch.provider === 'gmail') {
        await this.renewGmailWatch(watch);
      }
    } catch {
      this.unresolvedRenewals.add(watchKey);
      if (!this.isCurrentGeneration(generation)) return;
      console.error(`Unresolved ${watch.provider} watch renewal; automatic retry held`);
      
      // Persist only a generic uncertainty receipt, never provider payloads.
      // Do not let failure of this secondary log trigger another renewal.
      try {
        await supabase
          .from('sync_logs')
          .insert({
            user_id: watch.user_id,
            provider: 'google',
            service_type: watch.provider === 'google-calendar' ? 'calendar' : 'gmail',
            operation: 'watch_renewal',
            status: 'error',
            error_message: 'Watch renewal outcome unresolved; automatic retry held for this browser session',
            account_id: watch.account_id,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
          });
      } catch {
        if (this.isCurrentGeneration(generation)) console.error('Unable to persist watch renewal uncertainty');
      }
    } finally {
      this.activeRenewals.delete(watchKey);
    }
  }

  /**
   * Renew calendar watch
   */
  private async renewCalendarWatch(watch: WatchChannel): Promise<void> {
    const { data, error } = await supabase.functions.invoke('calendar-watch', {
      body: {
        action: 'renew',
        calendarAccountId: watch.account_id,
        calendarId: watch.calendar_id,
        oldChannelId: watch.channel_id,
        oldResourceId: watch.resource_id
      }
    });

    if (error || data?.success !== true) throw new Error('Calendar watch renewal outcome is unresolved');
  }

  /**
   * Renew Gmail watch
   */
  private async renewGmailWatch(watch: WatchChannel): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gmail-watch', {
      body: {
        action: 'renew',
        accountId: watch.account_id
      }
    });

    if (error || data?.success !== true) throw new Error('Gmail watch renewal outcome is unresolved');
  }

  /**
   * Stop watch renewal service
   */
  stopWatchRenewal(): void {
    console.log('Stopping watch renewal service...');
    ++this.generation;
    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.scanInFlight = null;
    
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
    isRunning: boolean;
    inFlightRenewals: number;
    unresolvedRenewals: number;
    nextRenewal?: Date;
  }> {
    const { data: calendarWatches } = await supabase
      .from('calendar_accounts')
      .select('id')
      .eq('watch_status', 'active')
      .not('watch_expires_at', 'is', null);

    const { data: gmailWatches } = await supabase
      .from('gmail_watch_subscriptions')
      .select('id')
      .eq('status', 'active')
      .not('watch_expires_at', 'is', null);

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
      isRunning: this.scanInterval !== null,
      inFlightRenewals: this.activeRenewals.size,
      unresolvedRenewals: this.unresolvedRenewals.size,
      nextRenewal
    };
  }
}

export const watchRenewalService = new WatchRenewalService();
