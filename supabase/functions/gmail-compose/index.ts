import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GmailComposeRequest {
  accountId: string;
  operation: 'create_draft' | 'send' | 'send_draft' | 'delete_draft' | 'list_drafts' | 'get_draft';
  draft?: any;
  message?: any;
  draftId?: string;
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

    const { accountId, operation, draft, message, draftId }: GmailComposeRequest = await req.json();

    // Get OAuth account with access token
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

    // Check if compose scope is available
    if (!oauthAccount.scopes?.includes('https://www.googleapis.com/auth/gmail.compose')) {
      throw new Error('Gmail compose scope not granted');
    }

    let gmailUrl = '';
    let method = 'GET';
    let body: any = null;

    const gmailBaseUrl = 'https://gmail.googleapis.com/gmail/v1';

    switch (operation) {
      case 'create_draft':
        gmailUrl = `${gmailBaseUrl}/users/me/drafts`;
        method = 'POST';
        body = JSON.stringify({ message: draft });
        break;

      case 'send':
        gmailUrl = `${gmailBaseUrl}/users/me/messages/send`;
        method = 'POST';
        body = JSON.stringify(message);
        break;

      case 'send_draft':
        if (!draftId) throw new Error('Draft ID required');
        gmailUrl = `${gmailBaseUrl}/users/me/drafts/${draftId}/send`;
        method = 'POST';
        body = JSON.stringify({});
        break;

      case 'delete_draft':
        if (!draftId) throw new Error('Draft ID required');
        gmailUrl = `${gmailBaseUrl}/users/me/drafts/${draftId}`;
        method = 'DELETE';
        break;

      case 'list_drafts':
        gmailUrl = `${gmailBaseUrl}/users/me/drafts`;
        method = 'GET';
        break;

      case 'get_draft':
        if (!draftId) throw new Error('Draft ID required');
        gmailUrl = `${gmailBaseUrl}/users/me/drafts/${draftId}`;
        method = 'GET';
        break;

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Make request to Gmail API
    const gmailResponse = await fetch(gmailUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${oauthAccount.access_token}`,
        'Content-Type': 'application/json',
      },
      body
    });

    if (!gmailResponse.ok) {
      if (gmailResponse.status === 401) {
        // Try to refresh token
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

          // Retry the request with new token
          const retryResponse = await fetch(gmailUrl, {
            method,
            headers: {
              'Authorization': `Bearer ${refreshData.access_token}`,
              'Content-Type': 'application/json',
            },
            body
          });

          if (retryResponse.ok) {
            const data = await retryResponse.json();
            
            // Log the operation
            await supabase
              .from('sync_logs')
              .insert({
                user_id: user.id,
                provider: 'google',
                service_type: 'gmail',
                operation: operation,
                status: 'success',
                account_id: accountId,
                items_processed: 1,
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              });

            return new Response(JSON.stringify(data), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
      
      const errorText = await gmailResponse.text();
      console.error('Gmail API error:', gmailResponse.status, errorText);
      throw new Error(`Gmail API error: ${gmailResponse.status} ${errorText}`);
    }

    const data = operation === 'delete_draft' ? { success: true } : await gmailResponse.json();

    // Log successful operation
    await supabase
      .from('sync_logs')
      .insert({
        user_id: user.id,
        provider: 'google',
        service_type: 'gmail',
        operation: operation,
        status: 'success',
        account_id: accountId,
        items_processed: 1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Gmail compose error:', error);
    
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