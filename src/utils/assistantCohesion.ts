/**
 * Assistant Cohesion Utilities
 * Ensures consistent AI persona and prevents personality leakage
 */

import { polishCopy } from './copyPolish';

export type AssistantContext = 'cbt' | 'planning' | 'celebration' | 'notification' | 'error' | 'general';
export type PersonaTone = 'compassionate' | 'analytical' | 'encouraging' | 'neutral';

interface PersonaGuidelines {
  context: AssistantContext;
  tone: PersonaTone;
  voiceCharacteristics: string[];
  forbiddenPhrases: string[];
  preferredPhrases: string[];
  examples: string[];
}

const PERSONA_GUIDELINES: PersonaGuidelines[] = [
  {
    context: 'cbt',
    tone: 'compassionate',
    voiceCharacteristics: [
      'Gentle inquiry without judgment',
      'Validates feelings before exploring thoughts',
      'Uses "curious" rather than "corrective" language',
      'Offers options rather than directives'
    ],
    forbiddenPhrases: [
      'you should think',
      'that\'s wrong',
      'negative thinking',
      'cognitive distortion',
      'irrational',
      'fix your thoughts'
    ],
    preferredPhrases: [
      'what feels true to you',
      'another way to see this',
      'makes sense that you\'d feel',
      'worth exploring together',
      'gentle perspective shift'
    ],
    examples: [
      'That sounds really difficult. What feels most overwhelming about it?',
      'It makes sense you\'d feel that way. Would it help to look at this together?',
      'You\'re handling so much right now. What\'s one thing that feels manageable?'
    ]
  },
  {
    context: 'planning',
    tone: 'analytical',
    voiceCharacteristics: [
      'Clear, structured thinking',
      'Focuses on practical next steps',
      'Acknowledges constraints realistically',
      'Suggests without overwhelming'
    ],
    forbiddenPhrases: [
      'you must',
      'should have planned',
      'poor planning',
      'behind schedule',
      'time management failure'
    ],
    preferredPhrases: [
      'ready when you are',
      'here\'s what I see',
      'worth considering',
      'gentle structure',
      'one step at a time'
    ],
    examples: [
      'I see three tasks for today. Would it help to tackle the quick one first?',
      'Your calendar looks full. Want to identify what feels most important?',
      'Here\'s a gentle structure for this week, starting with what\'s ready'
    ]
  },
  {
    context: 'celebration',
    tone: 'encouraging',
    voiceCharacteristics: [
      'Warm acknowledgment of effort',
      'Recognizes progress over perfection',
      'Celebrates process, not just outcomes',
      'Builds motivation without pressure'
    ],
    forbiddenPhrases: [
      'finally completed',
      'about time',
      'should have done more',
      'keep up the pace',
      'maintain momentum'
    ],
    preferredPhrases: [
      'beautifully handled',
      'you showed up',
      'gentle progress',
      'worth celebrating',
      'steady effort'
    ],
    examples: [
      'Three tasks done - you\'re finding your rhythm ✨',
      'That was a tough one, and you handled it beautifully',
      'Every small step counts, and this one really matters'
    ]
  },
  {
    context: 'notification',
    tone: 'neutral',
    voiceCharacteristics: [
      'Clear, actionable information',
      'Respectful of user attention',
      'No urgency unless truly urgent',
      'Options, not demands'
    ],
    forbiddenPhrases: [
      'urgent',
      'immediately',
      'you forgot',
      'overdue',
      'behind'
    ],
    preferredPhrases: [
      'ready for you',
      'when you\'re ready',
      'gentle reminder',
      'worth noting',
      'available now'
    ],
    examples: [
      'Your 3pm meeting is ready for you',
      'Gentle reminder: grocery list is ready when you are',
      'Two tasks available for this afternoon'
    ]
  }
];

/**
 * Validates message against persona guidelines
 */
export function validatePersonaConsistency(
  message: string, 
  context: AssistantContext
): { isValid: boolean; issues: string[]; suggestions: string[] } {
  const guidelines = PERSONA_GUIDELINES.find(g => g.context === context);
  if (!guidelines) {
    return { isValid: true, issues: [], suggestions: [] };
  }

  const issues: string[] = [];
  const suggestions: string[] = [];
  const lowerMessage = message.toLowerCase();

  // Check for forbidden phrases
  guidelines.forbiddenPhrases.forEach(phrase => {
    if (lowerMessage.includes(phrase.toLowerCase())) {
      issues.push(`Avoid using "${phrase}" in ${context} context`);
      
      // Find preferred alternative
      const alternatives = guidelines.preferredPhrases.filter(preferred => 
        phrase.split(' ').some(word => preferred.includes(word))
      );
      if (alternatives.length > 0) {
        suggestions.push(`Consider using "${alternatives[0]}" instead`);
      }
    }
  });

  // Check tone alignment
  const hasCompassionateLanguage = guidelines.preferredPhrases.some(phrase =>
    lowerMessage.includes(phrase.toLowerCase())
  );

  if (!hasCompassionateLanguage && context === 'cbt') {
    suggestions.push('Consider adding more validating language');
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  };
}

/**
 * Automatically corrects common persona violations
 */
export function correctPersonaViolations(
  message: string, 
  context: 'reminder' | 'cbt' | 'notification' | 'general'
): string {
  let corrected = message;
  const guidelines = PERSONA_GUIDELINES.find(g => g.context === context);
  
  if (!guidelines) return polishCopy(corrected, context);

  // Apply forbidden phrase replacements
  guidelines.forbiddenPhrases.forEach((forbidden, index) => {
    const preferred = guidelines.preferredPhrases[index];
    if (preferred) {
      const regex = new RegExp(`\\b${forbidden}\\b`, 'gi');
      corrected = corrected.replace(regex, preferred);
    }
  });

  // Apply copy polish for anti-shame language  
  corrected = polishCopy(corrected, context);

  return corrected;
}

/**
 * Generates context-appropriate response
 */
export function generateContextualResponse(
  userInput: string,
  context: AssistantContext,
  intention: string
): string {
  const guidelines = PERSONA_GUIDELINES.find(g => g.context === context);
  if (!guidelines) return intention;

  // Start with user's emotional state validation
  let response = '';
  
  if (context === 'cbt') {
    response = validateEmotion(userInput) + ' ';
  }
  
  response += intention;
  
  // Ensure response matches persona guidelines - map context to polishCopy acceptable types
  const mapContextToPolish = (ctx: AssistantContext): 'reminder' | 'cbt' | 'notification' | 'general' => {
    switch (ctx) {
      case 'cbt': return 'cbt';
      case 'notification': return 'notification';
      case 'planning': return 'general';
      case 'celebration': return 'general';
      case 'error': return 'general';
      default: return 'general';
    }
  };
  
  response = correctPersonaViolations(response, mapContextToPolish(context));
  
  return response;
}

/**
 * Validates emotional state for CBT context
 */
function validateEmotion(userInput: string): string {
  const stressIndicators = ['overwhelmed', 'stressed', 'anxious', 'worried', 'difficult'];
  const lowerInput = userInput.toLowerCase();
  
  const hasStress = stressIndicators.some(indicator => lowerInput.includes(indicator));
  
  if (hasStress) {
    return 'That sounds really challenging.';
  }
  
  return 'I hear you.';
}

/**
 * Lint rules for assistant cohesion
 */
export const assistantCohesionLints = {
  'no-medical-claims': {
    rule: (text: string) => !/(diagnos|treat|cure|medical|therapy|disorder)/i.test(text),
    message: 'Avoid medical/clinical language - use supportive alternatives'
  },
  
  'no-shame-language': {
    rule: (text: string) => !/(should have|must do|failed|behind|late|wrong)/i.test(text),
    message: 'Replace shame-inducing language with compassionate alternatives'
  },
  
  'consistent-tone': {
    rule: (text: string, context?: AssistantContext) => {
      if (!context) return true;
      const validation = validatePersonaConsistency(text, context);
      return validation.isValid;
    },
    message: 'Message tone doesn\'t match context guidelines'
  },
  
  'autonomy-preserving': {
    rule: (text: string) => !/(you must|have to|need to|should|require)/i.test(text),
    message: 'Preserve user autonomy - suggest rather than demand'
  },
  
  'explainable-ai': {
    rule: (text: string) => {
      if (text.includes('AI') || text.includes('suggest')) {
        return text.includes('because') || text.includes('since') || text.includes('reason');
      }
      return true;
    },
    message: 'AI suggestions should include "because" explanations'
  }
};

/**
 * Runs all lint rules on a message
 */
export function lintMessage(
  message: string, 
  context: AssistantContext
): { passed: boolean; failures: Array<{ rule: string; message: string }> } {
  const failures: Array<{ rule: string; message: string }> = [];
  
  Object.entries(assistantCohesionLints).forEach(([ruleName, lint]) => {
    const passed = typeof lint.rule === 'function' && lint.rule.length === 2 
      ? lint.rule(message, context)
      : lint.rule(message);
      
    if (!passed) {
      failures.push({
        rule: ruleName,
        message: lint.message
      });
    }
  });
  
  return {
    passed: failures.length === 0,
    failures
  };
}

/**
 * Development helper: logs persona violations
 */
export function debugPersonaConsistency(message: string, context: AssistantContext) {
  if (process.env.NODE_ENV === 'development') {
    const validation = validatePersonaConsistency(message, context);
    const lintResult = lintMessage(message, context);
    
    if (!validation.isValid || !lintResult.passed) {
      console.group(`🎭 Persona Consistency Issues (${context})`);
      console.log('Message:', message);
      
      if (validation.issues.length > 0) {
        console.log('Issues:', validation.issues);
        console.log('Suggestions:', validation.suggestions);
      }
      
      if (lintResult.failures.length > 0) {
        console.log('Lint failures:', lintResult.failures);
      }
      
      console.groupEnd();
    }
  }
}