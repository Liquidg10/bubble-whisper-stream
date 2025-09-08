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
    console.log('Starting scope decay job...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Find accounts that haven't been used in 30 days with elevated scopes
    const { data: staleAccounts, error: selectError } = await supabase
      .from('oauth_accounts')
      .select('*')
      .lt('last_used_at', thirtyDaysAgo)
      .not('scopes', 'eq', '{}');

    if (selectError) {
      throw new Error(`Failed to query stale accounts: ${selectError.message}`);
    }

    if (!staleAccounts || staleAccounts.length === 0) {
      console.log('No stale accounts found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No accounts required scope decay',
        processed: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let processedCount = 0;

    for (const account of staleAccounts) {
      try {
        // Reduce to minimal scopes based on provider
        let minimalScopes: string[] = [];
        
        if (account.provider === 'google') {
          minimalScopes = [
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/gmail.metadata'
          ];
        }

        // Update the account with minimal scopes
        const { error: updateError } = await supabase
          .from('oauth_accounts')
          .update({
            scopes: minimalScopes,
            updated_at: new Date().toISOString()
          })
          .eq('id', account.id);

        if (updateError) {
          console.error(`Failed to update account ${account.id}:`, updateError);
          continue;
        }

        console.log(`Reduced scopes for account ${account.id} (${account.account_email})`);
        processedCount++;

      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
      }
    }

    console.log(`Scope decay completed. Processed ${processedCount} accounts.`);

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully reduced scopes for ${processedCount} accounts`,
      processed: processedCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
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