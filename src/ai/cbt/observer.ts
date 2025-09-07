/**
 * CBT Observer - High-precision analyzer for thought patterns and distortions
 * English-only v1 with conservative detection thresholds
 */

import type { CBTAnnotation, DistortionType, CrisisFlag } from './types';
import { isFeatureEnabled } from '../../config/flags';

// Conversation history for pattern tracking (last 3 messages)
let conversationHistory: string[] = [];

// High-precision distortion detection patterns with context
const DISTORTION_PATTERNS: Record<DistortionType, {
  keywords: string[];
  patterns: RegExp[];
  weights: number[];
  contextRequirements: {
    requireNegativeValence?: boolean;
    requireFutureTense?: boolean;
    checkRepetition?: boolean;
  };
}> = {
  all_or_nothing: {
    keywords: ['always', 'never', 'everyone', 'no one', 'nothing', 'everything', 'all', 'none'],
    patterns: [
      /\b(always|never)\s+(?:am|is|are|was|were|will|do|does|did|can|could|would|should)\b/gi,
      /\b(everyone|no\s+one)\s+(?:thinks|says|knows|believes|will|does|is)\b/gi,
      /\b(everything|nothing)\s+(?:is|was|will\s+be|goes|works|happens)\b/gi,
      /\b(all|none)\s+(?:of\s+)?(?:them|people|my|the)\b/gi
    ],
    weights: [0.9, 0.85, 0.8, 0.75],
    contextRequirements: {
      requireNegativeValence: true
    }
  },
  catastrophizing: {
    keywords: ['disaster', 'ruined', 'impossible', 'hopeless', 'fail', 'wrecked', 'terrible', 'awful', 'doomed'],
    patterns: [
      /\b(?:will|going\s+to|gonna)\s+(?:be\s+)?(?:disaster|ruined|terrible|awful|impossible)\b/gi,
      /\b(?:everything|life|my\s+life)\s+(?:will|is\s+going\s+to)\s+(?:be\s+)?(?:ruined|over|destroyed)\b/gi,
      /\b(?:will\s+)?never\s+(?:be\s+able\s+to|recover|get\s+over|work\s+out)\b/gi,
      /\b(?:hopeless|impossible|can't\s+handle)\b.*\b(?:will|future|tomorrow|later)\b/gi
    ],
    weights: [0.95, 0.9, 0.85, 0.8],
    contextRequirements: {
      requireFutureTense: true
    }
  },
  overgeneralization: {
    keywords: ['everyone', 'nobody', 'all', 'none', 'typical', 'story of my life', 'always happens'],
    patterns: [
      /\b(everyone|nobody)\s+(?:thinks|says|knows|believes|does|is)\b/gi,
      /\b(?:all|none)\s+(?:of\s+)?(?:them|people|my\s+friends|guys|girls)\s+(?:are|do|think)\b/gi,
      /\b(?:this|that)\s+always\s+happens\s+(?:to\s+me|when)\b/gi,
      /\b(?:typical|story\s+of\s+my\s+life|same\s+thing\s+every\s+time)\b/gi
    ],
    weights: [0.85, 0.8, 0.9, 0.75],
    contextRequirements: {
      checkRepetition: true
    }
  },
  should_statements: {
    keywords: ['should', 'must', 'ought', 'have to', 'supposed to'],
    patterns: [
      /\bi\s+(should|must|ought\s+to)\s+/gi,
      /\b(have\s+to|supposed\s+to)\s+be\s+/gi,
      /\bshouldn't\s+have\s+/gi
    ],
    weights: [0.6, 0.7, 0.8],
    contextRequirements: {}
  },
  mind_reading: {
    keywords: ['thinks I', 'probably thinks', 'must think', 'obviously thinks', 'they think', 'thinking about me'],
    patterns: [
      /\b(?:he|she|they|people)\s+(?:think|believe)\s+(?:I|we)\s+(?:am|are)\b/gi,
      /\b(?:probably|definitely|obviously)\s+(?:think|believe)\s+(?:I|that\s+I)\b/gi,
      /\b(?:they'll|he'll|she'll)\s+(?:think|hate|judge)\s+me\b/gi,
      /\bknows?\s+what\s+(?:I'm\s+thinking|they're\s+thinking)\b/gi
    ],
    weights: [0.9, 0.85, 0.8, 0.75],
    contextRequirements: {}
  }
};

// Conservative crisis detection patterns - high precision
const CRISIS_PATTERNS = {
  self_harm: {
    keywords: [
      'hurt myself', 'harm myself', 'cut myself', 'self harm', 'cutting myself',
      'injure myself', 'hurt me', 'self injury', 'self mutilation', 'burn myself'
    ],
    patterns: [
      /\b(?:want|going|gonna)\s+to\s+(?:hurt|harm|cut|injure)\s+myself\b/gi,
      /\b(?:self\s+harm|self\s+injury|cutting)\b/gi
    ],
    severity: 'high' as const,
    confidence: 0.9
  },
  suicide: {
    keywords: [
      'kill myself', 'end it all', 'not worth living', 'suicide', 'take my life',
      'don\'t want to live', 'better off dead', 'suicidal', 'end my life'
    ],
    patterns: [
      /\b(?:want|going|gonna)\s+to\s+(?:kill|end)\s+myself\b/gi,
      /\b(?:suicide|suicidal|take\s+my\s+(?:own\s+)?life)\b/gi,
      /\b(?:better\s+off\s+dead|don't\s+want\s+to\s+live)\b/gi
    ],
    severity: 'critical' as const,
    confidence: 0.95
  },
  severe_distress: {
    keywords: [
      'can\'t take it anymore', 'breaking down', 'falling apart', 'can\'t cope',
      'losing my mind', 'going crazy', 'can\'t handle this', 'too much'
    ],
    patterns: [
      /\bcan't\s+(?:take\s+it|cope|handle)\s+(?:anymore|this)\b/gi,
      /\b(?:breaking\s+down|falling\s+apart|losing\s+my\s+mind)\b/gi
    ],
    severity: 'medium' as const,
    confidence: 0.7
  },
  emergency: {
    keywords: [
      'emergency', 'crisis', 'urgent help', 'immediate help', 'call 911',
      'need help now', 'emergency room', 'psychiatric emergency'
    ],
    patterns: [
      /\b(?:emergency|crisis|urgent|immediate)\s+help\b/gi,
      /\bneed\s+help\s+(?:now|immediately|right\s+now)\b/gi
    ],
    severity: 'critical' as const,
    confidence: 0.85
  }
};

// Negative valence words for context checking
const NEGATIVE_WORDS = [
  'bad', 'terrible', 'awful', 'horrible', 'sad', 'hate', 'depressed', 'anxious',
  'worried', 'scared', 'angry', 'frustrated', 'disappointed', 'upset', 'hurt',
  'broken', 'worthless', 'useless', 'failure', 'stupid', 'pathetic', 'disgusting'
];

// Future tense indicators
const FUTURE_INDICATORS = [
  'will', 'going to', 'gonna', 'tomorrow', 'next', 'future', 'later',
  'soon', 'eventually', 'ultimately', 'in the end'
];

// Sarcasm and idiom filters to reduce false positives
const SARCASM_INDICATORS = [
  'obviously', 'clearly', 'sure', 'yeah right', 'of course', 'totally',
  'absolutely', 'definitely', 'lol', 'haha', 'jk', 'just kidding'
];

const COMMON_IDIOMS = [
  'break a leg', 'piece of cake', 'it\'s raining cats and dogs',
  'kill two birds', 'spill the beans', 'the whole nine yards'
];

export function annotate(
  message: string, 
  context: {
    messageId: string;
    timestamp?: number;
    recentMood?: string;
    conversationDepth?: number;
    userSettings?: {
      assistLevel?: 'off' | 'subtle' | 'standard';
    };
  }
): CBTAnnotation | null {
  // Feature flag guards - high precision, conservative approach
  if (!isFeatureEnabled('cbtSilentObserve')) {
    return null;
  }
  
  if (context.userSettings?.assistLevel === 'off') {
    return null;
  }
  
  // Early return for very short messages or obvious non-content
  if (message.trim().length < 10 || /^[^a-zA-Z]*$/.test(message)) {
    return null;
  }
  const timestamp = context.timestamp || Date.now();
  const messageLength = message.length;
  const timeOfDay = new Date(timestamp).getHours();
  
  // Add to conversation history for pattern tracking
  conversationHistory.push(message.toLowerCase());
  if (conversationHistory.length > 3) {
    conversationHistory.shift();
  }
  
  // Check for sarcasm or idioms that might cause false positives
  if (containsSarcasmOrIdioms(message)) {
    return null;
  }
  
  // Detect distortions with high precision
  const distortions = detectDistortions(message);
  
  // Analyze sentiment with enhanced lexicon
  const sentiment = analyzeSentiment(message);
  
  // Check for crisis flags with conservative approach
  const crisisFlags = detectCrisisFlags(message);
  
  // Only return annotation if we have high-confidence findings
  if (distortions.length === 0 && crisisFlags.length === 0 && Math.abs(sentiment.score) < 0.6) {
    return null;
  }
  
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

function containsSarcasmOrIdioms(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Check for sarcasm indicators
  const hasSarcasm = SARCASM_INDICATORS.some(indicator => 
    lowerMessage.includes(indicator)
  );
  
  // Check for common idioms
  const hasIdiom = COMMON_IDIOMS.some(idiom => 
    lowerMessage.includes(idiom)
  );
  
  return hasSarcasm || hasIdiom;
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
      // Check context requirements
      if (!meetsContextRequirements(message, config.contextRequirements)) {
        continue;
      }
      
      const confidence = calculateConfidence(keywordMatches, patternMatches, type as DistortionType);
      
      // High precision threshold: 0.8
      if (confidence >= 0.8) {
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

function meetsContextRequirements(
  message: string, 
  requirements: {
    requireNegativeValence?: boolean;
    requireFutureTense?: boolean;
    checkRepetition?: boolean;
  }
): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Check negative valence requirement
  if (requirements.requireNegativeValence) {
    const hasNegativeContext = NEGATIVE_WORDS.some(word => 
      lowerMessage.includes(word)
    );
    if (!hasNegativeContext) return false;
  }
  
  // Check future tense requirement
  if (requirements.requireFutureTense) {
    const hasFutureTense = FUTURE_INDICATORS.some(indicator => 
      lowerMessage.includes(indicator)
    );
    if (!hasFutureTense) return false;
  }
  
  // Check repetition in conversation history
  if (requirements.checkRepetition) {
    const hasRepetition = conversationHistory.filter(historyMsg => 
      historyMsg.includes('always') || historyMsg.includes('never') || 
      historyMsg.includes('everyone') || historyMsg.includes('nobody')
    ).length >= 2;
    if (!hasRepetition) return false;
  }
  
  return true;
}

function calculateConfidence(
  keywords: string[], 
  patterns: { match: boolean; weight: number }[], 
  distortionType: DistortionType
): number {
  // Base scores
  const keywordScore = Math.min(keywords.length * 0.15, 0.4);
  const patternMatches = patterns.filter(p => p.match);
  const patternScore = patternMatches.length > 0 
    ? patternMatches.reduce((sum, p) => sum + p.weight, 0) / patterns.length 
    : 0;
  
  // Base confidence
  let confidence = keywordScore + patternScore;
  
  // Type-specific adjustments for higher precision
  switch (distortionType) {
    case 'all_or_nothing':
      // Boost confidence if multiple absolute words are present
      if (keywords.length >= 2) confidence += 0.1;
      break;
    case 'catastrophizing':
      // Boost confidence if future tense is strong
      if (patterns.some(p => p.match && p.weight >= 0.9)) confidence += 0.1;
      break;
    case 'overgeneralization':
      // Boost confidence if repetition is detected
      if (conversationHistory.length >= 2) confidence += 0.15;
      break;
  }
  
  return Math.min(confidence, 1.0);
}

function analyzeSentiment(message: string): { score: number; magnitude: number } {
  // Enhanced sentiment analysis with more comprehensive lexicon
  const positiveWords = [
    'good', 'great', 'happy', 'joy', 'love', 'excellent', 'wonderful', 'amazing',
    'fantastic', 'awesome', 'brilliant', 'perfect', 'beautiful', 'excited',
    'thrilled', 'grateful', 'blessed', 'optimistic', 'hopeful', 'confident'
  ];
  
  const negativeWords = [
    'bad', 'terrible', 'sad', 'hate', 'awful', 'horrible', 'depressed', 'anxious',
    'worried', 'scared', 'angry', 'frustrated', 'disappointed', 'upset', 'hurt',
    'broken', 'worthless', 'useless', 'failure', 'stupid', 'pathetic', 'disgusting',
    'devastated', 'hopeless', 'miserable', 'overwhelmed', 'stressed', 'exhausted'
  ];
  
  const words = message.toLowerCase().split(/\s+/);
  const positiveCount = words.filter(word => positiveWords.includes(word)).length;
  const negativeCount = words.filter(word => negativeWords.includes(word)).length;
  
  // Enhanced scoring with context consideration
  const totalWords = words.length;
  const emotionalWords = positiveCount + negativeCount;
  
  // Calculate base score
  let score = (positiveCount - negativeCount) / Math.max(totalWords / 8, 1);
  
  // Adjust for intensity markers
  const intensifiers = ['very', 'extremely', 'incredibly', 'absolutely', 'completely'];
  const hasIntensifier = words.some(word => intensifiers.includes(word));
  if (hasIntensifier && score !== 0) {
    score *= 1.3;
  }
  
  // Calculate magnitude based on emotional word density
  const magnitude = Math.min(emotionalWords / Math.max(totalWords / 15, 1), 1);
  
  return {
    score: Math.max(-1, Math.min(1, score)),
    magnitude: Math.max(0, Math.min(1, magnitude))
  };
}

function detectCrisisFlags(message: string): CrisisFlag[] {
  const lowerMessage = message.toLowerCase();
  const flags: CrisisFlag[] = [];
  
  for (const [type, config] of Object.entries(CRISIS_PATTERNS)) {
    // Check keywords
    const keywordMatches = config.keywords.filter(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    // Check patterns if available
    const patternMatches = config.patterns?.filter(pattern => 
      pattern.test(message)
    ) || [];
    
    if (keywordMatches.length > 0 || patternMatches.length > 0) {
      // Calculate confidence based on severity and matches
      let confidence = Math.min(
        (keywordMatches.length * 0.3) + (patternMatches.length * 0.5), 
        config.confidence
      );
      
      // Boost confidence for critical patterns
      if (config.severity === 'critical' && patternMatches.length > 0) {
        confidence = Math.min(confidence + 0.2, 1.0);
      }
      
      // Only include high-confidence crisis flags
      if (confidence >= 0.7) {
        flags.push({
          type: type as CrisisFlag['type'],
          confidence,
          keywords: keywordMatches,
          severity: config.severity
        });
      }
    }
  }
  
  return flags;
}

// Reset conversation history (for testing or privacy)
export function resetConversationHistory(): void {
  conversationHistory = [];
}