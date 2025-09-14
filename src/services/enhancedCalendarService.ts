/**
 * P4 Enhanced - Calendar Integration Service
 * Implements Bible features: bounded sync, 410 handling, robust watchers
 */

import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';

export interface CalendarAccount {
  id: string;
  email: string;
  calendarId: string;
  syncToken?: string;
  watchChannelId?: string;
  watchResourceId?: string;
  watchExpiresAt?: number;
  lastSyncAt?: number;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastError?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: string;
  attendees?: Array<{ email: string; responseStatus?: string }>;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface SyncWindow {
  startDate: Date;
  endDate: Date;
  daysBack: number;
  daysForward: number;
}

class EnhancedCalendarService {
  private readonly SYNC_WINDOW_DAYS = 90; // ±90 days as per Bible
  private readonly WATCH_RENEWAL_BUFFER = 24 * 60 * 60 * 1000; // 24 hours
  
  async setupBoundedSync(accountId: string): Promise<SyncWindow> {
    const now = new Date();
    const syncWindow: SyncWindow = {
      startDate: new Date(now.getTime() - (this.SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
      endDate: new Date(now.getTime() + (this.SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
      daysBack: this.SYNC_WINDOW_DAYS,
      daysForward: this.SYNC_WINDOW_DAYS
    };

    logger.info('Calendar bounded sync window established', {
      accountId,
      window: syncWindow,
      totalDays: this.SYNC_WINDOW_DAYS * 2
    });

    return syncWindow;
  }

  async syncCalendarEvents(
    account: CalendarAccount, 
    syncWindow: SyncWindow
  ): Promise<{ events: CalendarEvent[]; nextSyncToken?: string }> {
    if (!isFeatureEnabled('autoWriteCalendar')) {
      return { events: [] };
    }

    try {
      // Prepare sync parameters
      const params = new URLSearchParams({
        timeMin: syncWindow.startDate.toISOString(),
        timeMax: syncWindow.endDate.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime'
      });

      // Add sync token for incremental sync (if available)
      if (account.syncToken) {
        params.append('syncToken', account.syncToken);
        // Remove time bounds when using syncToken (Google requirement)
        params.delete('timeMin');
        params.delete('timeMax');
      }

      // Mock API call structure (would be actual Google Calendar API)
      const response = await this.callCalendarAPI(account, params);
      
      if (response.status === 410) {
        // Handle syncToken invalidation (410 Gone)
        logger.warn('SyncToken invalidated, performing full resync', {
          accountId: account.id,
          calendarId: account.calendarId
        });
        
        return this.handleSyncTokenInvalidation(account, syncWindow);
      }

      const events = response.items || [];
      const nextSyncToken = response.nextSyncToken;

      logger.info('Calendar sync completed', {
        accountId: account.id,
        eventsCount: events.length,
        hasNextSyncToken: !!nextSyncToken
      });

      return { events, nextSyncToken };

    } catch (error) {
      logger.error('Calendar sync failed', {
        accountId: account.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleSyncTokenInvalidation(
    account: CalendarAccount, 
    syncWindow: SyncWindow
  ): Promise<{ events: CalendarEvent[]; nextSyncToken?: string }> {
    // Clear invalid sync token
    account.syncToken = undefined;
    
    // Perform full sync within bounded window
    const params = new URLSearchParams({
      timeMin: syncWindow.startDate.toISOString(),
      timeMax: syncWindow.endDate.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime'
    });

    const response = await this.callCalendarAPI(account, params);
    
    logger.info('Full resync completed after 410 Gone', {
      accountId: account.id,
      eventsCount: response.items?.length || 0
    });

    return {
      events: response.items || [],
      nextSyncToken: response.nextSyncToken
    };
  }

  async renewWatch(account: CalendarAccount): Promise<boolean> {
    if (!account.watchExpiresAt) {
      return false;
    }

    const now = Date.now();
    const timeUntilExpiry = account.watchExpiresAt - now;
    
    // Renew if expiring within 24 hours
    if (timeUntilExpiry > this.WATCH_RENEWAL_BUFFER) {
      return false; // Not yet time to renew
    }

    try {
      // Stop existing watch
      if (account.watchChannelId && account.watchResourceId) {
        await this.stopWatch(account.watchChannelId, account.watchResourceId);
      }

      // Create new watch
      const newWatch = await this.createWatch(account);
      
      // Update account with new watch details
      account.watchChannelId = newWatch.channelId;
      account.watchResourceId = newWatch.resourceId;
      account.watchExpiresAt = newWatch.expiresAt;

      logger.info('Calendar watch renewed successfully', {
        accountId: account.id,
        newExpiresAt: new Date(newWatch.expiresAt).toISOString(),
        timeUntilExpiry: (newWatch.expiresAt - now) / (60 * 60 * 1000) // hours
      });

      return true;

    } catch (error) {
      logger.error('Calendar watch renewal failed', {
        accountId: account.id,
        error: error.message
      });
      return false;
    }
  }

  getHealthStatus(accounts: CalendarAccount[]): {
    healthy: number;
    expiringSoon: number;
    failed: number;
    details: Array<{
      accountId: string;
      status: 'healthy' | 'expiring_soon' | 'expired' | 'error';
      expiresAt?: string;
      lastError?: string;
    }>;
  } {
    const now = Date.now();
    const details = accounts.map(account => {
      if (account.syncStatus === 'error') {
        return {
          accountId: account.id,
          status: 'error' as const,
          lastError: account.lastError
        };
      }

      if (!account.watchExpiresAt) {
        return {
          accountId: account.id,
          status: 'error' as const,
          lastError: 'No watch configured'
        };
      }

      const timeUntilExpiry = account.watchExpiresAt - now;
      
      if (timeUntilExpiry <= 0) {
        return {
          accountId: account.id,
          status: 'expired' as const,
          expiresAt: new Date(account.watchExpiresAt).toISOString()
        };
      }

      if (timeUntilExpiry <= this.WATCH_RENEWAL_BUFFER) {
        return {
          accountId: account.id,
          status: 'expiring_soon' as const,
          expiresAt: new Date(account.watchExpiresAt).toISOString()
        };
      }

      return {
        accountId: account.id,
        status: 'healthy' as const,
        expiresAt: new Date(account.watchExpiresAt).toISOString()
      };
    });

    return {
      healthy: details.filter(d => d.status === 'healthy').length,
      expiringSoon: details.filter(d => d.status === 'expiring_soon').length,
      failed: details.filter(d => d.status === 'error' || d.status === 'expired').length,
      details
    };
  }

  // Mock API methods (would be actual Google Calendar API calls)
  private async callCalendarAPI(account: CalendarAccount, params: URLSearchParams): Promise<any> {
    // Simulated API response structure
    return {
      kind: 'calendar#events',
      etag: '"mock-etag"',
      summary: account.email,
      items: [], // Would contain actual events
      nextSyncToken: 'mock-sync-token',
      status: 200
    };
  }

  private async stopWatch(channelId: string, resourceId: string): Promise<void> {
    logger.info('Stopping calendar watch', { channelId, resourceId });
    // Would call Google Calendar API to stop watch
  }

  private async createWatch(account: CalendarAccount): Promise<{
    channelId: string;
    resourceId: string;
    expiresAt: number;
  }> {
    const channelId = `channel-${account.id}-${Date.now()}`;
    const resourceId = `resource-${Date.now()}`;
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    logger.info('Creating calendar watch', {
      accountId: account.id,
      channelId,
      resourceId,
      expiresAt: new Date(expiresAt).toISOString()
    });

    // Would call Google Calendar API to create watch
    return { channelId, resourceId, expiresAt };
  }
}

export const enhancedCalendarService = new EnhancedCalendarService();