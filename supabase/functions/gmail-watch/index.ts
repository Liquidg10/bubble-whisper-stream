import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface GmailWatchRequest {
  accountId: string;
  operation: 'start' | 'stop' | 'renew' | 'webhook';
  historyId?: string;
  resourceState?: string;
  resourceId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    if (req.method === 'POST') {
      // Handle webhook notifications from Gmail
      const resourceState = req.headers.get('x-goog-resource-state');
      const resourceId = req.headers.get('x-goog-resource-id');
      const channelId = req.headers.get('x-goog-channel-id');

      console.log('Gmail webhook received:', { resourceState, resourceId, channelId });

      if (resourceState === 'exists' || resourceState === 'sync') {
        // Process history changes
        await processHistoryChanges(resourceId, channelId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { accountId, operation, historyId }: GmailWatchRequest = await req.json();

    // Get the OAuth token for this account
    const { data: account, error: accountError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      throw new Error('Email account not found');
    }

    // Get OAuth token
    const { data: oauthAccount, error: oauthError } = await supabase
      .from('oauth_accounts')
      .select('*')
      .eq('id', account.oauth_token_id)
      .single();

    if (oauthError || !oauthAccount) {
      throw new Error('OAuth account not found');
    }

    let result;
    switch (operation) {
      case 'start':
        result = await startWatch(account, oauthAccount.access_token);
        break;
      case 'stop':
        result = await stopWatch(account, oauthAccount.access_token);
        break;
      case 'renew':
        result = await renewWatch(account, oauthAccount.access_token);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in gmail-watch function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

async function startWatch(account: any, accessToken: string) {
  // Generate unique channel ID and webhook URL
  const channelId = `gmail-watch-${account.id}-${Date.now()}`;
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-watch`;

  console.log('Starting Gmail watch for account:', account.account_email);

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/watch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      labelIds: ['INBOX'],
      topicName: `projects/${Deno.env.get('GOOGLE_CLOUD_PROJECT_ID')}/topics/gmail-notifications`,
      // Fallback to webhook if Pub/Sub not configured
      address: webhookUrl
    }),
  });

  if (!response.ok) {
    console.error('Gmail watch start failed:', await response.text());
    throw new Error(`Gmail API error: ${response.status}`);
  }

  const watchData = await response.json();
  console.log('Gmail watch started:', watchData);

  // Store watch information
  await supabase
    .from('email_accounts')
    .update({
      watch_channel_id: channelId,
      watch_resource_id: watchData.resourceId,
      watch_expiration: new Date(parseInt(watchData.expiration)),
      history_id: watchData.historyId,
      updated_at: new Date().toISOString()
    })
    .eq('id', account.id);

  return {
    success: true,
    channelId,
    resourceId: watchData.resourceId,
    expiration: watchData.expiration,
    historyId: watchData.historyId
  };
}

async function stopWatch(account: any, accessToken: string) {
  if (!account.watch_channel_id) {
    return { success: true, message: 'No active watch to stop' };
  }

  console.log('Stopping Gmail watch for channel:', account.watch_channel_id);

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/stop`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelId: account.watch_channel_id,
      resourceId: account.watch_resource_id
    }),
  });

  if (!response.ok && response.status !== 404) {
    console.error('Gmail watch stop failed:', await response.text());
    throw new Error(`Gmail API error: ${response.status}`);
  }

  // Clear watch information
  await supabase
    .from('email_accounts')
    .update({
      watch_channel_id: null,
      watch_resource_id: null,
      watch_expiration: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', account.id);

  return { success: true, message: 'Watch stopped successfully' };
}

async function renewWatch(account: any, accessToken: string) {
  console.log('Renewing Gmail watch for account:', account.account_email);
  
  // Stop existing watch first
  await stopWatch(account, accessToken);
  
  // Start new watch
  return await startWatch(account, accessToken);
}

async function processHistoryChanges(resourceId: string, channelId: string) {
  // Find the email account for this watch
  const { data: account, error } = await supabase
    .from('email_accounts')
    .select('*, oauth_accounts!inner(*)')
    .eq('watch_resource_id', resourceId)
    .eq('watch_channel_id', channelId)
    .single();

  if (error || !account) {
    console.error('Account not found for watch:', { resourceId, channelId });
    return;
  }

  const accessToken = account.oauth_accounts.access_token;
  const startHistoryId = account.history_id;

  console.log('Processing history changes for account:', account.account_email, 'from historyId:', startHistoryId);

  // Fetch history list
  const historyResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&labelId=INBOX`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!historyResponse.ok) {
    console.error('Failed to fetch history:', await historyResponse.text());
    return;
  }

  const historyData = await historyResponse.json();
  
  if (!historyData.history) {
    console.log('No history changes found');
    return;
  }

  console.log(`Processing ${historyData.history.length} history records`);

  // Process each history record
  for (const record of historyData.history) {
    if (record.messagesAdded) {
      for (const messageAdded of record.messagesAdded) {
        await processNewMessage(account, messageAdded.message, accessToken);
      }
    }
    
    if (record.messagesDeleted) {
      for (const messageDeleted of record.messagesDeleted) {
        await processDeletedMessage(account, messageDeleted.message);
      }
    }
  }

  // Update latest history ID
  if (historyData.historyId) {
    await supabase
      .from('email_accounts')
      .update({
        history_id: historyData.historyId,
        last_sync_at: new Date().toISOString()
      })
      .eq('id', account.id);
  }
}

async function processNewMessage(account: any, message: any, accessToken: string) {
  console.log('Processing new message:', message.id);

  // Fetch full message metadata
  const messageResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!messageResponse.ok) {
    console.error('Failed to fetch message:', await messageResponse.text());
    return;
  }

  const messageData = await messageResponse.json();
  const headers = messageData.payload.headers;
  
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
  const from = headers.find((h: any) => h.name === 'From')?.value || '';
  const to = headers.find((h: any) => h.name === 'To')?.value || '';
  const date = headers.find((h: any) => h.name === 'Date')?.value || '';
  const messageId = headers.find((h: any) => h.name === 'Message-ID')?.value || '';

  // Extract sender email and name
  const senderMatch = from.match(/(?:"?([^"]*)"?\s)?(?:<?([^>]+)>?)/);
  const senderName = senderMatch?.[1]?.trim() || '';
  const senderEmail = senderMatch?.[2]?.trim() || from;

  // Store in gmail_messages table
  await supabase
    .from('gmail_messages')
    .upsert({
      user_id: account.user_id,
      email_account_id: account.id,
      thread_id: messageData.threadId,
      external_message_id: message.id,
      gmail_thread_id: messageData.threadId,
      internal_date: new Date(parseInt(messageData.internalDate)),
      subject,
      sender_email: senderEmail,
      sender_name: senderName,
      to_emails: to ? [to] : [],
      label_ids: messageData.labelIds || [],
      payload_metadata: messageData.payload,
      body_preview: messageData.snippet || '',
      importance_score: calculateImportanceScore(messageData),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'external_message_id'
    });

  // Update or create thread record
  await supabase
    .from('gmail_threads')
    .upsert({
      user_id: account.user_id,
      thread_id: messageData.threadId,
      history_id: messageData.historyId,
      label_ids: messageData.labelIds || [],
      snippet: messageData.snippet || '',
      last_message_date: new Date(parseInt(messageData.internalDate)),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'thread_id'
    });

  // Analyze for actionable items
  await analyzeActionable(account, messageData, senderEmail, subject);
}

async function processDeletedMessage(account: any, message: any) {
  console.log('Processing deleted message:', message.id);
  
  // Mark message as deleted or remove it
  await supabase
    .from('gmail_messages')
    .delete()
    .eq('external_message_id', message.id)
    .eq('email_account_id', account.id);
}

function calculateImportanceScore(messageData: any): number {
  let score = 0.5; // Base score
  
  // Check for important keywords in subject
  const subject = messageData.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
  const importantKeywords = ['urgent', 'important', 'asap', 'deadline', 'action required', 'please review'];
  
  if (importantKeywords.some(keyword => subject.toLowerCase().includes(keyword))) {
    score += 0.3;
  }
  
  // Check if marked as important by Gmail
  if (messageData.labelIds?.includes('IMPORTANT')) {
    score += 0.2;
  }
  
  // Check if from known important senders (could be enhanced with user preferences)
  const from = messageData.payload.headers.find((h: any) => h.name === 'From')?.value || '';
  if (from.includes('@company.com') || from.includes('@bank.')) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}

async function analyzeActionable(account: any, messageData: any, senderEmail: string, subject: string) {
  const snippet = messageData.snippet || '';
  const combinedText = `${subject} ${snippet}`.toLowerCase();
  
  // Detect different types of actionables
  const actionables = [];
  
  // Meeting/Calendar invites
  if (combinedText.includes('meeting') || combinedText.includes('calendar') || combinedText.includes('invite')) {
    actionables.push({
      type: 'meeting',
      priority: 0.8,
      due_date: extractDueDate(combinedText)
    });
  }
  
  // RSVPs
  if (combinedText.includes('rsvp') || combinedText.includes('please confirm') || combinedText.includes('respond by')) {
    actionables.push({
      type: 'rsvp',
      priority: 0.7,
      due_date: extractDueDate(combinedText)
    });
  }
  
  // Bills/Payment
  if (combinedText.includes('bill') || combinedText.includes('payment') || combinedText.includes('invoice') || combinedText.includes('due')) {
    actionables.push({
      type: 'bill',
      priority: 0.9,
      due_date: extractDueDate(combinedText)
    });
  }
  
  // Shipping notifications
  if (combinedText.includes('shipped') || combinedText.includes('tracking') || combinedText.includes('delivery')) {
    actionables.push({
      type: 'shipping',
      priority: 0.5,
      due_date: extractDueDate(combinedText)
    });
  }
  
  // Store actionables
  for (const actionable of actionables) {
    await supabase
      .from('gmail_actionables')
      .insert({
        user_id: account.user_id,
        message_id: messageData.id,
        actionable_type: actionable.type,
        due_date: actionable.due_date,
        priority_score: actionable.priority,
        action_required: true,
        metadata: {
          subject,
          sender: senderEmail,
          snippet: snippet.substring(0, 200)
        }
      });
  }
}

function extractDueDate(text: string): string | null {
  // Simple date extraction - could be enhanced with more sophisticated parsing
  const datePatterns = [
    /due (?:by |on )?(\w+ \d{1,2})/i,
    /deadline (?:is |of )?(\w+ \d{1,2})/i,
    /respond by (\w+ \d{1,2})/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const dateStr = match[1];
        const currentYear = new Date().getFullYear();
        const parsedDate = new Date(`${dateStr}, ${currentYear}`);
        
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString();
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  }
  
  return null;
}

serve(handler);