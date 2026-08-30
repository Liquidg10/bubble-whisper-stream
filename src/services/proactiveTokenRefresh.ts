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

export class ProactiveTokenRefreshService {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private scans = new Map<number, Promise<void>>();
  private refreshes = new Map<string, Promise<TokenRefreshStatus>>();
  // Session-local holds are not durable provider reconciliation. Stop/start
  // must not automatically repeat an operation whose response was uncertain.
  private unresolved = new Map<string, TokenRefreshStatus>();
  private readonly REFRESH_THRESHOLD_MINUTES = 5;

  startProactiveRefresh(): void {
    if (this.refreshInterval !== null) return;
    const generation = ++this.generation;
    this.refreshInterval = setInterval(() => {
      void this.checkExpiringTokens(generation);
    }, 2 * 60 * 1000);
    void this.checkExpiringTokens(generation);
  }

  stopProactiveRefresh(): void {
    ++this.generation;
    if (this.refreshInterval !== null) clearInterval(this.refreshInterval);
    this.refreshInterval = null;
  }

  private isCurrent(generation?: number): boolean {
    // Explicit manual requests do not depend on the background timer switch.
    return generation === undefined ||
      (this.refreshInterval !== null && generation === this.generation);
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

  private checkExpiringTokens(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return Promise.resolve();
    const existing = this.scans.get(generation);
    if (existing) return existing;
    const scan = this.performMetadataCheck(generation).finally(() => {
      if (this.scans.get(generation) === scan) this.scans.delete(generation);
    });
    this.scans.set(generation, scan);
    return scan;
  }

  private async performMetadataCheck(generation: number): Promise<void> {
    try {
      const threshold = new Date(
        Date.now() + this.REFRESH_THRESHOLD_MINUTES * 60 * 1000,
      );
      const accounts = await this.listExpiringAccounts(threshold);
      if (!this.isCurrent(generation)) return;
      await Promise.allSettled(
        accounts.map((account) => this.refreshToken(account.id, account.provider, generation)),
      );
    } catch {
      if (this.isCurrent(generation)) console.error('OAuth refresh metadata check failed');
    }
  }

  private refreshToken(
    accountId: string,
    provider: string,
    generation?: number,
  ): Promise<TokenRefreshStatus> {
    const key = `${provider}:${accountId}`;
    const held = this.unresolved.get(key);
    if (held) return Promise.resolve(held);
    const existing = this.refreshes.get(key);
    if (existing) return existing;
    if (!this.isCurrent(generation)) return Promise.resolve({
      accountId, provider, expiresAt: '', refreshed: false, error: 'Background refresh stopped before dispatch',
    });
    const refresh = this.performRefresh(accountId, provider, generation).finally(() => {
      if (this.refreshes.get(key) === refresh) this.refreshes.delete(key);
    });
    this.refreshes.set(key, refresh);
    return refresh;
  }

  private async performRefresh(accountId: string, provider: string, generation?: number): Promise<TokenRefreshStatus> {
    let dispatched = false;
    try {
      if (provider !== 'google') {
        throw new Error('Unsupported OAuth provider');
      }

      dispatched = true;
      const { data, error } = await supabase.functions.invoke('oauth-google-refresh', {
        body: { account_id: accountId },
      });
      if (error) throw error;

      const receipt = data as OAuthRefreshReceipt | null;
      if (
        !receipt || receipt.success !== true || receipt.accountId !== accountId ||
        typeof receipt.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= Date.now() ||
        'access_token' in receipt || 'refresh_token' in receipt ||
        'accessToken' in receipt || 'refreshToken' in receipt
      ) {
        throw new Error('OAuth refresh returned an invalid server receipt');
      }

      await this.logRefresh(accountId, provider, 'success', undefined, generation);
      return {
        accountId,
        provider,
        expiresAt: receipt.expiresAt,
        refreshed: true,
      };
    } catch {
      const message = dispatched ? 'OAuth refresh outcome is unverified; reconciliation is required' : 'Unsupported OAuth provider';
      const result = {
        accountId,
        provider,
        expiresAt: '',
        refreshed: false,
        error: message,
      };
      if (dispatched) this.unresolved.set(`${provider}:${accountId}`, result);
      await this.logRefresh(accountId, provider, 'error', message, generation);
      return result;
    }
  }

  private async logRefresh(
    accountId: string,
    provider: string,
    status: 'success' | 'error',
    errorMessage?: string,
    generation?: number,
  ): Promise<void> {
    if (!this.isCurrent(generation)) return;
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user || !this.isCurrent(generation)) return;
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
      if (error) console.warn('Unable to persist OAuth refresh receipt');
    } catch {
      // Telemetry failure does not turn a verified provider receipt into an
      // uncertain provider operation or trigger a second refresh.
      if (this.isCurrent(generation)) console.warn('Unable to persist OAuth refresh receipt');
    }
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
    pendingScans: number;
    pendingRefreshes: number;
    unresolvedRefreshes: number;
  } {
    return {
      isRunning: this.refreshInterval !== null,
      refreshThresholdMinutes: this.REFRESH_THRESHOLD_MINUTES,
      pendingScans: this.scans.size,
      pendingRefreshes: this.refreshes.size,
      unresolvedRefreshes: this.unresolved.size,
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
