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
  const channelId = `calendar-${calendarId}-${Date.now()}`;
  
  const watchRequest = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: channelId, // Use channel ID as verification token
  };

  console.log('Setting up watch channel:', { calendarId, webhookUrl, channelId });

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
    console.error('Watch channel setup failed:', errorText);
    throw new Error(`Watch channel setup failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function stopWatchChannel(accessToken: string, channelId: string, resourceId: string) {
  const stopRequest = {
    id: channelId,
    resourceId: resourceId,
  };

  console.log('Stopping watch channel:', { channelId, resourceId });

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
    console.warn('Watch channel stop failed (may already be expired):', errorText);
    // Don't throw error as channel might already be expired
  }
}

async function updateWatchChannelStatus(
  calendarAccountId: string,
  status: 'active' | 'expired' | 'failed',
  channelData?: {
    channelId: string;
    resourceId: string;
    expiresAt: Date;
  }
) {
  const updates: any = { watch_status: status };
  
  if (channelData) {
    updates.watch_channel_id = channelData.channelId;
    updates.watch_resource_id = channelData.resourceId;
    updates.watch_expires_at = channelData.expiresAt.toISOString();
  }

  const { error } = await supabase
    .from('calendar_accounts')
    .update(updates)
    .eq('id', calendarAccountId);

  if (error) {
    console.error('Error updating watch channel status:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

async function handleWebhookNotification(req: Request): Promise<Response> {
  // Google sends push notifications to this endpoint
  const channelId = req.headers.get('x-goog-channel-id');
  const resourceId = req.headers.get('x-goog-resource-id');
  const resourceState = req.headers.get('x-goog-resource-state');
  const channelToken = req.headers.get('x-goog-channel-token');

  console.log('Webhook notification received:', {
    channelId,
    resourceId,
    resourceState,
    channelToken,
  });

  if (!channelId || !resourceId) {
    console.error('Missing required headers in webhook notification');
    return new Response('Bad Request', { status: 400 });
  }

  // Find the calendar account for this channel
  const { data: calendarAccount, error } = await supabase
    .from('calendar_accounts')
    .select('id, user_id, calendar_id')
    .eq('watch_channel_id', channelId)
    .eq('watch_resource_id', resourceId)
    .single();

  if (error || !calendarAccount) {
    console.error('Calendar account not found for channel:', channelId);
    return new Response('Not Found', { status: 404 });
  }

  // Handle different resource states
  if (resourceState === 'sync') {
    console.log('Initial sync notification, ignoring');
    return new Response('OK', { status: 200 });
  }

  if (resourceState === 'exists') {
    console.log('Calendar events changed, triggering incremental sync');
    
    // Trigger incremental sync
    try {
      const syncResponse = await supabase.functions.invoke('calendar-sync', {
        body: {
          calendarAccountId: calendarAccount.id,
          fullSync: false,
        },
      });

      if (syncResponse.error) {
        console.error('Failed to trigger sync:', syncResponse.error);
      } else {
        console.log('Incremental sync triggered successfully');
      }
    } catch (syncError) {
      console.error('Error triggering sync:', syncError);
    }
  }

  return new Response('OK', { status: 200 });
}

async function renewExpiringChannels() {
  console.log('Checking for expiring watch channels...');
  
  // Get channels expiring in the next 24 hours
  const { data: expiringChannels, error } = await supabase.rpc('get_expiring_watch_channels', {
    hours_ahead: 24,
  });

  if (error) {
    console.error('Error fetching expiring channels:', error);
    return;
  }

  console.log(`Found ${expiringChannels?.length || 0} expiring channels`);

  for (const channel of expiringChannels || []) {
    try {
      console.log(`Renewing channel for calendar ${channel.calendar_id}`);
      
      // Get fresh OAuth token
      const { data: tokenData, error: tokenError } = await supabase
        .from('oauth_tokens')
        .select('access_token, refresh_token, token_expires_at')
        .eq('user_id', channel.user_id)
        .eq('service_type', 'calendar')
        .single();

      if (tokenError || !tokenData) {
        console.error('OAuth token not found for user:', channel.user_id);
        continue;
      }

      let accessToken = tokenData.access_token;
      
      // Refresh token if expired
      if (new Date(tokenData.token_expires_at) <= new Date()) {
        const newToken = await refreshAccessToken(tokenData.refresh_token);
        if (!newToken) {
          console.error('Failed to refresh token for user:', channel.user_id);
          await updateWatchChannelStatus(channel.id, 'failed');
          continue;
        }
        accessToken = newToken;
      }

      // Stop old channel
      if (channel.watch_channel_id && channel.watch_resource_id) {
        await stopWatchChannel(accessToken, channel.watch_channel_id, channel.watch_resource_id);
      }

      // Setup new channel
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-watch`;
      const watchResponse = await setupWatchChannel(accessToken, channel.calendar_id, webhookUrl);
      
      // Update database
      await updateWatchChannelStatus(channel.id, 'active', {
        channelId: watchResponse.id,
        resourceId: watchResponse.resourceId,
        expiresAt: new Date(parseInt(watchResponse.expiration)),
      });

      console.log(`Successfully renewed channel for calendar ${channel.calendar_id}`);
      
    } catch (error) {
      console.error(`Failed to renew channel for calendar ${channel.calendar_id}:`, error);
      await updateWatchChannelStatus(channel.id, 'failed');
    }
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook notifications from Google
  if (req.method === 'POST' && req.headers.get('x-goog-channel-id')) {
    return await handleWebhookNotification(req);
  }

  // Handle control requests (setup, renew, stop)
  if (req.method === 'POST') {
    try {
      const { calendarAccountId, action }: WatchChannelRequest = await req.json();

      console.log('Watch channel request:', { calendarAccountId, action });

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
          oauth_token_id (
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
      let accessToken = calendarAccount.oauth_token_id.access_token;
      const tokenExpiry = new Date(calendarAccount.oauth_token_id.token_expires_at);
      
      if (tokenExpiry <= new Date()) {
        const newToken = await refreshAccessToken(calendarAccount.oauth_token_id.refresh_token);
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

        await updateWatchChannelStatus(calendarAccountId, 'active', {
          channelId: watchResponse.id,
          resourceId: watchResponse.resourceId,
          expiresAt: new Date(parseInt(watchResponse.expiration)),
        });

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
      console.error('Calendar watch error:', error);
      
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