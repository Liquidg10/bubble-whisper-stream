/**
 * P10 - OAuth Incremental Authorization Service
 * Implements least-privilege OAuth with scope escalation on demand
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface ScopeComparison {
  current: string[];
  requested: string[];
  added: string[];
  removed: string[];
}

export interface OAuthScope {
  id: string;
  name: string;
  description: string;
  category: 'minimal' | 'calendar-read' | 'calendar-write' | 'gmail-read' | 'gmail-draft' | 'gmail-send';
  required: boolean;
}

const GOOGLE_SCOPES: Record<string, OAuthScope> = {
  'openid': {
    id: 'openid',
    name: 'Basic Identity',
    description: 'Access to basic profile information',
    category: 'minimal',
    required: true
  },
  'email': {
    id: 'email',
    name: 'Email Address',
    description: 'Access to email address',
    category: 'minimal',
    required: true
  },
  'profile': {
    id: 'profile',
    name: 'Profile Info',
    description: 'Access to basic profile information',
    category: 'minimal',
    required: true
  },
  'https://www.googleapis.com/auth/calendar.readonly': {
    id: 'calendar.readonly',
    name: 'Calendar Read',
    description: 'Read access to calendar events',
    category: 'calendar-read',
    required: false
  },
  'https://www.googleapis.com/auth/calendar.events': {
    id: 'calendar.events',
    name: 'Calendar Events',
    description: 'Create and modify calendar events',
    category: 'calendar-write',
    required: false
  },
  'https://www.googleapis.com/auth/gmail.readonly': {
    id: 'gmail.readonly',
    name: 'Gmail Read',
    description: 'Read access to Gmail messages',
    category: 'gmail-read',
    required: false
  },
  'https://www.googleapis.com/auth/gmail.compose': {
    id: 'gmail.compose',
    name: 'Gmail Compose',
    description: 'Create email drafts',
    category: 'gmail-draft',
    required: false
  }
};

class OAuthIncrementalService {
  private currentScopes: string[] = [];

  /**
   * Get minimal scopes for initial OAuth
   * P10: Start with least privilege
   */
  getMinimalScopes(): string[] {
    return Object.entries(GOOGLE_SCOPES)
      .filter(([_, scope]) => scope.required)
      .map(([key, _]) => key);
  }

  /**
   * Get current user's OAuth scopes
   */
  async getCurrentScopes(): Promise<string[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.app_metadata?.provider_token) {
        return this.getMinimalScopes();
      }

      // In production, this would decode the actual token scopes
      // For now, we'll check what scopes are stored in user metadata
      const storedScopes = user.user_metadata?.oauth_scopes || this.getMinimalScopes();
      this.currentScopes = Array.isArray(storedScopes) ? storedScopes : this.getMinimalScopes();
      
      return this.currentScopes;
    } catch (error) {
      logger.error('Failed to get current OAuth scopes', error);
      return this.getMinimalScopes();
    }
  }

  /**
   * Compare current vs requested scopes
   */
  compareScopeChanges(current: string[], requested: string[]): ScopeComparison {
    const added = requested.filter(scope => !current.includes(scope));
    const removed = current.filter(scope => !requested.includes(scope));

    return {
      current,
      requested,
      added,
      removed
    };
  }

  /**
   * Check if feature requires scope escalation
   */
  async requiresEscalation(featureScopes: string[]): Promise<{ needsEscalation: boolean; comparison: ScopeComparison }> {
    const current = await this.getCurrentScopes();
    const comparison = this.compareScopeChanges(current, [...current, ...featureScopes]);
    
    return {
      needsEscalation: comparison.added.length > 0,
      comparison
    };
  }

  /**
   * Request scope escalation
   * P10: Show before/after scopes to user
   */
  async requestScopeEscalation(additionalScopes: string[], reason: string): Promise<boolean> {
    try {
      const current = await this.getCurrentScopes();
      const requested = [...new Set([...current, ...additionalScopes])];
      const comparison = this.compareScopeChanges(current, requested);

      logger.info('Requesting scope escalation', { 
        reason,
        added: comparison.added,
        current: comparison.current 
      });

      // In production, this would trigger Google's incremental auth flow
      // For now, we'll simulate the consent process
      const userConsent = await this.showScopeConsentModal(comparison, reason);
      
      if (userConsent) {
        await this.updateUserScopes(requested);
        this.currentScopes = requested;
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Scope escalation failed', error);
      return false;
    }
  }

  /**
   * Show scope consent modal (production would use Google's modal)
   */
  private async showScopeConsentModal(comparison: ScopeComparison, reason: string): Promise<boolean> {
    // This is a placeholder for the actual Google OAuth consent flow
    // In production, this would redirect to Google's consent screen
    
    const scopeDescriptions = comparison.added.map(scope => {
      const scopeInfo = GOOGLE_SCOPES[scope];
      return scopeInfo ? scopeInfo.description : scope;
    });

    console.log('Scope consent modal would show:', {
      reason,
      currentScopes: comparison.current.length,
      additionalScopes: scopeDescriptions,
      totalAfter: comparison.requested.length
    });

    // For testing, simulate user consent
    return true;
  }

  /**
   * Update user's OAuth scopes in database
   */
  private async updateUserScopes(scopes: string[]): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    // Store scopes in user metadata
    // In production, this would be handled by the OAuth provider
    const { error } = await supabase.auth.updateUser({
      data: {
        oauth_scopes: scopes,
        scope_updated_at: new Date().toISOString()
      }
    });

    if (error) {
      logger.error('Failed to update user scopes', error);
      throw error;
    }
  }

  /**
   * Enforce scope decay (30-day rule)
   */
  async enforceScopeDecay(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const scopeUpdatedAt = user.user_metadata?.scope_updated_at;
      if (!scopeUpdatedAt) return;

      const daysSinceUpdate = (Date.now() - new Date(scopeUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate >= 30) {
        logger.info('Enforcing 30-day scope decay');
        const minimalScopes = this.getMinimalScopes();
        await this.updateUserScopes(minimalScopes);
        this.currentScopes = minimalScopes;
      }
    } catch (error) {
      logger.error('Scope decay enforcement failed', error);
    }
  }

  /**
   * Get scope information for UI display
   */
  getScopeInfo(scopeId: string): OAuthScope | null {
    return GOOGLE_SCOPES[scopeId] || null;
  }

  /**
   * Get scopes needed for calendar auto-write
   */
  getCalendarWriteScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/calendar.events'
    ];
  }

  /**
   * Get scopes needed for email drafts
   */
  getEmailDraftScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/gmail.compose'
    ];
  }
}

export const oauthIncrementalService = new OAuthIncrementalService();