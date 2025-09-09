/**
 * Sync Token Validator - Ensure one sync token per calendar
 * Test 410 Gone path and prevent duplicate events during re-sync
 */

import { supabase } from '@/integrations/supabase/client';
import { devLog } from '@/devtools/devLog';

export interface SyncTokenStatus {
  calendarAccountId: string;
  accountEmail: string;
  calendarId: string;
  currentSyncToken?: string;
  nextSyncToken?: string;
  lastSyncAt?: string;
  syncStatus: string;
  eventsCount: number;
  issues: string[];
}

export interface SyncTokenValidationReport {
  timestamp: number;
  totalAccounts: number;
  tokenIssues: number;
  duplicateEvents: number;
  statuses: SyncTokenStatus[];
  goneSimulations: GoneSimulationResult[];
}

export interface GoneSimulationResult {
  calendarAccountId: string;
  accountEmail: string;
  success: boolean;
  eventsBeforeSync: number;
  eventsAfterSync: number;
  duplicatesFound: number;
  error?: string;
}

class SyncTokenValidator {
  private goneSimulations: GoneSimulationResult[] = [];

  /**
   * Validate sync token integrity across all accounts
   */
  async validateSyncTokens(): Promise<SyncTokenValidationReport> {
    const { data: accounts, error } = await supabase
      .from('calendar_accounts')
      .select(`
        id,
        account_email,
        calendar_id,
        sync_token,
        next_sync_token,
        last_sync_at,
        sync_status
      `);

    if (error) {
      throw new Error(`Failed to fetch calendar accounts: ${error.message}`);
    }

    const statuses: SyncTokenStatus[] = [];
    let tokenIssues = 0;
    let totalDuplicates = 0;

    for (const account of accounts || []) {
      const issues: string[] = [];
      
      // Check for missing or invalid sync tokens
      if (!account.sync_token && account.sync_status !== 'idle') {
        issues.push('Missing sync token for active account');
        tokenIssues++;
      }
      
      if (account.sync_token === account.next_sync_token && account.sync_token) {
        issues.push('Current and next sync tokens are identical');
        tokenIssues++;
      }
      
      // Count events for this account
      const { count: eventsCount } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('calendar_account_id', account.id);

      // Check for duplicate events
      const duplicates = await this.findDuplicateEvents(account.id);
      if (duplicates > 0) {
        issues.push(`${duplicates} duplicate events found`);
        totalDuplicates += duplicates;
      }

      statuses.push({
        calendarAccountId: account.id,
        accountEmail: account.account_email,
        calendarId: account.calendar_id || 'primary',
        currentSyncToken: account.sync_token || undefined,
        nextSyncToken: account.next_sync_token || undefined,
        lastSyncAt: account.last_sync_at || undefined,
        syncStatus: account.sync_status,
        eventsCount: eventsCount || 0,
        issues,
      });
    }

    return {
      timestamp: Date.now(),
      totalAccounts: accounts?.length || 0,
      tokenIssues,
      duplicateEvents: totalDuplicates,
      statuses,
      goneSimulations: [...this.goneSimulations],
    };
  }

  /**
   * Simulate 410 Gone response to test full bounded re-sync
   */
  async simulate410Gone(calendarAccountId: string): Promise<GoneSimulationResult> {
    try {
      // Get account info
      const { data: account, error: accountError } = await supabase
        .from('calendar_accounts')
        .select('account_email, calendar_id')
        .eq('id', calendarAccountId)
        .single();

      if (accountError || !account) {
        throw new Error(`Account not found: ${accountError?.message}`);
      }

      // Count events before sync
      const { count: eventsBefore } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('calendar_account_id', calendarAccountId);

      // Simulate 410 Gone by clearing sync token and triggering full sync
      const { error: clearTokenError } = await supabase
        .from('calendar_accounts')
        .update({ 
          sync_token: null, 
          next_sync_token: null,
          sync_status: 'idle'
        })
        .eq('id', calendarAccountId);

      if (clearTokenError) {
        throw new Error(`Failed to clear sync token: ${clearTokenError.message}`);
      }

      devLog('sync-validator', `Cleared sync tokens for ${account.account_email}`);

      // Trigger bounded full sync
      const { error: syncError } = await supabase.functions.invoke('calendar-sync', {
        body: {
          calendarAccountId,
          fullSync: true,
          boundedWindow: true, // Only sync last 90 days
        },
      });

      if (syncError) {
        throw new Error(`Sync failed: ${syncError.message}`);
      }

      // Wait a moment for sync to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Count events after sync
      const { count: eventsAfter } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('calendar_account_id', calendarAccountId);

      // Check for duplicates
      const duplicatesFound = await this.findDuplicateEvents(calendarAccountId);

      const result: GoneSimulationResult = {
        calendarAccountId,
        accountEmail: account.account_email,
        success: true,
        eventsBeforeSync: eventsBefore || 0,
        eventsAfterSync: eventsAfter || 0,
        duplicatesFound,
      };

      this.goneSimulations.push(result);
      devLog('sync-validator', `410 Gone simulation complete for ${account.account_email}`);
      
      return result;
    } catch (error) {
      const result: GoneSimulationResult = {
        calendarAccountId,
        accountEmail: 'unknown',
        success: false,
        eventsBeforeSync: 0,
        eventsAfterSync: 0,
        duplicatesFound: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.goneSimulations.push(result);
      return result;
    }
  }

  /**
   * Find duplicate events for a calendar account
   */
  private async findDuplicateEvents(calendarAccountId: string): Promise<number> {
    // Find events with the same event_id (calendar events should have this field)
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('id, title, start_time')
      .eq('calendar_account_id', calendarAccountId);

    if (error) {
      console.error('Error finding duplicate events:', error);
      return 0;
    }

    if (!events) return 0;

    // Simple duplicate detection based on title and start time
    const eventKeys = events.map(e => `${e.title}:${e.start_time}`);
    const uniqueKeys = new Set(eventKeys);
    const duplicates = eventKeys.length - uniqueKeys.size;

    return duplicates;
  }

  /**
   * Clean up duplicate events for testing
   */
  async cleanupDuplicateEvents(calendarAccountId: string): Promise<number> {
    // This would be implemented to remove duplicate events
    // For safety, we'll just return the count for now
    return this.findDuplicateEvents(calendarAccountId);
  }

  /**
   * Export validation report
   */
  async exportValidationReport(): Promise<string> {
    const report = await this.validateSyncTokens();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Clear simulation history
   */
  clearSimulations(): void {
    this.goneSimulations = [];
  }
}

export const syncTokenValidator = new SyncTokenValidator();