import { supabase } from '@/integrations/supabase/client';

// Scope definitions for incremental consent
export const SCOPES = {
  GOOGLE_CALENDAR: {
    READ: 'https://www.googleapis.com/auth/calendar.readonly',
    WRITE: 'https://www.googleapis.com/auth/calendar'
  },
  GMAIL: {
    METADATA: 'https://www.googleapis.com/auth/gmail.metadata',
    READ: 'https://www.googleapis.com/auth/gmail.readonly',
    COMPOSE: 'https://www.googleapis.com/auth/gmail.compose',
    MODIFY: 'https://www.googleapis.com/auth/gmail.modify'
  }
} as const;

export interface OAuthAccount {
  id: string;
  provider: 'google' | 'microsoft' | 'apple' | 'github';
  provider_user_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  last_used_at?: string;
  scopes: string[];
  account_email: string;
}

export interface ScopeRequest {
  provider: 'google' | 'microsoft';
  service: 'calendar' | 'email';
  requiredScopes: string[];
  reason: string;
}

class OAuthService {
  private encryptionKey: CryptoKey | null = null;

  constructor() {
    this.initializeEncryption();
  }

  private async initializeEncryption() {
    try {
      // Generate or retrieve encryption key for token storage
      const keyData = localStorage.getItem('oauth-encryption-key');
      if (keyData) {
        const importedKey = await window.crypto.subtle.importKey(
          'raw',
          new Uint8Array(JSON.parse(keyData)),
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
        this.encryptionKey = importedKey;
      } else {
        this.encryptionKey = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        const exportedKey = await window.crypto.subtle.exportKey('raw', this.encryptionKey);
        localStorage.setItem('oauth-encryption-key', JSON.stringify(Array.from(new Uint8Array(exportedKey))));
      }
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
    }
  }

  private async encryptToken(token: string): Promise<string> {
    if (!this.encryptionKey) {
      await this.initializeEncryption();
    }
    
    if (!this.encryptionKey) {
      throw new Error('Encryption not available');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      data
    );

    return JSON.stringify({
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    });
  }

  private async decryptToken(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      await this.initializeEncryption();
    }
    
    if (!this.encryptionKey) {
      throw new Error('Encryption not available');
    }

    const { encrypted, iv } = JSON.parse(encryptedData);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      this.encryptionKey,
      new Uint8Array(encrypted)
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  async getConnectedAccounts(): Promise<OAuthAccount[]> {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return [];

    const { data, error } = await supabase
      .from('oauth_accounts')
      .select('*')
      .eq('user_id', session.session.user.id);

    if (error) {
      console.error('Failed to fetch OAuth accounts:', error);
      return [];
    }

    // Decrypt tokens
    const accounts = await Promise.all(
      (data || []).map(async (account) => ({
        ...account,
        provider: account.provider as 'google' | 'microsoft' | 'apple' | 'github',
        access_token: account.access_token ? await this.decryptToken(account.access_token) : '',
        refresh_token: account.refresh_token ? await this.decryptToken(account.refresh_token) : undefined,
        scopes: (account as any).scopes || [],
        account_email: (account as any).account_email || ''
      }))
    );

    return accounts as OAuthAccount[];
  }

  async storeTokens(account: Partial<OAuthAccount>): Promise<void> {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      throw new Error('User not authenticated');
    }

    const encryptedData = {
      user_id: session.session.user.id,
      provider: account.provider,
      provider_user_id: account.provider_user_id,
      access_token: account.access_token ? await this.encryptToken(account.access_token) : null,
      refresh_token: account.refresh_token ? await this.encryptToken(account.refresh_token) : null,
      expires_at: account.expires_at,
      last_used_at: new Date().toISOString(),
      scopes: account.scopes,
      account_email: account.account_email
    };

    const { error } = await supabase
      .from('oauth_accounts')
      .upsert(encryptedData, {
        onConflict: 'provider,provider_user_id'
      });

    if (error) {
      throw new Error(`Failed to store OAuth tokens: ${error.message}`);
    }
  }

  async refreshAccessToken(account: OAuthAccount): Promise<string> {
    if (!account.refresh_token || account.provider !== 'google') {
      throw new Error('Cannot refresh token: no refresh token available');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '',
        refresh_token: account.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh access token');
    }

    const data = await response.json();
    
    // Update stored token
    await this.storeTokens({
      ...account,
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      last_used_at: new Date().toISOString()
    });

    return data.access_token;
  }

  async checkScopePermissions(accountId: string, requiredScopes: string[]): Promise<{
    hasPermission: boolean;
    missingScopes: string[];
  }> {
    const accounts = await this.getConnectedAccounts();
    const account = accounts.find(a => a.id === accountId);
    
    if (!account) {
      return { hasPermission: false, missingScopes: requiredScopes };
    }

    const missingScopes = requiredScopes.filter(scope => 
      !account.scopes.includes(scope)
    );

    return {
      hasPermission: missingScopes.length === 0,
      missingScopes
    };
  }

  async requestScopeEscalation(request: ScopeRequest): Promise<string> {
    // Generate OAuth URL with incremental scopes
    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      redirect_uri: `${window.location.origin}/oauth-callback.html`,
      response_type: 'code',
      scope: request.requiredScopes.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true', // For incremental authorization
      prompt: 'consent' // Force consent to ensure we get refresh token
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async revokeAccess(accountId: string): Promise<void> {
    const accounts = await this.getConnectedAccounts();
    const account = accounts.find(a => a.id === accountId);
    
    if (!account) {
      throw new Error('Account not found');
    }

    // Revoke with Google
    if (account.provider === 'google' && account.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${account.access_token}`, {
          method: 'POST'
        });
      } catch (error) {
        console.warn('Failed to revoke token with provider:', error);
      }
    }

    // Remove from database
    const { error } = await supabase
      .from('oauth_accounts')
      .delete()
      .eq('id', accountId);

    if (error) {
      throw new Error(`Failed to revoke access: ${error.message}`);
    }
  }

  async handleScopeDecay(): Promise<void> {
    const accounts = await this.getConnectedAccounts();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const account of accounts) {
      const lastUsed = new Date(account.last_used_at || 0);
      
      if (lastUsed < thirtyDaysAgo) {
        // Reduce to minimal scopes
        const minimalScopes = account.provider === 'google' 
          ? [SCOPES.GOOGLE_CALENDAR.READ, SCOPES.GMAIL.METADATA]
          : [];

        await this.storeTokens({
          ...account,
          scopes: minimalScopes,
          last_used_at: new Date().toISOString()
        });
      }
    }
  }

  async makeAuthenticatedRequest(accountId: string, url: string, options: RequestInit = {}): Promise<Response> {
    const accounts = await this.getConnectedAccounts();
    const account = accounts.find(a => a.id === accountId);
    
    if (!account) {
      throw new Error('Account not found');
    }

    // Check if token needs refresh
    const expiresAt = account.expires_at ? new Date(account.expires_at) : null;
    const isExpired = expiresAt && expiresAt <= new Date();

    let accessToken = account.access_token;
    if (isExpired && account.refresh_token) {
      accessToken = await this.refreshAccessToken(account);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Update last used timestamp
    await this.storeTokens({
      ...account,
      last_used_at: new Date().toISOString()
    });

    return response;
  }
}

export const oauthService = new OAuthService();