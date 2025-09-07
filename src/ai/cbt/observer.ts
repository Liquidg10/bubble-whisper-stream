/**
 * CBT Observer - Analyzes messages for thought patterns and distortions
 */

import type { CBTAnnotation, DistortionType, CrisisFlag } from './types';

// Distortion detection patterns
const DISTORTION_PATTERNS: Record<DistortionType, {
  keywords: string[];
  patterns: RegExp[];
  weights: number[];
}> = {
  all_or_nothing: {
    keywords: ['always', 'never', 'everything', 'nothing', 'completely', 'totally', 'perfect', 'failure'],
    patterns: [
      /\b(always|never)\s+\w+/gi,
      /\b(everything|nothing)\s+(is|was|will)/gi,
      /\b(completely|totally)\s+(useless|worthless|perfect)/gi
    ],
    weights: [0.8, 0.7, 0.9]
  },
  catastrophizing: {
    keywords: ['disaster', 'terrible', 'awful', 'horrible', 'worst', 'ruined', 'doomed', 'catastrophe'],
    patterns: [
      /\b(disaster|catastrophe|terrible|awful)\b/gi,
      /\b(worst\s+case|everything\s+will\s+fall\s+apart)/gi,
      /\b(ruined|doomed|end\s+of\s+the\s+world)/gi
    ],
    weights: [0.9, 0.8, 0.7]
  },
  overgeneralization: {
    keywords: ['everyone', 'nobody', 'all', 'none', 'typical', 'story of my life'],
    patterns: [
      /\b(everyone|nobody)\s+(thinks|says|knows)/gi,
      /\b(all\s+\w+\s+are|none\s+of\s+\w+)/gi,
      /\bthis\s+always\s+happens/gi
    ],
    weights: [0.7, 0.8, 0.9]
  },
  should_statements: {
    keywords: ['should', 'must', 'ought', 'have to', 'supposed to'],
    patterns: [
      /\bi\s+(should|must|ought\s+to)\s+/gi,
      /\b(have\s+to|supposed\s+to)\s+be\s+/gi,
      /\bshouldn't\s+have\s+/gi
    ],
    weights: [0.6, 0.7, 0.8]
  },
  mind_reading: {
    keywords: ['thinks I', 'probably thinks', 'must think', 'obviously thinks'],
    patterns: [
      /\b(he|she|they)\s+(thinks|believes)\s+(i|we)/gi,
      /\bprobably\s+(thinks|believes)/gi,
      /\bknows\s+what\s+i'm\s+thinking/gi
    ],
    weights: [0.8, 0.7, 0.9]
  }
};

// Crisis detection patterns
const CRISIS_PATTERNS = {
  self_harm: {
    keywords: ['hurt myself', 'harm myself', 'cut myself', 'self harm'],
    severity: 'high' as const
  },
  suicide: {
    keywords: ['kill myself', 'end it all', 'not worth living', 'suicide'],
    severity: 'critical' as const
  },
  severe_distress: {
    keywords: ['can\'t take it', 'overwhelming', 'breaking down', 'falling apart'],
    severity: 'medium' as const
  },
  emergency: {
    keywords: ['emergency', 'crisis', 'urgent help', 'immediate help'],
    severity: 'critical' as const
  }
};

export function annotate(
  message: string, 
  context: {
    messageId: string;
    timestamp?: number;
    recentMood?: string;
    conversationDepth?: number;
  }
): CBTAnnotation {
  const timestamp = context.timestamp || Date.now();
  const messageLength = message.length;
  const timeOfDay = new Date(timestamp).getHours();
  
  // Detect distortions
  const distortions = detectDistortions(message);
  
  // Analyze sentiment
  const sentiment = analyzeSentiment(message);
  
  // Check for crisis flags
  const crisisFlags = detectCrisisFlags(message);
  
  return {
    messageId: context.messageId,
    timestamp,
    distortions,
    sentiment,
    crisisFlags,
    context: {
      recentMood: context.recentMood,
      timeOfDay,
      messageLength,
      conversationDepth: context.conversationDepth || 0
    }
  };
}

function detectDistortions(message: string) {
  const lowerMessage = message.toLowerCase();
  const detectedDistortions = [];
  
  for (const [type, config] of Object.entries(DISTORTION_PATTERNS)) {
    const keywordMatches = config.keywords.filter(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    const patternMatches = config.patterns.map((pattern, index) => ({
      match: pattern.test(message),
      weight: config.weights[index] || 0.5
    }));
    
    if (keywordMatches.length > 0 || patternMatches.some(p => p.match)) {
      const confidence = calculateConfidence(keywordMatches, patternMatches);
      
      if (confidence > 0.3) { // Threshold for detection
        detectedDistortions.push({
          type: type as DistortionType,
          confidence,
          evidence: keywordMatches,
          keywords: keywordMatches
        });
      }
    }
  }
  
  return detectedDistortions;
}

function calculateConfidence(keywords: string[], patterns: { match: boolean; weight: number }[]): number {
  const keywordScore = Math.min(keywords.length * 0.2, 0.6);
  const patternScore = patterns
    .filter(p => p.match)
    .reduce((sum, p) => sum + p.weight, 0) / patterns.length;
  
  return Math.min(keywordScore + patternScore, 1.0);
}

function analyzeSentiment(message: string): { score: number; magnitude: number } {
  // Simple sentiment analysis based on positive/negative word counts
  const positiveWords = ['good', 'great', 'happy', 'joy', 'love', 'excellent', 'wonderful', 'amazing'];
  const negativeWords = ['bad', 'terrible', 'sad', 'hate', 'awful', 'horrible', 'depressed', 'anxious', 'worried'];
  
  const words = message.toLowerCase().split(/\s+/);
  const positiveCount = words.filter(word => positiveWords.includes(word)).length;
  const negativeCount = words.filter(word => negativeWords.includes(word)).length;
  
  const score = (positiveCount - negativeCount) / Math.max(words.length / 10, 1);
  const magnitude = Math.min((positiveCount + negativeCount) / Math.max(words.length / 20, 1), 1);
  
  return {
    score: Math.max(-1, Math.min(1, score)),
    magnitude: Math.max(0, Math.min(1, magnitude))
  };
}

function detectCrisisFlags(message: string): CrisisFlag[] {
  const lowerMessage = message.toLowerCase();
  const flags: CrisisFlag[] = [];
  
  for (const [type, config] of Object.entries(CRISIS_PATTERNS)) {
    const matches = config.keywords.filter(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    if (matches.length > 0) {
      flags.push({
        type: type as CrisisFlag['type'],
        confidence: Math.min(matches.length * 0.4, 1.0),
        keywords: matches,
        severity: config.severity
      });
    }
  }
  
  return flags;
}