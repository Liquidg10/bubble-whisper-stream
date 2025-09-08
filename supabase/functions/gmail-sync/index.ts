import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailSyncRequest {
  accountId: string;
  operation: 'list' | 'get' | 'search';
  messageId?: string;
  query?: string;
  maxResults?: number;
  pageToken?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { accountId, operation, messageId, query, maxResults = 50, pageToken }: GmailSyncRequest = await req.json();

    // Get OAuth account with decrypted token
    const { data: oauthAccount, error: accountError } = await supabase
      .from('oauth_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (accountError || !oauthAccount) {
      throw new Error('OAuth account not found');
    }

    // Make Gmail API request
    const gmailBaseUrl = 'https://gmail.googleapis.com/gmail/v1';
    let gmailUrl = '';
    
    switch (operation) {
      case 'list':
        gmailUrl = `${gmailBaseUrl}/users/me/messages?maxResults=${maxResults}`;
        if (query) gmailUrl += `&q=${encodeURIComponent(query)}`;
        if (pageToken) gmailUrl += `&pageToken=${pageToken}`;
        break;
      case 'get':
        if (!messageId) throw new Error('Message ID required for get operation');
        gmailUrl = `${gmailBaseUrl}/users/me/messages/${messageId}`;
        break;
      case 'search':
        if (!query) throw new Error('Query required for search operation');
        gmailUrl = `${gmailBaseUrl}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
        break;
    }

    const gmailResponse = await fetch(gmailUrl, {
      headers: {
        'Authorization': `Bearer ${oauthAccount.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!gmailResponse.ok) {
      if (gmailResponse.status === 401) {
        // Token might be expired, try to refresh
        const refreshUrl = 'https://oauth2.googleapis.com/token';
        const refreshResponse = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: oauthAccount.refresh_token,
            client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
            client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
          }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          
          // Update the access token
          await supabase
            .from('oauth_accounts')
            .update({ 
              access_token: refreshData.access_token,
              expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', accountId);

          // Retry the Gmail request with new token
          const retryResponse = await fetch(gmailUrl, {
            headers: {
              'Authorization': `Bearer ${refreshData.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          if (retryResponse.ok) {
            const data = await retryResponse.json();
            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
      
      throw new Error(`Gmail API error: ${gmailResponse.status} ${gmailResponse.statusText}`);
    }

    const data = await gmailResponse.json();

    // Log successful sync
    await supabase
      .from('sync_logs')
      .insert({
        user_id: user.id,
        provider: 'google',
        service_type: 'gmail',
        operation: operation,
        status: 'success',
        account_id: accountId,
        items_processed: operation === 'list' ? (data.messages?.length || 0) : 1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Gmail sync error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);