/**
 * PROMPT 11: CBT Copy Service
 * Enhanced microcopy for chips with A/B testing variants
 */

import { cbtABTestingService } from './cbtABTestingService';
import { polishCopy } from '@/utils/copyPolish';

interface ChipCopyVariant {
  promptText: string;        // Main chip message
  primaryAction: string;     // "Helpful" replacement
  dismissAction: string;     // "Not now" replacement
  explainability: string;    // "Because..." content
}

// A/B Test Variants for chip copy
const CHIP_COPY_VARIANTS: Record<string, ChipCopyVariant> = {
  curious: {
    promptText: "Got a moment to explore this?",
    primaryAction: "Yes, please",
    dismissAction: "Maybe later",
    explainability: "I noticed a pattern we could look at together"
  },
  supportive: {
    promptText: "Let's look at this together",
    primaryAction: "I'm ready",
    dismissAction: "Not right now",
    explainability: "This seems like a moment where support might help"
  },
  gentle: {
    promptText: "Want to check something?",
    primaryAction: "Sure",
    dismissAction: "Another time",
    explainability: "I see an opportunity for a gentle check-in"
  },
  validating: {
    promptText: "This sounds like a big moment",
    primaryAction: "Tell me more",
    dismissAction: "I'm okay",
    explainability: "Your feelings make complete sense here"
  },
  questioning: {
    promptText: "What if we tried a different angle?",
    primaryAction: "Let's try",
    dismissAction: "Not now",
    explainability: "There might be another way to see this"
  }
};

// Context-specific copy for different CBT actions
const CONTEXT_COPY = {
  reframe: {
    curious: "Want to explore another perspective?",
    supportive: "Let's find a gentler way to see this",
    gentle: "Could we try a different view?",
    validating: "Your feelings are valid - want to explore?",
    questioning: "What if this moment held something different?"
  },
  breathing: {
    curious: "Ready for a moment to breathe?",
    supportive: "Let's take a pause together",
    gentle: "Want to try some gentle breathing?",
    validating: "You deserve a moment of calm",
    questioning: "What if we slowed down for a moment?"
  },
  grounding: {
    curious: "Want to ground yourself here?",
    supportive: "Let's anchor you in this moment",
    gentle: "Ready to feel more centered?",
    validating: "You're safe to take your time",
    questioning: "What if we focused on right now?"
  }
};

/**
 * Gets appropriate chip copy based on user's A/B bucket and context
 */
export function getChipCopy(
  userId: string, 
  actionType: string = 'general',
  context?: string
): ChipCopyVariant {
  // Get user's A/B variant (simplified for now)
  const variants = Object.keys(CHIP_COPY_VARIANTS);
  const userHash = userId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  const variant = variants[Math.abs(userHash) % variants.length];
  
  // Use context-specific copy if available
  if (context && CONTEXT_COPY[context as keyof typeof CONTEXT_COPY]) {
    const contextVariants = CONTEXT_COPY[context as keyof typeof CONTEXT_COPY];
    const promptText = contextVariants[variant as keyof typeof contextVariants];
    
    if (promptText) {
      const baseCopy = CHIP_COPY_VARIANTS[variant] || CHIP_COPY_VARIANTS.gentle;
      return {
        ...baseCopy,
        promptText: polishCopy(promptText, 'cbt')
      };
    }
  }
  
  // Fall back to variant default
  const copy = CHIP_COPY_VARIANTS[variant] || CHIP_COPY_VARIANTS.gentle;
  
  return {
    promptText: polishCopy(copy.promptText, 'cbt'),
    primaryAction: polishCopy(copy.primaryAction, 'cbt'),
    dismissAction: polishCopy(copy.dismissAction, 'cbt'),
    explainability: polishCopy(copy.explainability, 'cbt')
  };
}

/**
 * Gets encouragement phrases for different contexts
 */
export function getContextualEncouragement(context: 'dismissed' | 'engaged' | 'helpful'): string {
  const encouragement = {
    dismissed: [
      "That's perfectly okay",
      "You know what works for you",
      "Trust your instincts",
      "Another time is fine"
    ],
    engaged: [
      "Thank you for being open",
      "This kind of reflection takes courage",
      "You're doing important work",
      "I appreciate you taking this moment"
    ],
    helpful: [
      "I'm glad this resonated",
      "Your feedback helps me learn",
      "Thank you for letting me know",
      "This helps me support you better"
    ]
  };
  
  const phrases = encouragement[context];
  const randomIndex = Math.floor(Math.random() * phrases.length);
  return polishCopy(phrases[randomIndex], 'cbt');
}

/**
 * Validates copy for clinical language and shame-inducing terms
 */
export function validateChipCopy(text: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const clinicalTerms = [
    'cognitive distortion', 'cbt', 'therapy', 'treatment', 'diagnosis',
    'disorder', 'pathology', 'dysfunction', 'abnormal', 'unhealthy'
  ];
  
  const shameTerms = [
    'wrong', 'bad', 'failure', 'should have', 'must', 'need to',
    'terrible', 'awful', 'lazy', 'procrastinating'
  ];
  
  const lowerText = text.toLowerCase();
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check for clinical terms
  clinicalTerms.forEach(term => {
    if (lowerText.includes(term)) {
      issues.push(`Contains clinical term: "${term}"`);
      suggestions.push(`Consider: ${polishCopy(term, 'cbt')}`);
    }
  });
  
  // Check for shame language
  shameTerms.forEach(term => {
    if (lowerText.includes(term)) {
      issues.push(`Contains shame language: "${term}"`);
      suggestions.push(`Consider: ${polishCopy(term, 'cbt')}`);
    }
  });
  
  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  };
}