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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid user token');
    }

    const { item_id } = await req.json();

    // Get the Plaid item to fetch access token
    const { data: plaidItem, error: itemError } = await supabase
      .from('plaid_items')
      .select('*')
      .eq('item_id', item_id)
      .eq('user_id', user.id)
      .single();

    if (itemError || !plaidItem) {
      throw new Error('Plaid item not found');
    }

    // Fetch accounts from Plaid API
    const response = await fetch('https://production.plaid.com/accounts/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? ''
      },
      body: JSON.stringify({
        access_token: plaidItem.access_token
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Plaid API error: ${error}`);
    }

    const data = await response.json();

    // Upsert accounts to database
    const accountsToUpsert = data.accounts.map((account: any) => ({
      account_id: account.account_id,
      plaid_item_id: plaidItem.id,
      user_id: user.id,
      name: account.name,
      official_name: account.official_name,
      type: account.type,
      subtype: account.subtype,
      balances: account.balances
    }));

    const { error: upsertError } = await supabase
      .from('plaid_accounts')
      .upsert(accountsToUpsert, { 
        onConflict: 'account_id',
        ignoreDuplicates: false 
      });

    if (upsertError) {
      console.error('Account upsert error:', upsertError);
      throw new Error('Failed to save accounts');
    }

    // Update sync status
    const { error: statusError } = await supabase
      .from('plaid_sync_status')
      .upsert({
        plaid_item_id: plaidItem.id,
        user_id: user.id,
        last_accounts_sync: new Date().toISOString(),
        is_healthy: true,
        error_count: 0
      }, { 
        onConflict: 'plaid_item_id',
        ignoreDuplicates: false 
      });

    if (statusError) {
      console.error('Status update error:', statusError);
    }

    return new Response(JSON.stringify({
      success: true,
      accounts_synced: data.accounts.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Plaid accounts sync failed:', error);
    return new Response(
      JSON.stringify({ 
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