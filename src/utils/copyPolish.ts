/**
 * Copy Polish Utilities
 * Ensures all user-facing text follows anti-shame guidelines
 */

import { ambientModeService } from '@/services/ambientModeService';

// Anti-shame replacements for common negative language
const SHAME_REPLACEMENTS = {
  // Failure language
  'failed': 'ready when you are',
  'failure': 'step to try again',
  'missed': 'ready for you',
  'overdue': 'waiting for you',
  'behind': 'catching up',
  'late': 'when you\'re ready',
  
  // Guilt language  
  'should have': 'could try',
  'must do': 'might help to',
  'need to': 'ready to',
  'have to': 'can',
  
  // Judgment language
  'wrong': 'different approach',
  'bad': 'tough moment',
  'terrible': 'challenging',
  'awful': 'difficult',
  
  // Performance language
  'lazy': 'taking rest',
  'procrastinating': 'preparing',
  'avoiding': 'taking time',
  'forgetting': 'lots on your mind',
  
  // CBT-specific clinical terms (PROMPT 11)
  'cognitive distortion': 'thinking pattern',
  'cbt': 'check-in',
  'intervention': 'support',
  'analysis': 'look together',
  'incorrect thinking': 'different way to see this',
  'negative thought': 'tough moment',
  'irrational': 'understandable feeling',
  'unhealthy pattern': 'pattern to explore',
  'therapy': 'support',
  'treatment': 'gentle help'
};

// Compassionate alternatives for status updates
const COMPASSIONATE_STATUS = {
  reminder: {
    pending: 'ready when you are',
    snoozed: 'taking a pause',
    dismissed: 'noted and set aside',
    completed: 'beautifully done'
  },
  task: {
    incomplete: 'in progress',
    pending: 'when you\'re ready',
    blocked: 'waiting for the right moment'
  },
  mood: {
    low: 'gentle day',
    overwhelmed: 'full plate today',
    stressed: 'feeling the pressure',
    anxious: 'mind is busy'
  }
};

// Enhanced Bible-aligned encouragement phrases
const ENCOURAGEMENT_PHRASES = [
  'You\'re doing your best',
  'Every small step counts',
  'It\'s okay to go at your own pace',
  'Your effort matters',
  'You\'re learning and growing',
  'Tomorrow is a fresh start',
  'You have everything you need',
  'Trust your process',
  'You took a timely break. That helps future-you.',
  'What would you say to yourself on a good day?',
  'You\'re meeting yourself where you are',
  'This is practice, not perfection',
  'You\'re being gentle with yourself',
  'Small steps are still progress'
];

// Self-compassion reframes (from Implementation Bible)
const SELF_COMPASSION_REFRAMES = [
  'How would you comfort a friend having this thought?',
  'What would you tell someone you care about?',
  'You\'re being harder on yourself than you need to be',
  'This feeling is temporary and understandable',
  'You\'re human, and humans have tough moments',
  'What\'s one small act of kindness you can give yourself?',
  'It\'s okay to not be okay right now',
  'You\'re doing the best you can with what you have'
];

// Autonomy-supportive language patterns (SDT-aligned)
const AUTONOMY_PHRASES = [
  'Pick: 10-min start or tomorrow morning?',
  'Want a 5-min tidy or skip for later?',
  'Ready when you are',
  'You choose what feels right',
  'What feels manageable for you?',
  'Trust your instincts on this',
  'You know what works for you',
  'Take your time with this'
];

/**
 * Polishes text to remove shame-inducing language
 * Now respects ambient mode settings
 */
export function polishCopy(text: string, context: 'reminder' | 'cbt' | 'notification' | 'general' = 'general'): string {
  // First apply ambient mode adjustments
  let polished = ambientModeService.getModeCopy(text, context);
  
  // Then apply shame replacement polish
  polished = polished.toLowerCase();
  for (const [shameWord, compassionateWord] of Object.entries(SHAME_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${shameWord}\\b`, 'gi');
    polished = polished.replace(regex, compassionateWord);
  }
  
  // Capitalize first letter
  return polished.charAt(0).toUpperCase() + polished.slice(1);
}

/**
 * Gets compassionate status text
 */
export function getCompassionateStatus(
  category: keyof typeof COMPASSIONATE_STATUS,
  status: string
): string {
  const statusMap = COMPASSIONATE_STATUS[category];
  return statusMap?.[status as keyof typeof statusMap] || status;
}

/**
 * Gets random encouragement phrase
 */
export function getEncouragement(): string {
  const randomIndex = Math.floor(Math.random() * ENCOURAGEMENT_PHRASES.length);
  return ENCOURAGEMENT_PHRASES[randomIndex];
}

/**
 * Gets self-compassion reframe (Bible enhancement)
 */
export function getSelfCompassionReframe(): string {
  const randomIndex = Math.floor(Math.random() * SELF_COMPASSION_REFRAMES.length);
  return SELF_COMPASSION_REFRAMES[randomIndex];
}

/**
 * Gets autonomy-supportive phrase (SDT-aligned)
 */
export function getAutonomySupportivePhrase(): string {
  const randomIndex = Math.floor(Math.random() * AUTONOMY_PHRASES.length);
  return AUTONOMY_PHRASES[randomIndex];
}

/**
 * Formats loading states with compassionate language
 */
export function getCompassionateLoading(action: string): string {
  const loadingPhrases = {
    saving: 'securing your thoughts...',
    loading: 'gathering your space...',
    thinking: 'reflecting with you...',
    processing: 'working gently...',
    analyzing: 'understanding patterns...',
    updating: 'refreshing your view...'
  };
  
  return loadingPhrases[action as keyof typeof loadingPhrases] || `${action}...`;
}

/**
 * Validates text for shame-inducing language
 */
export function validateCopy(text: string): {
  hasShameLanguage: boolean;
  suggestions: string[];
} {
  const shameWords = Object.keys(SHAME_REPLACEMENTS);
  const foundShameWords: string[] = [];
  
  const lowerText = text.toLowerCase();
  shameWords.forEach(word => {
    if (lowerText.includes(word)) {
      foundShameWords.push(word);
    }
  });
  
  return {
    hasShameLanguage: foundShameWords.length > 0,
    suggestions: foundShameWords.map(word => 
      `Replace "${word}" with "${SHAME_REPLACEMENTS[word as keyof typeof SHAME_REPLACEMENTS]}"`
    )
  };
}