/**
 * CBT Conversation Pipeline Integration Service
 * PROMPT 7: Wires CBT analysis into main conversation flow with proper gating
 */

import { isFeatureEnabled } from '@/config/flags';
import { processCBTMessage } from '@/ai/cbt/index';
import { cbtGuardService } from '@/services/cbtGuardService';
import { useBubbleStore } from '@/stores/bubbleStore';
import type { CBTAction } from '@/ai/cbt/types';

export interface CBTConversationResult {
  shouldShowCBT: boolean;
  cbtAction?: CBTAction;
  traceId?: string;
  devMetrics?: {
    annotationFound: boolean;
    decisionMade: boolean;
    interventionAllowed: boolean;
    abBucket?: string;
    reason: string;
  };
}

export interface ConversationAnalysisContext {
  messageText: string;
  messageId: string;
  userId: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
  }>;
  currentContext?: any;
}

class CBTConversationIntegrationService {
  private messageProcessingCache = new Map<string, Promise<CBTConversationResult>>();

  /**
   * PROMPT 7: Main message interception point
   * Processes message through CBT pipeline with proper gating
   */
  async analyzeMessage(context: ConversationAnalysisContext): Promise<CBTConversationResult> {
    const { messageText, messageId, userId } = context;
    
    // Ensure idempotent behavior - don't process same message twice
    const cacheKey = `${messageId}-${userId}`;
    if (this.messageProcessingCache.has(cacheKey)) {
      return this.messageProcessingCache.get(cacheKey)!;
    }

    const analysisPromise = this.performCBTAnalysis(context);
    this.messageProcessingCache.set(cacheKey, analysisPromise);
    
    // Clean up cache after analysis
    analysisPromise.finally(() => {
      setTimeout(() => this.messageProcessingCache.delete(cacheKey), 5000);
    });

    return analysisPromise;
  }

  private async performCBTAnalysis(context: ConversationAnalysisContext): Promise<CBTConversationResult> {
    const { messageText, messageId, userId, conversationHistory = [], currentContext } = context;
    
    // PROMPT 7: Check flags and kill switches first
    const cbtAssistEnabled = isFeatureEnabled('cbtAssist');
    const cbtSilentObserve = isFeatureEnabled('cbtSilentObserve');
    
    // Get user settings
    const bubbleStore = useBubbleStore.getState();
    const userSettings = bubbleStore.settings.cbtSettings;
    const assistLevel = userSettings?.cbtAssistEnabled ? (userSettings.assistLevel || 'standard') : 'off';

    // Dev metrics for logging
    const devMetrics = {
      annotationFound: false,
      decisionMade: false,
      interventionAllowed: false,
      abBucket: this.getABBucket(userId),
      reason: 'not_processed'
    };

    // PROMPT 7: If flags.cbtSilentObserve = true & assist Off => run annotate+decide but do not render
    const shouldRunAnalysis = cbtSilentObserve || cbtAssistEnabled;
    
    if (!shouldRunAnalysis) {
      devMetrics.reason = 'feature_disabled';
      return this.createResult(false, undefined, undefined, devMetrics);
    }

    // Check guard permissions
    const guardResult = cbtGuardService.canIntervene({
      userId,
      messageContent: messageText,
      conversationContext: { messageCount: conversationHistory.length },
      timestamp: Date.now()
    });

    if (!guardResult.allowed) {
      devMetrics.reason = `guard_blocked: ${guardResult.reason}`;
      if (this.shouldLogDevMetrics()) {
        console.log('[CBT] Guard blocked intervention:', guardResult);
      }
      return this.createResult(false, undefined, undefined, devMetrics);
    }

    try {
      // Build conversation context for CBT processing
      const conversationContextForCBT = this.buildConversationContext(conversationHistory, currentContext);
      
      // Build user settings context for CBT
      const userSettingsContext = {
        assistLevel: assistLevel as 'off' | 'subtle' | 'standard',
        privacyLayer: userSettings?.privacyLayer || 'context' as 'surface' | 'context' | 'deep',
        autoLogMode: userSettings?.autoLogMode || 'ask' as 'off' | 'ask' | 'on',
        quietHours: userSettings?.quietHours || { enabled: false, start: '22:00', end: '07:00' },
        topicExclusions: userSettings?.topicExclusions || [],
        neverInterveneOn: userSettings?.neverInterveneOn || []
      };
      
      // PROMPT 7: Run CBT pipeline - annotate → decide → render
      const cbtResult = await processCBTMessage(
        messageText,
        messageId,
        userId,
        {
          userSettings: userSettingsContext,
          conversationContext: conversationContextForCBT,
          recentMood: conversationContextForCBT.recentMood,
          conversationId: `conv_${Date.now()}`,
          privacyLayer: userSettingsContext.privacyLayer
        }
      );

      devMetrics.annotationFound = !!cbtResult.annotation;
      devMetrics.decisionMade = !!cbtResult.decision;
      devMetrics.interventionAllowed = !!cbtResult.action;

      // Normal flow - show CBT UI if action available and flags allow
      if (cbtResult.action && cbtAssistEnabled && assistLevel !== 'off') {
        devMetrics.reason = 'intervention_shown';
        devMetrics.interventionAllowed = true;
        
        if (this.shouldLogDevMetrics()) {
          console.log('[CBT] Intervention shown:', {
            actionType: cbtResult.action.type,
            distortions: cbtResult.annotation?.distortions?.map(d => d.type) || [],
            decision: cbtResult.decision?.reason,
            abBucket: devMetrics.abBucket
          });
        }
        
        return this.createResult(true, cbtResult.action, cbtResult.traceId, devMetrics);
      }

      // No intervention needed
      devMetrics.reason = cbtResult.decision?.reason || 'no_intervention_needed';
      if (this.shouldLogDevMetrics()) {
        console.log('[CBT] No intervention needed:', devMetrics.reason);
      }
      
      return this.createResult(false, undefined, cbtResult.traceId, devMetrics);

    } catch (error) {
      console.error('[CBT] Analysis error:', error);
      devMetrics.reason = `error: ${error.message}`;
      return this.createResult(false, undefined, undefined, devMetrics);
    }
  }

  private buildConversationContext(conversationHistory: any[], currentContext: any) {
    // Calculate basic conversation metrics
    const userMessages = conversationHistory.filter(msg => msg.role === 'user');
    const recentMood = this.extractRecentMood(userMessages.slice(-3));
    const averageSentiment = this.calculateAverageSentiment(userMessages.slice(-5));

    return {
      messageCount: conversationHistory.length,
      recentMood,
      averageSentiment,
      recentTopics: this.extractRecentTopics(userMessages.slice(-3)),
      timeSpan: conversationHistory.length > 0 ? 
        Date.now() - new Date(conversationHistory[0].timestamp || 0).getTime() : 0
    };
  }

  private extractRecentTopics(recentMessages: any[]): string[] {
    // Simple topic extraction from recent messages
    const topics: string[] = [];
    const topicKeywords = [
      'work', 'family', 'relationships', 'health', 'money', 'school', 
      'stress', 'anxiety', 'depression', 'future', 'past', 'goals'
    ];

    recentMessages.forEach(msg => {
      const content = msg.content.toLowerCase();
      topicKeywords.forEach(keyword => {
        if (content.includes(keyword) && !topics.includes(keyword)) {
          topics.push(keyword);
        }
      });
    });

    return topics;
  }

  private extractRecentMood(recentMessages: any[]): string | undefined {
    // Simple mood extraction from recent messages
    const moodKeywords = {
      positive: ['good', 'great', 'happy', 'excited', 'confident', 'energetic'],
      negative: ['bad', 'sad', 'tired', 'stressed', 'anxious', 'overwhelmed'],
      neutral: ['okay', 'fine', 'alright', 'normal']
    };

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    recentMessages.forEach(msg => {
      const content = msg.content.toLowerCase();
      moodKeywords.positive.forEach(word => {
        if (content.includes(word)) positiveCount++;
      });
      moodKeywords.negative.forEach(word => {
        if (content.includes(word)) negativeCount++;
      });
      moodKeywords.neutral.forEach(word => {
        if (content.includes(word)) neutralCount++;
      });
    });

    if (positiveCount > negativeCount && positiveCount > neutralCount) return 'positive';
    if (negativeCount > positiveCount && negativeCount > neutralCount) return 'negative';
    if (neutralCount > 0) return 'neutral';
    
    return undefined;
  }

  private calculateAverageSentiment(messages: any[]): number {
    if (messages.length === 0) return 0;

    const positiveWords = ['good', 'great', 'happy', 'love', 'excellent', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'sad', 'hate', 'awful', 'horrible'];

    let totalSentiment = 0;
    
    messages.forEach(msg => {
      const words = msg.content.toLowerCase().split(/\s+/);
      const positiveCount = words.filter(word => positiveWords.includes(word)).length;
      const negativeCount = words.filter(word => negativeWords.includes(word)).length;
      const messageSentiment = (positiveCount - negativeCount) / Math.max(words.length / 10, 1);
      totalSentiment += messageSentiment;
    });

    return Math.max(-1, Math.min(1, totalSentiment / messages.length));
  }

  private getABBucket(userId: string): string {
    // Simple A/B bucketing based on user ID hash
    const hash = this.simpleHash(userId);
    return hash % 2 === 0 ? 'A' : 'B';
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private shouldLogDevMetrics(): boolean {
    return isFeatureEnabled('cbtDevRoutes');
  }

  private createResult(
    shouldShow: boolean, 
    action?: CBTAction, 
    traceId?: string, 
    devMetrics?: any
  ): CBTConversationResult {
    const result: CBTConversationResult = {
      shouldShowCBT: shouldShow,
      cbtAction: action,
      traceId
    };

    if (this.shouldLogDevMetrics()) {
      result.devMetrics = devMetrics;
    }

    return result;
  }

  /**
   * Record engagement with CBT action from conversation
   */
  async recordCBTEngagement(
    traceId: string,
    engaged: boolean,
    userResponse?: string,
    helpfulness?: number
  ): Promise<void> {
    try {
      const { recordCBTEngagement } = await import('@/ai/cbt/index');
      await recordCBTEngagement(traceId, engaged, helpfulness, userResponse);
      
      if (this.shouldLogDevMetrics()) {
        console.log('[CBT] Engagement recorded:', { traceId, engaged, helpfulness });
      }
    } catch (error) {
      console.error('[CBT] Failed to record engagement:', error);
    }
  }

  /**
   * Check if CBT features are available for current user
   */
  isAvailable(): boolean {
    return isFeatureEnabled('cbtSilentObserve') || isFeatureEnabled('cbtAssist');
  }

  /**
   * Get current CBT configuration for debugging
   */
  getDebugInfo() {
    return {
      flags: {
        cbtAssist: isFeatureEnabled('cbtAssist'),
        cbtSilentObserve: isFeatureEnabled('cbtSilentObserve'),
        cbtCrisisEnabled: isFeatureEnabled('cbtCrisisEnabled'),
        cbtDevRoutes: isFeatureEnabled('cbtDevRoutes')
      },
      guardService: cbtGuardService.getDataScopePermissions(),
      cacheSize: this.messageProcessingCache.size
    };
  }
}

export const cbtConversationIntegration = new CBTConversationIntegrationService();