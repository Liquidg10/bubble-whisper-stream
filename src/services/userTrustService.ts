/**
 * User Trust Service
 * 
 * Manages contact allowlists, calendar whitelists, and trust scoring
 * for auto-write precision gate decisions.
 */

import { supabase } from '@/integrations/supabase/client';

export interface ContactTrustData {
  email: string;
  trustScore: number; // 0-1
  isAllowlisted: boolean;
  interactionCount: number;
  lastContactedAt: Date;
  firstContactedAt: Date;
}

export interface CalendarTrustData {
  calendarId: string;
  calendarName: string;
  isWhitelisted: boolean;
  autoWriteEnabled: boolean;
  trustLevel: 'high' | 'medium' | 'low';
}

export interface TrustPreferences {
  autoAllowFrequentContacts: boolean;
  trustThreshold: number; // 0-1, contacts above this are auto-trusted
  maxInteractionsForTrust: number;
  whitelistedDomains: string[];
  blockedDomains: string[];
}

class UserTrustService {
  private storageKey = 'mm-trust-preferences';
  
  /**
   * Get contact trust score and allowlist status
   */
  async getContactTrust(email: string): Promise<ContactTrustData | null> {
    try {
      const { data, error } = await supabase
        .from('email_recipients')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching contact trust:', error);
        return null;
      }
      
      if (!data) {
        return {
          email,
          trustScore: 0.1, // New contact
          isAllowlisted: false,
          interactionCount: 0,
          lastContactedAt: new Date(),
          firstContactedAt: new Date()
        };
      }
      
      return {
        email: data.email,
        trustScore: data.trust_score,
        isAllowlisted: data.is_allowlisted,
        interactionCount: data.interaction_count,
        lastContactedAt: new Date(data.last_contacted_at),
        firstContactedAt: new Date(data.first_contacted_at)
      };
    } catch (error) {
      console.warn('Error in getContactTrust:', error);
      return null;
    }
  }
  
  /**
   * Update contact trust data
   */
  async updateContactTrust(email: string, updates: Partial<ContactTrustData>): Promise<void> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { error } = await supabase
        .from('email_recipients')
        .upsert({
          email: email.toLowerCase(),
          user_id: user.user.id,
          trust_score: updates.trustScore,
          is_allowlisted: updates.isAllowlisted,
          interaction_count: updates.interactionCount,
          last_contacted_at: updates.lastContactedAt?.toISOString(),
          first_contacted_at: updates.firstContactedAt?.toISOString(),
          display_name: updates.email?.split('@')[0] // Simple fallback
        });
      
      if (error) {
        console.warn('Error updating contact trust:', error);
      }
    } catch (error) {
      console.warn('Error in updateContactTrust:', error);
    }
  }
  
  /**
   * Add contact to allowlist
   */
  async allowlistContact(email: string): Promise<void> {
    const existing = await this.getContactTrust(email);
    
    await this.updateContactTrust(email, {
      ...existing,
      isAllowlisted: true,
      trustScore: Math.max(existing?.trustScore || 0.1, 0.8) // Boost trust score
    });
  }
  
  /**
   * Remove contact from allowlist
   */
  async removeFromAllowlist(email: string): Promise<void> {
    const existing = await this.getContactTrust(email);
    
    await this.updateContactTrust(email, {
      ...existing,
      isAllowlisted: false
    });
  }
  
  /**
   * Get calendar trust data
   */
  async getCalendarTrust(calendarId: string): Promise<CalendarTrustData | null> {
    try {
      const { data, error } = await supabase
        .from('calendar_accounts')
        .select('*')
        .eq('calendar_id', calendarId)
        .maybeSingle();
      
      if (error || !data) {
        return null;
      }
      
      // Check if calendar is in whitelist (stored in local storage for now)
      const preferences = this.getTrustPreferences();
      const isWhitelisted = preferences.whitelistedDomains.some(domain => 
        data.account_email.endsWith(domain)
      );
      
      return {
        calendarId: data.calendar_id,
        calendarName: data.calendar_name || data.account_name,
        isWhitelisted,
        autoWriteEnabled: data.sync_enabled && isWhitelisted,
        trustLevel: data.is_primary ? 'high' : isWhitelisted ? 'medium' : 'low'
      };
    } catch (error) {
      console.warn('Error getting calendar trust:', error);
      return null;
    }
  }
  
  /**
   * Whitelist a calendar for auto-write
   */
  async whitelistCalendar(calendarId: string): Promise<void> {
    try {
      const calendarData = await this.getCalendarTrust(calendarId);
      if (!calendarData) return;
      
      const preferences = this.getTrustPreferences();
      const domain = calendarData.calendarName.split('@')[1];
      
      if (domain && !preferences.whitelistedDomains.includes(domain)) {
        preferences.whitelistedDomains.push(domain);
        this.saveTrustPreferences(preferences);
      }
    } catch (error) {
      console.warn('Error whitelisting calendar:', error);
    }
  }
  
  /**
   * Calculate dynamic trust score based on interaction patterns
   */
  async calculateDynamicTrustScore(email: string): Promise<number> {
    try {
      const contactData = await this.getContactTrust(email);
      if (!contactData) return 0.1;
      
      let score = 0.1; // Base score for unknown contacts
      
      // Interaction frequency boost
      if (contactData.interactionCount >= 10) {
        score += 0.3;
      } else if (contactData.interactionCount >= 5) {
        score += 0.2;
      } else if (contactData.interactionCount >= 2) {
        score += 0.1;
      }
      
      // Recency boost
      const daysSinceLastContact = (Date.now() - contactData.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastContact <= 7) {
        score += 0.2;
      } else if (daysSinceLastContact <= 30) {
        score += 0.1;
      }
      
      // Relationship duration boost
      const daysSinceFirstContact = (Date.now() - contactData.firstContactedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirstContact >= 365) {
        score += 0.2;
      } else if (daysSinceFirstContact >= 90) {
        score += 0.1;
      }
      
      // Domain trust boost
      const preferences = this.getTrustPreferences();
      const domain = email.split('@')[1];
      if (preferences.whitelistedDomains.includes(domain)) {
        score += 0.3;
      }
      
      // Explicit allowlist override
      if (contactData.isAllowlisted) {
        score = Math.max(score, 0.9);
      }
      
      return Math.min(1, score);
    } catch (error) {
      console.warn('Error calculating dynamic trust score:', error);
      return 0.1;
    }
  }
  
  /**
   * Check if email domain is blocked
   */
  isDomainBlocked(email: string): boolean {
    const preferences = this.getTrustPreferences();
    const domain = email.split('@')[1];
    return preferences.blockedDomains.includes(domain);
  }
  
  /**
   * Auto-update trust scores based on user interactions
   */
  async recordInteraction(email: string, interactionType: 'sent' | 'received' | 'replied'): Promise<void> {
    try {
      const existing = await this.getContactTrust(email);
      const now = new Date();
      
      const updates: Partial<ContactTrustData> = {
        interactionCount: (existing?.interactionCount || 0) + 1,
        lastContactedAt: now,
        firstContactedAt: existing?.firstContactedAt || now
      };
      
      // Boost trust score for positive interactions
      if (interactionType === 'replied') {
        updates.trustScore = Math.min(1, (existing?.trustScore || 0.1) + 0.1);
      } else if (interactionType === 'sent') {
        updates.trustScore = Math.min(1, (existing?.trustScore || 0.1) + 0.05);
      }
      
      // Auto-allowlist frequent contacts
      const preferences = this.getTrustPreferences();
      if (preferences.autoAllowFrequentContacts && 
          updates.interactionCount! >= preferences.maxInteractionsForTrust &&
          (updates.trustScore || 0) >= preferences.trustThreshold) {
        updates.isAllowlisted = true;
      }
      
      await this.updateContactTrust(email, updates);
    } catch (error) {
      console.warn('Error recording interaction:', error);
    }
  }
  
  /**
   * Get user trust preferences
   */
  getTrustPreferences(): TrustPreferences {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return { ...this.getDefaultPreferences(), ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Error loading trust preferences:', error);
    }
    
    return this.getDefaultPreferences();
  }
  
  /**
   * Save trust preferences
   */
  saveTrustPreferences(preferences: TrustPreferences): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(preferences));
    } catch (error) {
      console.warn('Error saving trust preferences:', error);
    }
  }
  
  /**
   * Get default trust preferences
   */
  private getDefaultPreferences(): TrustPreferences {
    return {
      autoAllowFrequentContacts: true,
      trustThreshold: 0.7,
      maxInteractionsForTrust: 10,
      whitelistedDomains: [],
      blockedDomains: ['spam.com', 'noreply.com']
    };
  }
  
  /**
   * Get all allowlisted contacts
   */
  async getAllowlistedContacts(): Promise<ContactTrustData[]> {
    try {
      const { data, error } = await supabase
        .from('email_recipients')
        .select('*')
        .eq('is_allowlisted', true)
        .order('last_contacted_at', { ascending: false });
      
      if (error) {
        console.warn('Error fetching allowlisted contacts:', error);
        return [];
      }
      
      return data.map(row => ({
        email: row.email,
        trustScore: row.trust_score,
        isAllowlisted: row.is_allowlisted,
        interactionCount: row.interaction_count,
        lastContactedAt: new Date(row.last_contacted_at),
        firstContactedAt: new Date(row.first_contacted_at)
      }));
    } catch (error) {
      console.warn('Error in getAllowlistedContacts:', error);
      return [];
    }
  }
  
  /**
   * Bulk import contacts for trust scoring
   */
  async bulkImportContacts(contacts: { email: string; interactionCount?: number }[]): Promise<void> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const contactData = contacts.map(contact => ({
        email: contact.email.toLowerCase(),
        user_id: user.user.id,
        trust_score: Math.min(0.8, 0.1 + (contact.interactionCount || 0) * 0.05),
        is_allowlisted: (contact.interactionCount || 0) >= 10,
        interaction_count: contact.interactionCount || 1,
        last_contacted_at: new Date().toISOString(),
        first_contacted_at: new Date().toISOString(),
        display_name: contact.email.split('@')[0]
      }));
      
      const { error } = await supabase
        .from('email_recipients')
        .upsert(contactData);
      
      if (error) {
        console.warn('Error bulk importing contacts:', error);
      }
    } catch (error) {
      console.warn('Error in bulkImportContacts:', error);
    }
  }
}

export const userTrustService = new UserTrustService();