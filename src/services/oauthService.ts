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
  user_id: string;
  provider: 'google-calendar' | 'gmail' | 'google' | 'microsoft' | 'apple' | 'github';
  provider_user_id: string;
  expires_at?: string;
  last_used_at?: string;
  scopes: string[];
  scopes_string?: string;
  account_email: string;
  token_type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScopeRequest {
  provider: 'google' | 'microsoft';
  service: 'calendar' | 'email';
  requiredScopes?: string[];
  reason: string;
  accountId?: string;
  currentScopes?: string[]; // For before/after comparison
}

export interface OAuthStartResult {
  authUrl: string;
  state: string;
}

export interface PendingCalendarOAuth {
  state: string;
  expiresAt: number;
}

export interface GoogleCalendarOAuthResult {
  calendarAccountId: string;
  account: {
    id: string;
    email: string;
    provider: string;
    calendarId: string;
  };
  scopes: string[];
}

export interface GoogleOAuthResult {
  oauthAccountId: string;
  account: {
    id: string;
    email: string;
    provider: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
  };
  scopes: string[];
}

export interface CanonicalCalendarAccount {
  id: string;
  accountEmail: string;
  accountName: string;
  provider: string;
  calendarId: string;
  calendarName: string;
  syncStatus: string | null;
  syncError: string | null;
  watchStatus: string | null;
  watchChannelId: string | null;
  watchResourceId: string | null;
  watchExpiresAt: string | null;
  connected: boolean;
}

export interface CanonicalCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees: string[];
}

interface AuthenticatedSession {
  accessToken: string;
  userId: string;
}

interface FunctionResult {
  success?: boolean;
  error?: string;
  details?: string;
  [key: string]: unknown;
}

const GOOGLE_AUTH_ORIGIN = 'https://accounts.google.com';
const GOOGLE_AUTH_PATH = '/o/oauth2/v2/auth';
export const CALENDAR_OAUTH_PENDING_KEY = 'mind-manual:calendar-oauth:pending:v1';
export const CALENDAR_OAUTH_RETURN_PATH = '/settings?tab=integrations';
export const GOOGLE_OAUTH_PENDING_KEY = 'mind-manual:google-oauth:pending:v1';
export const GOOGLE_OAUTH_RETURN_PATH = '/settings?tab=integrations';
const CALENDAR_OAUTH_MARKER_TTL_MS = 4.5 * 60 * 1000;

function functionFailureMessage(
  data: FunctionResult | null | undefined,
  fallback: string,
): string {
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.details === 'string' && data.details.trim()) return data.details;
  return fallback;
}

export function validateGoogleOAuthUrl(authUrl: unknown, expectedState: string): string {
  if (typeof authUrl !== 'string' || !authUrl) {
    throw new Error('The server did not return a Google authorization URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(authUrl);
  } catch {
    throw new Error('The server returned an invalid Google authorization URL.');
  }

  if (
    parsed.origin !== GOOGLE_AUTH_ORIGIN ||
    parsed.pathname !== GOOGLE_AUTH_PATH ||
    parsed.username ||
    parsed.password ||
    parsed.searchParams.get('state') !== expectedState
  ) {
    throw new Error('The Google authorization URL failed the security check.');
  }

  return parsed.toString();
}

export function storePendingCalendarOAuth(
  state: string,
  storage: Storage = window.sessionStorage,
  now = Date.now(),
): PendingCalendarOAuth {
  if (!state || state.length > 512) {
    throw new Error('The OAuth state marker is invalid.');
  }

  const marker: PendingCalendarOAuth = {
    state,
    expiresAt: now + CALENDAR_OAUTH_MARKER_TTL_MS,
  };
  storage.setItem(CALENDAR_OAUTH_PENDING_KEY, JSON.stringify(marker));
  return marker;
}

export function clearPendingCalendarOAuth(
  storage: Storage = window.sessionStorage,
): void {
  try {
    storage.removeItem(CALENDAR_OAUTH_PENDING_KEY);
  } catch {
    // Callback recovery must still be able to scrub the URL and leave safely
    // when browser storage becomes unavailable between redirects.
  }
}

export function readPendingCalendarOAuth(
  storage: Storage = window.sessionStorage,
  now = Date.now(),
): PendingCalendarOAuth | null {
  let raw: string | null;
  try {
    raw = storage.getItem(CALENDAR_OAUTH_PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const marker = JSON.parse(raw) as Record<string, unknown>;
    const expiresAt = marker.expiresAt;
    const validExpiry = typeof expiresAt === 'number' &&
      Number.isFinite(expiresAt) &&
      expiresAt > now &&
      expiresAt <= now + CALENDAR_OAUTH_MARKER_TTL_MS;

    if (
      typeof marker.state !== 'string' ||
      !marker.state ||
      marker.state.length > 512 ||
      !validExpiry
    ) {
      clearPendingCalendarOAuth(storage);
      return null;
    }

    return {
      state: marker.state,
      expiresAt,
    };
  } catch {
    clearPendingCalendarOAuth(storage);
    return null;
  }
}

export function storePendingGoogleOAuth(
  state: string,
  storage: Storage = window.sessionStorage,
  now = Date.now(),
): PendingCalendarOAuth {
  if (!state || state.length > 512) {
    throw new Error('The OAuth state marker is invalid.');
  }
  const marker = { state, expiresAt: now + CALENDAR_OAUTH_MARKER_TTL_MS };
  storage.setItem(GOOGLE_OAUTH_PENDING_KEY, JSON.stringify(marker));
  return marker;
}

export function clearPendingGoogleOAuth(
  storage: Storage = window.sessionStorage,
): void {
  try {
    storage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
  } catch {
    // URL scrubbing and safe callback exit must still work without storage.
  }
}

export function readPendingGoogleOAuth(
  storage: Storage = window.sessionStorage,
  now = Date.now(),
): PendingCalendarOAuth | null {
  let raw: string | null;
  try {
    raw = storage.getItem(GOOGLE_OAUTH_PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const marker = JSON.parse(raw) as Record<string, unknown>;
    const expiresAt = marker.expiresAt;
    const validExpiry = typeof expiresAt === 'number' &&
      Number.isFinite(expiresAt) &&
      expiresAt > now &&
      expiresAt <= now + CALENDAR_OAUTH_MARKER_TTL_MS;
    if (
      typeof marker.state !== 'string' || !marker.state ||
      marker.state.length > 512 || !validExpiry
    ) {
      clearPendingGoogleOAuth(storage);
      return null;
    }
    return { state: marker.state, expiresAt };
  } catch {
    clearPendingGoogleOAuth(storage);
    return null;
  }
}

class OAuthService {
  private async requireAuthenticatedSession(): Promise<AuthenticatedSession> {
    const { data, error } = await supabase.auth.getSession();
    const session = data.session;

    if (error || !session?.user || !session.access_token) {
      throw new Error('Sign in to Mind Manual before managing a Google connection.');
    }

    return {
      accessToken: session.access_token,
      userId: session.user.id,
    };
  }

  private async invokeAuthenticated<T extends FunctionResult>(
    functionName: string,
    body: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<T> {
    const session = await this.requireAuthenticatedSession();
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });

    if (error) {
      throw new Error(`${fallbackMessage}: ${error.message}`);
    }

    const result = data as T | null;
    if (!result || result.success !== true) {
      throw new Error(functionFailureMessage(result, fallbackMessage));
    }

    return result;
  }

  /**
   * Begins an OAuth grant without ever loading provider tokens into the browser.
   * The returned URL is pinned to Google's authorization endpoint and to the
   * exact state value created by the authenticated edge function.
   */
  async beginScopeEscalation(request: ScopeRequest): Promise<OAuthStartResult> {
    const list = Array.isArray(request.requiredScopes) ? request.requiredScopes : [];
    const defaultScope = DEFAULT_SCOPES[request.service === 'calendar' ? 'google-calendar' : 'gmail'];
    const scope = list.length ? list.join(' ') : defaultScope;
    const existingScopes = Array.isArray(request.currentScopes)
      ? request.currentScopes.filter(Boolean).join(' ')
      : '';

    const data = await this.invokeAuthenticated<FunctionResult & {
      authUrl?: unknown;
      state?: unknown;
    }>('calendar-oauth-start', {
      scope,
      service: request.service,
      reason: request.reason,
      accountId: request.accountId,
      existingScopes,
      isEscalation: Boolean(request.accountId),
    }, 'Unable to start Google authorization');

    if (typeof data.state !== 'string' || !data.state) {
      throw new Error('The server did not return an OAuth state value.');
    }

    return {
      authUrl: validateGoogleOAuthUrl(data.authUrl, data.state),
      state: data.state,
    };
  }

  async redirectToGoogleCalendar(
    request: ScopeRequest,
    navigation: Pick<Location, 'assign'> = window.location,
    storage: Storage = window.sessionStorage,
  ): Promise<void> {
    const oauthStart = await this.beginScopeEscalation(request);

    try {
      storePendingCalendarOAuth(
        oauthStart.state,
        storage,
      );
    } catch {
      throw new Error(
        'Unable to save the secure Google Calendar handoff. Enable session storage and try again.',
      );
    }

    try {
      navigation.assign(oauthStart.authUrl);
    } catch {
      clearPendingCalendarOAuth(storage);
      throw new Error('Unable to open Google authorization. Please try again.');
    }
  }

  async completeGoogleCalendarOAuth(
    code: string,
    state: string,
  ): Promise<GoogleCalendarOAuthResult> {
    if (!code || !state) {
      throw new Error('Google did not return a complete authorization response.');
    }

    const data = await this.invokeAuthenticated<FunctionResult & {
      calendarAccountId?: unknown;
      account?: unknown;
      scopes?: unknown;
      access_token?: unknown;
      refresh_token?: unknown;
    }>('calendar-oauth-callback', { code, state }, 'Unable to finish Google authorization');

    // Provider credentials must remain server-side even if a future backend
    // accidentally regresses and includes them in its JSON response.
    const accountPayload = data.account && typeof data.account === 'object'
      ? data.account as Record<string, unknown>
      : null;
    if (
      'access_token' in data ||
      'refresh_token' in data ||
      'accessToken' in data ||
      'refreshToken' in data ||
      Boolean(accountPayload && (
        'access_token' in accountPayload ||
        'refresh_token' in accountPayload ||
        'accessToken' in accountPayload ||
        'refreshToken' in accountPayload
      ))
    ) {
      throw new Error('The OAuth response exposed provider credentials and was rejected.');
    }

    if (typeof data.calendarAccountId !== 'string' || !data.calendarAccountId) {
      throw new Error('Google authorization completed, but no Calendar account was created.');
    }

    if (!data.account || typeof data.account !== 'object') {
      throw new Error('Google authorization completed, but the Calendar account receipt was missing.');
    }

    const account = data.account as Record<string, unknown>;
    if (
      typeof account.id !== 'string' ||
      typeof account.email !== 'string' ||
      typeof account.provider !== 'string' ||
      typeof account.calendarId !== 'string'
    ) {
      throw new Error('Google authorization returned an invalid Calendar account receipt.');
    }

    return {
      calendarAccountId: data.calendarAccountId,
      account: {
        id: account.id,
        email: account.email,
        provider: account.provider,
        calendarId: account.calendarId,
      },
      scopes: Array.isArray(data.scopes)
        ? data.scopes.filter((scope): scope is string => typeof scope === 'string')
        : typeof data.scopes === 'string'
          ? data.scopes.split(' ').filter(Boolean)
          : [],
    };
  }

  async syncCalendarAccount(calendarAccountId: string, fullSync = false): Promise<void> {
    const receipt = await this.invokeAuthenticated<FunctionResult & {
      boundedWindow?: unknown;
      eventsProcessed?: unknown;
      syncToken?: unknown;
      syncType?: unknown;
    }>('calendar-sync', {
      calendarAccountId,
      fullSync,
      boundedWindow: fullSync,
    }, fullSync
      ? 'Google Calendar connected, but the initial bounded sync failed'
      : 'Google Calendar refresh failed');

    const expectedSyncType = fullSync ? 'full' : 'incremental';
    const usedDocumentedFallback = !fullSync &&
      receipt.syncType === 'full' &&
      receipt.boundedWindow === true;
    if (
      (receipt.syncType !== expectedSyncType && !usedDocumentedFallback) ||
      typeof receipt.eventsProcessed !== 'number' ||
      !Number.isInteger(receipt.eventsProcessed) ||
      receipt.eventsProcessed < 0 ||
      typeof receipt.syncToken !== 'string' ||
      !receipt.syncToken
    ) {
      throw new Error('Calendar sync completed without a valid durable receipt.');
    }
  }

  async setupCalendarWatch(calendarAccountId: string): Promise<void> {
    const receipt = await this.invokeAuthenticated<FunctionResult & {
      channelId?: unknown;
      expiresAt?: unknown;
    }>('calendar-watch', {
      action: 'setup',
      calendarAccountId,
    }, 'Calendar synced, but live update setup failed');

    const watchExpiry = typeof receipt.expiresAt === 'string'
      ? Date.parse(receipt.expiresAt)
      : Number.NaN;
    if (
      typeof receipt.channelId !== 'string' ||
      !receipt.channelId ||
      !Number.isFinite(watchExpiry) ||
      watchExpiry <= Date.now()
    ) {
      throw new Error('Calendar live updates started without a valid watch receipt.');
    }
  }

  async initializeCalendarAccount(calendarAccountId: string): Promise<CanonicalCalendarAccount> {
    await this.syncCalendarAccount(calendarAccountId, true);
    await this.setupCalendarWatch(calendarAccountId);

    const account = await this.getCanonicalCalendarAccount(calendarAccountId);
    if (!account || !account.connected) {
      throw new Error(
        account?.syncError ||
        'Calendar setup finished without an active sync and watch receipt. Try connecting again.',
      );
    }

    return account;
  }

  async getCanonicalCalendarAccounts(): Promise<CanonicalCalendarAccount[]> {
    const session = await this.requireAuthenticatedSession();
    const { data, error } = await supabase
      .from('calendar_accounts')
      .select(
        'id, account_email, account_name, provider, calendar_id, calendar_name, sync_status, last_sync_error, watch_status, watch_channel_id, watch_resource_id, watch_expires_at',
      )
      .eq('user_id', session.userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Unable to load connected calendars: ${error.message}`);
    }

    return (data || []).map((account) => {
      const watchExpiry = account.watch_expires_at
        ? Date.parse(account.watch_expires_at)
        : Number.NaN;

      return {
        id: account.id,
        accountEmail: account.account_email,
        accountName: account.account_name,
        provider: account.provider,
        calendarId: account.calendar_id || 'primary',
        calendarName: account.calendar_name || account.account_name,
        syncStatus: account.sync_status,
        syncError: account.last_sync_error,
        watchStatus: account.watch_status,
        watchChannelId: account.watch_channel_id,
        watchResourceId: account.watch_resource_id,
        watchExpiresAt: account.watch_expires_at,
        connected: account.sync_status === 'complete' &&
          account.watch_status === 'active' &&
          Boolean(account.watch_channel_id) &&
          Boolean(account.watch_resource_id) &&
          Number.isFinite(watchExpiry) &&
          watchExpiry > Date.now(),
      };
    });
  }

  async getCanonicalCalendarAccount(
    calendarAccountId: string,
  ): Promise<CanonicalCalendarAccount | null> {
    const accounts = await this.getCanonicalCalendarAccounts();
    return accounts.find((account) => account.id === calendarAccountId) || null;
  }

  async getCanonicalCalendarEvents(
    calendarAccountId: string,
  ): Promise<CanonicalCalendarEvent[]> {
    const session = await this.requireAuthenticatedSession();
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, description, location, attendees')
      .eq('user_id', session.userId)
      .eq('calendar_account_id', calendarAccountId)
      .gte('start_time', timeMin)
      .lte('start_time', timeMax)
      .order('start_time', { ascending: true })
      .limit(10);

    if (error) {
      throw new Error(`Unable to load synced Calendar events: ${error.message}`);
    }

    return (data || []).map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start_time,
      end: event.end_time,
      description: event.description || undefined,
      location: event.location || undefined,
      attendees: Array.isArray(event.attendees)
        ? event.attendees.flatMap((attendee) => {
            if (typeof attendee === 'string') return [attendee];
            if (
              attendee &&
              typeof attendee === 'object' &&
              'email' in attendee &&
              typeof attendee.email === 'string'
            ) return [attendee.email];
            return [];
          })
        : [],
    }));
  }

  async getConnectedAccounts(): Promise<OAuthAccount[]> {
    const session = await this.requireAuthenticatedSession();

    const { data, error } = await supabase
      .from('oauth_accounts_metadata')
      .select(
        'id,user_id,provider,provider_user_id,expires_at,last_used_at,scopes,scopes_string,account_email,token_type,created_at,updated_at',
      )
      .eq('user_id', session.userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Unable to load connected accounts: ${error.message}`);
    }

    return (data || []).map((account) => ({
        id: account.id,
        user_id: account.user_id,
        provider: account.provider as OAuthAccount['provider'],
        provider_user_id: account.provider_user_id,
        expires_at: account.expires_at || undefined,
        last_used_at: account.last_used_at || undefined,
        scopes: account.scopes_string
          ? account.scopes_string.split(' ').filter(Boolean)
          : (account.scopes || []),
        scopes_string: account.scopes_string || undefined,
        account_email: account.account_email || '',
        token_type: account.token_type || undefined,
        created_at: account.created_at || undefined,
        updated_at: account.updated_at || undefined,
      }));
  }

  async refreshAccessToken(accountId: string): Promise<{ expiresAt: string }> {
    const receipt = await this.invokeAuthenticated<FunctionResult & {
      accountId?: unknown;
      expiresAt?: unknown;
      access_token?: unknown;
      refresh_token?: unknown;
      accessToken?: unknown;
      refreshToken?: unknown;
    }>('oauth-google-refresh', { account_id: accountId }, 'Unable to refresh Google access');

    if (
      'access_token' in receipt || 'refresh_token' in receipt ||
      'accessToken' in receipt || 'refreshToken' in receipt
    ) {
      throw new Error('The OAuth refresh response exposed provider credentials and was rejected.');
    }
    if (receipt.accountId !== accountId || typeof receipt.expiresAt !== 'string') {
      throw new Error('Google access refreshed without a valid server receipt.');
    }
    return { expiresAt: receipt.expiresAt };
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

  async requestScopeEscalation(request: ScopeRequest): Promise<OAuthStartResult> {
    if (request.service !== 'email') {
      throw new Error('Google Calendar uses its dedicated read-only authorization flow.');
    }

    const list = Array.isArray(request.requiredScopes) ? request.requiredScopes : [];
    const defaultScope = DEFAULT_SCOPES.gmail;
    const scope = list.length ? list.join(' ') : defaultScope;

    const data = await this.invokeAuthenticated<FunctionResult & {
      authUrl?: unknown;
      state?: unknown;
    }>('oauth-google-start', {
      scope,
      service: 'email',
      reason: request.reason,
      accountId: request.accountId,
    }, 'Unable to start Gmail authorization');

    if (typeof data.state !== 'string' || !data.state) {
      throw new Error('The server did not return an OAuth state value.');
    }
    return {
      authUrl: validateGoogleOAuthUrl(data.authUrl, data.state),
      state: data.state,
    };
  }

  redirectToGoogleOAuth(
    oauthStart: OAuthStartResult,
    navigation: Pick<Location, 'assign'> = window.location,
    storage: Storage = window.sessionStorage,
  ): void {
    try {
      storePendingGoogleOAuth(oauthStart.state, storage);
    } catch {
      throw new Error(
        'Unable to save the secure Google handoff. Enable session storage and try again.',
      );
    }

    try {
      navigation.assign(oauthStart.authUrl);
    } catch {
      clearPendingGoogleOAuth(storage);
      throw new Error('Unable to open Google authorization. Please try again.');
    }
  }

  async completeGoogleOAuth(code: string, state: string): Promise<GoogleOAuthResult> {
    if (!code || !state) {
      throw new Error('Google did not return a complete authorization response.');
    }

    const data = await this.invokeAuthenticated<FunctionResult & {
      oauthAccountId?: unknown;
      account?: unknown;
      scopes?: unknown;
      access_token?: unknown;
      refresh_token?: unknown;
    }>('oauth-google-callback', { code, state }, 'Unable to finish Gmail authorization');
    const accountPayload = data.account && typeof data.account === 'object'
      ? data.account as Record<string, unknown>
      : null;
    if (
      'access_token' in data || 'refresh_token' in data ||
      'accessToken' in data || 'refreshToken' in data ||
      Boolean(accountPayload && (
        'access_token' in accountPayload || 'refresh_token' in accountPayload ||
        'accessToken' in accountPayload || 'refreshToken' in accountPayload
      ))
    ) {
      throw new Error('The OAuth response exposed provider credentials and was rejected.');
    }
    if (typeof data.oauthAccountId !== 'string' || !data.oauthAccountId) {
      throw new Error('Google authorization completed without an account receipt.');
    }
    if (
      !accountPayload || typeof accountPayload.id !== 'string' ||
      typeof accountPayload.email !== 'string' ||
      typeof accountPayload.provider !== 'string'
    ) {
      throw new Error('Google authorization returned an invalid account receipt.');
    }

    return {
      oauthAccountId: data.oauthAccountId,
      account: {
        id: accountPayload.id,
        email: accountPayload.email,
        provider: accountPayload.provider,
        expiresAt: typeof accountPayload.expiresAt === 'string'
          ? accountPayload.expiresAt
          : null,
        lastUsedAt: typeof accountPayload.lastUsedAt === 'string'
          ? accountPayload.lastUsedAt
          : null,
      },
      scopes: Array.isArray(data.scopes)
        ? data.scopes.filter((scope): scope is string => typeof scope === 'string')
        : [],
    };
  }

  async revokeAccess(accountId: string): Promise<void> {
    const receipt = await this.invokeAuthenticated<FunctionResult & {
      accountId?: unknown;
      providerStatus?: unknown;
      access_token?: unknown;
      refresh_token?: unknown;
      accessToken?: unknown;
      refreshToken?: unknown;
    }>('oauth-google-revoke', { account_id: accountId }, 'Unable to revoke Google access');
    if (
      'access_token' in receipt || 'refresh_token' in receipt ||
      'accessToken' in receipt || 'refreshToken' in receipt
    ) {
      throw new Error('The OAuth revoke response exposed provider credentials and was rejected.');
    }
    if (
      receipt.accountId !== accountId ||
      !['revoked', 'already-revoked'].includes(String(receipt.providerStatus))
    ) {
      throw new Error('Google access was revoked without a valid server receipt.');
    }
  }

  // Alias for consistency with plugin naming
  async revokeAccount(accountId: string): Promise<void> {
    return this.revokeAccess(accountId);
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
