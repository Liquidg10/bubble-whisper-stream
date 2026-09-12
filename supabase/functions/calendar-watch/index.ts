import {
  type MindManualWorkLifecycle,
  wrapMindManualSubjectHandler,
} from "../_shared/migrationWriteFence.ts";
import {
  calendarWatchMigrationScope,
  retainCalendarLeaseForUncertainCompletion,
  type CalendarWatchMigrationContext,
  type CalendarWatchProviderMigrationContext,
} from "../_shared/calendarMigrationScope.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  createCalendarWatchChannelToken,
  replaceCalendarWatchChannelSafely,
  requireCalendarWatchWebhookSecret,
} from "../_shared/calendarWatchSecurity.ts";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Calendar-Watch-Contract': 'hmac-v1',
};

interface GoogleWatchResponse {
  id: string;
  resourceId: string;
  resourceUri: string;
  token?: string;
  expiration: string;
  type: string;
  address: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface StoredOAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  encryptionKey: CryptoKey;
}

async function loadStoredOAuthCredentials(tokens: {
  access_token: string;
  refresh_token: string | null;
}): Promise<StoredOAuthCredentials> {
  const encryptionKey = await loadOAuthTokenEncryptionKey();

  return {
    accessToken: await decryptOAuthToken(tokens.access_token, encryptionKey),
    refreshToken: tokens.refresh_token
      ? await decryptOAuthToken(tokens.refresh_token, encryptionKey)
      : null,
    encryptionKey,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      }),
    });

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      console.error(`Calendar token refresh failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch {
    console.error('Calendar token refresh transport failed');
    return null;
  }
}

async function setupWatchChannel(
  accessToken: string,
  calendarId: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<GoogleWatchResponse> {
  const channelId = `calendar-${calendarId.replace('@', '-')}-${Date.now()}`;
  const channelToken = await createCalendarWatchChannelToken(
    channelId,
    webhookSecret,
  );
  
  const watchRequest = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: channelToken,
  };

  console.log('Setting up Calendar watch channel');

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(watchRequest),
    }
  );

  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    console.error(`Calendar watch setup failed with status ${response.status}`);
    throw new Error('CALENDAR_WATCH_SETUP_FAILED');
  }

  const result = await response.json();
  console.log('Calendar watch channel created');
  return result;
}

async function stopWatchChannel(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<boolean> {
  const stopRequest = {
    id: channelId,
    resourceId: resourceId,
  };

  console.log('Stopping Calendar watch channel');

  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/channels/stop',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stopRequest),
      }
    );

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      console.warn(`Calendar watch stop failed with status ${response.status}`);
      // Keep the product's best-effort behavior while telling the migration
      // lifecycle that provider completion is not proven.
      return false;
    } else {
      console.log('✅ Watch channel stopped successfully');
      return true;
    }
  } catch {
    // A transient cleanup failure must not turn a successful, persisted
    // replacement into a reported renewal failure or dead-channel retry loop.
    console.warn('Calendar watch stop transport failed');
    return false;
  }
}

async function updateWatchChannelStatus(
  calendarAccountId: string,
  ownerUserId: string,
  status: 'inactive' | 'active' | 'expired' | 'failed',
  channelId?: string,
  resourceId?: string,
  expiresAt?: string
) {
  const updates: any = { watch_status: status };
  
  if (channelId) {
    updates.watch_channel_id = channelId;
  }
  if (resourceId) {
    updates.watch_resource_id = resourceId;
  }
  if (expiresAt) {
    updates.watch_expires_at = expiresAt;
  }

  const { error } = await supabase
    .from('calendar_accounts')
    .update(updates)
    .eq('id', calendarAccountId)
    .eq('user_id', ownerUserId)
    .select('id')
    .single();

  if (error) {
    console.error('Calendar watch status persistence failed');
    throw new Error('CALENDAR_WATCH_STATUS_PERSISTENCE_FAILED');
  }
}

async function handleWebhookNotification(
  scope: CalendarWatchProviderMigrationContext,
  lifecycle: MindManualWorkLifecycle,
): Promise<Response> {
  // Revalidate after admission: a channel may have been replaced while the
  // resolver was acquiring its lease. Never sync a stale or reassigned row.
  const { data: activeAccount, error: lookupError } = await supabase
    .from('calendar_accounts')
    .select('id')
    .eq('id', scope.calendarAccountId)
    .eq('user_id', scope.subjectId)
    .eq('watch_channel_id', scope.channelId)
    .eq('watch_resource_id', scope.resourceId)
    .eq('watch_status', 'active')
    .maybeSingle();
  if (lookupError) {
    return new Response('Calendar notification temporarily unavailable', {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  }
  if (!activeAccount) return new Response('OK', { status: 200 });
  console.log('Calendar changes detected; triggering incremental sync');
  let childOutcomeUncertain = false;
  try {
    // The service-role client deliberately invokes the mixed calendar-sync
    // resolver, which binds this account back to the same authoritative owner.
    const { data: syncData, error: syncError } = await supabase.functions.invoke('calendar-sync', {
      body: {
        calendarAccountId: scope.calendarAccountId,
        fullSync: false,
        boundedWindow: false,
      },
    });

    if (syncError || syncData?.success !== true) {
      childOutcomeUncertain = true;
      console.error('Calendar incremental child sync failed');
      console.log('🔄 Falling back to bounded window sync...');
      const { data: boundedSyncData, error: boundedSyncError } = await supabase.functions.invoke('calendar-sync', {
        body: {
          calendarAccountId: scope.calendarAccountId,
          fullSync: true,
          boundedWindow: true,
        },
      });

      if (boundedSyncError || boundedSyncData?.success !== true) {
        console.error('Calendar bounded child sync failed');
      } else {
        console.log('✅ Bounded sync fallback succeeded');
      }
    } else {
      console.log('✅ Incremental sync triggered successfully');
    }
  } catch {
    childOutcomeUncertain = true;
    console.error('Calendar child sync transport failed');
  }

  retainCalendarLeaseForUncertainCompletion(lifecycle, !childOutcomeUncertain);

  return new Response('OK', { status: 200 });
}

const handler = async (
  _req: Request,
  lifecycle: MindManualWorkLifecycle,
  scope: CalendarWatchMigrationContext,
): Promise<Response> => {
  try {
    if (scope.kind === 'provider') {
      return await handleWebhookNotification(scope, lifecycle);
    }
    const { calendarAccountId, action, subjectId } = scope;
    console.log('Calendar watch control request');

    // Resolver authentication is authoritative, but every service-role query
    // still binds the row to that same owner.
    const watchAccountQuery = supabase
      .from('calendar_accounts')
      .select(`
        *,
        oauth_tokens!calendar_accounts_oauth_token_id_fkey (
          access_token,
          refresh_token,
          token_expires_at
        )
      `)
      .eq('id', calendarAccountId)
      .eq('user_id', subjectId)
      .eq('oauth_tokens.user_id', subjectId);
    const { data: calendarAccount, error: accountError } = await watchAccountQuery.single();

    if (accountError || !calendarAccount) {
      return new Response(
        JSON.stringify({ error: 'Calendar account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const storedCredentials = await loadStoredOAuthCredentials(calendarAccount.oauth_tokens);
    let accessToken = storedCredentials.accessToken;
    const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);

    if (tokenExpiry <= new Date()) {
      if (!storedCredentials.refreshToken) {
        return new Response(
          JSON.stringify({ error: 'Calendar authorization must be renewed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const newToken = await refreshAccessToken(storedCredentials.refreshToken);
      if (!newToken) {
        retainCalendarLeaseForUncertainCompletion(lifecycle, false);
        return new Response(
          JSON.stringify({ error: 'Token refresh failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      accessToken = newToken;
      const { error: tokenUpdateError } = await supabase
        .from('oauth_tokens')
        .update({
          access_token: await encryptOAuthToken(newToken, storedCredentials.encryptionKey),
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
        .eq('id', calendarAccount.oauth_token_id)
        .eq('user_id', subjectId)
        .select('id')
        .single();
      if (tokenUpdateError) throw new Error('Failed to persist refreshed Calendar token');
    }

    if (action === 'renew') {
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
      let previousStopSettled = true;
      const watchResponse = await replaceCalendarWatchChannelSafely(
        Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
        {
          setupReplacement: (webhookSecret) => setupWatchChannel(
            accessToken, calendarAccount.calendar_id || 'primary', webhookUrl, webhookSecret,
          ),
          persistReplacement: (replacement) => updateWatchChannelStatus(
            calendarAccountId, subjectId, 'active', replacement.id, replacement.resourceId,
            new Date(parseInt(replacement.expiration)).toISOString(),
          ),
          stopPrevious: async () => {
            if (calendarAccount.watch_channel_id && calendarAccount.watch_resource_id) {
              previousStopSettled = await stopWatchChannel(
                accessToken, calendarAccount.watch_channel_id, calendarAccount.watch_resource_id,
              );
            }
          },
        },
      );
      retainCalendarLeaseForUncertainCompletion(lifecycle, previousStopSettled);
      return new Response(JSON.stringify({
        success: true,
        message: 'Watch channel renewed',
        channelId: watchResponse.id,
        expiresAt: new Date(parseInt(watchResponse.expiration)),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'setup') {
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
      const existingExpiry = calendarAccount.watch_expires_at
        ? Date.parse(calendarAccount.watch_expires_at)
        : Number.NaN;
      if (
        calendarAccount.watch_status === 'active' &&
        calendarAccount.watch_channel_id &&
        calendarAccount.watch_resource_id &&
        Number.isFinite(existingExpiry) &&
        existingExpiry > Date.now() + 5 * 60 * 1000
      ) {
        return new Response(JSON.stringify({
          success: true,
          channelId: calendarAccount.watch_channel_id,
          expiresAt: new Date(existingExpiry).toISOString(),
          reused: true,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (calendarAccount.watch_channel_id && calendarAccount.watch_resource_id) {
        let previousStopSettled = true;
        const watchResponse = await replaceCalendarWatchChannelSafely(
          Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
          {
            setupReplacement: (webhookSecret) => setupWatchChannel(
              accessToken, calendarAccount.calendar_id || 'primary', webhookUrl, webhookSecret,
            ),
            persistReplacement: (replacement) => updateWatchChannelStatus(
              calendarAccountId, subjectId, 'active', replacement.id, replacement.resourceId,
              new Date(parseInt(replacement.expiration)).toISOString(),
            ),
            stopPrevious: async () => {
              previousStopSettled = await stopWatchChannel(
                accessToken, calendarAccount.watch_channel_id, calendarAccount.watch_resource_id,
              );
            },
          },
        );
        retainCalendarLeaseForUncertainCompletion(lifecycle, previousStopSettled);
        return new Response(JSON.stringify({
          success: true,
          channelId: watchResponse.id,
          expiresAt: new Date(parseInt(watchResponse.expiration)).toISOString(),
          replaced: true,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const webhookSecret = requireCalendarWatchWebhookSecret(
        Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
      );
      const watchResponse = await setupWatchChannel(
        accessToken, calendarAccount.calendar_id || 'primary', webhookUrl, webhookSecret,
      );
      await updateWatchChannelStatus(
        calendarAccountId, subjectId, 'active', watchResponse.id, watchResponse.resourceId,
        new Date(parseInt(watchResponse.expiration)).toISOString(),
      );
      return new Response(JSON.stringify({
        success: true,
        channelId: watchResponse.id,
        expiresAt: new Date(parseInt(watchResponse.expiration)),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let stopSettled = true;
    if (calendarAccount.watch_channel_id && calendarAccount.watch_resource_id) {
      stopSettled = await stopWatchChannel(
        accessToken, calendarAccount.watch_channel_id, calendarAccount.watch_resource_id,
      );
    }
    await updateWatchChannelStatus(calendarAccountId, subjectId, 'inactive');
    retainCalendarLeaseForUncertainCompletion(lifecycle, stopSettled);
    return new Response(
      JSON.stringify({ success: true, message: 'Watch channel stopped' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch {
    console.error('Calendar watch operation failed');
    return new Response(JSON.stringify({
      error: 'Watch operation failed',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
};

serve(wrapMindManualSubjectHandler(
  "calendar-watch",
  calendarWatchMigrationScope(),
  handler,
));
