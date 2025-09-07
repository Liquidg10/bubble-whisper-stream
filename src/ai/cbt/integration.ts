/**
 * CBT AI Integration Service - Bridges CBT analysis with main AI conversation
 */

import { processCBTMessage, recordCBTEngagement } from '@/ai/cbt';
import { cbtGuardService } from '@/services/cbtGuardService';
import { useBubbleStore } from '@/stores/bubbleStore';
import { isFeatureEnabled } from '@/config/flags';
import type { CBTAction } from '@/ai/cbt/types';

export interface CBTIntegrationResult {
  shouldShowCBTResponse: boolean;
  cbtAction?: CBTAction;
  traceId?: string;
  enhancedPrompt?: string; // AI prompt enhancement
  conversationGuidance?: {
    tone: 'gentle' | 'supportive' | 'crisis';
    focus: string[];
    avoidTopics: string[];
  };
}

class CBTAIIntegrationService {
  /**
   * Analyze message for CBT patterns and determine AI conversation enhancement
   */
  async analyzeForConversation(
    message: string,
    messageId: string,
    userId: string,
    conversationContext?: {
      messageCount: number;
      recentMood?: string;
      averageSentiment: number;
    }
  ): Promise<CBTIntegrationResult> {
    
    // Quick exit if CBT is disabled
    if (!this.isCBTEnabled()) {
      return { shouldShowCBTResponse: false };
    }

    // Check intervention permissions
    const guardResult = cbtGuardService.canIntervene({
      userId,
      messageContent: message,
      timestamp: Date.now()
    });

    if (!guardResult.allowed) {
      return { 
        shouldShowCBTResponse: false,
        enhancedPrompt: this.createSilentAIGuidance(message, guardResult.reason)
      };
    }

    try {
      // Get user settings from store
      const settings = useBubbleStore.getState().settings;
      const userSettings = {
        assistLevel: settings.cbtSettings?.assistLevel || 'subtle' as const,
        privacyLayer: settings.cbtSettings?.privacyLayer || 'context' as const,
        autoLogMode: settings.cbtSettings?.autoLogMode || 'ask' as const,
        quietHours: settings.cbtSettings?.quietHours || { enabled: false, start: '22:00', end: '07:00' },
        topicExclusions: settings.cbtSettings?.topicExclusions || [],
        neverInterveneOn: settings.cbtSettings?.neverInterveneOn || []
      };

      // Process message through CBT pipeline
      const cbtResult = await processCBTMessage(message, messageId, userId, {
        userSettings,
        conversationContext: {
          messageCount: conversationContext?.messageCount || 0,
          averageSentiment: conversationContext?.averageSentiment || 0,
          recentTopics: [], // Will be enhanced later
          timeSpan: 30 // Default 30 minutes
        },
        recentMood: conversationContext?.recentMood
      });

      // Determine response strategy
      if (cbtResult.decision.shouldIntervene) {
        return this.createInterventionResponse(cbtResult, message);
      } else {
        return this.createSilentGuidanceResponse(cbtResult, message);
      }

    } catch (error) {
      console.error('CBT analysis failed:', error);
      return { shouldShowCBTResponse: false };
    }
  }

  /**
   * Create intervention response with explicit CBT action
   */
  private createInterventionResponse(cbtResult: any, originalMessage: string): CBTIntegrationResult {
    const { decision, action, annotation, traceId } = cbtResult;

    // Crisis interventions always show
    if (decision.priority === 'crisis') {
      return {
        shouldShowCBTResponse: true,
        cbtAction: action,
        traceId,
        conversationGuidance: {
          tone: 'crisis',
          focus: ['immediate_support', 'safety', 'resources'],
          avoidTopics: ['productivity', 'goals', 'future_planning']
        }
      };
    }

    // Regular interventions based on assist level
    const settings = useBubbleStore.getState().settings.cbtSettings;
    
    if (settings?.assistLevel === 'standard' || decision.interventionType === 'direct') {
      return {
        shouldShowCBTResponse: true,
        cbtAction: action,
        traceId,
        enhancedPrompt: this.createAIGuidancePrompt(annotation, decision, originalMessage),
        conversationGuidance: {
          tone: 'supportive',
          focus: this.getDistortionFocusAreas(decision.targetDistortions),
          avoidTopics: ['overwhelm', 'pressure']
        }
      };
    }

    // Subtle mode - enhance AI response only
    return {
      shouldShowCBTResponse: false,
      enhancedPrompt: this.createSubtleAIGuidance(annotation, decision, originalMessage),
      conversationGuidance: {
        tone: 'gentle',
        focus: ['perspective', 'support'],
        avoidTopics: []
      }
    };
  }

  /**
   * Create silent guidance for AI without explicit CBT intervention
   */
  private createSilentGuidanceResponse(cbtResult: any, originalMessage: string): CBTIntegrationResult {
    const { annotation } = cbtResult;

    // Even without intervention, we can guide the AI subtly
    if (annotation.distortions.length > 0 || annotation.sentiment.score < -0.5) {
      return {
        shouldShowCBTResponse: false,
        enhancedPrompt: this.createEmpatheticAIGuidance(annotation, originalMessage)
      };
    }

    return { shouldShowCBTResponse: false };
  }

  /**
   * Create AI prompt enhancement based on CBT analysis
   */
  private createAIGuidancePrompt(annotation: any, decision: any, originalMessage: string): string {
    const distortionTypes = decision.targetDistortions;
    const sentiment = annotation.sentiment;
    const crisisFlags = annotation.crisisFlags;

    let guidance = `The user's message shows signs of cognitive patterns that could benefit from gentle, supportive response. `;

    if (crisisFlags.length > 0) {
      guidance += `IMPORTANT: The user may be in crisis. Respond with immediate empathy and support. `;
    }

    if (distortionTypes.includes('all_or_nothing')) {
      guidance += `The user is thinking in absolute terms. Gently introduce nuance and middle ground. `;
    }

    if (distortionTypes.includes('catastrophizing')) {
      guidance += `The user is focusing on worst-case scenarios. Help ground them in realistic outcomes. `;
    }

    if (distortionTypes.includes('overgeneralization')) {
      guidance += `The user is making broad generalizations. Help them see specific situations individually. `;
    }

    if (sentiment.score < -0.7) {
      guidance += `The user seems to be experiencing significant negative emotions. Provide extra emotional support. `;
    }

    guidance += `Respond naturally and conversationally - don't mention CBT or therapy explicitly.`;

    return guidance;
  }

  /**
   * Create subtle AI guidance for when CBT intervention is blocked
   */
  private createSilentAIGuidance(message: string, blockReason: string): string {
    return `The user may be dealing with difficult thoughts. Respond with extra empathy and support, but avoid being clinical. Keep the conversation natural and supportive.`;
  }

  /**
   * Create empathetic AI guidance for negative sentiment
   */
  private createEmpatheticAIGuidance(annotation: any, originalMessage: string): string {
    if (annotation.sentiment.score < -0.5) {
      return `The user seems to be going through a difficult time. Respond with warmth, validation, and gentle support. Avoid being overly upbeat or dismissive of their feelings.`;
    }

    return '';
  }

  /**
   * Create subtle guidance for AI in subtle assist mode
   */
  private createSubtleAIGuidance(annotation: any, decision: any, originalMessage: string): string {
    const distortions = decision.targetDistortions;
    
    if (distortions.length === 0) return '';

    return `Respond supportively and naturally. If appropriate, gently offer alternative perspectives without being preachy. Focus on being understanding and helpful.`;
  }

  /**
   * Get focus areas based on detected distortions
   */
  private getDistortionFocusAreas(distortions: string[]): string[] {
    const focusMap: Record<string, string[]> = {
      'all_or_nothing': ['nuance', 'middle_ground', 'progress'],
      'catastrophizing': ['realistic_outcomes', 'coping_strategies', 'present_moment'],
      'overgeneralization': ['specific_situations', 'exceptions', 'context'],
      'should_statements': ['self_compassion', 'flexibility', 'preferences'],
      'mind_reading': ['communication', 'evidence', 'assumptions']
    };

    const focus = new Set<string>();
    distortions.forEach(distortion => {
      focusMap[distortion]?.forEach(area => focus.add(area));
    });

    return Array.from(focus);
  }

  /**
   * Record user engagement with CBT-enhanced conversation
   */
  async recordConversationEngagement(
    traceId: string,
    userResponse: string,
    helpfulness?: number
  ): Promise<void> {
    if (!traceId) return;

    try {
      await recordCBTEngagement(
        traceId,
        true, // User engaged with the conversation
        helpfulness,
        userResponse
      );
    } catch (error) {
      console.error('Failed to record CBT engagement:', error);
    }
  }

  /**
   * Check if CBT features are enabled
   */
  private isCBTEnabled(): boolean {
    return isFeatureEnabled('cbtAssist') && cbtGuardService.isFeatureAllowed('assist');
  }
}

export const cbtAIIntegration = new CBTAIIntegrationService();