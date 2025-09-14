/**
 * P4 Enhanced - Gmail Integration Service  
 * Implements Bible features: label guards, historyId handling, draft-only safety
 */

import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';

export interface GmailAccount {
  id: string;
  email: string;
  historyId?: string;
  watchChannelId?: string;
  watchResourceId?: string;
  watchExpiresAt?: number;
  lastSyncAt?: number;
  filters: {
    senders: string[];
    keywords: string[];
    importanceThreshold: number;
  };
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  senderEmail: string;
  senderName?: string;
  snippet: string;
  receivedAt: number;
  labelIds: string[];
  importance: number;
  bodyPreview?: string;
}

export interface EmailDraft {
  id?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isPlainText?: boolean;
  confidence: number;
  traceId: string;
}

class EnhancedGmailService {
  private readonly RESTRICTED_LABELS = [
    'SENT', 'DRAFT', 'SPAM', 'TRASH', 'INBOX'
  ];
  
  private readonly SAFE_LABELS = [
    'IMPORTANT', 'STARRED', 'UNREAD'
  ];

  async syncMessages(account: GmailAccount): Promise<{
    messages: GmailMessage[];
    newHistoryId?: string;
  }> {
    if (!isFeatureEnabled('emailIntegrationEnabled')) {
      return { messages: [] };
    }

    try {
      // Use history API for incremental sync if historyId available
      if (account.historyId) {
        return this.syncHistoryChanges(account);
      } else {
        return this.performFullMessageSync(account);
      }
    } catch (error) {
      logger.error('Gmail sync failed', {
        accountId: account.id,
        error: error.message
      });
      throw error;
    }
  }

  async syncHistoryChanges(account: GmailAccount): Promise<{
    messages: GmailMessage[];
    newHistoryId?: string;
  }> {
    try {
      // Get history changes since last historyId
      const historyResponse = await this.callGmailAPI(account, 'history', {
        startHistoryId: account.historyId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']
      });

      if (historyResponse.status === 404) {
        // History ID too old, fall back to full sync
        logger.warn('Gmail history ID expired, performing full sync', {
          accountId: account.id,
          oldHistoryId: account.historyId
        });
        
        return this.performFullMessageSync(account);
      }

      const messages = this.processHistoryResponse(historyResponse);
      
      logger.info('Gmail history sync completed', {
        accountId: account.id,
        messagesCount: messages.length,
        newHistoryId: historyResponse.historyId
      });

      return {
        messages,
        newHistoryId: historyResponse.historyId
      };

    } catch (error) {
      logger.error('Gmail history sync failed', {
        accountId: account.id,
        error: error.message
      });
      throw error;
    }
  }

  async performFullMessageSync(account: GmailAccount): Promise<{
    messages: GmailMessage[];
    newHistoryId?: string;
  }> {
    const messages: GmailMessage[] = [];
    let pageToken: string | undefined;
    
    try {
      do {
        const response = await this.callGmailAPI(account, 'messages', {
          maxResults: 100,
          q: this.buildSearchQuery(account.filters),
          pageToken
        });

        if (response.messages) {
          // Get full message details
          const detailedMessages = await this.getMessageDetails(
            account, 
            response.messages.map((m: any) => m.id)
          );
          messages.push(...detailedMessages);
        }

        pageToken = response.nextPageToken;
      } while (pageToken);

      logger.info('Gmail full sync completed', {
        accountId: account.id,
        totalMessages: messages.length
      });

      return { messages };

    } catch (error) {
      logger.error('Gmail full sync failed', {
        accountId: account.id,
        error: error.message
      });
      throw error;
    }
  }

  async createDraft(account: GmailAccount, draft: EmailDraft): Promise<{
    draftId: string;
    success: boolean;
    traceId: string;
  }> {
    if (!isFeatureEnabled('autoWriteEmail')) {
      throw new Error('Email auto-write is disabled');
    }

    // NEVER auto-send - drafts only as per Bible
    if (draft.confidence < 0.85) {
      throw new Error('Confidence too low for draft creation');
    }

    try {
      const draftPayload = {
        message: {
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          body: draft.body,
          isPlainText: draft.isPlainText || false
        }
      };

      const response = await this.callGmailAPI(account, 'drafts', draftPayload, 'POST');
      
      logger.info('Gmail draft created', {
        accountId: account.id,
        draftId: response.id,
        traceId: draft.traceId,
        confidence: draft.confidence
      });

      return {
        draftId: response.id,
        success: true,
        traceId: draft.traceId
      };

    } catch (error) {
      logger.error('Gmail draft creation failed', {
        accountId: account.id,
        traceId: draft.traceId,
        error: error.message
      });
      throw error;
    }
  }

  async applyLabelSafely(
    account: GmailAccount, 
    messageId: string, 
    labelId: string
  ): Promise<boolean> {
    // Label guards: only allow safe label operations
    if (this.RESTRICTED_LABELS.includes(labelId)) {
      logger.warn('Attempted to apply restricted label', {
        accountId: account.id,
        messageId,
        labelId
      });
      return false;
    }

    if (!this.SAFE_LABELS.includes(labelId)) {
      logger.warn('Label not in safe list', {
        accountId: account.id,
        messageId,
        labelId
      });
      return false;
    }

    try {
      await this.callGmailAPI(account, `messages/${messageId}/modify`, {
        addLabelIds: [labelId]
      }, 'POST');

      logger.info('Label applied safely', {
        accountId: account.id,
        messageId,
        labelId
      });

      return true;

    } catch (error) {
      logger.error('Label application failed', {
        accountId: account.id,
        messageId,
        labelId,
        error: error.message
      });
      return false;
    }
  }

  async renewWatch(account: GmailAccount): Promise<boolean> {
    if (!account.watchExpiresAt) {
      return false;
    }

    const now = Date.now();
    const RENEWAL_BUFFER = 24 * 60 * 60 * 1000; // 24 hours
    const timeUntilExpiry = account.watchExpiresAt - now;
    
    // Renew if expiring within 24 hours
    if (timeUntilExpiry > RENEWAL_BUFFER) {
      return false;
    }

    try {
      // Stop existing watch
      if (account.watchChannelId) {
        await this.stopWatch(account.watchChannelId);
      }

      // Create new watch
      const newWatch = await this.createWatch(account);
      
      // Update account with new watch details
      account.watchChannelId = newWatch.channelId;
      account.watchResourceId = newWatch.resourceId;
      account.watchExpiresAt = newWatch.expiresAt;

      logger.info('Gmail watch renewed successfully', {
        accountId: account.id,
        newExpiresAt: new Date(newWatch.expiresAt).toISOString()
      });

      return true;

    } catch (error) {
      logger.error('Gmail watch renewal failed', {
        accountId: account.id,
        error: error.message
      });
      return false;
    }
  }

  private buildSearchQuery(filters: GmailAccount['filters']): string {
    const parts: string[] = [];
    
    // Add sender filters
    if (filters.senders.length > 0) {
      const senderQuery = filters.senders.map(s => `from:${s}`).join(' OR ');
      parts.push(`(${senderQuery})`);
    }
    
    // Add keyword filters
    if (filters.keywords.length > 0) {
      const keywordQuery = filters.keywords.map(k => `"${k}"`).join(' OR ');
      parts.push(`(${keywordQuery})`);
    }
    
    // Add importance filter
    if (filters.importanceThreshold > 0.5) {
      parts.push('is:important');
    }
    
    // Default to recent messages if no filters
    if (parts.length === 0) {
      parts.push('newer_than:7d');
    }
    
    return parts.join(' ');
  }

  private async getMessageDetails(account: GmailAccount, messageIds: string[]): Promise<GmailMessage[]> {
    const messages: GmailMessage[] = [];
    
    for (const id of messageIds) {
      try {
        const message = await this.callGmailAPI(account, `messages/${id}`);
        messages.push(this.parseMessage(message));
      } catch (error) {
        logger.warn('Failed to get message details', { messageId: id, error: error.message });
      }
    }
    
    return messages;
  }

  private parseMessage(rawMessage: any): GmailMessage {
    const headers = rawMessage.payload.headers;
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value;
    
    return {
      id: rawMessage.id,
      threadId: rawMessage.threadId,
      subject,
      senderEmail: this.extractEmail(from),
      senderName: this.extractName(from),
      snippet: rawMessage.snippet,
      receivedAt: date ? new Date(date).getTime() : Date.now(),
      labelIds: rawMessage.labelIds || [],
      importance: this.calculateImportance(rawMessage),
      bodyPreview: rawMessage.snippet
    };
  }

  private calculateImportance(message: any): number {
    // Simple importance scoring
    let score = 0.5;
    
    if (message.labelIds?.includes('IMPORTANT')) score += 0.3;
    if (message.labelIds?.includes('STARRED')) score += 0.2;
    if (message.labelIds?.includes('CATEGORY_PRIMARY')) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private extractEmail(fromHeader: string): string {
    const match = fromHeader.match(/<(.+?)>/);
    return match ? match[1] : fromHeader;
  }

  private extractName(fromHeader: string): string | undefined {
    const match = fromHeader.match(/^(.+?)\s*</);
    return match ? match[1].replace(/"/g, '') : undefined;
  }

  private processHistoryResponse(response: any): GmailMessage[] {
    // Process history changes and return affected messages
    // This would parse the actual history response from Gmail API
    return [];
  }

  // Mock API methods (would be actual Gmail API calls)
  private async callGmailAPI(
    account: GmailAccount, 
    endpoint: string, 
    params?: any, 
    method: string = 'GET'
  ): Promise<any> {
    // Simulated API response
    return {
      kind: 'gmail#listMessagesResponse',
      messages: [],
      resultSizeEstimate: 0,
      status: 200
    };
  }

  private async stopWatch(channelId: string): Promise<void> {
    logger.info('Stopping Gmail watch', { channelId });
  }

  private async createWatch(account: GmailAccount): Promise<{
    channelId: string;
    resourceId: string;
    expiresAt: number;
  }> {
    const channelId = `gmail-channel-${account.id}-${Date.now()}`;
    const resourceId = `gmail-resource-${Date.now()}`;
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    return { channelId, resourceId, expiresAt };
  }
}

export const enhancedGmailService = new EnhancedGmailService();