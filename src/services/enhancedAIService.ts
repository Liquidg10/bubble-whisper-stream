/**
 * Enhanced AI Service with Supabase Edge Function Integration
 * Replaces placeholder with real conversation service
 */

import { supabase } from '@/integrations/supabase/client';
import { enhancedAIConversation } from '@/ai/enhanced-conversation';
import { castSynthesizer } from './castSynthesizer';
import { contextualBandits } from './contextualBandits';

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
    [key: string]: any;
  };
}

class EnhancedAIService {
  async processConversation(request: EnhancedConversationRequest): Promise<EnhancedConversationResponse> {
    try {
      // Cast Synthesizer Integration - unified voice with multi-expert perspectives
      const castInput = {
        userId: request.userId,
        messageText: request.messageText,
        currentContext: {
          timeOfDay: this.getTimeOfDay(),
          energyLevel: this.inferEnergyLevel(request),
          recentActions: request.currentContext?.recentActions || [],
          mood: request.currentContext?.mood
        },
        userPersona: this.inferUserPersona(request)
      };

      const castResponse = await castSynthesizer.synthesizeResponse(castInput);

      // Try Supabase edge function with Cast context
      const { data, error } = await supabase.functions.invoke('ai-conversation', {
        body: {
          message: request.messageText,
          history: request.conversationHistory || [],
          context: {
            ...request.currentContext,
            castGuidance: castResponse.metadata,
            becauseText: castResponse.becauseText
          },
          enhancedMode: true
        }
      });

      if (error) {
        console.warn('Supabase AI service error, using Cast fallback:', error);
        return this.fallbackToCast(request, castResponse);
      }

      // Merge Supabase response with Cast enhancements
      return {
        reply: data.reply || castResponse.message,
        confidence: Math.max(data.confidence || 0.7, castResponse.confidence),
        tone: castResponse.tone,
        cbtGuidance: data.cbtGuidance || (castResponse.metadata.castMembersActive.includes('Clinical Psych') ? {
          shouldShow: true,
          distortionTypes: [],
          reframingSuggestion: castResponse.message
        } : undefined),
        metadata: {
          tokensUsed: data.tokensUsed || 0,
          processingTime: data.processingTime || 0,
          castSynthesis: castResponse.metadata,
          breathPrompt: castResponse.breathPrompt,
          microCelebration: castResponse.microCelebration,
          implementationIntention: castResponse.implementationIntention,
          becauseText: castResponse.becauseText
        }
      };
    } catch (error) {
      console.warn('Enhanced AI service error, using Cast fallback:', error);
      return this.fallbackToLocal(request);
    }
  }

  private async fallbackToCast(request: EnhancedConversationRequest, castResponse: any): Promise<EnhancedConversationResponse> {
    // Pure Cast Synthesizer fallback
    return {
      reply: castResponse.message,
      confidence: castResponse.confidence,
      tone: castResponse.tone,
      cbtGuidance: castResponse.metadata.castMembersActive.includes('Clinical Psych') ? {
        shouldShow: true,
        distortionTypes: [],
        reframingSuggestion: castResponse.message
      } : undefined,
      metadata: {
        tokensUsed: 0,
        processingTime: 50,
        castSynthesis: castResponse.metadata,
        breathPrompt: castResponse.breathPrompt,
        microCelebration: castResponse.microCelebration,
        implementationIntention: castResponse.implementationIntention,
        becauseText: castResponse.becauseText,
        fallbackMode: 'cast-only'
      }
    };
  }

  private async fallbackToLocal(request: EnhancedConversationRequest): Promise<EnhancedConversationResponse> {
    // Use local enhanced conversation service as final fallback
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
        processingTime: 100,
        fallbackMode: 'local-only'
      }
    };
  }

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  private inferEnergyLevel(request: EnhancedConversationRequest): 'low' | 'medium' | 'high' {
    const message = request.messageText.toLowerCase();
    if (message.includes('tired') || message.includes('exhausted') || message.includes('drained')) {
      return 'low';
    }
    if (message.includes('energized') || message.includes('ready') || message.includes('motivated')) {
      return 'high';
    }
    return 'medium';
  }

  private inferUserPersona(request: EnhancedConversationRequest): 'executive' | 'parent' | 'builder' | 'mixed' {
    const message = request.messageText.toLowerCase();
    const context = request.currentContext;
    
    // Executive patterns: time-focused, meeting references, efficiency
    if (message.includes('meeting') || message.includes('calendar') || message.includes('deadline')) {
      return 'executive';
    }
    
    // Parent patterns: family, schedule coordination, multi-tasking
    if (message.includes('kids') || message.includes('family') || message.includes('school')) {
      return 'parent';
    }
    
    // Builder patterns: creating, building, momentum, chaos-to-order
    if (message.includes('build') || message.includes('create') || message.includes('start')) {
      return 'builder';
    }
    
    return 'mixed';
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