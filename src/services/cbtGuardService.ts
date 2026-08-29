/**
 * CBT Guard Service - Core safety and privacy enforcement for CBT features
 * Provides centralized gating, kill switches, and telemetry guardrails
 */

import { isFeatureEnabled } from '@/config/flags';
import { useBubbleStore } from '@/stores/bubbleStore';

export interface CBTGuardContext {
  userId?: string;
  messageContent?: string;
  conversationContext?: any;
  timestamp: number;
}

export interface CBTGuardResult {
  allowed: boolean;
  reason?: string;
  restrictions?: string[];
}

class CBTGuardService {
  /**
   * Primary gating function - checks all flags and settings
   */
  isFeatureAllowed(feature: 'assist' | 'observe' | 'crisis' | 'devRoutes'): boolean {
    // Check feature flags first
    switch (feature) {
      case 'assist':
        if (!isFeatureEnabled('cbtAssist')) return false;
        break;
      case 'observe':
        if (!isFeatureEnabled('cbtSilentObserve')) return false;
        break;
      case 'crisis':
        if (!isFeatureEnabled('cbtCrisisEnabled')) return false;
        break;
      case 'devRoutes':
        if (!isFeatureEnabled('cbtDevRoutes')) return false;
        break;
    }

    // Check global kill switch
    const settings = useBubbleStore.getState().settings;
    if (!settings.cbtSettings?.cbtAssistEnabled) {
      return false;
    }

    return true;
  }

  /**
   * Comprehensive intervention gating
   */
  canIntervene(context: CBTGuardContext): CBTGuardResult {
    // Primary kill switches
    if (!this.isFeatureAllowed('assist')) {
      return { 
        allowed: false, 
        reason: 'CBT assistance disabled',
        restrictions: ['feature_disabled']
      };
    }

    const settings = useBubbleStore.getState().settings;
    const cbtSettings = settings.cbtSettings;

    if (!cbtSettings) {
      return { 
        allowed: false, 
        reason: 'CBT settings not configured',
        restrictions: ['not_configured']
      };
    }

    // Assist level check
    if (cbtSettings.assistLevel === 'off') {
      return { 
        allowed: false, 
        reason: 'User has disabled assistance',
        restrictions: ['user_disabled']
      };
    }

    // Quiet hours check
    if (this.isQuietHours(cbtSettings)) {
      return { 
        allowed: false, 
        reason: 'Quiet hours active',
        restrictions: ['quiet_hours']
      };
    }

    // Topic exclusions check
    if (context.messageContent && this.hasExcludedTopics(context.messageContent, cbtSettings)) {
      return { 
        allowed: false, 
        reason: 'Excluded topic detected',
        restrictions: ['topic_exclusion']
      };
    }

    // Never intervene list check
    if (context.messageContent && this.hasNeverIntervenePhrase(context.messageContent, cbtSettings)) {
      return { 
        allowed: false, 
        reason: 'Never intervene phrase detected',
        restrictions: ['never_intervene']
      };
    }

    return { allowed: true };
  }

  /**
   * Privacy layer enforcement
   */
  getDataScopePermissions(userId?: string) {
    if (!this.isFeatureAllowed('assist')) {
      return { surface: false, context: false, deep: false };
    }

    const settings = useBubbleStore.getState().settings;
    const privacyLayer = settings.cbtSettings?.privacyLayer || 'context';

    return {
      surface: true,
      context: privacyLayer === 'context' || privacyLayer === 'deep',
      deep: privacyLayer === 'deep'
    };
  }

  /**
   * Auto-logging permission check
   */
  canAutoLog(): boolean {
    if (!this.isFeatureAllowed('assist')) return false;

    const settings = useBubbleStore.getState().settings;
    const autoLogMode = settings.cbtSettings?.autoLogMode || 'ask';

    return autoLogMode === 'on';
  }

  /**
   * Should prompt user before logging
   */
  shouldPromptBeforeLogging(): boolean {
    if (!this.isFeatureAllowed('assist')) return false;

    const settings = useBubbleStore.getState().settings;
    const autoLogMode = settings.cbtSettings?.autoLogMode || 'ask';

    return autoLogMode === 'ask';
  }

  /**
   * Telemetry guardrails - pseudonymous ID generation
   */
  generatePseudonymousId(userId: string): string {
    // Create stable but pseudonymous ID for telemetry
    // Never send actual user IDs in telemetry
    const hash = this.simpleHash(userId + 'cbt-salt');
    // FIXED WIDTH, deliberately. `simpleHash` returns a 32-bit value, whose
    // base-36 form is at most 7 characters -- so the previous
    // `.substring(0, 8)` could never yield 8 and produced a VARIABLE-width id
    // (6 chars observed). A telemetry pseudonym with variable width leaks a
    // coarse signal about the underlying hash and breaks its own documented
    // `cbt_[a-z0-9]{8}` contract. Pad first, then clamp, so the width holds
    // even if `simpleHash` is later widened.
    // NOTE: this changes emitted ids (`cbt_zik0zj` -> `cbt_00zik0zj`). Any
    // historical telemetry keyed on the old form will not join to the new one.
    return `cbt_${hash.toString(36).padStart(8, '0').slice(0, 8)}`;
  }

  /**
   * Privacy-safe data filtering for network requests
   */
  filterForNetworkTransmission(data: any): any {
    // Remove PII and sensitive data before any network calls
    const filtered = { ...data };
    
    // Remove direct identifiers
    delete filtered.userId;
    delete filtered.email;
    delete filtered.phone;
    delete filtered.location;
    
    // Sanitize message content
    if (filtered.messageContent) {
      filtered.messageContent = this.sanitizeMessage(filtered.messageContent);
    }

    return filtered;
  }

  /**
   * Crisis intervention gating (always allowed when enabled)
   */
  canProvideCrisisSupport(): boolean {
    return this.isFeatureAllowed('crisis');
  }

  // Private helper methods
  private isQuietHours(cbtSettings: any): boolean {
    if (!cbtSettings.quietHours?.enabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = cbtSettings.quietHours.start.split(':').map(Number);
    const [endHour, endMin] = cbtSettings.quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      // Same day quiet hours
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Overnight quiet hours
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  private hasExcludedTopics(message: string, cbtSettings: any): boolean {
    const lowerMessage = message.toLowerCase();
    return cbtSettings.topicExclusions?.some((topic: string) => 
      lowerMessage.includes(topic.toLowerCase())
    ) || false;
  }

  private hasNeverIntervenePhrase(message: string, cbtSettings: any): boolean {
    const lowerMessage = message.toLowerCase();
    return cbtSettings.neverInterveneOn?.some((phrase: string) => 
      lowerMessage.includes(phrase.toLowerCase())
    ) || false;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private sanitizeMessage(message: string): string {
    // Remove potential PII patterns from longest digit runs to shortest.
    // The seven-digit rule must remain last: otherwise it can consume the
    // tail of a 10-digit phone number or an SSN before the more specific rule
    // has a chance to classify the complete value.
    return message
      .replace(/\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email addresses
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]') // Credit card numbers
      .replace(/\b\d{3}-?\d{3}-?\d{4}\b/g, '[PHONE]') // Phone numbers (10-digit)
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]') // SSN patterns
      // Intentionally over-redacts bare seven-digit identifiers. This runs at
      // the network boundary, where a false positive is safer than leaking a
      // local phone number.
      .replace(/\b\d{3}-?\d{4}\b/g, '[PHONE]'); // Phone numbers (7-digit local)
  }
}

export const cbtGuardService = new CBTGuardService();
