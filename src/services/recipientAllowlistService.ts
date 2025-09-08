import { supabase } from '@/integrations/supabase/client';

export interface RecipientEntry {
  id: string;
  user_id: string;
  email: string;
  display_name?: string;
  first_contacted_at: string;
  last_contacted_at: string;
  interaction_count: number;
  is_allowlisted: boolean;
  trust_score: number;
  created_at: string;
  updated_at: string;
}

export interface RecipientStatus {
  email: string;
  isAllowlisted: boolean;
  isFirstTime: boolean;
  trustScore: number;
  interactionCount: number;
  lastContacted?: string;
}

class RecipientAllowlistService {
  
  /**
   * Check recipient status for email composition
   */
  async checkRecipientStatus(email: string): Promise<RecipientStatus> {
    const { data: recipient, error } = await supabase
      .from('email_recipients')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !recipient) {
      return {
        email,
        isAllowlisted: false,
        isFirstTime: true,
        trustScore: 0,
        interactionCount: 0
      };
    }

    return {
      email,
      isAllowlisted: recipient.is_allowlisted,
      isFirstTime: recipient.interaction_count === 0,
      trustScore: recipient.trust_score,
      interactionCount: recipient.interaction_count,
      lastContacted: recipient.last_contacted_at
    };
  }

  /**
   * Record email interaction and update trust score
   */
  async recordInteraction(email: string, displayName?: string): Promise<void> {
    const now = new Date().toISOString();
    
    const { data: existing } = await supabase
      .from('email_recipients')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      // Update existing recipient
      const newInteractionCount = existing.interaction_count + 1;
      const newTrustScore = Math.min(1.0, existing.trust_score + 0.1);
      
      await supabase
        .from('email_recipients')
        .update({
          display_name: displayName || existing.display_name,
          last_contacted_at: now,
          interaction_count: newInteractionCount,
          trust_score: newTrustScore,
          // Auto-allowlist after 5 successful interactions
          is_allowlisted: existing.is_allowlisted || newInteractionCount >= 5,
          updated_at: now
        })
        .eq('id', existing.id);
    } else {
      // Create new recipient record
      await supabase
        .from('email_recipients')
        .insert({
          email: email.toLowerCase(),
          display_name: displayName,
          first_contacted_at: now,
          last_contacted_at: now,
          interaction_count: 1,
          trust_score: 0.1,
          is_allowlisted: false
        });
    }
  }

  /**
   * Manually add recipient to allowlist
   */
  async addToAllowlist(email: string, displayName?: string): Promise<void> {
    const now = new Date().toISOString();
    
    const { data: existing } = await supabase
      .from('email_recipients')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      await supabase
        .from('email_recipients')
        .update({
          is_allowlisted: true,
          trust_score: Math.max(existing.trust_score, 0.8),
          updated_at: now
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('email_recipients')
        .insert({
          email: email.toLowerCase(),
          display_name: displayName,
          first_contacted_at: now,
          last_contacted_at: now,
          interaction_count: 0,
          trust_score: 0.8,
          is_allowlisted: true
        });
    }
  }

  /**
   * Remove recipient from allowlist
   */
  async removeFromAllowlist(email: string): Promise<void> {
    await supabase
      .from('email_recipients')
      .update({
        is_allowlisted: false,
        updated_at: new Date().toISOString()
      })
      .eq('email', email.toLowerCase());
  }

  /**
   * Get all allowlisted recipients
   */
  async getAllowlistedRecipients(): Promise<RecipientEntry[]> {
    const { data, error } = await supabase
      .from('email_recipients')
      .select('*')
      .eq('is_allowlisted', true)
      .order('last_contacted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get recipient interaction history
   */
  async getRecipientHistory(email: string): Promise<RecipientEntry | null> {
    const { data, error } = await supabase
      .from('email_recipients')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Search recipients by name or email
   */
  async searchRecipients(query: string): Promise<RecipientEntry[]> {
    const { data, error } = await supabase
      .from('email_recipients')
      .select('*')
      .or(`email.ilike.%${query}%,display_name.ilike.%${query}%`)
      .order('interaction_count', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  }
}

export const recipientAllowlistService = new RecipientAllowlistService();