/**
 * Enhanced AI Conversation Service with CBT Integration
 * Extends existing AI service with thought pattern awareness
 */

import { cbtAIIntegration } from './cbt/integration';
import type { CBTIntegrationResult } from './cbt/integration';

export interface EnhancedConversationRequest {
  message: string;
  userId: string;
  messageId: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  contextualInfo?: {
    recentMood?: string;
    currentActivity?: string;
    timeOfDay?: string;
  };
}

export interface EnhancedConversationResponse {
  aiResponse: string;
  cbtGuidance?: {
    shouldShow: boolean;
    action?: any;
    traceId?: string;
  };
  conversationMeta?: {
    tone: string;
    detectedPatterns: string[];
    supportLevel: 'low' | 'medium' | 'high' | 'crisis';
  };
}

class EnhancedAIConversationService {
  /**
   * Process conversation with CBT awareness
   */
  async processConversation(
    request: EnhancedConversationRequest
  ): Promise<EnhancedConversationResponse> {
    
    // Step 1: Analyze message for CBT patterns
    const conversationContext = this.buildConversationContext(request);
    
    const cbtAnalysis = await cbtAIIntegration.analyzeForConversation(
      request.message,
      request.messageId,
      request.userId,
      conversationContext
    );

    // Step 2: Enhance AI prompt with CBT guidance
    const enhancedPrompt = this.buildEnhancedPrompt(request, cbtAnalysis);

    // Step 3: Call AI service with enhanced prompt
    const aiResponse = await this.callAIService(enhancedPrompt, request);

    // Step 4: Process and return enhanced response
    return this.buildEnhancedResponse(aiResponse, cbtAnalysis, request);
  }

  /**
   * Build conversation context for CBT analysis
   */
  private buildConversationContext(request: EnhancedConversationRequest) {
    const history = request.conversationHistory || [];
    
    // Calculate average sentiment from recent messages
    const recentUserMessages = history
      .filter(msg => msg.role === 'user')
      .slice(-5); // Last 5 user messages
    
    // Simple sentiment estimation
    const averageSentiment = this.estimateAverageSentiment(recentUserMessages);

    return {
      messageCount: history.length,
      recentMood: request.contextualInfo?.recentMood,
      averageSentiment
    };
  }

  /**
   * Build enhanced AI prompt with CBT guidance
   */
  private buildEnhancedPrompt(
    request: EnhancedConversationRequest, 
    cbtAnalysis: CBTIntegrationResult
  ): string {
    let prompt = this.getBaseAIPrompt();

    // Add CBT guidance if available
    if (cbtAnalysis.enhancedPrompt) {
      prompt += `\n\nIMPORTANT CONTEXT: ${cbtAnalysis.enhancedPrompt}`;
    }

    // Add conversation guidance
    if (cbtAnalysis.conversationGuidance) {
      const guidance = cbtAnalysis.conversationGuidance;
      prompt += `\n\nCONVERSATION GUIDANCE:`;
      prompt += `\n- Tone: ${guidance.tone}`;
      
      if (guidance.focus.length > 0) {
        prompt += `\n- Focus on: ${guidance.focus.join(', ')}`;
      }
      
      if (guidance.avoidTopics.length > 0) {
        prompt += `\n- Avoid topics: ${guidance.avoidTopics.join(', ')}`;
      }
    }

    // Add user's message
    prompt += `\n\nUser message: "${request.message}"`;

    // Add context if available
    if (request.contextualInfo) {
      prompt += `\n\nContext: `;
      if (request.contextualInfo.recentMood) {
        prompt += `User's recent mood: ${request.contextualInfo.recentMood}. `;
      }
      if (request.contextualInfo.currentActivity) {
        prompt += `Current activity: ${request.contextualInfo.currentActivity}. `;
      }
      if (request.contextualInfo.timeOfDay) {
        prompt += `Time of day: ${request.contextualInfo.timeOfDay}. `;
      }
    }

    return prompt;
  }

  /**
   * Get base AI system prompt
   */
  private getBaseAIPrompt(): string {
    return `You are a helpful, empathetic AI assistant. You provide supportive, thoughtful responses that help users feel heard and understood. 

When responding:
- Be warm and genuine in your tone
- Validate the user's feelings and experiences  
- Offer practical help when appropriate
- Ask thoughtful follow-up questions
- Avoid being preachy or overly clinical
- Focus on the user's immediate needs and concerns

Respond naturally and conversationally. Do not mention CBT, therapy, or clinical concepts unless explicitly relevant to the conversation.`;
  }

  /**
   * Call the main AI service (placeholder - integrate with existing AI service)
   */
  private async callAIService(
    prompt: string, 
    request: EnhancedConversationRequest
  ): Promise<string> {
    // TODO: Integrate with existing AI conversation service
    // This would typically call the Supabase edge function or other AI provider
    
    // For now, return a placeholder that shows the enhanced prompt is working
    const mockResponses = [
      "I hear that you're going through a challenging time right now. That sounds really difficult. What would feel most helpful for you in this moment?",
      "It sounds like you're carrying a lot right now. Sometimes when we're overwhelmed, it can help to focus on just one small step forward. What feels most manageable for you today?",
      "I can sense the frustration in what you're sharing. Those feelings are completely understandable given what you're dealing with. Have you been able to find any moments of relief, even small ones?",
      "Thank you for sharing this with me. It takes courage to talk about difficult experiences. What kind of support would feel most meaningful to you right now?"
    ];
    
    return mockResponses[Math.floor(Math.random() * mockResponses.length)];
  }

  /**
   * Build enhanced response with CBT metadata
   */
  private buildEnhancedResponse(
    aiResponse: string,
    cbtAnalysis: CBTIntegrationResult,
    request: EnhancedConversationRequest
  ): EnhancedConversationResponse {
    
    // Determine support level
    let supportLevel: 'low' | 'medium' | 'high' | 'crisis' = 'low';
    
    if (cbtAnalysis.conversationGuidance?.tone === 'crisis') {
      supportLevel = 'crisis';
    } else if (cbtAnalysis.conversationGuidance?.tone === 'supportive') {
      supportLevel = 'high';
    } else if (cbtAnalysis.conversationGuidance?.tone === 'gentle') {
      supportLevel = 'medium';
    }

    return {
      aiResponse,
      cbtGuidance: cbtAnalysis.shouldShowCBTResponse ? {
        shouldShow: true,
        action: cbtAnalysis.cbtAction,
        traceId: cbtAnalysis.traceId
      } : undefined,
      conversationMeta: {
        tone: cbtAnalysis.conversationGuidance?.tone || 'neutral',
        detectedPatterns: cbtAnalysis.conversationGuidance?.focus || [],
        supportLevel
      }
    };
  }

  /**
   * Estimate average sentiment from message history (simple implementation)
   */
  private estimateAverageSentiment(messages: Array<{ content: string }>): number {
    if (messages.length === 0) return 0;

    const positiveWords = ['good', 'great', 'happy', 'joy', 'love', 'excellent', 'wonderful', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'sad', 'hate', 'awful', 'horrible', 'depressed', 'anxious', 'worried', 'stressed'];

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

  /**
   * Record engagement with AI conversation (for CBT learning)
   */
  async recordEngagement(
    traceId?: string,
    userResponse?: string,
    helpfulness?: number
  ): Promise<void> {
    if (traceId) {
      await cbtAIIntegration.recordConversationEngagement(
        traceId,
        userResponse || '',
        helpfulness
      );
    }
  }
}

export const enhancedAIConversation = new EnhancedAIConversationService();