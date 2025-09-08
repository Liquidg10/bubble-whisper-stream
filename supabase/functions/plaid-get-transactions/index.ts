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

    const { item_id, start_date, end_date } = await req.json();

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

    // Default to last 30 days if no date range provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let allTransactions: any[] = [];
    let offset = 0;
    const count = 500; // Plaid's max per request

    // Fetch transactions with pagination
    while (true) {
      const response = await fetch('https://production.plaid.com/transactions/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? ''
        },
        body: JSON.stringify({
          access_token: plaidItem.access_token,
          start_date: startDate,
          end_date: endDate,
          offset: offset,
          count: count
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Plaid API error: ${error}`);
      }

      const data = await response.json();
      allTransactions = allTransactions.concat(data.transactions);

      // Check if we've fetched all transactions
      if (data.transactions.length < count) {
        break;
      }

      offset += count;
    }

    // Transform and upsert transactions
    const transactionsToUpsert = allTransactions.map((transaction: any) => ({
      transaction_id: transaction.transaction_id,
      account_id: transaction.account_id,
      plaid_item_id: plaidItem.id,
      user_id: user.id,
      amount: -transaction.amount, // Plaid uses negative for outflows, we'll store positive for expenses
      date: transaction.date,
      name: transaction.name,
      merchant_name: transaction.merchant_name,
      category: transaction.category,
      iso_currency_code: transaction.iso_currency_code,
      account_owner: transaction.account_owner,
      authorized_date: transaction.authorized_date,
      location: transaction.location,
      payment_meta: transaction.payment_meta,
      pending: transaction.pending,
      pending_transaction_id: transaction.pending_transaction_id
    }));

    // Batch upsert in chunks of 1000 to avoid payload limits
    const batchSize = 1000;
    let upsertedCount = 0;

    for (let i = 0; i < transactionsToUpsert.length; i += batchSize) {
      const batch = transactionsToUpsert.slice(i, i + batchSize);
      
      const { error: upsertError } = await supabase
        .from('plaid_transactions')
        .upsert(batch, { 
          onConflict: 'transaction_id',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('Transaction upsert error:', upsertError);
        throw new Error('Failed to save transactions');
      }

      upsertedCount += batch.length;
    }

    // Update sync status
    const { error: statusError } = await supabase
      .from('plaid_sync_status')
      .upsert({
        plaid_item_id: plaidItem.id,
        user_id: user.id,
        last_transactions_sync: new Date().toISOString(),
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
      transactions_synced: upsertedCount,
      date_range: { start_date: startDate, end_date: endDate }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Plaid transactions sync failed:', error);
    
    // Update error count in sync status
    try {
      const { item_id } = await req.json();
      const { data: plaidItem } = await supabase
        .from('plaid_items')
        .select('id')
        .eq('item_id', item_id)
        .single();

      if (plaidItem) {
        await supabase
          .from('plaid_sync_status')
          .upsert({
            plaid_item_id: plaidItem.id,
            user_id: (await supabase.auth.getUser(req.headers.get('authorization')?.replace('Bearer ', '') || '')).data.user?.id,
            last_error: error.message,
            error_count: supabase.sql`error_count + 1`,
            is_healthy: false,
            next_retry_at: new Date(Date.now() + Math.min(Math.pow(2, 3) * 1000, 300000)).toISOString() // Exponential backoff, max 5 minutes
          }, { 
            onConflict: 'plaid_item_id',
            ignoreDuplicates: false 
          });
      }
    } catch (statusError) {
      console.error('Error updating status:', statusError);
    }

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