import { supabase } from '@/integrations/supabase/client';
import { recipientAllowlistService, RecipientEntry } from './recipientAllowlistService';

export interface ContactOption {
  email: string;
  displayName?: string;
  trustScore: number;
  interactionCount: number;
  lastContacted?: string;
  recentThreads: EmailThread[];
  isAllowlisted: boolean;
}

export interface EmailThread {
  threadId: string;
  subject: string;
  lastMessageDate: string;
  messageCount: number;
}

export interface DisambiguationResult {
  needsDisambiguation: boolean;
  contacts: ContactOption[];
  exactMatch?: ContactOption;
}

class ContactDisambiguationService {

  /**
   * Resolve contact by name, handling disambiguation when multiple matches exist
   */
  async resolveContact(name: string): Promise<DisambiguationResult> {
    // First try exact email match
    if (this.isEmailAddress(name)) {
      const contact = await this.getContactByEmail(name);
      if (contact) {
        return {
          needsDisambiguation: false,
          contacts: [contact],
          exactMatch: contact
        };
      }
    }

    // Search by display name
    const recipients = await recipientAllowlistService.searchRecipients(name);
    
    if (recipients.length === 0) {
      return {
        needsDisambiguation: false,
        contacts: []
      };
    }

    if (recipients.length === 1) {
      const contact = await this.buildContactOption(recipients[0]);
      return {
        needsDisambiguation: false,
        contacts: [contact],
        exactMatch: contact
      };
    }

    // Multiple matches - need disambiguation
    const contacts = await Promise.all(
      recipients.map(recipient => this.buildContactOption(recipient))
    );

    // Sort by trust score and interaction count
    contacts.sort((a, b) => {
      if (a.isAllowlisted !== b.isAllowlisted) {
        return a.isAllowlisted ? -1 : 1;
      }
      if (a.trustScore !== b.trustScore) {
        return b.trustScore - a.trustScore;
      }
      return b.interactionCount - a.interactionCount;
    });

    return {
      needsDisambiguation: true,
      contacts
    };
  }

  /**
   * Get contact details by email address
   */
  private async getContactByEmail(email: string): Promise<ContactOption | null> {
    const recipient = await recipientAllowlistService.getRecipientHistory(email);
    if (!recipient) return null;

    return this.buildContactOption(recipient);
  }

  /**
   * Build contact option with recent threads
   */
  private async buildContactOption(recipient: RecipientEntry): Promise<ContactOption> {
    const recentThreads = await this.getRecentThreads(recipient.email);

    return {
      email: recipient.email,
      displayName: recipient.display_name,
      trustScore: recipient.trust_score,
      interactionCount: recipient.interaction_count,
      lastContacted: recipient.last_contacted_at,
      recentThreads,
      isAllowlisted: recipient.is_allowlisted
    };
  }

  /**
   * Get recent email threads with a contact
   */
  private async getRecentThreads(email: string): Promise<EmailThread[]> {
    const { data: messages, error } = await supabase
      .from('email_messages')
      .select('thread_id, subject, received_at')
      .eq('sender_email', email)
      .order('received_at', { ascending: false })
      .limit(5);

    if (error || !messages) return [];

    // Group by thread and get thread info
    const threadMap = new Map<string, EmailThread>();
    
    for (const message of messages) {
      if (!threadMap.has(message.thread_id)) {
        threadMap.set(message.thread_id, {
          threadId: message.thread_id,
          subject: message.subject,
          lastMessageDate: message.received_at,
          messageCount: 1
        });
      } else {
        const thread = threadMap.get(message.thread_id)!;
        thread.messageCount++;
        // Keep the latest date
        if (message.received_at > thread.lastMessageDate) {
          thread.lastMessageDate = message.received_at;
        }
      }
    }

    return Array.from(threadMap.values())
      .sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime())
      .slice(0, 3); // Return top 3 recent threads
  }

  /**
   * Validate email address format
   */
  private isEmailAddress(text: string): boolean {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(text);
  }

  /**
   * Get contact suggestions as user types
   */
  async getContactSuggestions(query: string, limit: number = 10): Promise<ContactOption[]> {
    if (query.length < 2) return [];

    const recipients = await recipientAllowlistService.searchRecipients(query);
    const contacts = await Promise.all(
      recipients.slice(0, limit).map(recipient => this.buildContactOption(recipient))
    );

    return contacts.sort((a, b) => {
      // Prioritize allowlisted contacts
      if (a.isAllowlisted !== b.isAllowlisted) {
        return a.isAllowlisted ? -1 : 1;
      }
      // Then by trust score
      if (a.trustScore !== b.trustScore) {
        return b.trustScore - a.trustScore;
      }
      // Then by interaction count
      return b.interactionCount - a.interactionCount;
    });
  }
}

export const contactDisambiguationService = new ContactDisambiguationService();
