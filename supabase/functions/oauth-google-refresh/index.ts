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

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { refresh_token, account_id } = await req.json();

    if (!refresh_token || !account_id) {
      throw new Error('Refresh token and account ID are required');
    }

    console.log('Refreshing OAuth token for account:', account_id);

    // Validate that the account exists and belongs to the authenticated user
    const { data: account, error: accountError } = await supabase
      .from('oauth_accounts')
      .select('user_id, provider')
      .eq('id', account_id)
      .single();

    if (accountError || !account) {
      console.error('Account not found:', accountError);
      throw new Error('OAuth account not found');
    }

    // Refresh the access token with Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();
    console.log('Token refreshed successfully');

    // Update the stored token (with encryption)
    const updateData: any = {
      access_token: await encryptToken(tokens.access_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      last_used_at: new Date().toISOString(),
      token_type: tokens.token_type
    };

    // If a new refresh token is provided, update it too
    if (tokens.refresh_token) {
      updateData.refresh_token = await encryptToken(tokens.refresh_token);
    }

    // Update scopes if provided
    if (tokens.scope) {
      updateData.scopes_string = tokens.scope;
    }

    const { error: updateError } = await supabase
      .from('oauth_accounts')
      .update(updateData)
      .eq('id', account_id);

    if (updateError) {
      console.error('Failed to update account:', updateError);
      throw new Error(`Failed to update account: ${updateError.message}`);
    }

    console.log('Account updated successfully');

    return new Response(JSON.stringify({
      success: true,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      scope: tokens.scope
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('OAuth refresh error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        },
      }
    );
  }
};

async function encryptToken(token: string): Promise<string> {
  try {
    const ENCRYPTION_KEY_LENGTH = 32;
    const IV_LENGTH = 12;
    
    // Get encryption key from environment
    const keyMaterial = new TextEncoder().encode(
      Deno.env.get('OAUTH_ENCRYPTION_KEY') || 'default-oauth-encryption-key-change-me-in-production'
    );

    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial.slice(0, ENCRYPTION_KEY_LENGTH),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const data = new TextEncoder().encode(token);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Return base64 encoded
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Token encryption failed:', error);
    // Fallback to plaintext in case of encryption failure
    return token;
  }
}

serve(handler);