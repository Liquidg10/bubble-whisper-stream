/**
 * Enhanced AI Service with Supabase Edge Function Integration
 * Replaces placeholder with real conversation service
 */

import { supabase } from '@/integrations/supabase/client';
import { enhancedAIConversation } from '@/ai/enhanced-conversation';

export interface EnhancedConversationRequest {
  messageText: string;
  messageId: string;
  userId: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  currentContext?: {
    currentBubbles?: Array<{ type: string; content: string; }>;
    recentActions?: string[];
    timeOfDay?: string;
    mood?: string;
  };
}

export interface EnhancedConversationResponse {
  reply: string;
  confidence: number;
  tone: 'supportive' | 'neutral' | 'encouraging';
  cbtGuidance?: {
    shouldShow: boolean;
    distortionTypes?: string[];
    reframingSuggestion?: string;
  };
  metadata: {
    tokensUsed: number;
    processingTime: number;
  };
}

class EnhancedAIService {
  async processConversation(request: EnhancedConversationRequest): Promise<EnhancedConversationResponse> {
    try {
      // First try Supabase edge function
      const { data, error } = await supabase.functions.invoke('ai-conversation', {
        body: {
          message: request.messageText,
          history: request.conversationHistory || [],
          context: request.currentContext || {},
          enhancedMode: true
        }
      });

      if (error) {
        console.warn('Supabase AI service error, falling back to local:', error);
        return this.fallbackToLocal(request);
      }

      return {
        reply: data.reply || 'I understand. How can I help you with that?',
        confidence: data.confidence || 0.7,
        tone: data.tone || 'supportive',
        cbtGuidance: data.cbtGuidance,
        metadata: {
          tokensUsed: data.tokensUsed || 0,
          processingTime: data.processingTime || 0
        }
      };
    } catch (error) {
      console.warn('Enhanced AI service error, using fallback:', error);
      return this.fallbackToLocal(request);
    }
  }

  private async fallbackToLocal(request: EnhancedConversationRequest): Promise<EnhancedConversationResponse> {
    // Use local enhanced conversation service as fallback
    const localRequest = {
      message: request.messageText,
      userId: request.userId,
      messageId: request.messageId,
      conversationHistory: request.conversationHistory,
      contextualInfo: request.currentContext
    };
    
    const result = await enhancedAIConversation.processConversation(localRequest);
    
    return {
      reply: result.aiResponse,
      confidence: 0.6,
      tone: (result.conversationMeta?.tone === 'neutral' || result.conversationMeta?.tone === 'encouraging') 
        ? result.conversationMeta.tone as 'supportive' | 'neutral' | 'encouraging'
        : 'supportive',
      cbtGuidance: result.cbtGuidance,
      metadata: {
        tokensUsed: 0, // Local processing
        processingTime: 100
      }
    };
  }

  async summarizeConversation(messages: Array<{ role: string; content: string; }>): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke('ai-conversation', {
        body: {
          action: 'summarize',
          messages
        }
      });

      if (error) throw error;
      return data.summary || 'Conversation summary not available.';
    } catch (error) {
      console.warn('Summary service error:', error);
      return 'Unable to generate summary at this time.';
    }
  }
}

export const enhancedAIService = new EnhancedAIService();