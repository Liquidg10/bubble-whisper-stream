/**
 * Proactive Token Refresh Service
 *
 * The browser schedules refreshes using metadata only. Provider credentials
 * never cross this boundary; the authenticated Edge Function resolves the
 * owned account_id, decrypts server-side, refreshes, and returns a receipt.
 */

import { supabase } from '@/integrations/supabase/client';

interface TokenRefreshStatus {
  accountId: string;
  provider: string;
  expiresAt: string;
  refreshed: boolean;
  error?: string;
}

interface OAuthRefreshReceipt {
  success?: unknown;
  accountId?: unknown;
  expiresAt?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
}

class ProactiveTokenRefreshService {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private readonly REFRESH_THRESHOLD_MINUTES = 5;

  startProactiveRefresh(): void {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(() => {
      void this.checkExpiringTokens();
    }, 2 * 60 * 1000);
    void this.checkExpiringTokens();
  }

  stopProactiveRefresh(): void {
    if (!this.refreshInterval) return;
    clearInterval(this.refreshInterval);
    this.refreshInterval = null;
  }

  private async listExpiringAccounts(thresholdTime: Date) {
    const { data, error } = await supabase
      .from('oauth_accounts_metadata')
      .select('id,provider,expires_at,user_id')
      .eq('provider', 'google')
      .not('expires_at', 'is', null)
      .lt('expires_at', thresholdTime.toISOString());

    if (error) {
      throw new Error(`Unable to load expiring OAuth account metadata: ${error.message}`);
    }
    return data || [];
  }

  private async checkExpiringTokens(): Promise<void> {
    try {
      const threshold = new Date(
        Date.now() + this.REFRESH_THRESHOLD_MINUTES * 60 * 1000,
      );
      const accounts = await this.listExpiringAccounts(threshold);
      await Promise.allSettled(
        accounts.map((account) => this.refreshToken(account.id, account.provider)),
      );
    } catch (error) {
      console.error('OAuth refresh metadata check failed:', error);
    }
  }

  private async refreshToken(
    accountId: string,
    provider: string,
  ): Promise<TokenRefreshStatus> {
    try {
      if (provider !== 'google') {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      const { data, error } = await supabase.functions.invoke('oauth-google-refresh', {
        body: { account_id: accountId },
      });
      if (error) throw error;

      const receipt = data as OAuthRefreshReceipt | null;
      if (
        !receipt || receipt.success !== true || receipt.accountId !== accountId ||
        typeof receipt.expiresAt !== 'string' ||
        'access_token' in receipt || 'refresh_token' in receipt ||
        'accessToken' in receipt || 'refreshToken' in receipt
      ) {
        throw new Error('OAuth refresh returned an invalid server receipt');
      }

      await this.logRefresh(accountId, provider, 'success');
      return {
        accountId,
        provider,
        expiresAt: receipt.expiresAt,
        refreshed: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.logRefresh(accountId, provider, 'error', message);
      return {
        accountId,
        provider,
        expiresAt: '',
        refreshed: false,
        error: message,
      };
    }
  }

  private async logRefresh(
    accountId: string,
    provider: string,
    status: 'success' | 'error',
    errorMessage?: string,
  ): Promise<void> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('sync_logs').insert({
      user_id: user.id,
      provider,
      service_type: 'oauth',
      operation: 'proactive_token_refresh',
      status,
      account_id: accountId,
      items_processed: status === 'success' ? 1 : 0,
      error_message: errorMessage,
      started_at: now,
      completed_at: now,
    });
    if (error) console.warn('Unable to persist OAuth refresh receipt:', error.message);
  }

  async refreshAllExpiringTokens(): Promise<TokenRefreshStatus[]> {
    const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const accounts = await this.listExpiringAccounts(threshold);
    return await Promise.all(
      accounts.map((account) => this.refreshToken(account.id, account.provider)),
    );
  }

  getRefreshStatus(): {
    isRunning: boolean;
    refreshThresholdMinutes: number;
  } {
    return {
      isRunning: this.refreshInterval !== null,
      refreshThresholdMinutes: this.REFRESH_THRESHOLD_MINUTES,
    };
  }

  async getExpiringTokens(hoursAhead = 24): Promise<Array<{
    accountId: string;
    provider: string;
    expiresAt: string;
    minutesUntilExpiry: number;
  }>> {
    const threshold = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    try {
      const accounts = await this.listExpiringAccounts(threshold);
      return accounts.flatMap((account) => {
        if (!account.expires_at) return [];
        return [{
          accountId: account.id,
          provider: account.provider,
          expiresAt: account.expires_at,
          minutesUntilExpiry: Math.floor(
            (new Date(account.expires_at).getTime() - Date.now()) / (1000 * 60),
          ),
        }];
      });
    } catch {
      return [];
    }
  }
}

export const proactiveTokenRefreshService = new ProactiveTokenRefreshService();
