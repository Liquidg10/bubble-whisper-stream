/**
 * Proactive Token Refresh Service
 * Automatically refreshes OAuth tokens before they expire
 */

import { supabase } from '@/integrations/supabase/client';

interface TokenRefreshStatus {
  accountId: string;
  provider: string;
  expiresAt: string;
  refreshed: boolean;
  error?: string;
}

class ProactiveTokenRefreshService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_THRESHOLD_MINUTES = 5; // Refresh 5 minutes before expiry

  /**
   * Start proactive token refresh monitoring
   */
  startProactiveRefresh(): void {
    console.log('Starting proactive token refresh service...');
    
    // Check for expiring tokens every 2 minutes
    this.refreshInterval = setInterval(() => {
      this.checkExpiringTokens();
    }, 2 * 60 * 1000); // 2 minutes

    // Initial check
    this.checkExpiringTokens();
  }

  /**
   * Stop proactive token refresh monitoring
   */
  stopProactiveRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Stopped proactive token refresh service');
    }
  }

  /**
   * Check for tokens that need refreshing
   */
  private async checkExpiringTokens(): Promise<void> {
    try {
      const thresholdTime = new Date(Date.now() + this.REFRESH_THRESHOLD_MINUTES * 60 * 1000);
      
      // Get accounts with tokens expiring soon
      const { data: accounts, error } = await supabase
        .from('oauth_accounts')
        .select('id, provider, expires_at, refresh_token, user_id')
        .not('expires_at', 'is', null)
        .not('refresh_token', 'is', null)
        .lt('expires_at', thresholdTime.toISOString());

      if (error) {
        console.error('Error fetching expiring tokens:', error);
        return;
      }

      if (!accounts || accounts.length === 0) {
        return;
      }

      console.log(`Found ${accounts.length} tokens expiring soon, refreshing...`);

      // Refresh each expiring token
      const refreshPromises = accounts.map(account => 
        this.refreshToken(account.id, account.provider, account.refresh_token)
      );

      const results = await Promise.allSettled(refreshPromises);
      
      // Log results
      results.forEach((result, index) => {
        const account = accounts[index];
        if (result.status === 'fulfilled') {
          console.log(`Successfully refreshed token for account ${account.id}`);
        } else {
          console.error(`Failed to refresh token for account ${account.id}:`, result.reason);
        }
      });

    } catch (error) {
      console.error('Error in proactive token refresh:', error);
    }
  }

  /**
   * Refresh a specific token
   */
  private async refreshToken(
    accountId: string, 
    provider: string, 
    refreshToken: string
  ): Promise<TokenRefreshStatus> {
    try {
      console.log(`Refreshing token for account ${accountId} (${provider})`);

      let refreshResult;
      
      if (provider === 'google') {
        // Use the OAuth refresh edge function
        const { data, error } = await supabase.functions.invoke('oauth-google-refresh', {
          body: {
            refresh_token: refreshToken,
            account_id: accountId
          }
        });

        if (error) throw error;
        refreshResult = data;
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      // Log successful refresh
      await supabase
        .from('sync_logs')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          provider: provider,
          service_type: 'oauth',
          operation: 'proactive_token_refresh',
          status: 'success',
          account_id: accountId,
          items_processed: 1,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        });

      return {
        accountId,
        provider,
        expiresAt: refreshResult.expires_at || new Date(Date.now() + refreshResult.expires_in * 1000).toISOString(),
        refreshed: true
      };

    } catch (error) {
      console.error(`Token refresh failed for account ${accountId}:`, error);

      // Log failed refresh
      await supabase
        .from('sync_logs')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          provider: provider,
          service_type: 'oauth',
          operation: 'proactive_token_refresh',
          status: 'error',
          error_message: error.message,
          account_id: accountId,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        });

      return {
        accountId,
        provider,
        expiresAt: '',
        refreshed: false,
        error: error.message
      };
    }
  }

  /**
   * Manually refresh all expiring tokens
   */
  async refreshAllExpiringTokens(): Promise<TokenRefreshStatus[]> {
    console.log('Manually refreshing all expiring tokens...');
    
    const thresholdTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Next 24 hours
    
    const { data: accounts, error } = await supabase
      .from('oauth_accounts')
      .select('id, provider, expires_at, refresh_token')
      .not('expires_at', 'is', null)
      .not('refresh_token', 'is', null)
      .lt('expires_at', thresholdTime.toISOString());

    if (error || !accounts) {
      throw new Error(`Failed to fetch expiring tokens: ${error?.message}`);
    }

    const refreshPromises = accounts.map(account => 
      this.refreshToken(account.id, account.provider, account.refresh_token)
    );

    const results = await Promise.allSettled(refreshPromises);
    
    return results.map((result, index) => {
      const account = accounts[index];
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          accountId: account.id,
          provider: account.provider,
          expiresAt: account.expires_at,
          refreshed: false,
          error: result.reason?.message || 'Unknown error'
        };
      }
    });
  }

  /**
   * Get refresh service status
   */
  getRefreshStatus(): {
    isRunning: boolean;
    refreshThresholdMinutes: number;
  } {
    return {
      isRunning: this.refreshInterval !== null,
      refreshThresholdMinutes: this.REFRESH_THRESHOLD_MINUTES
    };
  }

  /**
   * Get tokens that will expire soon
   */
  async getExpiringTokens(hoursAhead: number = 24): Promise<{
    accountId: string;
    provider: string;
    expiresAt: string;
    minutesUntilExpiry: number;
  }[]> {
    const thresholdTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    
    const { data: accounts, error } = await supabase
      .from('oauth_accounts')
      .select('id, provider, expires_at, account_email')
      .not('expires_at', 'is', null)
      .lt('expires_at', thresholdTime.toISOString())
      .order('expires_at', { ascending: true });

    if (error || !accounts) {
      return [];
    }

    return accounts.map(account => ({
      accountId: account.id,
      provider: account.provider,
      expiresAt: account.expires_at,
      minutesUntilExpiry: Math.floor((new Date(account.expires_at).getTime() - Date.now()) / (1000 * 60))
    }));
  }
}

export const proactiveTokenRefreshService = new ProactiveTokenRefreshService();