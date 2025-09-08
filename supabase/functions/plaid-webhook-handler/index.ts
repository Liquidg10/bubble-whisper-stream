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
    const webhook = await req.json();
    console.log('Received Plaid webhook:', webhook);

    // Extract webhook details
    const {
      webhook_type,
      webhook_code,
      item_id,
      new_transactions,
      removed_transactions,
      error
    } = webhook;

    // Find the Plaid item and associated user
    const { data: plaidItem, error: itemError } = await supabase
      .from('plaid_items')
      .select('id, user_id')
      .eq('item_id', item_id)
      .single();

    if (itemError || !plaidItem) {
      console.error('Plaid item not found for webhook:', item_id);
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Log webhook event
    const { error: logError } = await supabase
      .from('plaid_webhooks')
      .insert({
        webhook_id: crypto.randomUUID(),
        plaid_item_id: plaidItem.id,
        user_id: plaidItem.user_id,
        webhook_type,
        webhook_code,
        payload: webhook,
        processed: false
      });

    if (logError) {
      console.error('Failed to log webhook:', logError);
    }

    // Update sync status with webhook received timestamp
    const { error: statusError } = await supabase
      .from('plaid_sync_status')
      .upsert({
        plaid_item_id: plaidItem.id,
        user_id: plaidItem.user_id,
        last_webhook_received: new Date().toISOString()
      }, { 
        onConflict: 'plaid_item_id',
        ignoreDuplicates: false 
      });

    if (statusError) {
      console.error('Failed to update sync status:', statusError);
    }

    // Handle different webhook types
    switch (webhook_type) {
      case 'TRANSACTIONS':
        if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
          // Trigger background sync for new/updated transactions
          console.log(`New transactions available for item ${item_id}: ${new_transactions} new, ${removed_transactions} removed`);
          
          // Call plaid-get-transactions function asynchronously
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/plaid-get-transactions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              item_id: item_id,
              // Sync last 7 days to catch any updates
              start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            })
          }).catch(error => {
            console.error('Failed to trigger transaction sync:', error);
          });
        }
        break;

      case 'ITEM':
        if (webhook_code === 'ERROR') {
          console.log(`Item error for ${item_id}:`, error);
          
          // Update sync status with error
          await supabase
            .from('plaid_sync_status')
            .upsert({
              plaid_item_id: plaidItem.id,
              user_id: plaidItem.user_id,
              last_error: error?.error_message || 'Unknown item error',
              error_count: supabase.sql`error_count + 1`,
              is_healthy: false
            }, { 
              onConflict: 'plaid_item_id',
              ignoreDuplicates: false 
            });
        }
        break;

      case 'ACCOUNTS':
        if (webhook_code === 'DEFAULT_UPDATE') {
          // Account information has been updated
          console.log(`Account update available for item ${item_id}`);
          
          // Call plaid-get-accounts function asynchronously
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/plaid-get-accounts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              item_id: item_id
            })
          }).catch(error => {
            console.error('Failed to trigger account sync:', error);
          });
        }
        break;

      default:
        console.log(`Unhandled webhook type: ${webhook_type}, code: ${webhook_code}`);
    }

    // Mark webhook as processed
    await supabase
      .from('plaid_webhooks')
      .update({ 
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('plaid_item_id', plaidItem.id)
      .eq('webhook_type', webhook_type)
      .eq('webhook_code', webhook_code)
      .eq('processed', false);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Webhook processed successfully'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Webhook processing failed:', error);
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