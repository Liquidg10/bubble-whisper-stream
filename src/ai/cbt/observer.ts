/**
 * CBT Observer — Detects cognitive distortions and crisis signals in user messages
 * Cumulative patches: Runs 7–16
 *   Run 7:  calculateConfidence divisor fix (/ patternMatches.length)
 *   Run 8:  all_or_nothing P0 verb expansion; NEGATIVE_WORDS+FUTURE_INDICATORS lexicon
 *   Run 13/14: Three-tier sarcasm filter (UNAMBIGUOUS / CONTEXTUAL / DISTRESS_MARKERS)
 *   Run 15: 5th all_or_nothing pattern; mind_reading + catastrophizing + overgeneralization
 *           pattern tweaks; /g lastIndex reset; crisis dedup
 *   Run 16: Enhanced analyzeSentiment with conflict factor; isMixedSentiment+hasStrongNegative sentinel
 */

import type { CBTAnnotation, CBTDistortionAnnotation, CrisisFlag, DistortionType } from './types';
import { detectCrisisInMessage } from './crisis';

// ---------------------------------------------------------------------------
// Module-level conversation history (Run 17: needed by tests via resetConversationHistory)
// ---------------------------------------------------------------------------
let conversationHistory: string[] = [];

export function resetConversationHistory(): void {
  conversationHistory = [];
}

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------

// Run 8: added 'fail', 'mess'; Run 13: added 'hopeless'
const NEGATIVE_WORDS = [
  'bad', 'terrible', 'awful', 'horrible', 'dreadful', 'painful', 'hurt',
  'sad', 'angry', 'frustrated', 'worthless', 'stupid', 'hate', 'fear',
  'anxious', 'worried', 'stressed', 'lonely', 'fail', 'mess', 'hopeless',
  'scary', 'broken', 'miserable', 'depressed', 'impossible',
  'disaster', 'ruined', 'overwhelming', 'exhausted', 'defeated', 'shame'
];

// Run 16: positive words for conflict factor in mixed-sentiment detection
const POSITIVE_WORDS = [
  'love', 'happy', 'great', 'good', 'wonderful', 'excited', 'amazing',
  'fantastic', 'joy', 'pleased', 'glad', 'delighted', 'enjoy', 'like',
  'appreciate', 'grateful', 'proud', 'confident', 'hopeful', 'relaxed'
];

// Run 8: added "'ll"
const FUTURE_INDICATORS = [
  'will', 'going to', 'gonna', "i'll", "we'll", "they'll", "you'll",
  "he'll", "she'll", "'ll"
];

// ---------------------------------------------------------------------------
// Three-tier sarcasm filter (Runs 13/14)
// ---------------------------------------------------------------------------

// Tier 1: Always sarcasm
const UNAMBIGUOUS_SARCASM = [
  'lol', 'lmao', 'lmfao', 'haha', 'hahaha', 'rofl',
  'just kidding', 'jk', 'jks', 'not really', '/s',
  'ya right', 'yeah right', 'oh right', 'riiight', 'suuure'
];

// Tier 2: Probable sarcasm unless distress markers present
const CONTEXTUAL_INTENSIFIERS = [
  'obviously', 'clearly', 'absolutely', 'totally', 'definitely',
  'certainly', 'surely', 'of course', 'naturally', 'evidently'
];

// Tier 3: Genuine distress indicators that bypass sarcasm filter
const SARCASM_DISTRESS_MARKERS = [
  'fail', 'failing', 'failed', 'hurt', 'hurting', 'scared', 'fear',
  'worried', 'awful', 'terrible', 'worthless', 'hopeless', 'anxious',
  'depressed', 'broken', 'alone', 'lost', 'stuck', 'trapped',
  'overwhelmed', 'exhausted', 'miserable', 'pain', 'disaster', 'ruined',
  'incompetent', 'useless', 'pathetic', 'stupid', 'dumb'
];

function containsSarcasmOrIdioms(message: string): boolean {
  const lower = message.toLowerCase();

  // Tier 1: Unambiguous sarcasm — always return true
  if (UNAMBIGUOUS_SARCASM.some(s => lower.includes(s))) return true;

  // Tier 2: Contextual intensifiers — only sarcasm if no distress markers
  const hasIntensifier = CONTEXTUAL_INTENSIFIERS.some(s => lower.includes(s));
  if (hasIntensifier) {
    const hasDistressMarker = SARCASM_DISTRESS_MARKERS.some(s => lower.includes(s));
    return !hasDistressMarker;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Distortion patterns
// ---------------------------------------------------------------------------

type DistortionConfig = {
  keywords: string[];
  patterns: RegExp[];
  weights: number[];
  contextRequirements: {
    requireNegativeValence?: boolean;
    requireFutureTense?: boolean;
  };
};

const DISTORTION_PATTERNS: Record<DistortionType, DistortionConfig> = {
  all_or_nothing: {
    keywords: ['always', 'never', 'everyone', 'no one', 'nothing', 'everything', 'all', 'none'],
    patterns: [
      // P0 — Run 8: added fail|fails|failed|mess|messes|messed to verb alternation
      /\b(always|never)\s+(?:am|is|are|was|were|will|do|does|did|can|could|would|should|fail|fails|failed|mess|messes|messed)\b/gi,
      // P1 — everyone/no one + cognitive verbs
      /\b(everyone|no\s+one)\s+(?:thinks|says|knows|believes|will|does|is)\b/gi,
      // P2 — everything/nothing + state verbs
      /\b(everything|nothing)\s+(?:is|was|will\s+be|goes|works|happens)\b/gi,
      // P3 — all/none + pronouns/determiners
      /\b(all|none)\s+(?:of\s+)?(?:them|people|my|the)\b/gi,
      // P4 — Run 15: always/never + action failure verbs
      /\b(always|never)\s+(?:fail|mess\s+up|screw\s+up|lose|struggle|give\s+up)\b/gi,
    ],
    weights: [0.9, 0.85, 0.8, 0.75, 0.85],
    contextRequirements: { requireNegativeValence: true }
  },

  catastrophizing: {
    keywords: [
      'disaster', 'ruined', 'catastrophe', 'terrible', 'awful', 'impossible',
      'worst', 'never recover', 'end of the world', 'hopeless', 'over'
    ],
    patterns: [
      // P0 — Run 15: added optional (?:a\s+)?
      /\b(?:will|going\s+to|gonna)\s+(?:be\s+)?(?:a\s+)?(?:disaster|ruined|terrible|awful|impossible)\b/gi,
      // P1 — "never (0–3 words) recover" — catches "I'll never be able to recover"
      /\b(?:never|can't|cannot)\s+(?:\w+\s+){0,3}(?:recover|escape|get\s+over|heal|bounce\s+back)\b/gi,
      // P2 — "this/it/my life will be over/ruined/hopeless"
      /\b(?:this|it|my\s+life)\s+(?:is|will\s+be)\s+(?:over|ruined|finished|hopeless|impossible)\b/gi,
      // P3 — worst/most terrible thing/day/nightmare
      /\b(?:worst|most\s+terrible|most\s+awful)\s+(?:thing|day|moment|experience|nightmare)\b/gi,
    ],
    weights: [0.9, 0.85, 0.8, 0.75],
    contextRequirements: { requireFutureTense: true }
  },

  overgeneralization: {
    keywords: ['everyone', 'nobody', 'all', 'none', 'typical', 'story of my life', 'always happens'],
    patterns: [
      // P0 — Run 15: removed 'does' and 'is' (too broad)
      /\b(everyone|nobody)\s+(?:thinks|says|knows|believes)\b/gi,
      // P1 — all/none + people/friends + verb
      /\b(?:all|none)\s+(?:of\s+)?(?:them|people|my\s+friends|guys|girls)\s+(?:are|do|think)\b/gi,
      // P2 — "this/that always happens"
      /\b(?:this|that)\s+always\s+happens\b/gi,
      // P3 — "typical" / "story of my life"
      /\b(?:typical|story\s+of\s+my\s+life|same\s+thing\s+every\s+time)\b/gi,
    ],
    weights: [0.85, 0.8, 0.75, 0.7],
    contextRequirements: {}  // Run 15: checkRepetition removed
  },

  should_statements: {
    keywords: ['should', 'must', 'have to', 'supposed to', 'ought to', 'need to be'],
    patterns: [
      /\b(?:I\s+)?(?:should|must|have\s+to|supposed\s+to|ought\s+to)\s+(?:be|do|have|know|feel|act|try)\b/gi,
      /\b(?:should\s+have|must\s+have|could\s+have)\s+(?:done|been|known|said|tried)\b/gi,
      /\b(?:I\s+)?(?:need\s+to|have\s+to)\s+(?:be|do|have|know|feel|act|try)\s+(?:better|more|less|harder|perfect)\b/gi,
      /\bwhy\s+(?:can't|don't|didn't|won't)\s+I\b/gi,
    ],
    weights: [0.9, 0.85, 0.8, 0.75],
    contextRequirements: {}
  },

  mind_reading: {
    keywords: ['think I', 'thinks I', 'probably thinks', 'definitely thinks', 'know what they think'],
    patterns: [
      // P0 — Run 15: added 'everyone'; 'thinks?'; 'I\'m'/'that I'; removed am/are requirement
      /\b(?:he|she|they|people|everyone)\s+(?:think[s]?|believe[s]?|will\s+think)\s+(?:I|we|I'm|that\s+I)\b/gi,
      // P1 — Run 15: added 'thinks?'; 'I\'m'
      /\b(?:probably|definitely|obviously)\s+(?:think[s]?|believe[s]?)\s+(?:I|I'm|that\s+I)\b/gi,
      // P2 — they'll/he'll/she'll judge me
      /\b(?:they'll|he'll|she'll)\s+(?:think|hate|judge)\s+me\b/gi,
      // P3 — knows what I'm thinking
      /\bknows?\s+what\s+(?:I'm\s+thinking|they're\s+thinking)\b/gi,
    ],
    weights: [0.9, 0.85, 0.8, 0.75],
    contextRequirements: {}
  }
};

const DETECTION_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Confidence calculation — Run 7: divide by patternMatches.length (not patterns.length)
// ---------------------------------------------------------------------------

function calculateConfidence(
  message: string,
  keywords: string[],
  patterns: RegExp[],
  weights: number[]
): { confidence: number; matchedKeywords: string[]; matchedPatterns: string[] } {
  const lower = message.toLowerCase();

  const matchedKeywords = keywords.filter(k => lower.includes(k.toLowerCase()));
  const keywordScore = Math.min(matchedKeywords.length * 0.15, 0.4);

  // Run 15: reset lastIndex before each .test() to avoid /g contamination
  const patternResults = patterns.map((pattern, i) => {
    pattern.lastIndex = 0;  // /g lastIndex fix
    return {
      matched: pattern.test(lower),
      weight: weights[i],
      source: pattern.source
    };
  });

  const successfulMatches = patternResults.filter(r => r.matched);

  // Run 7: divide by successfulMatches.length (was patterns.length — bug)
  const patternScore = successfulMatches.length > 0
    ? successfulMatches.reduce((sum, r) => sum + r.weight, 0) / successfulMatches.length
    : 0;

  const confidence = Math.min(keywordScore + patternScore, 1.0);
  const matchedPatterns = successfulMatches.map(r => r.source);

  return { confidence, matchedKeywords, matchedPatterns };
}

// ---------------------------------------------------------------------------
// Sentiment analysis — Run 16: conflict factor for mixed sentiment
// ---------------------------------------------------------------------------

function analyzeSentiment(message: string): {
  score: number;
  magnitude: number;
  positiveCount: number;
  negativeCount: number;
} {
  const lower = message.toLowerCase();
  const positiveCount = POSITIVE_WORDS.filter(w => lower.includes(w)).length;
  const negativeCount = NEGATIVE_WORDS.filter(w => lower.includes(w)).length;
  const totalWords = positiveCount + negativeCount;

  if (totalWords === 0) {
    return { score: 0, magnitude: 0, positiveCount: 0, negativeCount: 0 };
  }

  // Conflict factor: 0 when all one polarity, 1 when perfectly balanced
  const conflictFactor = 2 * Math.min(positiveCount, negativeCount) / Math.max(totalWords, 1);
  const rawScore = (positiveCount - negativeCount) / totalWords;
  const score = rawScore * (1 - conflictFactor);
  const magnitude = Math.abs(score) + conflictFactor * 0.5;

  return { score, magnitude, positiveCount, negativeCount };
}

// ---------------------------------------------------------------------------
// Distortion detection
// ---------------------------------------------------------------------------

function detectDistortions(message: string): CBTDistortionAnnotation[] {
  const lower = message.toLowerCase();
  const results: CBTDistortionAnnotation[] = [];

  for (const [type, config] of Object.entries(DISTORTION_PATTERNS) as [DistortionType, DistortionConfig][]) {
    const { confidence, matchedKeywords, matchedPatterns } = calculateConfidence(
      lower,
      config.keywords,
      config.patterns,
      config.weights
    );

    if (confidence < DETECTION_THRESHOLD) continue;

    // Context requirements
    if (config.contextRequirements.requireNegativeValence) {
      const hasNegativeValence = NEGATIVE_WORDS.some(w => lower.includes(w.toLowerCase()));
      if (!hasNegativeValence) continue;
    }

    if (config.contextRequirements.requireFutureTense) {
      const hasFutureTense = FUTURE_INDICATORS.some(i => lower.includes(i.toLowerCase()));
      if (!hasFutureTense) continue;
    }

    let boostedConfidence = confidence;

    // All-or-nothing: boost when multiple absolute keywords present
    if (type === 'all_or_nothing' && matchedKeywords.length >= 2) {
      boostedConfidence = Math.min(boostedConfidence + 0.1, 1.0);
    }

    results.push({
      type,
      confidence: boostedConfidence,
      evidence: matchedKeywords,
      keywords: matchedKeywords,
      patterns: matchedPatterns
    });
  }

  // Sort by confidence descending so primary distortion is first
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// Crisis flag detection — Run 15: dedup (remove medium when critical/high present)
// Delegates pattern matching to crisis.ts (string-based, no /g issue there)
// ---------------------------------------------------------------------------

function detectCrisisFlags(message: string): CrisisFlag[] {
  // Reset any regex state (guard for future regex-based additions)
  const flags = detectCrisisInMessage(message);

  // Run 15: dedup — if high/critical present, drop medium-severity flags
  const hasHighOrCritical = flags.some(f => f.severity === 'high' || f.severity === 'critical');
  return hasHighOrCritical ? flags.filter(f => f.severity !== 'medium') : flags;
}

// ---------------------------------------------------------------------------
// Main annotation function
// ---------------------------------------------------------------------------

export function annotate(
  message: string,
  context?: {
    messageId?: string;
    userId?: string;
    userSettings?: { assistLevel?: string };
    timestamp?: number;
    recentMood?: string;
    conversationDepth?: number;
  }
): CBTAnnotation | null {
  // Run 17: Feature flag gate — cbtSilentObserve must not be explicitly disabled
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('flags.cbtSilentObserve') === 'false') {
      return null;
    }
  } catch { /* localStorage unavailable (e.g. SSR) — proceed normally */ }

  // Run 17: User assist level gate
  if (context?.userSettings?.assistLevel === 'off') return null;

  const lowerMessage = message.toLowerCase();

  // Run 13/14: bail early on sarcasm/idioms
  if (containsSarcasmOrIdioms(lowerMessage)) return null;

  const distortions = detectDistortions(lowerMessage);
  const crisisFlags = detectCrisisFlags(lowerMessage);

  // Run 16: enhanced sentiment with conflict factor
  const { score, magnitude, positiveCount, negativeCount } = analyzeSentiment(lowerMessage);
  const sentiment = { score, magnitude }; // matches CBTAnnotation['sentiment'] type exactly

  // Run 16: sentinel — return null unless something meaningful is happening
  const totalEmotionalWords = positiveCount + negativeCount;
  const hasStrongNegative = score <= -0.6 && totalEmotionalWords >= 2;
  const isMixedSentiment = positiveCount > 0 && negativeCount > 0;

  if (
    distortions.length === 0 &&
    crisisFlags.length === 0 &&
    !hasStrongNegative &&
    !isMixedSentiment
  ) {
    return null;
  }

  // Run 17: maintain conversation history (capped at 3) for repetition detection
  conversationHistory.push(message);
  if (conversationHistory.length > 3) {
    conversationHistory.shift();
  }

  return {
    messageId: context?.messageId || '',
    timestamp: context?.timestamp ?? Date.now(),
    sentiment,
    distortions,
    crisisFlags,
    context: {
      recentMood: context?.recentMood,
      timeOfDay: new Date().getHours(),
      messageLength: message.length,
      conversationDepth: context?.conversationDepth ?? conversationHistory.length
    }
  };
}
