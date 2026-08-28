import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  createCalendarWatchChannelToken,
  extractBearerToken,
  isCalendarWatchAction,
  isExactServiceRoleBearer,
  normalizeCalendarAccountId,
  replaceCalendarWatchChannelSafely,
  requireCalendarWatchWebhookSecret,
  verifyCalendarWatchChannelToken,
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

interface WatchChannelRequest {
  calendarAccountId?: string;
  accountId?: string;
  action?: unknown;
}

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
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
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

  console.log('🔔 Setting up watch channel:', { calendarId, webhookUrl, channelId });

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
    const errorText = await response.text();
    console.error('❌ Watch channel setup failed:', errorText);
    throw new Error(`Watch channel setup failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Watch channel created:', { channelId: result.id, expiration: result.expiration });
  return result;
}

async function stopWatchChannel(accessToken: string, channelId: string, resourceId: string) {
  const stopRequest = {
    id: channelId,
    resourceId: resourceId,
  };

  console.log('🛑 Stopping watch channel:', { channelId, resourceId });

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
      const errorText = await response.text();
      console.warn('⚠️ Watch channel stop failed (may already be expired):', errorText);
      // Don't throw: the replacement channel is already persisted and active.
    } else {
      console.log('✅ Watch channel stopped successfully');
    }
  } catch (error) {
    // A transient cleanup failure must not turn a successful, persisted
    // replacement into a reported renewal failure or dead-channel retry loop.
    console.warn('⚠️ Watch channel stop request failed:', error);
  }
}

async function updateWatchChannelStatus(
  calendarAccountId: string,
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
    .eq('id', calendarAccountId);

  if (error) {
    console.error('❌ Error updating watch channel status:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

async function handleWebhookNotification(req: Request): Promise<Response> {
  const resourceState = req.headers.get('X-Goog-Resource-State');
  const resourceId = req.headers.get('X-Goog-Resource-Id');
  const channelId = req.headers.get('X-Goog-Channel-Id');
  const channelToken = req.headers.get('X-Goog-Channel-Token');
  const messageNumber = req.headers.get('X-Goog-Message-Number');

  console.log('📨 Webhook notification received:', {
    resourceState,
    resourceId,
    channelId,
    messageNumber
  });

  if (!resourceState || !resourceId || !channelId) {
    console.log('⚠️ Missing required headers');
    return new Response('Missing required headers', { status: 400 });
  }

  const validChannelToken = await verifyCalendarWatchChannelToken(
    channelToken,
    channelId,
    Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
  );
  if (!validChannelToken) {
    console.warn('⚠️ Rejected calendar webhook with an invalid channel token');
    return new Response('Unauthorized', { status: 401 });
  }

  // Handle different resource states
  if (resourceState === 'sync') {
    console.log('🔄 Initial sync notification - no action needed');
    return new Response('OK', { status: 200 });
  }

  // Find the calendar account for this channel
  const { data: account, error } = await supabase
    .from('calendar_accounts')
    .select('id, user_id, calendar_id')
    .eq('watch_channel_id', channelId)
    .eq('watch_resource_id', resourceId)
    .eq('watch_status', 'active')
    .single();

  if (error || !account) {
    console.log('⚠️ Calendar account not found for channel:', channelId);
    return new Response('OK', { status: 200 }); // Still return 200 to acknowledge
  }

  // Handle exists state - calendar events have changed
  if (resourceState === 'exists') {
    console.log(`🔄 Calendar changes detected for account ${account.id} - triggering incremental sync`);
    
    try {
      // Call the calendar-sync function for incremental sync
      const { error: syncError } = await supabase.functions.invoke('calendar-sync', {
        body: {
          calendarAccountId: account.id,
          fullSync: false, // Incremental sync
          boundedWindow: false // Use sync token
        }
      });

      if (syncError) {
        console.error('❌ Failed to trigger incremental sync:', syncError);
        
        // If incremental sync fails, try bounded window sync as fallback
        console.log('🔄 Falling back to bounded window sync...');
        const { error: boundedSyncError } = await supabase.functions.invoke('calendar-sync', {
          body: {
            calendarAccountId: account.id,
            fullSync: true,
            boundedWindow: true
          }
        });
        
        if (boundedSyncError) {
          console.error('❌ Bounded sync fallback also failed:', boundedSyncError);
        } else {
          console.log('✅ Bounded sync fallback succeeded');
        }
      } else {
        console.log('✅ Incremental sync triggered successfully');
      }
    } catch (error) {
      console.error('❌ Error triggering sync:', error);
    }
  }

  return new Response('OK', { status: 200 });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook notifications from Google
  if (req.method === 'POST' && req.headers.get('X-Goog-Channel-Id')) {
    return await handleWebhookNotification(req);
  }

  // Handle control requests (setup, renew, stop)
  if (req.method === 'POST') {
    try {
      // ---- AUTHZ (added) ------------------------------------------------
      // The webhook branch above is Google-originated and carries no user JWT.
      // Everything below is a control request and must be caller-scoped, because
      // this function uses the SERVICE ROLE key and RLS will not scope rows for us.
      // watch-renewal-cron invokes this function with the service-role key.
      const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
      const bearer = extractBearerToken(authHeader);
      if (!bearer) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const isInternalCaller = isExactServiceRoleBearer(
        authHeader,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      );

      let callerUserId: string | null = null;
      if (!isInternalCaller) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);
        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        callerUserId = user.id;
      }
      // ---- end AUTHZ ------------------------------------------------------

      const requestBody: WatchChannelRequest = await req.json();
      if (!isCalendarWatchAction(requestBody.action)) {
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const accountIdResult = normalizeCalendarAccountId(
        requestBody.calendarAccountId,
        requestBody.accountId,
      );
      if (!accountIdResult.ok) {
        return new Response(
          JSON.stringify({ error: accountIdResult.reason }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { calendarAccountId } = accountIdResult;
      const action = requestBody.action;
      console.log('🔔 Watch channel request:', { calendarAccountId, action });

      // Get calendar account
      let watchAccountQuery = supabase
        .from('calendar_accounts')
        .select(`
          *,
          oauth_tokens!calendar_accounts_oauth_token_id_fkey (
            access_token,
            refresh_token,
            token_expires_at
          )
        `)
        .eq('id', calendarAccountId);
      // AUTHZ: bind the row to the caller unless this is a trusted internal invoke
      if (callerUserId) watchAccountQuery = watchAccountQuery.eq('user_id', callerUserId);
      const { data: calendarAccount, error: accountError } = await watchAccountQuery.single();

      if (accountError || !calendarAccount) {
        return new Response(
          JSON.stringify({ error: 'Calendar account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get fresh access token
      const storedCredentials = await loadStoredOAuthCredentials(
        calendarAccount.oauth_tokens,
      );
      let accessToken = storedCredentials.accessToken;
      const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);
      
      if (tokenExpiry <= new Date()) {
        if (!storedCredentials.refreshToken) {
          return new Response(
            JSON.stringify({ error: 'Calendar authorization must be renewed' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const newToken = await refreshAccessToken(storedCredentials.refreshToken);
        if (!newToken) {
          return new Response(
            JSON.stringify({ error: 'Token refresh failed' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        accessToken = newToken;

        const { error: tokenUpdateError } = await supabase
          .from('oauth_tokens')
          .update({
            access_token: await encryptOAuthToken(
              newToken,
              storedCredentials.encryptionKey,
            ),
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq('id', calendarAccount.oauth_token_id);

        if (tokenUpdateError) {
          throw new Error('Failed to persist refreshed Calendar token');
        }
      }

      if (action === 'renew') {
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
        const watchResponse = await replaceCalendarWatchChannelSafely(
          Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
          {
            setupReplacement: (webhookSecret) => setupWatchChannel(
              accessToken,
              calendarAccount.calendar_id || 'primary',
              webhookUrl,
              webhookSecret,
            ),
            persistReplacement: (replacement) => updateWatchChannelStatus(
              calendarAccountId,
              'active',
              replacement.id,
              replacement.resourceId,
              new Date(parseInt(replacement.expiration)).toISOString(),
            ),
            stopPrevious: async () => {
              if (calendarAccount.watch_channel_id && calendarAccount.watch_resource_id) {
                await stopWatchChannel(
                  accessToken,
                  calendarAccount.watch_channel_id,
                  calendarAccount.watch_resource_id,
                );
              }
            },
          },
        );

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Watch channel renewed',
            channelId: watchResponse.id,
            expiresAt: new Date(parseInt(watchResponse.expiration)),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (action === 'setup') {
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
        const existingExpiry = calendarAccount.watch_expires_at
          ? Date.parse(calendarAccount.watch_expires_at)
          : Number.NaN;

        // Setup is deliberately idempotent for an already healthy channel.
        // The OAuth UI can safely retry a partially completed connection
        // without creating a second Google channel when persistence succeeded.
        if (
          calendarAccount.watch_status === 'active' &&
          calendarAccount.watch_channel_id &&
          calendarAccount.watch_resource_id &&
          Number.isFinite(existingExpiry) &&
          existingExpiry > Date.now() + 5 * 60 * 1000
        ) {
          return new Response(
            JSON.stringify({
              success: true,
              channelId: calendarAccount.watch_channel_id,
              expiresAt: new Date(existingExpiry).toISOString(),
              reused: true,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        if (
          calendarAccount.watch_channel_id &&
          calendarAccount.watch_resource_id
        ) {
          const watchResponse = await replaceCalendarWatchChannelSafely(
            Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
            {
              setupReplacement: (webhookSecret) => setupWatchChannel(
                accessToken,
                calendarAccount.calendar_id || 'primary',
                webhookUrl,
                webhookSecret,
              ),
              persistReplacement: (replacement) => updateWatchChannelStatus(
                calendarAccountId,
                'active',
                replacement.id,
                replacement.resourceId,
                new Date(parseInt(replacement.expiration)).toISOString(),
              ),
              stopPrevious: () => stopWatchChannel(
                accessToken,
                calendarAccount.watch_channel_id,
                calendarAccount.watch_resource_id,
              ),
            },
          );

          return new Response(
            JSON.stringify({
              success: true,
              channelId: watchResponse.id,
              expiresAt: new Date(parseInt(watchResponse.expiration)).toISOString(),
              replaced: true,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const webhookSecret = requireCalendarWatchWebhookSecret(
          Deno.env.get('CALENDAR_WATCH_WEBHOOK_SECRET'),
        );
        const watchResponse = await setupWatchChannel(
          accessToken,
          calendarAccount.calendar_id || 'primary',
          webhookUrl,
          webhookSecret,
        );

        await updateWatchChannelStatus(
          calendarAccountId, 
          'active',
          watchResponse.id,
          watchResponse.resourceId,
          new Date(parseInt(watchResponse.expiration)).toISOString()
        );

        return new Response(
          JSON.stringify({
            success: true,
            channelId: watchResponse.id,
            expiresAt: new Date(parseInt(watchResponse.expiration)),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (action === 'stop') {
        if (calendarAccount.watch_channel_id && calendarAccount.watch_resource_id) {
          await stopWatchChannel(
            accessToken,
            calendarAccount.watch_channel_id,
            calendarAccount.watch_resource_id
          );
        }

        await updateWatchChannelStatus(calendarAccountId, 'inactive');

        return new Response(
          JSON.stringify({ success: true, message: 'Watch channel stopped' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error('❌ Calendar watch error:', error);
      
      return new Response(
        JSON.stringify({ 
          error: 'Watch operation failed',
          details: error.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('Method not allowed', { status: 405 });
};

serve(handler);
