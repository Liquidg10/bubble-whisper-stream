/**
 * Conversation Joy Mining Service
 * Analyzes conversation history for joyful moments and sentiment
 */

import { conversationService, ConversationMessage } from './conversationService';

export interface JoyfulConversation {
  id: string;
  threadId: string;
  userMessage: string;
  aiResponse: string;
  joyScore: number;
  joyIndicators: string[];
  timestamp: string;
  summary?: string;
  context?: any;
}

export interface ConversationJoyMetrics {
  totalConversations: number;
  joyfulConversations: number;
  averageJoyScore: number;
  topJoyIndicators: { indicator: string; count: number }[];
  weeklyTrend: { week: string; joyScore: number }[];
}

class ConversationJoyService {
  private joyKeywords = [
    'laugh', 'happy', 'joy', 'excited', 'smile', 'love', 'great', 'amazing',
    'wonderful', 'awesome', 'fantastic', 'delighted', 'thrilled', 'cheerful',
    'grateful', 'blessed', 'proud', 'accomplished', 'celebrated', 'success'
  ];

  private positiveEmotions = [
    'haha', 'hehe', 'lol', '😊', '😄', '😍', '🎉', '❤️', '💕', '🥳',
    '!', 'yay', 'woohoo', 'fantastic', 'brilliant', 'perfect'
  ];

  async analyzeConversationForJoy(message: ConversationMessage): Promise<JoyfulConversation | null> {
    const combinedText = `${message.user_message} ${message.ai_response}`.toLowerCase();
    
    // Calculate joy score based on keyword presence and intensity
    let joyScore = 0;
    const foundIndicators: string[] = [];

    // Check for joy keywords
    this.joyKeywords.forEach(keyword => {
      const matches = (combinedText.match(new RegExp(keyword, 'g')) || []).length;
      if (matches > 0) {
        joyScore += matches * 0.2;
        foundIndicators.push(keyword);
      }
    });

    // Check for positive emotions and expressions
    this.positiveEmotions.forEach(emotion => {
      const matches = (combinedText.match(new RegExp(emotion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (matches > 0) {
        joyScore += matches * 0.3;
        foundIndicators.push(emotion);
      }
    });

    // Check for exclamation marks (enthusiasm)
    const exclamationCount = (combinedText.match(/!/g) || []).length;
    if (exclamationCount > 0) {
      joyScore += Math.min(exclamationCount * 0.1, 0.5); // Cap the bonus
    }

    // Check for length (longer messages might indicate engagement)
    if (message.user_message.length > 100) {
      joyScore += 0.1;
    }

    // Normalize score to 0-1 range
    joyScore = Math.min(joyScore, 1.0);

    // Only consider it joyful if score is above threshold
    if (joyScore >= 0.3) {
      return {
        id: message.id,
        threadId: message.conversation_thread_id,
        userMessage: message.user_message,
        aiResponse: message.ai_response,
        joyScore,
        joyIndicators: [...new Set(foundIndicators)], // Remove duplicates
        timestamp: message.created_at,
        summary: message.summary,
        context: message.context
      };
    }

    return null;
  }

  async getJoyfulConversations(limit: number = 50): Promise<JoyfulConversation[]> {
    try {
      // Get recent conversation threads - handle unauthenticated gracefully
      const activeThread = await conversationService.getOrCreateActiveThread();
      if (!activeThread) {
        return []; // Return empty array if not authenticated
      }
      
      const conversations = await conversationService.getConversationHistory(activeThread.id, 200);
      
      const joyfulConversations: JoyfulConversation[] = [];

      for (const conversation of conversations) {
        const joyfulConvo = await this.analyzeConversationForJoy(conversation);
        if (joyfulConvo) {
          joyfulConversations.push(joyfulConvo);
        }
      }

      // Sort by joy score and timestamp
      return joyfulConversations
        .sort((a, b) => {
          const scoreDiff = b.joyScore - a.joyScore;
          if (Math.abs(scoreDiff) < 0.1) {
            // If scores are similar, sort by recency
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          }
          return scoreDiff;
        })
        .slice(0, limit);
    } catch (error) {
      console.warn('Failed to get joyful conversations:', error);
      return [];
    }
  }

  async getConversationJoyMetrics(): Promise<ConversationJoyMetrics> {
    try {
      const joyfulConversations = await this.getJoyfulConversations(200);
      
      if (joyfulConversations.length === 0) {
        return {
          totalConversations: 0,
          joyfulConversations: 0,
          averageJoyScore: 0,
          topJoyIndicators: [],
          weeklyTrend: []
        };
      }

      // Calculate metrics
      const totalJoyScore = joyfulConversations.reduce((sum, conv) => sum + conv.joyScore, 0);
      const averageJoyScore = totalJoyScore / joyfulConversations.length;

      // Count joy indicators
      const indicatorCounts: Record<string, number> = {};
      joyfulConversations.forEach(conv => {
        conv.joyIndicators.forEach(indicator => {
          indicatorCounts[indicator] = (indicatorCounts[indicator] || 0) + 1;
        });
      });

      const topJoyIndicators = Object.entries(indicatorCounts)
        .map(([indicator, count]) => ({ indicator, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Calculate weekly trend (last 4 weeks)
      const weeklyTrend = this.calculateWeeklyTrend(joyfulConversations);

      return {
        totalConversations: joyfulConversations.length,
        joyfulConversations: joyfulConversations.length,
        averageJoyScore,
        topJoyIndicators,
        weeklyTrend
      };
    } catch (error) {
      console.warn('Failed to calculate joy metrics:', error);
      return {
        totalConversations: 0,
        joyfulConversations: 0,
        averageJoyScore: 0,
        topJoyIndicators: [],
        weeklyTrend: []
      };
    }
  }

  private calculateWeeklyTrend(conversations: JoyfulConversation[]): { week: string; joyScore: number }[] {
    const now = new Date();
    const weeks: { week: string; joyScore: number }[] = [];

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const weekConversations = conversations.filter(conv => {
        const convDate = new Date(conv.timestamp);
        return convDate >= weekStart && convDate < weekEnd;
      });

      const averageJoyScore = weekConversations.length > 0
        ? weekConversations.reduce((sum, conv) => sum + conv.joyScore, 0) / weekConversations.length
        : 0;

      weeks.push({
        week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        joyScore: Number(averageJoyScore.toFixed(2))
      });
    }

    return weeks;
  }

  async searchJoyfulConversations(query: string): Promise<JoyfulConversation[]> {
    const allJoyful = await this.getJoyfulConversations(100);
    const searchTerm = query.toLowerCase();

    return allJoyful.filter(conv => 
      conv.userMessage.toLowerCase().includes(searchTerm) ||
      conv.aiResponse.toLowerCase().includes(searchTerm) ||
      conv.joyIndicators.some(indicator => indicator.includes(searchTerm))
    );
  }
}

export const conversationJoyService = new ConversationJoyService();