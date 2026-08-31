import { wrapMindManualHandler } from "../_shared/migrationWriteFence.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { isExactServiceRoleBearer } from '../_shared/calendarWatchSecurity.ts';
import type { Database } from '../../../src/integrations/supabase/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WatchChannel {
  id: string;
  user_id: string;
  provider: 'google-calendar' | 'gmail';
  resource_id?: string;
  channel_id?: string;
  expires_at: string | null;
  account_id: string;
  calendar_id?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

serve(wrapMindManualHandler("watch-renewal-cron", async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!isExactServiceRoleBearer(authHeader, supabaseServiceKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Starting watch renewal cron job...');

    // Get calendar watches expiring in the next 24 hours
    const { data: calendarWatches, error: calendarWatchError } = await supabase
      .rpc('get_expiring_watch_channels', { hours_ahead: 24 });
    if (calendarWatchError) {
      throw new Error(`Calendar watch discovery failed: ${calendarWatchError.message}`);
    }

    // Gmail watches expire within seven days and Google recommends renewing
    // daily. Entering the six-day window renews each mailbox roughly one day
    // after its previous registration while retaining the existing cursor.
    const expiryDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const { data: gmailAccounts, error: gmailWatchError } = await supabase
      .from('gmail_watch_subscriptions')
      .select('id,user_id,oauth_account_id,watch_expires_at,account_email')
      .eq('status', 'active')
      .not('watch_expires_at', 'is', null)
      .lt('watch_expires_at', expiryDate);
    if (gmailWatchError) {
      throw new Error(`Gmail watch discovery failed: ${gmailWatchError.message}`);
    }

    let renewalsScheduled = 0;
    let renewalErrors = 0;

    // Process calendar watch renewals
    if (calendarWatches) {
      for (const watch of calendarWatches) {
        try {
          const watchData: WatchChannel = {
            id: watch.id,
            user_id: watch.user_id,
            provider: 'google-calendar',
            resource_id: watch.watch_resource_id,
            channel_id: watch.watch_channel_id,
            expires_at: watch.watch_expires_at,
            account_id: watch.id,
            calendar_id: watch.calendar_id
          };

          await renewWatch(supabase, watchData);
          renewalsScheduled++;
          
          console.log(`✅ Renewed calendar watch for account ${watch.id}`);
        } catch (error) {
          console.error(`❌ Failed to renew calendar watch ${watch.id}:`, error);
          renewalErrors++;
          
          // Log failure for monitoring
          await supabase
            .from('sync_logs')
            .insert({
              user_id: watch.user_id,
              provider: 'google',
              service_type: 'calendar',
              operation: 'watch_renewal',
              status: 'error',
              error_message: getErrorMessage(error),
              account_id: watch.id,
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString()
            });
        }
      }
    }

    // Process Gmail watch renewals
    if (gmailAccounts) {
      for (const account of gmailAccounts) {
        try {
          const watchData: WatchChannel = {
            id: account.id,
            user_id: account.user_id,
            provider: 'gmail',
            expires_at: account.watch_expires_at,
            account_id: account.oauth_account_id
          };

          await renewWatch(supabase, watchData);
          renewalsScheduled++;
          
          console.log(`✅ Renewed Gmail watch ${account.id}`);
        } catch (error) {
          console.error(`❌ Failed to renew Gmail watch ${account.id}:`, error);
          renewalErrors++;
          
          // Log failure for monitoring
          await supabase
            .from('sync_logs')
            .insert({
              user_id: account.user_id,
              provider: 'google',
              service_type: 'gmail',
              operation: 'watch_renewal',
              status: 'error',
              error_message: getErrorMessage(error),
              account_id: account.oauth_account_id,
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString()
            });
        }
      }
    }

    const result = {
      message: 'Watch renewal cron completed',
      renewalsScheduled,
      renewalErrors,
      calendarWatches: calendarWatches?.length || 0,
      gmailWatches: gmailAccounts?.length || 0,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Watch renewal summary:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Watch renewal cron failed:', error);
    return new Response(JSON.stringify({ 
      error: getErrorMessage(error),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

/**
 * Renew a specific watch channel
 */
async function renewWatch(
  supabase: SupabaseClient<Database>,
  watch: WatchChannel,
): Promise<void> {
  console.log(`🔄 Renewing ${watch.provider} watch for account ${watch.account_id}`);

  try {
    if (watch.provider === 'google-calendar') {
      const { data, error } = await supabase.functions.invoke('calendar-watch', {
        body: {
          action: 'renew',
          calendarAccountId: watch.account_id,
          calendarId: watch.calendar_id,
          oldChannelId: watch.channel_id,
          oldResourceId: watch.resource_id
        }
      });

      if (error) throw error;
      console.log('✅ Calendar watch renewed successfully:', data);
      
    } else if (watch.provider === 'gmail') {
      const { data, error } = await supabase.functions.invoke('gmail-watch', {
        body: {
          action: 'renew',
          accountId: watch.account_id
        }
      });

      if (error) throw error;
      console.log('✅ Gmail watch renewed successfully:', data);
    }

    // Log successful renewal
    await supabase
      .from('sync_logs')
      .insert({
        user_id: watch.user_id,
        provider: 'google',
        service_type: watch.provider === 'google-calendar' ? 'calendar' : 'gmail',
        operation: 'watch_renewal',
        status: 'success',
        account_id: watch.account_id,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

  } catch (error) {
    console.error(`💥 Failed to renew ${watch.provider} watch:`, error);
    throw error;
  }
}
