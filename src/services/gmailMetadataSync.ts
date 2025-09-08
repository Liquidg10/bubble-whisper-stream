import { supabase } from '@/integrations/supabase/client';
import { gmailIntentClassifier, EmailMetadata, IntentClassification } from './gmailIntentClassifier';
import { oauthService } from './oauthService';

interface GmailSyncOptions {
  maxResults?: number;
  query?: string;
  pageToken?: string;
}

interface SyncResult {
  processed: number;
  intents: Array<{
    metadata: EmailMetadata;
    classification: IntentClassification;
  }>;
  nextPageToken?: string;
  errors: string[];
}

class GmailMetadataSyncService {
  private syncInProgress = false;
  private listeners: Array<(result: SyncResult) => void> = [];

  async syncMetadata(accountId: string, options: GmailSyncOptions = {}): Promise<SyncResult> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const result: SyncResult = {
      processed: 0,
      intents: [],
      errors: []
    };

    try {
      // Get account details
      const accounts = await oauthService.getConnectedAccounts();
      const account = accounts.find(acc => acc.id === accountId && acc.provider === 'google');
      
      if (!account) {
        throw new Error('Gmail account not found');
      }

      // Check for minimal required scope
      const hasMetadataScope = account.scopes?.some(scope => 
        scope.includes('gmail.metadata') || scope.includes('gmail.readonly')
      );

      if (!hasMetadataScope) {
        throw new Error('Insufficient Gmail permissions - metadata scope required');
      }

      // Search for emails using Gmail API
      const searchQuery = options.query || 'is:important OR is:unread';
      const { data: searchData, error: searchError } = await supabase.functions.invoke('gmail-sync', {
        body: {
          accountId,
          operation: 'search',
          query: searchQuery,
          maxResults: options.maxResults || 50,
          pageToken: options.pageToken
        }
      });

      if (searchError) {
        result.errors.push(`Search failed: ${searchError.message}`);
        return result;
      }

      if (!searchData.messages || searchData.messages.length === 0) {
        return result;
      }

      result.nextPageToken = searchData.nextPageToken;

      // Process each message metadata
      for (const message of searchData.messages.slice(0, 20)) { // Limit to 20 for initial batch
        try {
          // Get message details (metadata only)
          const { data: messageData, error: messageError } = await supabase.functions.invoke('gmail-sync', {
            body: {
              accountId,
              operation: 'get',
              messageId: message.id
            }
          });

          if (messageError) {
            result.errors.push(`Failed to get message ${message.id}: ${messageError.message}`);
            continue;
          }

          // Extract metadata
          const metadata = this.extractMetadata(messageData);
          if (!metadata) {
            result.errors.push(`Failed to extract metadata for message ${message.id}`);
            continue;
          }

          // Classify intent
          const classification = await gmailIntentClassifier.classifyEmailMetadata(metadata);

          // Store in database
          await this.storeEmailMetadata(metadata, classification, accountId);

          result.intents.push({ metadata, classification });
          result.processed++;

        } catch (error) {
          result.errors.push(`Error processing message ${message.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Log sync operation
      await this.logSyncOperation(accountId, result);

    } catch (error) {
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.syncInProgress = false;
      this.notifyListeners(result);
    }

    return result;
  }

  private extractMetadata(gmailMessage: any): EmailMetadata | null {
    try {
      const headers = gmailMessage.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
      const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
      const dateHeader = headers.find((h: any) => h.name === 'Date')?.value;

      // Parse sender info
      const senderMatch = fromHeader.match(/^(.*?)\s*<(.+)>$/) || fromHeader.match(/^(.+)$/);
      const sender = senderMatch ? senderMatch[1]?.trim() || senderMatch[0]?.trim() : 'Unknown';
      const senderEmail = fromHeader.includes('<') 
        ? fromHeader.match(/<(.+)>/)?.[1] || fromHeader
        : fromHeader;

      return {
        id: gmailMessage.id,
        subject,
        sender,
        senderEmail: senderEmail.trim(),
        receivedAt: dateHeader ? new Date(dateHeader) : new Date(),
        threadId: gmailMessage.threadId,
        snippet: gmailMessage.snippet || ''
      };
    } catch (error) {
      console.error('Failed to extract email metadata:', error);
      return null;
    }
  }

  private async storeEmailMetadata(
    metadata: EmailMetadata, 
    classification: IntentClassification,
    accountId: string
  ): Promise<void> {
    try {
      // Check if email already exists
      const { data: existing } = await supabase
        .from('email_messages')
        .select('id')
        .eq('external_message_id', metadata.id)
        .single();

      if (existing) {
        // Update existing record
        await supabase
          .from('email_messages')
          .update({
            importance_score: classification.confidence,
            labels: [classification.intent, ...classification.tags],
            updated_at: new Date().toISOString()
          })
          .eq('external_message_id', metadata.id);
      } else {
        // Insert new record (metadata only)
        await supabase
          .from('email_messages')
          .insert({
            external_message_id: metadata.id,
            email_account_id: accountId,
            user_id: (await supabase.auth.getUser()).data.user?.id,
            sender_name: metadata.sender,
            sender_email: metadata.senderEmail,
            subject: metadata.subject,
            body_preview: metadata.snippet,
            thread_id: metadata.threadId,
            received_at: metadata.receivedAt.toISOString(),
            importance_score: classification.confidence,
            labels: [classification.intent, ...classification.tags],
            bubble_created: false
          });
      }
    } catch (error) {
      console.error('Failed to store email metadata:', error);
      throw error;
    }
  }

  private async logSyncOperation(accountId: string, result: SyncResult): Promise<void> {
    try {
      await supabase
        .from('sync_logs')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          provider: 'google',
          service_type: 'gmail',
          operation: 'metadata_sync',
          status: result.errors.length === 0 ? 'success' : 'partial_failure',
          account_id: accountId,
          items_processed: result.processed,
          error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to log sync operation:', error);
    }
  }

  subscribe(listener: (result: SyncResult) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(result: SyncResult): void {
    this.listeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        console.error('Error in sync listener:', error);
      }
    });
  }

  isInProgress(): boolean {
    return this.syncInProgress;
  }
}

export const gmailMetadataSync = new GmailMetadataSyncService();
export type { SyncResult, GmailSyncOptions };