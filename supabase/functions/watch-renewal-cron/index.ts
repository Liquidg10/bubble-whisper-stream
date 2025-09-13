import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WatchChannel {
  id: string;
  user_id: string;
  provider: 'google-calendar' | 'gmail';
  resource_id: string;
  channel_id: string;
  expires_at: string;
  account_id: string;
  calendar_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Starting watch renewal cron job...');

    // Get calendar watches expiring in the next 24 hours
    const { data: calendarWatches } = await supabase
      .rpc('get_expiring_watch_channels', { hours_ahead: 24 });

    // Get Gmail accounts with expiring watches (7 days ahead)
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: gmailAccounts } = await supabase
      .from('email_accounts')
      .select('*')
      .not('watch_expiration', 'is', null)
      .lt('watch_expiration', expiryDate);

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
              error_message: error.message,
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
            resource_id: account.watch_resource_id,
            channel_id: account.watch_channel_id,
            expires_at: account.watch_expiration,
            account_id: account.id
          };

          await renewWatch(supabase, watchData);
          renewalsScheduled++;
          
          console.log(`✅ Renewed Gmail watch for account ${account.id}`);
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
              error_message: error.message,
              account_id: account.id,
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
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Renew a specific watch channel
 */
async function renewWatch(supabase: any, watch: WatchChannel): Promise<void> {
  console.log(`🔄 Renewing ${watch.provider} watch for account ${watch.account_id}`);

  try {
    if (watch.provider === 'google-calendar') {
      const { data, error } = await supabase.functions.invoke('calendar-watch', {
        body: {
          action: 'renew',
          accountId: watch.account_id,
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
          accountId: watch.account_id,
          oldChannelId: watch.channel_id,
          oldResourceId: watch.resource_id
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