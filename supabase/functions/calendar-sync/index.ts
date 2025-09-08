import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  calendarAccountId: string;
  fullSync?: boolean;
  timeWindow?: {
    start: string;
    end: string;
  };
}

interface CalendarWriteRequest {
  action: 'create_event' | 'update_event' | 'delete_event';
  calendarAccountId: string;
  eventData?: any;
  eventId?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
  updated: string;
}

interface GoogleCalendarResponse {
  items: GoogleCalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
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

async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventData: any
): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  
  console.log('Creating calendar event:', { calendarId, eventData });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Create event error:', response.status, errorText);
    throw new Error(`Calendar API error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  
  console.log('Deleting calendar event:', { calendarId, eventId });

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    console.error('Delete event error:', response.status, errorText);
    throw new Error(`Calendar API error: ${response.status} ${errorText}`);
  }
}

async function syncCalendarEvents(
  accessToken: string,
  calendarId: string,
  syncToken?: string,
  timeWindow?: { start: string; end: string }
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken?: string }> {
  const params = new URLSearchParams();
  
  if (syncToken) {
    params.append('syncToken', syncToken);
  } else {
    // Full sync with time window
    const timeMin = timeWindow?.start || new Date().toISOString();
    const timeMax = timeWindow?.end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    params.append('timeMin', timeMin);
    params.append('timeMax', timeMax);
    params.append('singleEvents', 'true');
    params.append('orderBy', 'startTime');
  }

  params.append('maxResults', '250');

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  
  console.log('Fetching calendar events:', { calendarId, syncToken: !!syncToken, url });

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 410) {
      // Sync token expired, need full sync
      throw new Error('SYNC_TOKEN_EXPIRED');
    }
    throw new Error(`Calendar API error: ${response.status} ${await response.text()}`);
  }

  const data: GoogleCalendarResponse = await response.json();
  
  return {
    events: data.items || [],
    nextSyncToken: data.nextSyncToken,
  };
}

async function persistEvents(calendarAccountId: string, userId: string, events: GoogleCalendarEvent[]) {
  const eventRecords = events.map(event => ({
    user_id: userId,
    calendar_account_id: calendarAccountId,
    external_event_id: event.id,
    title: event.summary || 'Untitled Event',
    description: event.description || null,
    location: event.location || null,
    start_time: event.start.dateTime || event.start.date,
    end_time: event.end.dateTime || event.end.date,
    status: event.status || 'confirmed',
    attendees: event.attendees ? JSON.stringify(event.attendees) : null,
  }));

  console.log(`Persisting ${eventRecords.length} events`);

  // Use upsert to handle idempotent updates
  const { error } = await supabase
    .from('calendar_events')
    .upsert(eventRecords, {
      onConflict: 'external_event_id,calendar_account_id',
    });

  if (error) {
    console.error('Error persisting events:', error);
    throw new Error(`Database error: ${error.message}`);
  }

  return eventRecords.length;
}

async function updateSyncStatus(
  calendarAccountId: string,
  status: 'syncing' | 'complete' | 'error',
  syncToken?: string,
  error?: string
) {
  const updates: any = { sync_status: status };
  
  if (syncToken) {
    updates.next_sync_token = syncToken;
  }
  
  if (error) {
    updates.last_sync_error = error;
  } else {
    updates.last_sync_error = null;
  }

  if (status === 'complete') {
    updates.last_sync_at = new Date().toISOString();
  }

  await supabase
    .from('calendar_accounts')
    .update(updates)
    .eq('id', calendarAccountId);
}

async function logSyncOperation(
  userId: string,
  calendarAccountId: string,
  operation: string,
  status: 'success' | 'error',
  itemsProcessed: number = 0,
  errorMessage?: string
) {
  await supabase.from('sync_logs').insert({
    user_id: userId,
    provider: 'google',
    service_type: 'calendar',
    account_id: calendarAccountId,
    operation,
    status,
    items_processed: itemsProcessed,
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    
    // Handle write operations (create, update, delete events)
    if ('action' in requestBody) {
      const { action, calendarAccountId, eventData, eventId }: CalendarWriteRequest = requestBody;
      
      // Get calendar account details
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
        console.error('Calendar account not found:', accountError);
        return new Response(
          JSON.stringify({ error: 'Calendar account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if token needs refresh
      let accessToken = calendarAccount.oauth_token_id.access_token;
      const tokenExpiry = new Date(calendarAccount.oauth_token_id.token_expires_at);
      
      if (tokenExpiry <= new Date()) {
        console.log('Access token expired, refreshing...');
        const newToken = await refreshAccessToken(calendarAccount.oauth_token_id.refresh_token);
        
        if (!newToken) {
          return new Response(
            JSON.stringify({ error: 'Token refresh failed' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        accessToken = newToken;
        
        // Update token in database
        await supabase
          .from('oauth_tokens')
          .update({
            access_token: newToken,
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq('id', calendarAccount.oauth_token_id);
      }

      // Execute the action
      const calendarId = calendarAccount.calendar_id || 'primary';
      
      switch (action) {
        case 'create_event':
          if (!eventData) {
            return new Response(
              JSON.stringify({ error: 'Event data required for create action' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          const createdEvent = await createCalendarEvent(accessToken, calendarId, eventData);
          
          // Persist to our database
          await supabase.from('calendar_events').insert({
            user_id: calendarAccount.user_id,
            calendar_account_id: calendarAccountId,
            external_event_id: createdEvent.id,
            title: createdEvent.summary || 'Untitled Event',
            description: createdEvent.description || null,
            location: createdEvent.location || null,
            start_time: createdEvent.start.dateTime || createdEvent.start.date,
            end_time: createdEvent.end.dateTime || createdEvent.end.date,
            status: createdEvent.status || 'confirmed',
            attendees: createdEvent.attendees ? JSON.stringify(createdEvent.attendees) : null,
          });
          
          return new Response(
            JSON.stringify({ success: true, event: createdEvent }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
          
        case 'delete_event':
          if (!eventId) {
            return new Response(
              JSON.stringify({ error: 'Event ID required for delete action' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          await deleteCalendarEvent(accessToken, calendarId, eventId);
          
          // Remove from our database
          await supabase
            .from('calendar_events')
            .delete()
            .eq('external_event_id', eventId)
            .eq('calendar_account_id', calendarAccountId);
          
          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
          
        default:
          return new Response(
            JSON.stringify({ error: 'Unsupported action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }
    }

    // Handle sync operations (existing code)
    const { calendarAccountId, fullSync = false, timeWindow }: SyncRequest = requestBody;

    console.log('Calendar sync request:', { calendarAccountId, fullSync, timeWindow });

    // Get calendar account details
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
      console.error('Calendar account not found:', accountError);
      return new Response(
        JSON.stringify({ error: 'Calendar account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update sync status to syncing
    await updateSyncStatus(calendarAccountId, 'syncing');

    // Check if token needs refresh
    let accessToken = calendarAccount.oauth_token_id.access_token;
    const tokenExpiry = new Date(calendarAccount.oauth_token_id.token_expires_at);
    
    if (tokenExpiry <= new Date()) {
      console.log('Access token expired, refreshing...');
      const newToken = await refreshAccessToken(calendarAccount.oauth_token_id.refresh_token);
      
      if (!newToken) {
        await updateSyncStatus(calendarAccountId, 'error', undefined, 'Token refresh failed');
        await logSyncOperation(calendarAccount.user_id, calendarAccountId, 'sync', 'error', 0, 'Token refresh failed');
        
        return new Response(
          JSON.stringify({ error: 'Token refresh failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      accessToken = newToken;
      
      // Update token in database
      await supabase
        .from('oauth_tokens')
        .update({
          access_token: newToken,
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
        })
        .eq('id', calendarAccount.oauth_token_id);
    }

    // Determine sync strategy
    const useSyncToken = !fullSync && calendarAccount.next_sync_token;
    
    try {
      const { events, nextSyncToken } = await syncCalendarEvents(
        accessToken,
        calendarAccount.calendar_id || 'primary',
        useSyncToken ? calendarAccount.next_sync_token : undefined,
        timeWindow
      );

      // Persist events
      const processedCount = await persistEvents(calendarAccountId, calendarAccount.user_id, events);

      // Update sync status
      await updateSyncStatus(calendarAccountId, 'complete', nextSyncToken);
      
      // Log success
      await logSyncOperation(
        calendarAccount.user_id,
        calendarAccountId,
        fullSync ? 'full_sync' : 'incremental_sync',
        'success',
        processedCount
      );

      console.log(`Sync completed: ${processedCount} events processed`);

      return new Response(
        JSON.stringify({
          success: true,
          eventsProcessed: processedCount,
          syncType: fullSync ? 'full' : 'incremental',
          nextSyncToken,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (syncError: any) {
      console.error('Sync error:', syncError);
      
      if (syncError.message === 'SYNC_TOKEN_EXPIRED') {
        console.log('Sync token expired, triggering full sync...');
        
        // Retry with full sync
        const { events, nextSyncToken } = await syncCalendarEvents(
          accessToken,
          calendarAccount.calendar_id || 'primary',
          undefined,
          timeWindow
        );

        const processedCount = await persistEvents(calendarAccountId, calendarAccount.user_id, events);
        await updateSyncStatus(calendarAccountId, 'complete', nextSyncToken);
        
        await logSyncOperation(
          calendarAccount.user_id,
          calendarAccountId,
          'full_sync_after_token_expiry',
          'success',
          processedCount
        );

        return new Response(
          JSON.stringify({
            success: true,
            eventsProcessed: processedCount,
            syncType: 'full_after_token_expiry',
            nextSyncToken,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle other sync errors
      await updateSyncStatus(calendarAccountId, 'error', undefined, syncError.message);
      await logSyncOperation(
        calendarAccount.user_id,
        calendarAccountId,
        fullSync ? 'full_sync' : 'incremental_sync',
        'error',
        0,
        syncError.message
      );

      throw syncError;
    }

  } catch (error: any) {
    console.error('Calendar sync error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Sync failed',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);