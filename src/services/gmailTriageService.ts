import { supabase } from '@/integrations/supabase/client';
import { oauthService } from './oauthService';

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility: string;
  labelListVisibility: string;
  type: string;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: {
    partId: string;
    mimeType: string;
    filename: string;
    headers: Array<{
      name: string;
      value: string;
    }>;
    body: {
      size: number;
      data?: string;
    };
  };
  sizeEstimate: number;
}

export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

export interface TriageResult {
  messagesProcessed: number;
  threadsProcessed: number;
  actionablesFound: number;
  labelsUpdated: number;
  nextPageToken?: string;
  errors: string[];
}

export interface ActionableItem {
  id: string;
  messageId: string;
  type: 'meeting' | 'rsvp' | 'bill' | 'shipping' | 'task' | 'deadline';
  priority: number;
  dueDate?: Date;
  completed: boolean;
  metadata: {
    subject: string;
    sender: string;
    snippet: string;
    extractedData?: any;
  };
}

export interface TriageOptions {
  maxResults?: number;
  labelIds?: string[];
  query?: string;
  pageToken?: string;
  contextCacheEnabled?: boolean;
  forceRefresh?: boolean;
}

class GmailTriageService {
  private syncInProgress = false;
  private listeners: Array<(result: TriageResult) => void> = [];

  /**
   * Sync Gmail labels for an account
   */
  async syncLabels(accountId: string): Promise<GmailLabel[]> {
    console.log('Syncing Gmail labels for account:', accountId);

    try {
      // Get account and OAuth token
      const { data: account, error: accountError } = await supabase
        .from('email_accounts')
        .select('*, oauth_accounts!inner(*)')
        .eq('id', accountId)
        .single();

      if (accountError || !account) {
        throw new Error('Email account not found');
      }

      // TODO: Check if we have gmail.readonly scope
      // This would require implementing hasScope method in oauthService
      // For now, we'll proceed and handle auth errors in the API call

      // Fetch labels from Gmail API
      const response = await supabase.functions.invoke('gmail-sync', {
        body: {
          accountId,
          operation: 'labels'
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const labels = response.data.labels || [];
      console.log(`Fetched ${labels.length} labels`);

      // Cache labels in database
      await supabase
        .from('email_accounts')
        .update({
          labels_cache: { labels, updated_at: new Date().toISOString() },
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      return labels;

    } catch (error) {
      console.error('Error syncing Gmail labels:', error);
      throw error;
    }
  }

  /**
   * Main triage method - processes emails and extracts actionable items
   */
  async triageMessages(accountId: string, options: TriageOptions = {}): Promise<TriageResult> {
    if (this.syncInProgress) {
      throw new Error('Triage already in progress');
    }

    this.syncInProgress = true;
    console.log('Starting Gmail triage for account:', accountId);

    const result: TriageResult = {
      messagesProcessed: 0,
      threadsProcessed: 0,
      actionablesFound: 0,
      labelsUpdated: 0,
      errors: []
    };

    try {
      // Get account details
      const { data: account, error: accountError } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (accountError || !account) {
        throw new Error('Email account not found');
      }

      // Sync labels first if not cached or force refresh
      if (!account.labels_cache || options.forceRefresh) {
        await this.syncLabels(accountId);
        result.labelsUpdated = 1;
      }

      // Build query parameters
      const queryParams = this.buildQueryParams(options);

      // Fetch messages using Gmail sync function
      const response = await supabase.functions.invoke('gmail-sync', {
        body: {
          accountId,
          operation: 'list',
          ...queryParams,
          format: options.contextCacheEnabled ? 'full' : 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID']
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const messages = response.data.messages || [];
      result.nextPageToken = response.data.nextPageToken;
      result.messagesProcessed = messages.length;

      console.log(`Processing ${messages.length} messages`);

      // Process each message
      for (const message of messages) {
        try {
          // Store message in database
          await this.storeMessage(accountId, message);

          // Analyze for actionable items
          const actionables = await this.analyzeMessage(accountId, message);
          result.actionablesFound += actionables.length;

        } catch (error) {
          console.error('Error processing message:', message.id, error);
          result.errors.push(`Message ${message.id}: ${error.message}`);
        }
      }

      // Update sync status
      await supabase
        .from('email_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      console.log('Gmail triage completed:', result);
      this.notifyListeners(result);

      return result;

    } catch (error) {
      console.error('Error in Gmail triage:', error);
      result.errors.push(error.message);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Start Gmail watch for real-time updates
   */
  async startWatch(accountId: string): Promise<any> {
    console.log('Starting Gmail watch for account:', accountId);

    const response = await supabase.functions.invoke('gmail-watch', {
      body: {
        accountId,
        operation: 'start'
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  }

  /**
   * Stop Gmail watch
   */
  async stopWatch(accountId: string): Promise<any> {
    console.log('Stopping Gmail watch for account:', accountId);

    const response = await supabase.functions.invoke('gmail-watch', {
      body: {
        accountId,
        operation: 'stop'
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  }

  /**
   * Renew Gmail watch before expiration
   */
  async renewWatch(accountId: string): Promise<any> {
    console.log('Renewing Gmail watch for account:', accountId);

    const response = await supabase.functions.invoke('gmail-watch', {
      body: {
        accountId,
        operation: 'renew'
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  }

  /**
   * Get actionable items for a user
   */
  async getActionables(userId: string, type?: string): Promise<ActionableItem[]> {
    let query = supabase
      .from('gmail_actionables')
      .select('*')
      .eq('user_id', userId)
      .eq('action_completed', false)
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('actionable_type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching actionables:', error);
      throw error;
    }

    return (data || []).map(item => ({
      id: item.id,
      messageId: item.message_id,
      type: item.actionable_type as 'meeting' | 'rsvp' | 'bill' | 'shipping' | 'task' | 'deadline',
      priority: item.priority_score,
      dueDate: item.due_date ? new Date(item.due_date) : undefined,
      completed: item.action_completed,
      metadata: {
        subject: (typeof item.metadata === 'object' && item.metadata && 'subject' in item.metadata) ? 
          String(item.metadata.subject) : '',
        sender: (typeof item.metadata === 'object' && item.metadata && 'sender' in item.metadata) ? 
          String(item.metadata.sender) : '',
        snippet: (typeof item.metadata === 'object' && item.metadata && 'snippet' in item.metadata) ? 
          String(item.metadata.snippet) : '',
        extractedData: item.metadata
      }
    }));
  }

  /**
   * Mark actionable as completed
   */
  async completeActionable(actionableId: string): Promise<void> {
    const { error } = await supabase
      .from('gmail_actionables')
      .update({
        action_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', actionableId);

    if (error) {
      throw error;
    }
  }

  /**
   * Get Gmail threads with messages
   */
  async getThreads(userId: string, options: { limit?: number; labelIds?: string[] } = {}): Promise<any[]> {
    let query = supabase
      .from('gmail_threads')
      .select(`
        *,
        gmail_messages(*)
      `)
      .eq('user_id', userId)
      .order('last_message_date', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  private buildQueryParams(options: TriageOptions) {
    const params: any = {
      maxResults: options.maxResults || 50
    };

    if (options.labelIds && options.labelIds.length > 0) {
      params.labelIds = options.labelIds;
    }

    if (options.query) {
      params.q = options.query;
    }

    if (options.pageToken) {
      params.pageToken = options.pageToken;
    }

    return params;
  }

  private async storeMessage(accountId: string, message: GmailMessage): Promise<void> {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const to = headers.find(h => h.name === 'To')?.value || '';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';

    // Extract sender information
    const senderMatch = from.match(/(?:"?([^"]*)"?\s)?(?:<?([^>]+)>?)/);
    const senderName = senderMatch?.[1]?.trim() || '';
    const senderEmail = senderMatch?.[2]?.trim() || from;

    // Get account info for user_id
    const { data: account } = await supabase
      .from('email_accounts')
      .select('user_id')
      .eq('id', accountId)
      .single();

    if (!account) {
      throw new Error('Account not found');
    }

    // Store message using email_messages table (using existing schema)
    const { error } = await supabase
      .from('email_messages')
      .upsert({
        user_id: account.user_id,
        email_account_id: accountId,
        thread_id: message.threadId,
        external_message_id: message.id,
        gmail_thread_id: message.threadId,
        received_at: new Date(parseInt(message.internalDate)).toISOString(),
        internal_date: new Date(parseInt(message.internalDate)).toISOString(),
        subject,
        sender_email: senderEmail,
        sender_name: senderName,
        to_emails: to ? [to] : [],
        label_ids: message.labelIds || [],
        payload_metadata: message.payload,
        body_preview: message.snippet || '',
        importance_score: this.calculateImportanceScore(message),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'external_message_id'
      });

    if (error) {
      throw error;
    }

    // Update or insert thread information (using existing gmail_threads table if it exists)
    try {
      await supabase
        .from('gmail_threads')
        .upsert({
          user_id: account.user_id,
          thread_id: message.threadId,
          history_id: message.historyId,
          label_ids: message.labelIds || [],
          snippet: message.snippet || '',
          last_message_date: new Date(parseInt(message.internalDate)).toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'thread_id'
        });
    } catch (threadError) {
      // If gmail_threads table doesn't exist, continue without it
      console.warn('Could not update gmail_threads table:', threadError);
    }
  }

  private async analyzeMessage(accountId: string, message: GmailMessage): Promise<any[]> {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const snippet = message.snippet || '';
    const combinedText = `${subject} ${snippet}`.toLowerCase();

    const actionables = [];

    // Get account user_id
    const { data: account } = await supabase
      .from('email_accounts')
      .select('user_id')
      .eq('id', accountId)
      .single();

    if (!account) {
      return actionables;
    }

    // Detect meetings/calendar invites
    if (this.containsKeywords(combinedText, ['meeting', 'calendar', 'invite', 'appointment', 'conference'])) {
      actionables.push({
        user_id: account.user_id,
        message_id: message.id,
        actionable_type: 'meeting',
        priority_score: 0.8,
        due_date: this.extractDueDate(combinedText),
        metadata: {
          subject,
          sender: from,
          snippet: snippet.substring(0, 200),
          keywords: ['meeting', 'calendar']
        }
      });
    }

    // Detect RSVPs
    if (this.containsKeywords(combinedText, ['rsvp', 'please confirm', 'respond by', 'please reply'])) {
      actionables.push({
        user_id: account.user_id,
        message_id: message.id,
        actionable_type: 'rsvp',
        priority_score: 0.7,
        due_date: this.extractDueDate(combinedText),
        metadata: {
          subject,
          sender: from,
          snippet: snippet.substring(0, 200),
          keywords: ['rsvp', 'confirm']
        }
      });
    }

    // Detect bills/payments
    if (this.containsKeywords(combinedText, ['bill', 'payment', 'invoice', 'due', 'amount owed', 'balance'])) {
      actionables.push({
        user_id: account.user_id,
        message_id: message.id,
        actionable_type: 'bill',
        priority_score: 0.9,
        due_date: this.extractDueDate(combinedText),
        metadata: {
          subject,
          sender: from,
          snippet: snippet.substring(0, 200),
          keywords: ['bill', 'payment']
        }
      });
    }

    // Detect shipping notifications
    if (this.containsKeywords(combinedText, ['shipped', 'tracking', 'delivery', 'package', 'order'])) {
      actionables.push({
        user_id: account.user_id,
        message_id: message.id,
        actionable_type: 'shipping',
        priority_score: 0.5,
        due_date: this.extractDueDate(combinedText),
        metadata: {
          subject,
          sender: from,
          snippet: snippet.substring(0, 200),
          keywords: ['shipping', 'delivery']
        }
      });
    }

    // Store actionables in database
    for (const actionable of actionables) {
      const { error } = await supabase
        .from('gmail_actionables')
        .insert(actionable);

      if (error) {
        console.error('Error storing actionable:', error);
      }
    }

    return actionables;
  }

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private extractDueDate(text: string): string | null {
    const datePatterns = [
      /due (?:by |on )?(\w+ \d{1,2}(?:, \d{4})?)/i,
      /deadline (?:is |of )?(\w+ \d{1,2}(?:, \d{4})?)/i,
      /respond by (\w+ \d{1,2}(?:, \d{4})?)/i,
      /(\w+ \d{1,2}(?:, \d{4})?) deadline/i,
      /by (\w+ \d{1,2}(?:, \d{4})?)/i,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const dateStr = match[1];
          const currentYear = new Date().getFullYear();
          const parsedDate = new Date(dateStr.includes(',') ? dateStr : `${dateStr}, ${currentYear}`);

          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        } catch (e) {
          continue;
        }
      }
    }

    return null;
  }

  private calculateImportanceScore(message: GmailMessage): number {
    let score = 0.5; // Base score

    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';

    // Check for important keywords in subject
    const importantKeywords = ['urgent', 'important', 'asap', 'deadline', 'action required', 'please review'];
    if (importantKeywords.some(keyword => subject.toLowerCase().includes(keyword))) {
      score += 0.3;
    }

    // Check if marked as important by Gmail
    if (message.labelIds?.includes('IMPORTANT')) {
      score += 0.2;
    }

    // Check sender domain for business emails
    if (from.includes('@company.com') || from.includes('@bank.') || from.includes('@gov.')) {
      score += 0.1;
    }

    // Check for size - longer emails might be more important
    if (message.sizeEstimate > 5000) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Subscribe to triage progress updates
   */
  subscribe(listener: (result: TriageResult) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if triage is currently in progress
   */
  isInProgress(): boolean {
    return this.syncInProgress;
  }

  private notifyListeners(result: TriageResult): void {
    this.listeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        console.error('Error in triage listener:', error);
      }
    });
  }
}

export const gmailTriageService = new GmailTriageService();