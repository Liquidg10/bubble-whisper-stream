/**
 * P9 - Watch Health Production Service  
 * Production enablement for Calendar/Gmail watch renewal and health monitoring
 * Handles T-1 day renewals, 410 Gone recovery, and production health diagnostics
 */

import { supabase } from '@/integrations/supabase/client';
import { calendarHealthService } from '@/services/calendarHealthService';
import { gmailHealthService } from '@/services/gmailHealthService';
import { watchRenewalService } from '@/services/watchRenewalService';
import { logger } from '@/utils/logger';

export interface ProductionWatchHealth {
  calendar: {
    totalAccounts: number;
    activeWatches: number;
    expiringIn24h: number;
    failed410Recovery: number;
    lastRenewalCheck: number;
  };
  gmail: {
    totalAccounts: number;
    activeWatches: number;
    expiringIn24h: number;
    failed410Recovery: number;
    lastSyncError: number;
  };
  renewal: {
    scheduledRenewals: number;
    successfulRenewals24h: number;
    failedRenewals24h: number;
    nextRenewalTime?: number;
  };
}

export class WatchHealthProductionService {
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private renewalJobInterval?: ReturnType<typeof setInterval>;
  private running = false;
  private generation = 0;
  private startup: Promise<void> | null = null;
  // Retain pending work across stops/restarts: clearing timers does not cancel
  // an already dispatched provider request, and new ticks must not overlap it.
  private maintenanceInFlight: Promise<void> | null = null;
  private recoveriesInFlight = new Map<string, Promise<void>>();

  /**
   * Start production watch health monitoring
   * P9: Production enablement with automated renewals
   */
  startProductionMonitoring(): Promise<void> {
    if (this.running) return this.startup ?? Promise.resolve();
    this.running = true;
    const generation = ++this.generation;
    const promise = this.startGeneration(generation).catch(error => {
      if (this.isCurrentGeneration(generation)) this.stopProductionMonitoring();
      throw error;
    }).finally(() => {
      if (this.startup === promise) this.startup = null;
    });
    this.startup = promise;
    return promise;
  }

  private isCurrentGeneration(generation: number): boolean {
    return this.running && this.generation === generation;
  }

  private async startGeneration(generation: number): Promise<void> {
    logger.info('Starting production watch health monitoring (P9)');

    // Start automated watch renewal service
    await watchRenewalService.startWatchRenewal();
    if (!this.isCurrentGeneration(generation)) return;

    // Health check every 30 minutes
    this.healthCheckInterval = setInterval(() => {
      void this.performHealthCheck(generation);
    }, 30 * 60 * 1000);

    // Renewal job check every hour  
    this.renewalJobInterval = setInterval(() => {
      void this.checkRenewalJobs(generation);
    }, 60 * 60 * 1000);

    // Initial health check
    await this.performHealthCheck(generation);
  }

  /**
   * Stop production monitoring
   */
  stopProductionMonitoring(): void {
    logger.info('Stopping production watch health monitoring');
    this.running = false;
    ++this.generation;
    this.startup = null;
    
    if (this.healthCheckInterval !== undefined) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    if (this.renewalJobInterval !== undefined) {
      clearInterval(this.renewalJobInterval);
      this.renewalJobInterval = undefined;
    }
    watchRenewalService.stopWatchRenewal();
    // Pending maintenance/recovery is deliberately retained until its promises
    // settle. This stops follow-on work; it is not a provider drain receipt.
  }

  private runMaintenance(generation: number, operation: () => Promise<void>): Promise<void> {
    if (!this.isCurrentGeneration(generation)) return Promise.resolve();
    if (this.maintenanceInFlight) return this.maintenanceInFlight;
    const promise = operation().finally(() => {
      if (this.maintenanceInFlight === promise) this.maintenanceInFlight = null;
    });
    this.maintenanceInFlight = promise;
    return promise;
  }

  /**
   * Get comprehensive production watch health status
   */
  async getProductionHealthStatus(): Promise<ProductionWatchHealth> {
    try {
      // Get calendar health
      const calendarMetrics = await calendarHealthService.getHealthMetrics();
      const calendarAccounts = await calendarHealthService.getAccountHealthStatus();
      
      // Get Gmail health  
      const gmailMetrics = await gmailHealthService.getHealthMetrics();
      const gmailAccounts = await gmailHealthService.getAccountHealthStatus();
      
      // Get renewal service status
      const renewalStatus = await watchRenewalService.getWatchRenewalStatus();
      
      // Count expiring watches (next 24 hours)
      const now = Date.now();
      const tomorrow = now + 24 * 60 * 60 * 1000;
      
      const calendarExpiring = calendarAccounts.filter(account => 
        account.watchExpiresAt && new Date(account.watchExpiresAt).getTime() <= tomorrow
      ).length;
      
      const gmailExpiring = gmailAccounts.filter(account =>
        account.watchExpiresAt && new Date(account.watchExpiresAt).getTime() <= tomorrow  
      ).length;

      // Get recent renewal stats
      const renewalStats = await this.getRenewalStats();

      return {
        calendar: {
          totalAccounts: calendarMetrics.totalAccounts,
          activeWatches: calendarMetrics.activeWatches,
          expiringIn24h: calendarExpiring,
          failed410Recovery: await this.count410RecoveryFailures('calendar'),
          lastRenewalCheck: now
        },
        gmail: {
          totalAccounts: gmailMetrics.totalAccounts,
          activeWatches: gmailMetrics.activeWatches, 
          expiringIn24h: gmailExpiring,
          failed410Recovery: await this.count410RecoveryFailures('gmail'),
          lastSyncError: typeof gmailMetrics.lastSyncAt === 'number' ? gmailMetrics.lastSyncAt : 0
        },
        renewal: {
          scheduledRenewals: renewalStatus.scheduledRenewals,
          successfulRenewals24h: renewalStats.successful,
          failedRenewals24h: renewalStats.failed,
          nextRenewalTime: renewalStatus.nextRenewal?.getTime()
        }
      };

    } catch (error) {
      logger.error('Failed to get production watch health status', error);
      throw error;
    }
  }

  /**
   * Perform automated health checks and request coordinated renewal scheduling
   */
  private performHealthCheck(generation: number): Promise<void> {
    return this.runMaintenance(generation, () => this.performHealthCheckForGeneration(generation));
  }

  private async performHealthCheckForGeneration(generation: number): Promise<void> {
    try {
      logger.info('Performing production watch health check');
      
      const health = await this.getProductionHealthStatus();
      if (!this.isCurrentGeneration(generation)) return;
      
      // Alert on critical issues
      if (health.calendar.expiringIn24h > 0) {
        logger.warn(`${health.calendar.expiringIn24h} calendar watches expiring in 24h`);
      }
      
      if (health.gmail.expiringIn24h > 0) {
        logger.warn(`${health.gmail.expiringIn24h} Gmail watches expiring in 24h`);
      }
      
      if (health.renewal.failedRenewals24h > 5) {
        logger.error(`High renewal failure rate: ${health.renewal.failedRenewals24h} failures in 24h`);
      }

      // The shared coordinator owns account admission and uncertainty holds.
      // Do not bypass it with a second automatic provider-renewal loop here.
      if (this.isCurrentGeneration(generation)) {
        await watchRenewalService.refreshRenewalSchedule();
      }

    } catch (error) {
      logger.error('Production health check failed', error);
    }
  }

  /**
   * Check and trigger renewal jobs
   */
  private checkRenewalJobs(generation: number): Promise<void> {
    return this.runMaintenance(generation, () => this.checkRenewalJobsForGeneration(generation));
  }

  private async checkRenewalJobsForGeneration(generation: number): Promise<void> {
    try {
      logger.info('Checking renewal jobs');
      if (this.isCurrentGeneration(generation)) {
        await watchRenewalService.refreshRenewalSchedule();
      }
    } catch (error) {
      logger.error('Renewal job check failed', error);
    }
  }

  /**
   * Count 410 Gone recovery failures in the last 24 hours
   */
  private async count410RecoveryFailures(provider: 'calendar' | 'gmail'): Promise<number> {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('sync_logs')
        .select('id')
        .eq('provider', provider)
        .eq('status', 'error')
        .ilike('error_message', '%410%')
        .gte('created_at', yesterday);

      if (error) {
        logger.error(`Failed to count 410 recovery failures for ${provider}`, error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      logger.error(`Error counting 410 recovery failures for ${provider}`, error);
      return 0;
    }
  }

  /**
   * Get renewal statistics for the last 24 hours
   */
  private async getRenewalStats(): Promise<{ successful: number; failed: number }> {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: successful } = await supabase
        .from('sync_logs')
        .select('id')
        .eq('operation', 'watch_renewal')
        .eq('status', 'success')
        .gte('created_at', yesterday);

      const { data: failed } = await supabase
        .from('sync_logs')
        .select('id')
        .eq('operation', 'watch_renewal')
        .eq('status', 'error')
        .gte('created_at', yesterday);

      return {
        successful: successful?.length || 0,
        failed: failed?.length || 0
      };
    } catch (error) {
      logger.error('Failed to get renewal stats', error);
      return { successful: 0, failed: 0 };
    }
  }

  /**
   * Explicit operator-requested 410 recovery, separate from automatic renewal.
   * This does not inherit the coordinator's automatic uncertainty/admission
   * guarantee. A lifecycle stop still prevents the next recovery stage.
   */
  handle410GoneRecovery(accountId: string, provider: 'calendar' | 'gmail'): Promise<void> {
    const key = `${provider}:${accountId}`;
    const existing = this.recoveriesInFlight.get(key);
    if (existing) return existing;
    // Explicit recovery remains callable while automatic monitoring is stopped.
    // A subsequent stop invalidates its next stage without cancelling the call
    // already sent to the provider.
    const generation = this.generation;
    const promise = this.perform410GoneRecovery(accountId, provider, generation).finally(() => {
      if (this.recoveriesInFlight.get(key) === promise) this.recoveriesInFlight.delete(key);
    });
    this.recoveriesInFlight.set(key, promise);
    return promise;
  }

  private async perform410GoneRecovery(accountId: string, provider: 'calendar' | 'gmail', generation: number): Promise<void> {
    logger.warn(`Handling explicit 410 Gone recovery for ${provider}`);
    
    try {
      if (provider === 'calendar') {
        // Calendar requires full bounded resync after 410
        await calendarHealthService.triggerBoundedSync(accountId);
        if (this.generation !== generation) throw new Error('Watch recovery stopped before setup');
        await calendarHealthService.setupWatchChannel(accountId);
      } else if (provider === 'gmail') {
        // Gmail requires history reset and new watch  
        await gmailHealthService.triggerSyncWithRecovery(accountId, true);
        if (this.generation !== generation) throw new Error('Watch recovery stopped before setup');
        await gmailHealthService.setupWatchChannel(accountId);
      }
      
      logger.info(`Explicit 410 Gone recovery completed for ${provider}`);
      
    } catch (error) {
      logger.error(`Explicit 410 Gone recovery failed for ${provider}`, error);
      throw error;
    }
  }
}

export const watchHealthProductionService = new WatchHealthProductionService();
