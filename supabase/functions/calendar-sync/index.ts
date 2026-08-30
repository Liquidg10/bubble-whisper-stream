import { wrapMindManualHandler } from "../_shared/migrationWriteFence.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";
import {
  buildCalendarSyncStatusUpdate,
  buildCalendarSyncSuccessReceipt,
  type CalendarPageResult,
  type CalendarSyncWindow,
  type CalendarSyncStatus,
  type CalendarSyncStatusOptions,
  partitionCalendarEventChanges,
  processCalendarEventPages,
} from "./calendarSyncProtocol.ts";

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

interface GoogleCalendarEvent {
  id: string;
  etag?: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
  updated?: string;
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

const MAX_SYNC_WINDOW_DAYS = 365;

function normalizeWindowDays(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Calendar sync window days must be a positive number');
  }
  return Math.min(Math.ceil(value), MAX_SYNC_WINDOW_DAYS);
}

function createSyncWindow(
  timeWindow: { startDays?: number; endDays?: number } | undefined,
  defaultWindowDays: number,
): CalendarSyncWindow {
  const now = new Date();
  const startDays = normalizeWindowDays(timeWindow?.startDays, defaultWindowDays);
  const endDays = normalizeWindowDays(timeWindow?.endDays, defaultWindowDays);
  const timeMin = new Date(now.getTime() - (startDays * 24 * 60 * 60 * 1000));
  const timeMax = new Date(now.getTime() + (endDays * 24 * 60 * 60 * 1000));
  
  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
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
  syncToken?: string | null,
  simulate410 = false,
  timeWindow?: { startDays?: number; endDays?: number },
  boundedWindow = false
): Promise<CalendarPageResult> {
  if (simulate410) {
    console.log('🧪 Simulating 410 Gone error');
    return {
      success: false,
      error: '410 Gone - Invalid sync token',
      requiresFullSync: true,
      itemsProcessed: 0,
    };
  }

  const incremental = Boolean(syncToken);
  const window = incremental
    ? undefined
    : createSyncWindow(timeWindow, boundedWindow ? 90 : 30);

  if (incremental) {
    console.log('🔄 Incremental sync with syncToken');
  } else {
    console.log(`📅 Bounded sync: ${window?.timeMin} to ${window?.timeMax}`);
  }

  const result = await processCalendarEventPages<GoogleCalendarEvent>({
    accessToken,
    calendarId,
    syncToken,
    window,
  }, async (events) => {
    await persistEvents(calendarAccountId, userId, events);
  });

  if (!result.success) {
    console.error('❌ Sync error:', result.error);
    return result;
  }

  console.log(`📥 Retrieved and persisted ${result.itemsProcessed} event changes`);
  return result;
}

async function persistEvents(calendarAccountId: string, userId: string, events: GoogleCalendarEvent[]): Promise<void> {
  if (!events || events.length === 0) {
    console.log('📝 No events to persist');
    return;
  }

  const { activeEvents, cancelledEventIds } = partitionCalendarEventChanges(events);
  const eventRows = activeEvents.map((event) => {
    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;
    if (!startTime || !endTime) {
      throw new Error(`Google Calendar event ${event.id} omitted its start or end time`);
    }

    return {
        calendar_account_id: calendarAccountId,
        user_id: userId,
        external_event_id: event.id,
        etag: event.etag || null,
        title: event.summary || 'Untitled Event',
        description: event.description || null,
        location: event.location || null,
        start_time: startTime,
        end_time: endTime,
        start_tz: event.start?.timeZone || null,
        end_tz: event.end?.timeZone || null,
        status: event.status || 'confirmed',
        attendees: event.attendees || [],
        html_link: event.htmlLink || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
  });

  if (eventRows.length > 0) {
    const { error } = await supabase
      .from('calendar_events')
      .upsert(eventRows, {
        onConflict: 'calendar_account_id,external_event_id',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`Calendar event upsert failed: ${error.message}`);
    }
  }

  if (cancelledEventIds.length > 0) {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('calendar_account_id', calendarAccountId)
      .eq('user_id', userId)
      .in('external_event_id', cancelledEventIds);

    if (error) {
      throw new Error(`Cancelled Calendar event cleanup failed: ${error.message}`);
    }
  }

  console.log(
    `✅ Calendar page persisted (${eventRows.length} upserted, ${cancelledEventIds.length} cancelled)`,
  );
}

async function updateSyncStatus(
  calendarAccountId: string,
  status: CalendarSyncStatus,
  options: CalendarSyncStatusOptions = {},
) {
  const updates = buildCalendarSyncStatusUpdate(status, options);

  const { error } = await supabase
    .from('calendar_accounts')
    .update(updates)
    .eq('id', calendarAccountId);

  if (error) {
    throw new Error(`Calendar sync status update failed: ${error.message}`);
  }
}

async function logSyncOperation(
  calendarAccountId: string,
  userId: string,
  operation: string,
  status: 'success' | 'error',
  itemsProcessed: number = 0,
  errorMessage?: string
) {
  const { error } = await supabase.from('sync_logs').insert({
    user_id: userId,
    provider: 'google',
    service_type: 'calendar',
    account_id: calendarAccountId,
    operation,
    status,
    items_processed: itemsProcessed,
    items_created: 0,
    items_updated: 0,
    error_message: errorMessage,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Calendar sync receipt write failed: ${error.message}`);
  }
}

async function cleanupCalendarEventWindow(
  calendarAccountId: string,
  windowDays: number,
): Promise<void> {
  const { error } = await supabase.rpc('cleanup_old_calendar_events', {
    account_id: calendarAccountId,
    window_days: windowDays,
  });
  if (error) {
    throw new Error(`Calendar event window cleanup failed: ${error.message}`);
  }
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
    // ---- AUTHZ (added) --------------------------------------------------
    // This function runs with the SERVICE ROLE key, which bypasses RLS, so the
    // database will NOT scope rows for us. Every user-scoped lookup below must
    // therefore be explicitly bound to the caller. Mirrors the pattern already
    // used by gmail-sync / gmail-compose / plaid-get-accounts / plaid-get-transactions.
    //
    // Two legitimate caller classes:
    //   1. an end user  -> bearer is a user JWT; scope every row to that user
    //   2. an internal  -> bearer is the service-role key (calendar-watch's
    //      webhook path and watch-renewal-cron invoke this function directly);
    //      already trusted, so no user scoping is possible or required.
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const bearer = authHeader.replace('Bearer ', '').trim();
    const isInternalCaller = bearer === (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '\u0000');

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

    const requestBody = await req.json();
    
    // Handle write operations (create, update, delete events)
    if ('action' in requestBody) {
      const { action, calendarAccountId, eventData, eventId, sendUpdates = 'none', draft = false }: CalendarWriteRequest = requestBody;
      
      // Get calendar account details
      let writeAccountQuery = supabase
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
      if (callerUserId) writeAccountQuery = writeAccountQuery.eq('user_id', callerUserId);
      const { data: calendarAccount, error: accountError } = await writeAccountQuery.single();

      if (accountError || !calendarAccount) {
        console.error('Calendar account not found:', accountError);
        return new Response(
          JSON.stringify({ error: 'Calendar account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if token needs refresh
      const storedCredentials = await loadStoredOAuthCredentials(
        calendarAccount.oauth_tokens,
      );
      let accessToken = storedCredentials.accessToken;
      const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);
      
      if (tokenExpiry <= new Date()) {
        console.log('🔄 Access token expired, refreshing...');
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
        
        // Update token in database
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
          throw new Error(`Refreshed Calendar token persistence failed: ${tokenUpdateError.message}`);
        }
      }

      const calendarId = calendarAccount.calendar_id || 'primary';
      
      switch (action) {
        case 'create_event': {
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
          const createdStart = createdEvent.start?.dateTime || createdEvent.start?.date;
          const createdEnd = createdEvent.end?.dateTime || createdEvent.end?.date;
          if (!createdStart || !createdEnd) {
            throw new Error('Google Calendar created an event without start or end time');
          }
          
          // Persist to our database with enhanced schema
          const { error: createdEventInsertError } = await supabase.from('calendar_events').insert({
            user_id: calendarAccount.user_id,
            calendar_account_id: calendarAccountId,
            external_event_id: createdEvent.id,
            etag: createdEvent.etag || null,
            title: createdEvent.summary || 'Untitled Event',
            description: createdEvent.description || null,
            location: createdEvent.location || null,
            start_time: createdStart,
            end_time: createdEnd,
            start_tz: createdEvent.start?.timeZone || null,
            end_tz: createdEvent.end?.timeZone || null,
            status: createdEvent.status || 'confirmed',
            attendees: createdEvent.attendees || [],
            html_link: createdEvent.htmlLink || null,
            last_synced_at: new Date().toISOString(),
          });
          if (createdEventInsertError) {
            throw new Error(`Created Calendar event cache write failed: ${createdEventInsertError.message}`);
          }
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              event: createdEvent,
              sendUpdates: finalSendUpdates
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
          
        case 'delete_event': {
          if (!eventId) {
            return new Response(
              JSON.stringify({ error: 'Event ID required for delete action' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          await deleteCalendarEvent(accessToken, calendarId, eventId, sendUpdates);
          
          // Remove from our database
          const { error: deletedEventCacheError } = await supabase
            .from('calendar_events')
            .delete()
            .eq('external_event_id', eventId)
            .eq('calendar_account_id', calendarAccountId)
            .eq('user_id', calendarAccount.user_id);
          if (deletedEventCacheError) {
            throw new Error(`Deleted Calendar event cache cleanup failed: ${deletedEventCacheError.message}`);
          }
          
          return new Response(
            JSON.stringify({ success: true, sendUpdates }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
          
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
    let syncAccountQuery = supabase
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
    if (callerUserId) syncAccountQuery = syncAccountQuery.eq('user_id', callerUserId);
    const { data: calendarAccount, error: accountError } = await syncAccountQuery.single();

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
    const storedCredentials = await loadStoredOAuthCredentials(
      calendarAccount.oauth_tokens,
    );
    let accessToken = storedCredentials.accessToken;
    const tokenExpiry = new Date(calendarAccount.oauth_tokens.token_expires_at);
    
    if (tokenExpiry <= new Date()) {
      console.log('🔄 Access token expired, refreshing...');
      if (!storedCredentials.refreshToken) {
        await updateSyncStatus(
          calendarAccountId,
          'error',
          { error: 'Calendar authorization must be renewed' },
        );
        return new Response(
          JSON.stringify({ error: 'Calendar authorization must be renewed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newToken = await refreshAccessToken(storedCredentials.refreshToken);
      
      if (!newToken) {
        await updateSyncStatus(calendarAccountId, 'error', { error: 'Token refresh failed' });
        await logSyncOperation(calendarAccountId, calendarAccount.user_id, 'sync', 'error', 0, 'Token refresh failed');
        
        return new Response(
          JSON.stringify({ error: 'Token refresh failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      accessToken = newToken;
      
      // Update token in database
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
        throw new Error(`Refreshed Calendar token persistence failed: ${tokenUpdateError.message}`);
      }
    }

    const calendarId = calendarAccount.calendar_id || 'primary';
    const syncToken = (fullSync || boundedWindow)
      ? undefined
      : calendarAccount.next_sync_token;

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
      await updateSyncStatus(calendarAccountId, 'syncing', {
        syncToken: null,
        error: 'Sync token invalid, performing bounded re-sync',
      });
      
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
        await cleanupCalendarEventWindow(
          calendarAccountId,
          calendarAccount.bounded_sync_window_days || 90,
        );
        await logSyncOperation(
          calendarAccountId,
          calendarAccount.user_id,
          'bounded-resync',
          'success',
          boundedSyncResult.itemsProcessed,
        );
        await updateSyncStatus(calendarAccountId, 'complete', {
          syncToken: boundedSyncResult.syncToken,
          fullSyncCompleted: true,
        });
        
        return new Response(JSON.stringify(buildCalendarSyncSuccessReceipt(
          boundedSyncResult.itemsProcessed,
          boundedSyncResult.syncToken,
          'full',
          'Bounded re-sync completed successfully',
        )), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      } else {
        await updateSyncStatus(calendarAccountId, 'error', {
          syncToken: null,
          error: boundedSyncResult.error || 'Bounded re-sync failed',
        });
        await logSyncOperation(
          calendarAccountId,
          calendarAccount.user_id,
          'bounded-resync',
          'error',
          boundedSyncResult.itemsProcessed,
          boundedSyncResult.error,
        );
        
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
      // Clean up old events outside sync window
      if (fullSync || boundedWindow) {
        await cleanupCalendarEventWindow(
          calendarAccountId,
          calendarAccount.bounded_sync_window_days || 90,
        );
      }
      await logSyncOperation(
        calendarAccountId, 
        calendarAccount.user_id, 
        fullSync || boundedWindow ? 'full-sync' : 'incremental-sync',
        'success', 
        syncResult.itemsProcessed,
      );
      await updateSyncStatus(calendarAccountId, 'complete', {
        syncToken: syncResult.syncToken,
        fullSyncCompleted: fullSync || boundedWindow,
      });

      return new Response(JSON.stringify(buildCalendarSyncSuccessReceipt(
        syncResult.itemsProcessed,
        syncResult.syncToken,
        fullSync || boundedWindow ? 'full' : 'incremental',
      )), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    } else {
      await updateSyncStatus(calendarAccountId, 'error', { error: syncResult.error });
      await logSyncOperation(
        calendarAccountId,
        calendarAccount.user_id,
        'sync',
        'error',
        syncResult.itemsProcessed,
        syncResult.error,
      );
      
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

serve(wrapMindManualHandler("calendar-sync", handler));
