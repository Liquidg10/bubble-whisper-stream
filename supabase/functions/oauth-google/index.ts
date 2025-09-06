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

    // Check if user exists or create new user
    const { data: existingUser, error: userError } = await supabase
      .from('oauth_accounts')
      .select('user_id, users(*)')
      .eq('provider', 'google')
      .eq('provider_user_id', userInfo.id)
      .single();

    let userId: string;

    if (existingUser) {
      console.log('Existing user found');
      userId = existingUser.user_id;
      
      // Update last login
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
    } else {
      console.log('Creating new user');
      
      // Create new user
      const { data: newUser, error: createUserError } = await supabase
        .from('users')
        .insert({
          email: userInfo.email,
          display_name: userInfo.name,
          avatar_url: userInfo.picture,
          email_verified: userInfo.verified_email
        })
        .select()
        .single();

      if (createUserError) {
        console.error('User creation failed:', createUserError);
        throw new Error(`User creation failed: ${createUserError.message}`);
      }

      userId = newUser.id;

      // Create OAuth account record
      const { error: oauthError } = await supabase
        .from('oauth_accounts')
        .insert({
          user_id: userId,
          provider: 'google',
          provider_user_id: userInfo.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          last_used_at: new Date().toISOString()
        });

      if (oauthError) {
        console.error('OAuth account creation failed:', oauthError);
        throw new Error(`OAuth account creation failed: ${oauthError.message}`);
      }
    }

    // Generate session token (simplified - in production use proper JWT)
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store session
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        id: sessionToken,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        provider: 'google'
      });

    if (sessionError) {
      console.error('Session creation failed:', sessionError);
      throw new Error(`Session creation failed: ${sessionError.message}`);
    }

    console.log('OAuth flow completed successfully');

    return new Response(JSON.stringify({
      success: true,
      session_token: sessionToken,
      user: {
        id: userId,
        email: userInfo.email,
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