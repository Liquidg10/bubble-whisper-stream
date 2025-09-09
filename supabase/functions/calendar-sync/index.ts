import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  calendarAccountId: string;
  fullSync?: boolean;
  simulate410?: boolean;
  timeWindow?: {
    startDays?: number;
    endDays?: number;
  };
  boundedWindow?: boolean;
}

interface CalendarWriteRequest {
  action: 'create_event' | 'update_event' | 'delete_event';
  calendarAccountId: string;
  eventData?: any;
  eventId?: string;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  draft?: boolean;
}

interface CalendarSyncWindow {
  timeMin: string;
  timeMax: string;
  windowDays: number;
}

interface GoogleCalendarEvent {
  id: string;
  etag?: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
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

function createSyncWindow(windowDays: number = 90): CalendarSyncWindow {
  const now = new Date();
  const timeMin = new Date(now.getTime() - (windowDays * 24 * 60 * 60 * 1000));
  const timeMax = new Date(now.getTime() + (windowDays * 24 * 60 * 60 * 1000));
  
  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    windowDays
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

async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventData: any,
  sendUpdates: 'all' | 'externalOnly' | 'none' = 'none'
): Promise<GoogleCalendarEvent> {
  const params = new URLSearchParams();
  if (eventData.attendees && eventData.attendees.length > 0) {
    params.append('sendUpdates', sendUpdates);
  }
  
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  
  console.log('📅 Creating calendar event:', { calendarId, eventData, sendUpdates });

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
    console.error('❌ Create event error:', response.status, errorText);
    throw new Error(`Calendar API error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  sendUpdates: 'all' | 'externalOnly' | 'none' = 'none'
): Promise<void> {
  const params = new URLSearchParams({ sendUpdates });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${params}`;
  
  console.log('🗑️ Deleting calendar event:', { calendarId, eventId, sendUpdates });

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    console.error('❌ Delete event error:', response.status, errorText);
    throw new Error(`Calendar API error: ${response.status} ${errorText}`);
  }
}

async function syncCalendarEvents(
  accessToken: string,
  calendarId: string,
  calendarAccountId: string,
  userId: string,
  syncToken?: string,
  simulate410 = false,
  timeWindow?: { startDays?: number; endDays?: number },
  boundedWindow = false
): Promise<{ success: boolean; data?: any; error?: string; syncToken?: string; requiresFullSync?: boolean }> {
  try {
    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&singleEvents=true&orderBy=startTime`;
    
    // Handle incremental sync with syncToken
    if (syncToken && !simulate410) {
      url += `&syncToken=${encodeURIComponent(syncToken)}`;
      console.log('🔄 Incremental sync with syncToken');
    } else {
      // Bounded window sync - use ±90 days by default or custom window
      const windowDays = boundedWindow ? 90 : (timeWindow?.startDays ?? 30);
      const syncWindow = createSyncWindow(windowDays);
      
      url += `&timeMin=${syncWindow.timeMin}&timeMax=${syncWindow.timeMax}`;
      console.log(`📅 Bounded sync: ${syncWindow.timeMin} to ${syncWindow.timeMax} (±${syncWindow.windowDays} days)`);
    }

    if (simulate410) {
      console.log('🧪 Simulating 410 Gone error');
      return { success: false, error: '410 Gone - Invalid sync token', requiresFullSync: true };
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Calendar API error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 401) {
        throw new Error('Token expired - refresh required');
      }
      
      // Handle 410 Gone - invalid sync token
      if (response.status === 410 || errorText.includes('invalidSyncToken')) {
        console.log('🔄 Received 410 Gone - sync token invalid, triggering bounded re-sync');
        return { success: false, error: '410 Gone - Invalid sync token', requiresFullSync: true };
      }
      
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data: GoogleCalendarResponse = await response.json();
    console.log(`📥 Retrieved ${data.items?.length || 0} events`);

    // Persist events with enhanced data
    if (data.items && data.items.length > 0) {
      await persistEvents(calendarAccountId, userId, data.items);
    }

    return {
      success: true,
      data,
      syncToken: data.nextSyncToken
    };

  } catch (error: any) {
    console.error('❌ Sync error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function persistEvents(calendarAccountId: string, userId: string, events: GoogleCalendarEvent[]): Promise<void> {
  if (!events || events.length === 0) {
    console.log('📝 No events to persist');
    return;
  }

  console.log(`📝 Persisting ${events.length} events`);

  for (const event of events) {
    try {
      // Extract timezone information
      const startTz = event.start?.timeZone;
      const endTz = event.end?.timeZone;
      
      // Convert Google event to our enhanced schema
      const eventData = {
        calendar_account_id: calendarAccountId,
        user_id: userId,
        external_event_id: event.id,
        etag: event.etag || null,
        title: event.summary || 'Untitled Event',
        description: event.description || null,
        location: event.location || null,
        start_time: event.start?.dateTime || event.start?.date,
        end_time: event.end?.dateTime || event.end?.date,
        start_tz: startTz || null,
        end_tz: endTz || null,
        status: event.status || 'confirmed',
        attendees: event.attendees || [],
        html_link: event.htmlLink || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Upsert the event with enhanced data
      const { error } = await supabase
        .from('calendar_events')
        .upsert(eventData, { 
          onConflict: 'calendar_account_id,external_event_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`❌ Failed to persist event ${event.id}:`, error);
      }
    } catch (error) {
      console.error(`❌ Error processing event ${event.id}:`, error);
    }
  }

  console.log('✅ Events persisted successfully');
}

async function updateSyncStatus(
  calendarAccountId: string,
  status: 'idle' | 'syncing' | 'complete' | 'error',
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
    updates.last_full_sync_at = new Date().toISOString();
  }

  await supabase
    .from('calendar_accounts')
    .update(updates)
    .eq('id', calendarAccountId);
}

async function logSyncOperation(
  calendarAccountId: string,
  userId: string,
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
    items_created: itemsProcessed,
    items_updated: 0,
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}

async function createDraftEvent(calendarAccountId: string, userId: string, eventData: any): Promise<string> {
  console.log('📋 Creating draft event for preview');
  
  const draftId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Store draft in database for user preview
  const { error } = await supabase
    .from('calendar_events')
    .insert({
      id: draftId,
      calendar_account_id: calendarAccountId,
      user_id: userId,
      external_event_id: draftId,
      title: eventData.summary || 'Draft Event',
      description: eventData.description || null,
      location: eventData.location || null,
      start_time: eventData.start?.dateTime || eventData.start?.date,
      end_time: eventData.end?.dateTime || eventData.end?.date,
      start_tz: eventData.start?.timeZone || null,
      end_tz: eventData.end?.timeZone || null,
      status: 'tentative',
      attendees: eventData.attendees || [],
      updated_at: new Date().toISOString()
    });
    
  if (error) {
    console.error('❌ Failed to create draft event:', error);
    throw new Error('Failed to create draft event');
  }
  
  return draftId;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    
    // Handle write operations (create, update, delete events)
    if ('action' in requestBody) {
      const { action, calendarAccountId, eventData, eventId, sendUpdates = 'none', draft = false }: CalendarWriteRequest = requestBody;
      
      // Get calendar account details
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
        console.error('Calendar account not found:', accountError);
        return new Response(
          JSON.stringify({ error: 'Calendar account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if token needs refresh
      let accessToken = calendarAccount.oauth_tokens.access_token;
      const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);
      
      if (tokenExpiry <= new Date()) {
        console.log('🔄 Access token expired, refreshing...');
        const newToken = await refreshAccessToken(calendarAccount.oauth_tokens.refresh_token);
        
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

      const calendarId = calendarAccount.calendar_id || 'primary';
      
      switch (action) {
        case 'create_event':
          if (!eventData) {
            return new Response(
              JSON.stringify({ error: 'Event data required for create action' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (draft) {
            // Create draft for user preview
            const draftId = await createDraftEvent(calendarAccountId, calendarAccount.user_id, eventData);
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                draft: true,
                draftId,
                message: 'Draft event created for preview'
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Determine sendUpdates based on attendees
          const finalSendUpdates = eventData.attendees && eventData.attendees.length > 0 ? 'all' : 'none';
          
          const createdEvent = await createCalendarEvent(accessToken, calendarId, eventData, finalSendUpdates);
          
          // Persist to our database with enhanced schema
          await supabase.from('calendar_events').insert({
            user_id: calendarAccount.user_id,
            calendar_account_id: calendarAccountId,
            external_event_id: createdEvent.id,
            etag: createdEvent.etag || null,
            title: createdEvent.summary || 'Untitled Event',
            description: createdEvent.description || null,
            location: createdEvent.location || null,
            start_time: createdEvent.start.dateTime || createdEvent.start.date,
            end_time: createdEvent.end.dateTime || createdEvent.end.date,
            start_tz: createdEvent.start.timeZone || null,
            end_tz: createdEvent.end.timeZone || null,
            status: createdEvent.status || 'confirmed',
            attendees: createdEvent.attendees || [],
            html_link: createdEvent.htmlLink || null,
            last_synced_at: new Date().toISOString(),
          });
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              event: createdEvent,
              sendUpdates: finalSendUpdates
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
          
        case 'delete_event':
          if (!eventId) {
            return new Response(
              JSON.stringify({ error: 'Event ID required for delete action' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          await deleteCalendarEvent(accessToken, calendarId, eventId, sendUpdates);
          
          // Remove from our database
          await supabase
            .from('calendar_events')
            .delete()
            .eq('external_event_id', eventId)
            .eq('calendar_account_id', calendarAccountId);
          
          return new Response(
            JSON.stringify({ success: true, sendUpdates }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
          
        default:
          return new Response(
            JSON.stringify({ error: 'Unsupported action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }
    }

    // Handle sync operations
    const { calendarAccountId, fullSync = false, simulate410 = false, timeWindow, boundedWindow = false }: SyncRequest = requestBody;

    console.log('📅 Calendar sync request:', { calendarAccountId, fullSync, simulate410, boundedWindow });

    // Get calendar account details
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
      console.error('Calendar account not found:', accountError);
      return new Response(
        JSON.stringify({ error: 'Calendar account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update sync status to syncing
    await updateSyncStatus(calendarAccountId, 'syncing');

    // Check if token needs refresh
    let accessToken = calendarAccount.oauth_tokens.access_token;
    const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);
    
    if (tokenExpiry <= new Date()) {
      console.log('🔄 Access token expired, refreshing...');
      const newToken = await refreshAccessToken(calendarAccount.oauth_tokens.refresh_token);
      
      if (!newToken) {
        await updateSyncStatus(calendarAccountId, 'error', undefined, 'Token refresh failed');
        await logSyncOperation(calendarAccountId, calendarAccount.user_id, 'sync', 'error', 0, 'Token refresh failed');
        
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

    const calendarId = calendarAccount.calendar_id || 'primary';
    const syncToken = fullSync ? undefined : calendarAccount.next_sync_token;

    // Perform the sync
    const syncResult = await syncCalendarEvents(
      accessToken,
      calendarId,
      calendarAccountId,
      calendarAccount.user_id,
      syncToken,
      simulate410,
      timeWindow,
      boundedWindow || fullSync
    );

    // Handle 410 Gone - trigger bounded re-sync
    if (!syncResult.success && syncResult.requiresFullSync) {
      console.log('🔄 Sync token invalid, performing bounded re-sync...');
      
      // Clear the invalid sync token
      await updateSyncStatus(calendarAccountId, 'syncing', null, 'Sync token invalid, performing bounded re-sync');
      
      // Perform bounded re-sync
      const boundedSyncResult = await syncCalendarEvents(
        accessToken,
        calendarId,
        calendarAccountId,
        calendarAccount.user_id,
        undefined, // No sync token
        false,
        undefined,
        true // Enable bounded window
      );
      
      if (boundedSyncResult.success) {
        await updateSyncStatus(calendarAccountId, 'complete', boundedSyncResult.syncToken);
        await logSyncOperation(calendarAccountId, calendarAccount.user_id, 'bounded-resync', 'success', boundedSyncResult.data?.items?.length || 0);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Bounded re-sync completed successfully',
          data: boundedSyncResult.data,
          syncToken: boundedSyncResult.syncToken
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      } else {
        await updateSyncStatus(calendarAccountId, 'error', null, boundedSyncResult.error || 'Bounded re-sync failed');
        await logSyncOperation(calendarAccountId, calendarAccount.user_id, 'bounded-resync', 'error', 0, boundedSyncResult.error);
        
        return new Response(JSON.stringify({
          success: false,
          error: boundedSyncResult.error || 'Bounded re-sync failed'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }
    }

    if (syncResult.success) {
      await updateSyncStatus(calendarAccountId, 'complete', syncResult.syncToken);
      await logSyncOperation(
        calendarAccountId, 
        calendarAccount.user_id, 
        fullSync ? 'full-sync' : 'incremental-sync', 
        'success', 
        syncResult.data?.items?.length || 0
      );

      // Clean up old events outside sync window
      if (fullSync || boundedWindow) {
        const windowDays = calendarAccount.bounded_sync_window_days || 90;
        await supabase.rpc('cleanup_old_calendar_events', {
          account_id: calendarAccountId,
          window_days: windowDays
        });
      }

      return new Response(JSON.stringify({
        success: true,
        eventsProcessed: syncResult.data?.items?.length || 0,
        syncType: fullSync ? 'full' : 'incremental',
        syncToken: syncResult.syncToken,
        boundedWindow
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    } else {
      await updateSyncStatus(calendarAccountId, 'error', null, syncResult.error);
      await logSyncOperation(calendarAccountId, calendarAccount.user_id, 'sync', 'error', 0, syncResult.error);
      
      return new Response(JSON.stringify({
        success: false,
        error: syncResult.error
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

  } catch (error: any) {
    console.error('❌ Calendar sync handler error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
};

serve(handler);