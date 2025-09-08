import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlaidLinkTokenRequest {
  products: string[];
  country_codes: string[];
  language: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { products, country_codes, language }: PlaidLinkTokenRequest = await req.json();

    const response = await fetch('https://production.plaid.com/link/token/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? ''
      },
      body: JSON.stringify({
        client_name: 'Mind Manual',
        country_codes: country_codes,
        language: language,
        products: products,
        user: {
          client_user_id: crypto.randomUUID()
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Plaid API error: ${error}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      link_token: data.link_token
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('Plaid link token creation failed:', error);
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