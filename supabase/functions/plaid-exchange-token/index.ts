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

interface PlaidExchangeRequest {
  public_token: string;
  institution_name: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { public_token, institution_name }: PlaidExchangeRequest = await req.json();

    // Exchange public token for access token
    const response = await fetch('https://production.plaid.com/item/public_token/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? ''
      },
      body: JSON.stringify({
        public_token: public_token
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Plaid token exchange failed: ${error}`);
    }

    const data = await response.json();

    // Get user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid user token');
    }

    // Store encrypted access token and item ID in database
    // For this demo, we'll store in a plaid_items table (create if needed)
    const { error: insertError } = await supabase
      .from('plaid_items')
      .insert({
        user_id: user.id,
        item_id: data.item_id,
        access_token: data.access_token, // In production, encrypt this
        institution_name: institution_name,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw new Error('Failed to store Plaid connection');
    }

    return new Response(JSON.stringify({
      success: true,
      item_id: data.item_id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Plaid token exchange failed:', error);
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