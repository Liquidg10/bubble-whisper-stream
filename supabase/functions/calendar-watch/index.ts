import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WatchChannelRequest {
  calendarAccountId: string;
  action: 'setup' | 'renew' | 'stop';
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
  webhookUrl: string
): Promise<GoogleWatchResponse> {
  const channelId = `calendar-${calendarId.replace('@', '-')}-${Date.now()}`;
  
  const watchRequest = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: channelId, // Use channel ID as verification token
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
    // Don't throw error as channel might already be expired
  } else {
    console.log('✅ Watch channel stopped successfully');
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
  const messageNumber = req.headers.get('X-Goog-Message-Number');

  console.log('📨 Webhook notification received:', {
    resourceState,
    resourceId,
    channelId,
    messageNumber
  });

  if (!resourceState || !resourceId) {
    console.log('⚠️ Missing required headers');
    return new Response('Missing required headers', { status: 400 });
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

async function renewExpiringChannels(): Promise<void> {
  console.log('🔄 Checking for expiring watch channels...');

  // Check for channels expiring in the next 24 hours (T-1 day renewal)
  const { data: expiringChannels, error } = await supabase
    .rpc('get_expiring_watch_channels', { hours_ahead: 24 });

  if (error) {
    console.error('❌ Error fetching expiring channels:', error);
    return;
  }

  if (!expiringChannels || expiringChannels.length === 0) {
    console.log('✅ No expiring channels found');
    return;
  }

  console.log(`🔄 Found ${expiringChannels.length} expiring channels for proactive renewal`);

  for (const channel of expiringChannels) {
    try {
      console.log(`⏰ Renewing channel ${channel.watch_channel_id} for calendar ${channel.calendar_id} (expires: ${channel.watch_expires_at})`);
      await renewWatchChannel(channel.id);
    } catch (error) {
      console.error(`❌ Failed to renew channel ${channel.id}:`, error);
      
      // If renewal fails, try to recover by setting up a new channel
      try {
        console.log(`🔧 Attempting recovery by setting up new watch channel for account ${channel.id}`);
        await setupNewWatchChannel(channel.id);
      } catch (recoveryError) {
        console.error(`❌ Recovery failed for channel ${channel.id}:`, recoveryError);
        await updateWatchChannelStatus(channel.id, 'failed');
      }
    }
  }
}

async function renewWatchChannel(calendarAccountId: string): Promise<void> {
  // Get account details
  const { data: account, error: accountError } = await supabase
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
    .single();

  if (accountError || !account) {
    throw new Error(`Failed to get account details: ${accountError?.message}`);
  }

  let accessToken = account.oauth_tokens.access_token;

  // Refresh token if needed
  if (new Date(account.oauth_tokens.token_expires_at) <= new Date()) {
    accessToken = await refreshAccessToken(account.oauth_tokens.refresh_token);
    if (!accessToken) {
      throw new Error('Failed to refresh access token');
    }
  }

  // Stop old channel if it exists
  if (account.watch_channel_id && account.watch_resource_id) {
    await stopWatchChannel(accessToken, account.watch_channel_id, account.watch_resource_id);
  }

  // Setup new watch channel
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
  const watchResponse = await setupWatchChannel(accessToken, account.calendar_id || 'primary', webhookUrl);
  
  // Update database with new channel info
  await updateWatchChannelStatus(
    calendarAccountId,
    'active',
    watchResponse.id,
    watchResponse.resourceId,
    new Date(parseInt(watchResponse.expiration)).toISOString()
  );

  console.log(`✅ Successfully renewed watch channel for account ${calendarAccountId}`);
}

async function setupNewWatchChannel(calendarAccountId: string): Promise<void> {
  // Get account details
  const { data: account, error: accountError } = await supabase
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
    .single();

  if (accountError || !account) {
    throw new Error(`Failed to get account details: ${accountError?.message}`);
  }

  let accessToken = account.oauth_tokens.access_token;

  // Refresh token if needed
  if (new Date(account.oauth_tokens.token_expires_at) <= new Date()) {
    accessToken = await refreshAccessToken(account.oauth_tokens.refresh_token);
    if (!accessToken) {
      throw new Error('Failed to refresh access token');
    }
  }

  // Setup new watch channel
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
  const watchResponse = await setupWatchChannel(accessToken, account.calendar_id || 'primary', webhookUrl);
  
  // Update database with new channel info
  await updateWatchChannelStatus(
    calendarAccountId,
    'active',
    watchResponse.id,
    watchResponse.resourceId,
    new Date(parseInt(watchResponse.expiration)).toISOString()
  );

  console.log(`✅ Successfully set up new watch channel for account ${calendarAccountId}`);
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
      const { calendarAccountId, action }: WatchChannelRequest = await req.json();

      console.log('🔔 Watch channel request:', { calendarAccountId, action });

      if (action === 'renew') {
        await renewExpiringChannels();
        return new Response(
          JSON.stringify({ success: true, message: 'Channel renewal completed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get calendar account
      const { data: calendarAccount, error: accountError } = await supabase
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
        .single();

      if (accountError || !calendarAccount) {
        return new Response(
          JSON.stringify({ error: 'Calendar account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get fresh access token
      let accessToken = calendarAccount.oauth_tokens.access_token;
      const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);
      
      if (tokenExpiry <= new Date()) {
        const newToken = await refreshAccessToken(calendarAccount.oauth_tokens.refresh_token);
        if (!newToken) {
          return new Response(
            JSON.stringify({ error: 'Token refresh failed' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        accessToken = newToken;
      }

      if (action === 'setup') {
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
        const watchResponse = await setupWatchChannel(
          accessToken,
          calendarAccount.calendar_id || 'primary',
          webhookUrl
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