import { supabase } from '@/integrations/supabase/client';

// Scope definitions for incremental consent
export const SCOPES = {
  GOOGLE_CALENDAR: {
    READ: 'https://www.googleapis.com/auth/calendar.readonly',
    WRITE: 'https://www.googleapis.com/auth/calendar.events' // Fixed to use calendar.events for minimal write access
  },
  GMAIL: {
    METADATA: 'https://www.googleapis.com/auth/gmail.metadata',
    READ: 'https://www.googleapis.com/auth/gmail.readonly',
    MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
    SEND: 'https://www.googleapis.com/auth/gmail.send' // Added send scope for explicit send functionality
  }
} as const;

// Scope combinations for different permission levels
export const SCOPE_LEVELS = {
  GMAIL: {
    MINIMAL: [SCOPES.GMAIL.METADATA], // Just headers and labels
    READ: [SCOPES.GMAIL.METADATA, SCOPES.GMAIL.READ], // Read email content
    COMPOSE: [SCOPES.GMAIL.METADATA, SCOPES.GMAIL.READ, SCOPES.GMAIL.MODIFY], // Drafts and labels
    SEND: [SCOPES.GMAIL.METADATA, SCOPES.GMAIL.READ, SCOPES.GMAIL.MODIFY, SCOPES.GMAIL.SEND] // Full permissions
  },
  CALENDAR: {
    READ: [SCOPES.GOOGLE_CALENDAR.READ], // View calendar events
    WRITE: [SCOPES.GOOGLE_CALENDAR.READ, SCOPES.GOOGLE_CALENDAR.WRITE] // Create/edit events
  }
} as const;

// Default scope strings for initial connection
export const DEFAULT_SCOPES = {
  'google-calendar': SCOPES.GOOGLE_CALENDAR.READ,
  'gmail': SCOPES.GMAIL.METADATA,
  'google': 'openid email profile'
} as const;

export interface OAuthAccount {
  id: string;
  provider: 'google-calendar' | 'gmail' | 'google' | 'microsoft' | 'apple' | 'github';
  provider_user_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  last_used_at?: string;
  scopes: string[];
  scopes_string?: string;
  account_email: string;
  token_type?: string;
}

export interface ScopeRequest {
  provider: 'google' | 'microsoft';
  service: 'calendar' | 'email';
  requiredScopes?: string[];
  reason: string;
  accountId?: string;
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

    // Decrypt tokens and handle both old array and new string scopes
    const accounts = await Promise.all(
      (data || []).map(async (account) => ({
        ...account,
        provider: account.provider as OAuthAccount['provider'],
        access_token: account.access_token ? await this.decryptToken(account.access_token) : '',
        refresh_token: account.refresh_token ? await this.decryptToken(account.refresh_token) : undefined,
        scopes: (account as any).scopes_string 
          ? (account as any).scopes_string.split(' ').filter(Boolean)
          : ((account as any).scopes || []),
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

    // Use the new scopes_string format and let the server handle encryption
    const updateData = {
      user_id: session.session.user.id,
      provider: account.provider,
      provider_user_id: account.provider_user_id,
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expires_at: account.expires_at,
      last_used_at: new Date().toISOString(),
      account_email: account.account_email,
      token_type: account.token_type || 'Bearer'
    };

    // Handle scopes - convert array to space-delimited string
    if (account.scopes) {
      (updateData as any).scopes_string = Array.isArray(account.scopes) 
        ? account.scopes.join(' ')
        : account.scopes;
    }

    const { error } = await supabase
      .from('oauth_accounts')
      .upsert(updateData, {
        onConflict: 'provider,provider_user_id'
      });

    if (error) {
      throw new Error(`Failed to store OAuth tokens: ${error.message}`);
    }
  }

  async refreshAccessToken(account: OAuthAccount): Promise<string> {
    if (!account.refresh_token || !account.provider.includes('google')) {
      throw new Error('Cannot refresh token: no refresh token available');
    }

    // Use our edge function for secure token refresh (no client secret exposure)
    const { data, error } = await supabase.functions.invoke('oauth-google-refresh', {
      body: {
        refresh_token: account.refresh_token,
        account_id: account.id
      }
    });

    if (error) {
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }

    // Update stored token via server-side encryption
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

  // Get current permission level for a service
  async getPermissionLevel(accountId: string, service: 'calendar' | 'gmail'): Promise<string> {
    const accounts = await this.getConnectedAccounts();
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) return 'none';
    
    if (service === 'calendar') {
      if (account.scopes.some(s => s.includes('calendar.events'))) return 'write';
      if (account.scopes.some(s => s.includes('calendar.readonly'))) return 'read';
      return 'none';
    }
    
    if (service === 'gmail') {
      if (account.scopes.some(s => s.includes('gmail.send'))) return 'send';
      if (account.scopes.some(s => s.includes('gmail.modify'))) return 'compose';
      if (account.scopes.some(s => s.includes('gmail.readonly'))) return 'read';
      if (account.scopes.some(s => s.includes('gmail.metadata'))) return 'minimal';
      return 'none';
    }
    
    return 'none';
  }

  // Check if scope escalation is needed for an operation
  async needsEscalation(accountId: string, operation: string): Promise<{ needed: boolean; scopes?: string[]; reason?: string }> {
    const permissionLevel = await this.getPermissionLevel(accountId, operation.includes('calendar') ? 'calendar' : 'gmail');
    
    if (operation === 'calendar-read' && permissionLevel === 'none') {
      return { needed: true, scopes: [...SCOPE_LEVELS.CALENDAR.READ], reason: 'view your calendar events' };
    }
    
    if (operation === 'calendar-write' && !['write'].includes(permissionLevel)) {
      return { needed: true, scopes: [...SCOPE_LEVELS.CALENDAR.WRITE], reason: 'create calendar events from your tasks' };
    }
    
    if (operation === 'gmail-metadata' && permissionLevel === 'none') {
      return { needed: true, scopes: [...SCOPE_LEVELS.GMAIL.MINIMAL], reason: 'access email headers and organize your inbox' };
    }
    
    if (operation === 'gmail-read' && !['read', 'compose', 'send'].includes(permissionLevel)) {
      return { needed: true, scopes: [...SCOPE_LEVELS.GMAIL.READ], reason: 'read email content to create meaningful bubbles' };
    }
    
    if (operation === 'gmail-compose' && !['compose', 'send'].includes(permissionLevel)) {
      return { needed: true, scopes: [...SCOPE_LEVELS.GMAIL.COMPOSE], reason: 'create email drafts and manage labels' };
    }
    
    if (operation === 'gmail-send' && permissionLevel !== 'send') {
      return { needed: true, scopes: [...SCOPE_LEVELS.GMAIL.SEND], reason: 'send emails on your behalf' };
    }
    
    return { needed: false };
  }

  async requestScopeEscalation(request: ScopeRequest): Promise<string> {
    // Validate and provide default scopes if requiredScopes is undefined
    const list = Array.isArray(request.requiredScopes) ? request.requiredScopes : [];
    const defaultScope = DEFAULT_SCOPES[request.service === 'calendar' ? 'google-calendar' : 'gmail'];
    const scope = list.length ? list.join(' ') : defaultScope;

    // Use our edge function to generate OAuth URLs with proper state/PKCE
    const { data, error } = await supabase.functions.invoke('oauth-google-start', {
      body: {
        scope,
        service: request.service,
        reason: request.reason
      }
    });

    if (error) {
      throw new Error(`Failed to generate OAuth URL: ${error.message}`);
    }

    return data.authUrl;
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

  // Alias for consistency with plugin naming
  async revokeAccount(accountId: string): Promise<void> {
    return this.revokeAccess(accountId);
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

    // Check if token is expired or will expire soon (within 5 minutes)
    const expiresAt = account.expires_at ? new Date(account.expires_at) : null;
    const isExpired = expiresAt && expiresAt <= new Date();
    const willExpireSoon = expiresAt && expiresAt <= new Date(Date.now() + 5 * 60 * 1000);

    let accessToken = account.access_token;
    
    // Proactively refresh if expired or expiring soon
    if ((isExpired || willExpireSoon) && account.refresh_token) {
      console.log('Proactively refreshing token before request');
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

  /**
   * Start automated background services
   */
  async startBackgroundServices(): Promise<void> {
    console.log('Starting OAuth background services...');
    
    // Import and start services dynamically to avoid circular dependencies
    try {
      const { proactiveTokenRefreshService } = await import('./proactiveTokenRefresh');
      const { watchRenewalService } = await import('./watchRenewalService');
      
      proactiveTokenRefreshService.startProactiveRefresh();
      await watchRenewalService.startWatchRenewal();
    } catch (error) {
      console.error('Failed to start background services:', error);
    }
  }

  /**
   * Stop automated background services
   */
  async stopBackgroundServices(): Promise<void> {
    console.log('Stopping OAuth background services...');
    
    try {
      const { proactiveTokenRefreshService } = await import('./proactiveTokenRefresh');
      const { watchRenewalService } = await import('./watchRenewalService');
      
      proactiveTokenRefreshService.stopProactiveRefresh();
      watchRenewalService.stopWatchRenewal();
    } catch (error) {
      console.error('Failed to stop background services:', error);
    }
  }
}

export const oauthService = new OAuthService();