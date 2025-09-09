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
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, state } = await req.json();

    if (!code || !state) {
      throw new Error('Authorization code and state are required');
    }

    console.log('Processing OAuth callback with code and state');

    // Verify state and get stored data
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_state')
      .select('*')
      .eq('state', state)
      .single();

    if (stateError || !stateData) {
      console.error('Invalid or expired state:', stateError);
      throw new Error('Invalid or expired OAuth state');
    }

    // Check if state is not too old (5 minutes max)
    const stateAge = Date.now() - new Date(stateData.created_at).getTime();
    if (stateAge > 5 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    console.log('State verified successfully');

    // Determine redirect URI based on stored origin
    const redirectUri = getRedirectUri(stateData.origin);

    // Exchange authorization code for tokens using PKCE
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: stateData.code_verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed:', error);
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();
    console.log('Tokens received successfully');

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      console.error('User info fetch failed:', error);
      throw new Error(`User info fetch failed: ${error}`);
    }

    const userInfo: GoogleUserInfo = await userResponse.json();
    console.log('User info received:', { email: userInfo.email, name: userInfo.name });

    // Determine provider type based on scopes
    const provider = determineProvider(tokens.scope, stateData.service);

    // Check if OAuth account exists
    const { data: existingOAuth, error: oauthError } = await supabase
      .from('oauth_accounts')
      .select('user_id, id')
      .eq('provider', provider)
      .eq('provider_user_id', userInfo.id)
      .maybeSingle();

    let authUser;
    let oauthAccountId;

    if (existingOAuth) {
      console.log('Updating existing OAuth account');
      
      // Update OAuth account tokens with incremental scope union
      const { data: currentAccount } = await supabase
        .from('oauth_accounts')
        .select('scopes_string')
        .eq('id', existingOAuth.id)
        .single();

      const currentScopes = currentAccount?.scopes_string?.split(' ').filter(Boolean) || [];
      const newScopes = tokens.scope.split(' ').filter(Boolean);
      const allScopes = [...new Set([...currentScopes, ...newScopes])];

      await supabase
        .from('oauth_accounts')
        .update({ 
          last_used_at: new Date().toISOString(),
          access_token: await encryptToken(tokens.access_token),
          refresh_token: tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          scopes_string: allScopes.join(' '),
          token_type: tokens.token_type
        })
        .eq('id', existingOAuth.id);

      oauthAccountId = existingOAuth.id;

      // Get user info
      const { data: userData } = await supabase.auth.admin.getUserById(existingOAuth.user_id);
      authUser = userData.user;
    } else {
      console.log('Creating new user and OAuth account');
      
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userInfo.email,
        email_confirm: true,
        user_metadata: {
          name: userInfo.name,
          avatar_url: userInfo.picture,
          provider: 'google'
        }
      });

      if (authError) {
        console.error('User creation failed:', authError);
        throw new Error(`User creation failed: ${authError.message}`);
      }

      authUser = authData.user;

      // Create OAuth account record
      const { data: newOAuth, error: oauthCreateError } = await supabase
        .from('oauth_accounts')
        .insert({
          user_id: authUser.id,
          provider: provider,
          provider_user_id: userInfo.id,
          access_token: await encryptToken(tokens.access_token),
          refresh_token: tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          last_used_at: new Date().toISOString(),
          scopes_string: tokens.scope,
          account_email: userInfo.email,
          token_type: tokens.token_type
        })
        .select('id')
        .single();

      if (oauthCreateError) {
        console.error('OAuth account creation failed:', oauthCreateError);
        throw new Error(`OAuth account creation failed: ${oauthCreateError.message}`);
      }

      oauthAccountId = newOAuth.id;
    }

    // Clean up used state
    await supabase
      .from('oauth_state')
      .delete()
      .eq('state', state);

    // Generate Supabase Auth session
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email,
      options: {
        redirectTo: `${stateData.origin}/auth/callback`
      }
    });

    if (sessionError) {
      console.error('Session generation failed:', sessionError);
      throw new Error(`Session generation failed: ${sessionError.message}`);
    }

    console.log('OAuth flow completed successfully');

    return new Response(JSON.stringify({
      success: true,
      session_url: sessionData.properties?.action_link,
      oauth_account_id: oauthAccountId,
      user: {
        id: authUser.id,
        email: authUser.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      scopes: tokens.scope
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('OAuth callback error:', error);
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

function determineProvider(scope: string, service?: string): string {
  if (scope.includes('calendar')) return 'google-calendar';
  if (scope.includes('gmail') || scope.includes('mail')) return 'gmail';
  return 'google';
}

function getRedirectUri(origin: string): string {
  if (origin.includes('localhost')) {
    return `${origin}/oauth-callback.html`;
  } else if (origin.includes('sandbox.lovable.dev')) {
    return `${origin}/oauth-callback.html`;
  } else {
    return `${origin}/oauth-callback.html`;
  }
}

async function encryptToken(token: string): Promise<string> {
  // For now, return the token as-is. In production, implement proper encryption
  // This matches the database function we created
  return token;
}

serve(handler);