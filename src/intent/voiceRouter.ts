/**
 * Enhanced voice intent router with confidence scoring and clarification
 * Routes voice commands to appropriate bubble types with horizon setting
 */

import { Bubble, BubbleType } from '@/types/bubble';
import { setHorizon } from '@/lib/horizon';

export interface IntentResult {
  type: BubbleType;
  tags: string[];
  horizon?: 'today' | 'week' | 'later';
  confidence: number;
  clarification?: string;
  needsClarification: boolean;
}

export interface VoiceRouterOptions {
  context?: {
    timeOfDay?: string;
    recentBubbles?: Bubble[];
    userPreferences?: Record<string, any>;
  };
  confidenceThreshold?: number;
}

class VoiceRouter {
  private confidenceThreshold = 0.6;
  
  // Intent patterns with confidence weights
  private patterns = {
    reminder: {
      triggers: [
        { pattern: /remind\s+me/i, weight: 0.9 },
        { pattern: /reminder/i, weight: 0.85 },
        { pattern: /don'?t\s+forget/i, weight: 0.8 },
        { pattern: /set\s+a\s+reminder/i, weight: 0.95 },
        { pattern: /at\s+\d+/i, weight: 0.7 }, // "at 3pm"
        { pattern: /(tomorrow|next\s+week|later)/i, weight: 0.6 }
      ],
      horizonKeywords: {
        today: ['today', 'this afternoon', 'tonight', 'later today'],
        week: ['tomorrow', 'next week', 'this week', 'weekend'],
        later: ['next month', 'someday', 'eventually', 'future']
      }
    },
    
    shopping: {
      triggers: [
        { pattern: /\b(buy|purchase|get)\b/i, weight: 0.85 },
        { pattern: /need\s+to\s+(buy|get|pick\s+up)/i, weight: 0.9 },
        { pattern: /(grocery|shopping|store)/i, weight: 0.8 },
        { pattern: /add\s+to\s+(shopping|grocery)\s+list/i, weight: 0.95 }
      ]
    },
    
    idea: {
      triggers: [
        { pattern: /\bidea\b/i, weight: 0.9 },
        { pattern: /what\s+if/i, weight: 0.8 },
        { pattern: /i'?m\s+thinking/i, weight: 0.7 },
        { pattern: /(concept|brainstorm)/i, weight: 0.85 },
        { pattern: /maybe\s+we\s+could/i, weight: 0.75 }
      ]
    },
    
    note: {
      triggers: [
        { pattern: /(take\s+)?(a\s+)?note/i, weight: 0.9 },
        { pattern: /write\s+down/i, weight: 0.85 },
        { pattern: /remember\s+this/i, weight: 0.8 },
        { pattern: /jot\s+down/i, weight: 0.85 },
        { pattern: /make\s+a\s+note/i, weight: 0.9 }
      ]
    },
    
    task: {
      triggers: [
        { pattern: /\btask\b/i, weight: 0.8 },
        { pattern: /(todo|to\s+do)/i, weight: 0.85 },
        { pattern: /need\s+to\s+do/i, weight: 0.8 },
        { pattern: /have\s+to/i, weight: 0.6 },
        { pattern: /should\s+do/i, weight: 0.65 }
      ]
    },
    
    memory: {
      triggers: [
        { pattern: /(happy|joy|excited|love)/i, weight: 0.75 },
        { pattern: /(amazing|wonderful|fantastic)/i, weight: 0.8 },
        { pattern: /had\s+a\s+great/i, weight: 0.85 },
        { pattern: /feeling\s+(good|great|happy)/i, weight: 0.8 }
      ]
    }
  };

  route(text: string, options: VoiceRouterOptions = {}): IntentResult {
    const { context, confidenceThreshold = this.confidenceThreshold } = options;
    
    const normalizedText = text.toLowerCase().trim();
    let bestMatch: IntentResult = {
      type: 'Thought',
      tags: [],
      confidence: 0.5,
      needsClarification: true,
      clarification: "I'm not sure what type of note this should be. Could you clarify?"
    };

    // Score each intent type
    for (const [intentType, config] of Object.entries(this.patterns)) {
      const score = this.calculateIntentScore(normalizedText, config.triggers);
      
      if (score > bestMatch.confidence) {
        bestMatch = this.createIntentResult(intentType, score, normalizedText, config);
      }
    }

    // Apply confidence threshold
    bestMatch.needsClarification = bestMatch.confidence < confidenceThreshold;
    
    // Add context-based adjustments
    if (context) {
      bestMatch = this.applyContextualAdjustments(bestMatch, context, normalizedText);
    }

    console.log('🎯 Voice intent routed:', { text, result: bestMatch });
    return bestMatch;
  }

  private calculateIntentScore(text: string, triggers: Array<{ pattern: RegExp; weight: number }>): number {
    let totalScore = 0;
    let maxWeight = 0;

    for (const { pattern, weight } of triggers) {
      if (pattern.test(text)) {
        totalScore += weight;
        maxWeight = Math.max(maxWeight, weight);
      }
    }

    // Use highest weight as base, with bonus for multiple matches
    return maxWeight + (totalScore - maxWeight) * 0.1;
  }

  private createIntentResult(
    intentType: string, 
    score: number, 
    text: string, 
    config: any
  ): IntentResult {
    let type: BubbleType;
    let tags: string[] = [];
    let horizon: 'today' | 'week' | 'later' | undefined;

    switch (intentType) {
      case 'reminder':
        type = 'ReminderNote';
        tags = ['reminder'];
        horizon = this.extractHorizon(text, config.horizonKeywords);
        break;
      case 'shopping':
        type = 'Task';
        tags = ['shopping'];
        break;
      case 'idea':
        type = 'Thought';
        tags = ['idea'];
        break;
      case 'note':
        type = 'Thought';
        tags = ['note'];
        break;
      case 'task':
        type = 'Task';
        tags = [];
        break;
      case 'memory':
        type = 'Memory';
        tags = ['joy'];
        break;
      default:
        type = 'Thought';
        tags = [];
    }

    return {
      type,
      tags,
      horizon,
      confidence: Math.min(score, 0.95), // Cap at 95%
      needsClarification: false
    };
  }

  private extractHorizon(text: string, horizonKeywords: Record<string, string[]>): 'today' | 'week' | 'later' {
    for (const [horizon, keywords] of Object.entries(horizonKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return horizon as 'today' | 'week' | 'later';
        }
      }
    }
    
    // Default based on time patterns
    if (/\d+\s*(pm|am)/i.test(text)) {
      return 'today';
    }
    
    return 'today'; // Default horizon
  }

  private applyContextualAdjustments(
    result: IntentResult, 
    context: VoiceRouterOptions['context'], 
    text: string
  ): IntentResult {
    if (!context) return result;

    // Time-based adjustments
    if (context.timeOfDay) {
      if (context.timeOfDay === 'evening' && result.type === 'ReminderNote') {
        // Evening reminders likely for tomorrow
        if (!result.horizon || result.horizon === 'today') {
          result.horizon = 'week';
        }
      }
    }

    // Recent bubble context
    if (context.recentBubbles && context.recentBubbles.length > 0) {
      const recentTypes = context.recentBubbles.slice(0, 3).map(b => b.type);
      const recentTags = context.recentBubbles.flatMap(b => b.tags?.map(t => t.name) || []);
      
      // If user just created shopping items, bias towards shopping
      if (recentTypes.includes('Task') && recentTags.includes('shopping')) {
        if (result.type === 'Task' && !result.tags.includes('shopping')) {
          result.tags.push('shopping');
          result.confidence = Math.min(result.confidence + 0.1, 0.95);
        }
      }
    }

    return result;
  }

  generateClarification(text: string, confidence: number): string {
    if (confidence < 0.3) {
      return "I didn't quite understand that. Could you try rephrasing what you'd like to capture?";
    }
    
    if (confidence < 0.5) {
      return "I'm not sure if this should be a reminder, note, or task. Which would you prefer?";
    }
    
    return "Could you clarify what type of note this should be?";
  }

  // Helper method to create bubble with proper horizon
  createBubbleFromIntent(text: string, intent: IntentResult): Bubble {
    const bubble: Bubble = {
      id: crypto.randomUUID(),
      type: intent.type,
      content: text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
      size: 0.7,
      tags: intent.tags.map(tag => ({
        id: crypto.randomUUID(),
        name: tag,
        emoji: this.getTagEmoji(tag)
      }))
    };

    // Set horizon if provided
    if (intent.horizon) {
      setHorizon(bubble, intent.horizon);
    }

    return bubble;
  }

  private getTagEmoji(tag: string): string {
    const emojiMap: Record<string, string> = {
      shopping: '🛒',
      idea: '💡',
      reminder: '⏰',
      joy: '😊',
      note: '📝',
      task: '✅',
      work: '💼',
      personal: '👤',
      health: '🏥'
    };
    
    return emojiMap[tag] || '📝';
  }
}

export const voiceRouter = new VoiceRouter();