import {
  type MindManualWorkLifecycle,
  wrapMindManualSubjectHandler,
} from "../_shared/migrationWriteFence.ts";
import {
  calendarSyncMigrationScope,
  retainCalendarLeaseForUncertainCompletion,
  type CalendarSyncMigrationContext,
} from "../_shared/calendarMigrationScope.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { type ReviewedCalendarUpdateDependencies } from './reviewedCalendarUpdate.ts';
import { handleCalendarOutcomeInspection } from './inspectCalendarOutcome.ts';
import { handleCalendarOperationReceiptRead, handleCalendarOperationUpdate } from './calendarOperationReceipt.ts';
import { createCalendarOperationRegistry } from './calendarOperationRegistry.ts';
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
  action: 'create_event' | 'delete_event';
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
  
  console.log('📅 Creating calendar event');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    console.error(`Calendar create failed with status ${response.status}`);
    throw new Error('CALENDAR_PROVIDER_CREATE_FAILED');
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
  
  console.log('🗑️ Deleting calendar event');

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    void response.body?.cancel().catch(() => undefined);
    console.error(`Calendar delete failed with status ${response.status}`);
    throw new Error('CALENDAR_PROVIDER_DELETE_FAILED');
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
    console.error('Calendar provider sync failed');
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
    // The canonical database constraint is UNIQUE
    // (calendar_account_id, external_event_id). The account was admitted and
    // reloaded with this exact user_id, so every conflict belongs to that same
    // canonical account owner; the payload repeats the resolved owner.
    const { error } = await supabase
      .from('calendar_events')
      .upsert(eventRows, {
        onConflict: 'calendar_account_id,external_event_id',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error('CALENDAR_EVENT_UPSERT_FAILED');
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
      throw new Error('CALENDAR_EVENT_CLEANUP_FAILED');
    }
  }

  console.log(
    `✅ Calendar page persisted (${eventRows.length} upserted, ${cancelledEventIds.length} cancelled)`,
  );
}

async function updateSyncStatus(
  calendarAccountId: string,
  ownerUserId: string,
  status: CalendarSyncStatus,
  options: CalendarSyncStatusOptions = {},
) {
  const updates = buildCalendarSyncStatusUpdate(status, options);

  const { error } = await supabase
    .from('calendar_accounts')
    .update(updates)
    .eq('id', calendarAccountId)
    .eq('user_id', ownerUserId);

  if (error) {
    throw new Error('CALENDAR_STATUS_UPDATE_FAILED');
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
    throw new Error('CALENDAR_SYNC_RECEIPT_FAILED');
  }
}

async function cleanupCalendarEventWindow(
  calendarAccountId: string,
  ownerUserId: string,
  windowDays: number,
): Promise<void> {
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    throw new Error('CALENDAR_WINDOW_INVALID');
  }
  const now = Date.now();
  const span = Math.ceil(windowDays) * 24 * 60 * 60 * 1000;
  const lowerBound = new Date(now - span).toISOString();
  const upperBound = new Date(now + span).toISOString();
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('calendar_account_id', calendarAccountId)
    .eq('user_id', ownerUserId)
    .or(`start_time.lt.${lowerBound},start_time.gt.${upperBound}`);
  if (error) {
    throw new Error('CALENDAR_WINDOW_CLEANUP_FAILED');
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
    console.error('Calendar draft persistence failed');
    throw new Error('Failed to create draft event');
  }
  
  return draftId;
}

const handler = async (
  req: Request,
  lifecycle: MindManualWorkLifecycle,
  scope: CalendarSyncMigrationContext,
): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication and service-account owner resolution happened before
    // migration admission. Body fields never supply this subject.
    const {
      requestBody,
      callerUserId,
      isInternalCaller,
      subjectId,
      operation,
    } = scope;

    if (operation === 'prepare_reviewed_update' || operation === 'confirm_reviewed_update' || operation === 'inspect_reviewed_outcome' || operation === 'read_reviewed_update_receipt') {
      if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
      // Old clients must not bypass durable admission or create new v1 holds
      // after a preview. This neutral rejection is never a no-write receipt.
      if ((operation === 'prepare_reviewed_update' || operation === 'confirm_reviewed_update') && requestBody.version !== 2) {
        return new Response(JSON.stringify({ error: 'unsupported_reviewed_update_version' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      const operationRegistry = createCalendarOperationRegistry(async (name, args) => {
        const { data, error } = await supabase.rpc(name, args);
        return { data, error };
      });
      if (operation === 'read_reviewed_update_receipt') {
        // No activation flag, account/token lookup, cache mutation or provider
        // port is given to recovery. Disconnection cannot erase saved evidence.
        return await handleCalendarOperationReceiptRead(requestBody, {
          callerUserId, isInternalCaller, readOperation: operationRegistry.readOperation,
        });
      }
      // This independent path cannot fall through to legacy create/delete or
      // refresh-token behavior. It remains OFF until separately activated.
      const reviewedDependencies: ReviewedCalendarUpdateDependencies = {
        enabled: Deno.env.get('CALENDAR_REVIEWED_UPDATES_ENABLED'), callerUserId, isInternalCaller,
        loadAccount: async (accountId, owner) => {
          const { data, error } = await supabase.from('calendar_accounts')
            .select('id,user_id,provider,calendar_id,oauth_token_id,sync_enabled')
            .eq('id', accountId).eq('user_id', owner).eq('sync_enabled', true).single();
          if (error) throw new Error('Calendar account unavailable');
          return data;
        },
        loadToken: async (tokenId, owner) => {
          const { data, error } = await supabase.from('oauth_tokens')
            .select('id,user_id,provider,service_type,scope,access_token,token_expires_at')
            .eq('id', tokenId).eq('user_id', owner).eq('provider', 'google').eq('service_type', 'calendar').single();
          if (error) throw new Error('Calendar authorization unavailable');
          return data;
        },
        loadEvent: async (accountId, eventId, owner) => {
          const { data, error } = await supabase.from('calendar_events')
            .select('id,user_id,calendar_account_id,external_event_id,etag')
            .eq('user_id', owner).eq('calendar_account_id', accountId).eq('external_event_id', eventId).single();
          if (error) throw new Error('Calendar event unavailable');
          return data;
        },
        decryptAccessToken: async (encrypted) => decryptOAuthToken(encrypted, await loadOAuthTokenEncryptionKey()),
        updateCache: async (write) => {
          const fields = write.fields;
          let update = supabase.from('calendar_events').update({
            etag: write.etag, title: fields.title, description: fields.description || null, location: fields.location || null,
            start_time: fields.startTime, end_time: fields.endTime, start_tz: fields.startTz, end_tz: fields.endTz,
            last_synced_at: new Date().toISOString(),
          }).eq('id', write.cacheId).eq('user_id', write.ownerUserId)
            .eq('calendar_account_id', write.calendarAccountId).eq('external_event_id', write.eventId);
          update = write.expectedCacheEtag === null ? update.is('etag', null) : update.eq('etag', write.expectedCacheEtag);
          const { data, error } = await update
            .select('id,user_id,calendar_account_id,external_event_id,etag,title,description,location,start_time,end_time,start_tz,end_tz').single();
          if (error) throw new Error('Calendar cache outcome unavailable');
          return data;
        },
      };
      return operation === 'inspect_reviewed_outcome'
        ? await handleCalendarOutcomeInspection(requestBody, reviewedDependencies)
        : await handleCalendarOperationUpdate(requestBody, { ...reviewedDependencies, ...operationRegistry });
    }
    
    // Handle write operations (create, update, delete events)
    if (operation === 'create_event' || operation === 'delete_event') {
      const { eventData, eventId, sendUpdates = 'none', draft = false } =
        requestBody as unknown as CalendarWriteRequest;
      const action = operation;
      const calendarAccountId = scope.calendarAccountId;
      
      // Get calendar account details
      const writeAccountQuery = supabase
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
      const { data: calendarAccount, error: accountError } = await writeAccountQuery.single();

      if (accountError || !calendarAccount) {
        console.error('Calendar account unavailable for resolved owner');
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
          retainCalendarLeaseForUncertainCompletion(lifecycle, false);
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
          .eq('id', calendarAccount.oauth_token_id)
          .eq('user_id', subjectId);
        if (tokenUpdateError) {
          throw new Error('CALENDAR_TOKEN_PERSISTENCE_FAILED');
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
            throw new Error('CALENDAR_CREATED_EVENT_CACHE_FAILED');
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
            throw new Error('CALENDAR_DELETED_EVENT_CACHE_FAILED');
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
    const { fullSync = false, simulate410 = false, timeWindow, boundedWindow = false } =
      requestBody as unknown as SyncRequest;
    const calendarAccountId = scope.calendarAccountId;

    console.log('📅 Calendar sync request:', { calendarAccountId, fullSync, simulate410, boundedWindow });

    // Get calendar account details
    const syncAccountQuery = supabase
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
    const { data: calendarAccount, error: accountError } = await syncAccountQuery.single();

    if (accountError || !calendarAccount) {
      console.error('Calendar account unavailable for resolved owner');
      return new Response(
        JSON.stringify({ error: 'Calendar account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update sync status to syncing
    await updateSyncStatus(calendarAccountId, subjectId, 'syncing');

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
          subjectId,
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
        retainCalendarLeaseForUncertainCompletion(lifecycle, false);
        await updateSyncStatus(calendarAccountId, subjectId, 'error', { error: 'Token refresh failed' });
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
        .eq('id', calendarAccount.oauth_token_id)
        .eq('user_id', subjectId);
      if (tokenUpdateError) {
        throw new Error('CALENDAR_TOKEN_PERSISTENCE_FAILED');
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
      await updateSyncStatus(calendarAccountId, subjectId, 'syncing', {
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
          subjectId,
          calendarAccount.bounded_sync_window_days || 90,
        );
        await logSyncOperation(
          calendarAccountId,
          calendarAccount.user_id,
          'bounded-resync',
          'success',
          boundedSyncResult.itemsProcessed,
        );
        await updateSyncStatus(calendarAccountId, subjectId, 'complete', {
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
        await updateSyncStatus(calendarAccountId, subjectId, 'error', {
          syncToken: null,
          error: 'Calendar bounded synchronization failed',
        });
        await logSyncOperation(
          calendarAccountId,
          calendarAccount.user_id,
          'bounded-resync',
          'error',
          boundedSyncResult.itemsProcessed,
          'Calendar bounded synchronization failed',
        );
        
        return new Response(JSON.stringify({
          success: false,
          error: 'CALENDAR_BOUNDED_SYNC_FAILED',
          message: 'Calendar synchronization could not be completed.',
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
          subjectId,
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
      await updateSyncStatus(calendarAccountId, subjectId, 'complete', {
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
      await updateSyncStatus(calendarAccountId, subjectId, 'error', {
        error: 'Calendar synchronization failed',
      });
      await logSyncOperation(
        calendarAccountId,
        calendarAccount.user_id,
        'sync',
        'error',
        syncResult.itemsProcessed,
        'Calendar synchronization failed',
      );
      
      return new Response(JSON.stringify({
        success: false,
        error: 'CALENDAR_SYNC_FAILED',
        message: 'Calendar synchronization could not be completed.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

  } catch {
    console.error('Calendar sync handler failed');
    
    return new Response(JSON.stringify({
      success: false,
      error: 'CALENDAR_SYNC_FAILED',
      message: 'Calendar synchronization could not be completed.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
};

serve(wrapMindManualSubjectHandler(
  "calendar-sync",
  calendarSyncMigrationScope(),
  handler,
));
