import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting OAuth scope decay process...');

    // Find accounts inactive for over 30 days with non-empty scopes
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: staleAccounts, error: selectError } = await supabase
      .from('oauth_accounts')
      .select('id, provider, scopes_string, last_used_at')
      .lt('last_used_at', thirtyDaysAgo.toISOString())
      .neq('scopes_string', '');

    if (selectError) {
      console.error('Error fetching stale accounts:', selectError);
      throw new Error(`Failed to fetch stale accounts: ${selectError.message}`);
    }

    console.log(`Found ${staleAccounts?.length || 0} stale OAuth accounts`);

    let processedCount = 0;

    if (staleAccounts && staleAccounts.length > 0) {
      for (const account of staleAccounts) {
        try {
          let minimalScopes = '';

          // Reduce to minimal scopes based on provider
          switch (account.provider) {
            case 'google-calendar':
              minimalScopes = 'https://www.googleapis.com/auth/calendar.readonly';
              break;
            case 'gmail':
              minimalScopes = 'https://www.googleapis.com/auth/gmail.metadata';
              break;
            case 'google':
              minimalScopes = 'openid email profile';
              break;
            default:
              console.log(`Skipping unknown provider: ${account.provider}`);
              continue;
          }

          // Update the account with reduced scopes
          const { error: updateError } = await supabase
            .from('oauth_accounts')
            .update({
              scopes_string: minimalScopes,
              updated_at: new Date().toISOString()
            })
            .eq('id', account.id);

          if (updateError) {
            console.error(`Failed to update account ${account.id}:`, updateError);
            continue;
          }

          processedCount++;
          console.log(`Reduced scopes for account ${account.id} (${account.provider})`);
        } catch (accountError) {
          console.error(`Error processing account ${account.id}:`, accountError);
        }
      }
    }

    // Clean up expired OAuth state entries
    const { error: cleanupError } = await supabase
      .rpc('cleanup_expired_oauth_state');

    if (cleanupError) {
      console.warn('Failed to cleanup expired OAuth state:', cleanupError);
    } else {
      console.log('Cleaned up expired OAuth state entries');
    }

    console.log(`OAuth scope decay completed. Processed ${processedCount} accounts.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'OAuth scope decay completed',
      stale_accounts_found: staleAccounts?.length || 0,
      accounts_processed: processedCount
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Scope decay job failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
};

serve(handler);