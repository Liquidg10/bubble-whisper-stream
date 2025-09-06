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
  id_token: string;
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
    const { code, redirect_uri } = await req.json();

    if (!code) {
      throw new Error('Authorization code is required');
    }

    console.log('Exchanging code for tokens...');

    // Exchange authorization code for tokens
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
        redirect_uri: redirect_uri || 'http://localhost:8080',
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

    // Check if OAuth account exists
    const { data: existingOAuth, error: oauthError } = await supabase
      .from('oauth_accounts')
      .select('user_id')
      .eq('provider', 'google')
      .eq('provider_user_id', userInfo.id)
      .maybeSingle();

    let authUser;

    if (existingOAuth) {
      console.log('Existing OAuth account found');
      
      // Update OAuth account tokens
      await supabase
        .from('oauth_accounts')
        .update({ 
          last_used_at: new Date().toISOString(),
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        })
        .eq('provider', 'google')
        .eq('provider_user_id', userInfo.id);

      // Get user info
      const { data: userData } = await supabase.auth.admin.getUserById(existingOAuth.user_id);
      authUser = userData.user;
    } else {
      console.log('Creating new user via Supabase Auth');
      
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
      const { error: oauthCreateError } = await supabase
        .from('oauth_accounts')
        .insert({
          user_id: authUser.id,
          provider: 'google',
          provider_user_id: userInfo.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          last_used_at: new Date().toISOString()
        });

      if (oauthCreateError) {
        console.error('OAuth account creation failed:', oauthCreateError);
        throw new Error(`OAuth account creation failed: ${oauthCreateError.message}`);
      }
    }

    // Generate Supabase Auth session
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email,
      options: {
        redirectTo: `${req.headers.get('origin') || 'http://localhost:3000'}/auth/callback`
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
      user: {
        id: authUser.id,
        email: authUser.email,
        name: userInfo.name,
        picture: userInfo.picture
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('OAuth error:', error);
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

serve(handler);