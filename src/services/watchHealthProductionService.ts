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

class WatchHealthProductionService {
  private healthCheckInterval?: NodeJS.Timeout;
  private renewalJobInterval?: NodeJS.Timeout;

  /**
   * Start production watch health monitoring
   * P9: Production enablement with automated renewals
   */
  async startProductionMonitoring(): Promise<void> {
    logger.info('Starting production watch health monitoring (P9)');

    // Start automated watch renewal service
    await watchRenewalService.startWatchRenewal();

    // Health check every 30 minutes
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30 * 60 * 1000);

    // Renewal job check every hour  
    this.renewalJobInterval = setInterval(async () => {
      await this.checkRenewalJobs();
    }, 60 * 60 * 1000);

    // Initial health check
    await this.performHealthCheck();
  }

  /**
   * Stop production monitoring
   */
  stopProductionMonitoring(): void {
    logger.info('Stopping production watch health monitoring');

    watchRenewalService.stopWatchRenewal();
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    if (this.renewalJobInterval) {
      clearInterval(this.renewalJobInterval);
      this.renewalJobInterval = undefined;
    }
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
      const renewalStatus = watchRenewalService.getWatchRenewalStatus();
      
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
          lastSyncError: gmailMetrics.lastSyncTime || 0
        },
        renewal: {
          scheduledRenewals: renewalStatus.scheduledRenewals,
          successfulRenewals24h: renewalStats.successful,
          failedRenewals24h: renewalStats.failed,
          nextRenewalTime: renewalStatus.nextRenewal
        }
      };

    } catch (error) {
      logger.error('Failed to get production watch health status', error);
      throw error;
    }
  }

  /**
   * Perform automated health check and trigger recovery if needed
   */
  private async performHealthCheck(): Promise<void> {
    try {
      logger.info('Performing production watch health check');
      
      const health = await this.getProductionHealthStatus();
      
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

      // Trigger renewals for expiring watches
      await this.renewExpiringWatches();

    } catch (error) {
      logger.error('Production health check failed', error);
    }
  }

  /**
   * Check and trigger renewal jobs
   */
  private async checkRenewalJobs(): Promise<void> {
    try {
      logger.info('Checking renewal jobs');
      
      // Calendar renewals
      await calendarHealthService.renewAllExpiringChannels();
      
      // Gmail renewals (if service supports it)
      const gmailAccounts = await gmailHealthService.getAccountHealthStatus();
      const expiringGmail = gmailAccounts.filter(account => {
        const expires = account.watchExpiresAt;
        if (!expires) return false;
        const hoursUntilExpiry = (expires - Date.now()) / (1000 * 60 * 60);
        return hoursUntilExpiry <= 24 && hoursUntilExpiry > 0;
      });

      for (const account of expiringGmail) {
        try {
          await gmailHealthService.renewWatchChannel(account.accountId);
          logger.info(`Renewed Gmail watch for account ${account.accountId}`);
        } catch (error) {
          logger.error(`Failed to renew Gmail watch for account ${account.accountId}`, error);
        }
      }

    } catch (error) {
      logger.error('Renewal job check failed', error);
    }
  }

  /**
   * Renew expiring watches proactively
   */
  private async renewExpiringWatches(): Promise<void> {
    const now = Date.now();
    const renewalWindow = now + 24 * 60 * 60 * 1000; // Next 24 hours

    try {
      // Get expiring calendar watches
      const { data: expiringCalendar } = await supabase
        .from('calendar_accounts')
        .select('id, watch_expires_at, account_email')
        .eq('watch_status', 'active')
        .not('watch_expires_at', 'is', null)
        .lte('watch_expires_at', new Date(renewalWindow).toISOString());

      // Renew calendar watches
      if (expiringCalendar) {
        for (const account of expiringCalendar) {
          try {
            await calendarHealthService.renewWatchChannel(account.id);
            logger.info(`Proactively renewed calendar watch for ${account.account_email}`);
          } catch (error) {
            logger.error(`Failed to renew calendar watch for ${account.account_email}`, error);
          }
        }
      }

      // Similar process for Gmail watches
      const { data: expiringGmail } = await supabase
        .from('email_accounts')
        .select('id, watch_expiration, account_email')
        .eq('provider', 'gmail')
        .not('watch_expiration', 'is', null)
        .lte('watch_expiration', new Date(renewalWindow).toISOString());

      if (expiringGmail) {
        for (const account of expiringGmail) {
          try {
            await gmailHealthService.renewWatchChannel(account.id);
            logger.info(`Proactively renewed Gmail watch for ${account.account_email}`);
          } catch (error) {
            logger.error(`Failed to renew Gmail watch for ${account.account_email}`, error);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to renew expiring watches', error);
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
   * Handle 410 Gone error with bounded resync
   * P9: Production 410 recovery per Google docs
   */
  async handle410GoneRecovery(accountId: string, provider: 'calendar' | 'gmail'): Promise<void> {
    logger.warn(`Handling 410 Gone recovery for ${provider} account ${accountId}`);
    
    try {
      if (provider === 'calendar') {
        // Calendar requires full bounded resync after 410
        await calendarHealthService.triggerBoundedSync(accountId);
        await calendarHealthService.setupWatchChannel(accountId);
      } else if (provider === 'gmail') {
        // Gmail requires history reset and new watch  
        await gmailHealthService.triggerSyncWithRecovery(accountId, true);
        await gmailHealthService.setupWatchChannel(accountId);
      }
      
      logger.info(`410 Gone recovery completed for ${provider} account ${accountId}`);
      
    } catch (error) {
      logger.error(`410 Gone recovery failed for ${provider} account ${accountId}`, error);
      throw error;
    }
  }
}

export const watchHealthProductionService = new WatchHealthProductionService();