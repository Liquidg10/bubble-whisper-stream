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
    const { scope, service, reason, accountId, existingScopes, isEscalation } = await req.json();
    const origin = req.headers.get('origin') || 'http://localhost:3000';

    console.log('Starting OAuth flow:', { scope, service, reason, origin });

    // Generate state and code_verifier for PKCE
    const state = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store state and code_verifier temporarily (you might want to use a more secure storage)
    const tempData = {
      state,
      code_verifier: codeVerifier,
      service,
      origin,
      created_at: new Date().toISOString()
    };

    // Set a short-lived cookie or store in database for state verification
    const { error: storeError } = await supabase
      .from('oauth_state')
      .insert(tempData);

    if (storeError) {
      console.error('Failed to store OAuth state:', storeError);
      throw new Error('Failed to initialize OAuth flow');
    }

    // Determine redirect URI based on environment
    const redirectUri = getRedirectUri(origin);

    // For incremental auth, combine existing + new scopes
    let finalScope = scope || 'openid email profile';
    if (isEscalation && existingScopes) {
      // Combine existing scopes with new ones for true incremental auth
      const allScopes = new Set([
        ...existingScopes.split(' ').filter(Boolean),
        ...finalScope.split(' ').filter(Boolean)
      ]);
      finalScope = Array.from(allScopes).join(' ');
    }

    // Build OAuth URL with proper parameters
    const params = new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: finalScope,
      access_type: 'offline',
      include_granted_scopes: 'true', // For incremental authorization
      prompt: isEscalation ? 'consent select_account' : 'consent', // Different prompt for escalation
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    console.log('Generated OAuth URL successfully');

    return new Response(JSON.stringify({
      success: true,
      authUrl,
      state,
      service,
      reason
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('OAuth start error:', error);
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

// Helper functions for PKCE
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function getRedirectUri(origin: string): string {
  // Handle different environments
  if (origin.includes('localhost')) {
    return `${origin}/oauth-callback`;
  } else if (origin.includes('sandbox.lovable.dev')) {
    return `${origin}/oauth-callback`;
  } else {
    // Production or custom domain
    return `${origin}/oauth-callback`;
  }
}

serve(handler);