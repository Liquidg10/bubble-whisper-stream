/**
 * Crisis Protocol Integration for CBT System
 * Handles crisis detection, session silencing, and resource delivery
 * PROMPT 6: Block CBT when crisis detected, provide supportive resources
 */

import type { CBTAnnotation, CrisisFlag } from './types';

export interface CrisisSessionState {
  inCrisisMode: boolean;
  crisisDetectedAt: number;
  cooldownMinutes: number;
  crisisType: CrisisFlag['type'];
  sessionId: string;
}

// Enhanced crisis keywords with conservative approach
const ENHANCED_CRISIS_PATTERNS = {
  self_harm: {
    keywords: [
      'hurt myself', 'harm myself', 'cut myself', 'self harm', 'cutting myself',
      'injure myself', 'hurt me', 'self injury', 'self mutilation', 'burn myself',
      'scratch myself', 'hit myself', 'punish myself physically'
    ],
    phrases: [
      'want to hurt myself',
      'going to hurt myself',
      'thinking about hurting myself',
      'urge to cut',
      'need to cut'
    ]
  },
  suicide: {
    keywords: [
      'kill myself', 'end it all', 'not worth living', 'suicide', 'take my life',
      'don\'t want to live', 'better off dead', 'suicidal', 'end my life',
      'want to die', 'wish I was dead', 'thinking about suicide'
    ],
    phrases: [
      'want to kill myself',
      'going to kill myself',
      'planning to end my life',
      'thoughts of suicide',
      'suicidal ideation'
    ]
  },
  severe_distress: {
    keywords: [
      'can\'t take it anymore', 'breaking down', 'falling apart', 'can\'t cope',
      'losing my mind', 'going crazy', 'can\'t handle this', 'too much',
      'overwhelmed completely', 'at my breaking point', 'can\'t go on'
    ],
    phrases: [
      'can\'t take this anymore',
      'at the end of my rope',
      'ready to give up',
      'completely overwhelmed'
    ]
  },
  emergency: {
    keywords: [
      'emergency', 'crisis', 'urgent help', 'immediate help', 'call 911',
      'need help now', 'emergency room', 'psychiatric emergency',
      'having a breakdown', 'mental health emergency'
    ],
    phrases: [
      'need help right now',
      'this is an emergency',
      'having a crisis',
      'urgent mental health help'
    ]
  }
};

// Region-aware crisis resources
export const CRISIS_RESOURCES_BY_REGION = {
  US: [
    {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      description: '24/7 suicide prevention and crisis counseling'
    },
    {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      description: 'Free, 24/7 crisis support via text'
    },
    {
      name: 'National Sexual Assault Hotline',
      contact: '1-800-656-4673',
      description: 'Support for sexual violence survivors'
    },
    {
      name: 'Emergency Services',
      contact: 'Call 911',
      description: 'For immediate danger or medical emergencies'
    }
  ],
  UK: [
    {
      name: 'Samaritans',
      contact: 'Call 116 123',
      description: 'Free emotional support 24/7'
    },
    {
      name: 'Crisis Text Line',
      contact: 'Text SHOUT to 85258',
      description: 'Free, 24/7 crisis support via text'
    },
    {
      name: 'Mind Infoline',
      contact: '0300 123 3393',
      description: 'Mental health information and support'
    },
    {
      name: 'Emergency Services',
      contact: 'Call 999',
      description: 'For immediate danger or medical emergencies'
    }
  ],
  CA: [
    {
      name: 'Talk Suicide Canada',
      contact: '1-833-456-4566',
      description: '24/7 bilingual suicide prevention'
    },
    {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 686868',
      description: 'Free, 24/7 crisis support via text'
    },
    {
      name: 'Kids Help Phone',
      contact: '1-800-668-6868',
      description: 'Support for children and youth'
    },
    {
      name: 'Emergency Services',
      contact: 'Call 911',
      description: 'For immediate danger or medical emergencies'
    }
  ],
  AU: [
    {
      name: 'Lifeline',
      contact: '13 11 14',
      description: '24/7 crisis support and suicide prevention'
    },
    {
      name: 'Beyond Blue',
      contact: '1300 22 4636',
      description: 'Mental health support and information'
    },
    {
      name: 'Crisis Text Line',
      contact: 'Text CONNECT to 0477 13 11 14',
      description: 'Free, 24/7 crisis support via text'
    },
    {
      name: 'Emergency Services',
      contact: 'Call 000',
      description: 'For immediate danger or medical emergencies'
    }
  ],
  generic: [
    {
      name: 'Local Emergency Services',
      contact: 'Contact your local emergency number',
      description: 'For immediate danger or medical emergencies'
    },
    {
      name: 'Mental Health Professional',
      contact: 'Contact your therapist or counselor',
      description: 'Reach out to a trusted mental health provider'
    },
    {
      name: 'Trusted Support Person',
      contact: 'Call a friend, family member, or support person',
      description: 'Connect with someone you trust'
    },
    {
      name: 'Local Crisis Line',
      contact: 'Search online for crisis hotlines in your area',
      description: 'Find local mental health crisis resources'
    }
  ]
};

/**
 * Enhanced crisis detection with conservative patterns
 */
export function detectCrisisInMessage(message: string): CrisisFlag[] {
  const lowerMessage = message.toLowerCase();
  const flags: CrisisFlag[] = [];

  for (const [type, patterns] of Object.entries(ENHANCED_CRISIS_PATTERNS)) {
    let confidence = 0;
    const keywords: string[] = [];

    // Check keywords
    for (const keyword of patterns.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
        confidence += 0.2;
      }
    }

    // Check phrases (higher weight)
    for (const phrase of patterns.phrases) {
      if (lowerMessage.includes(phrase.toLowerCase())) {
        keywords.push(phrase);
        confidence += 0.4;
      }
    }

    // Conservative threshold: require at least 0.7 confidence
    if (confidence >= 0.7) {
      const severity = getSeverityForCrisisType(type as CrisisFlag['type']);
      flags.push({
        type: type as CrisisFlag['type'],
        confidence: Math.min(confidence, 1.0),
        keywords,
        severity
      });
    }
  }

  return flags;
}

function getSeverityForCrisisType(type: CrisisFlag['type']): CrisisFlag['severity'] {
  switch (type) {
    case 'suicide':
    case 'emergency':
      return 'critical';
    case 'self_harm':
      return 'high';
    case 'severe_distress':
      return 'medium';
    default:
      return 'medium';
  }
}

/**
 * Get region-aware crisis resources
 */
export function getCrisisResources(userRegion?: string): typeof CRISIS_RESOURCES_BY_REGION.generic {
  const region = userRegion || detectUserRegion();
  return CRISIS_RESOURCES_BY_REGION[region as keyof typeof CRISIS_RESOURCES_BY_REGION] || 
         CRISIS_RESOURCES_BY_REGION.generic;
}

function detectUserRegion(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone.includes('America/New_York') || timezone.includes('America/Chicago') || 
        timezone.includes('America/Denver') || timezone.includes('America/Los_Angeles')) {
      return 'US';
    }
    if (timezone.includes('Europe/London')) return 'UK';
    if (timezone.includes('America/Toronto') || timezone.includes('America/Vancouver')) return 'CA';
    if (timezone.includes('Australia/')) return 'AU';
  } catch (error) {
    console.warn('Could not detect timezone for crisis resources');
  }
  return 'generic';
}

/**
 * Crisis session state management
 */
export class CrisisSessionManager {
  private static STORAGE_PREFIX = 'cbt_crisis_session_';

  static getSessionState(userId: string): CrisisSessionState {
    const storageKey = `${this.STORAGE_PREFIX}${userId}`;
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) {
      return {
        inCrisisMode: false,
        crisisDetectedAt: 0,
        cooldownMinutes: 60, // Default 1 hour
        crisisType: 'severe_distress',
        sessionId: ''
      };
    }

    const parsed = JSON.parse(stored);
    
    // Check if cooldown has expired
    const now = Date.now();
    const cooldownExpiry = parsed.crisisDetectedAt + (parsed.cooldownMinutes * 60 * 1000);
    
    if (parsed.inCrisisMode && now > cooldownExpiry) {
      // Reset crisis mode automatically
      const resetState = this.createInitialState();
      this.setSessionState(userId, resetState);
      return resetState;
    }

    return parsed;
  }

  static setSessionState(userId: string, state: CrisisSessionState): void {
    const storageKey = `${this.STORAGE_PREFIX}${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  static activateCrisisMode(userId: string, crisisType: CrisisFlag['type'], cooldownMinutes = 60): void {
    const state: CrisisSessionState = {
      inCrisisMode: true,
      crisisDetectedAt: Date.now(),
      cooldownMinutes,
      crisisType,
      sessionId: `crisis_${Date.now()}`
    };
    this.setSessionState(userId, state);
  }

  static resetCrisisMode(userId: string): void {
    const resetState = this.createInitialState();
    this.setSessionState(userId, resetState);
  }

  static getRemainingCooldownMinutes(userId: string): number {
    const state = this.getSessionState(userId);
    if (!state.inCrisisMode) return 0;
    
    const now = Date.now();
    const cooldownExpiry = state.crisisDetectedAt + (state.cooldownMinutes * 60 * 1000);
    const remaining = Math.max(0, cooldownExpiry - now);
    
    return Math.ceil(remaining / (1000 * 60));
  }

  private static createInitialState(): CrisisSessionState {
    return {
      inCrisisMode: false,
      crisisDetectedAt: 0,
      cooldownMinutes: 60,
      crisisType: 'severe_distress',
      sessionId: ''
    };
  }
}

/**
 * Supportive crisis response messages
 */
export const CRISIS_RESPONSE_TEMPLATES = {
  validation: [
    'I\'m here with you. You don\'t have to go through this alone. 💙',
    'What you\'re feeling right now is valid and I\'m here to support you.',
    'You\'re not alone in this moment. I care about your wellbeing.',
    'I hear how much pain you\'re in right now. Let\'s get you connected to support.'
  ],
  gentle_connection: [
    'I can connect you to resources that can help right now.',
    'There are people who want to help and support you through this.',
    'Let me share some immediate support options with you.',
    'Would you like me to help you find someone to talk to right away?'
  ],
  no_reframing: [
    // These are what NOT to say - no CBT reframing during crisis
    // 'Let\'s think about this differently',
    // 'What evidence do you have for this thought?',
    // 'Maybe there\'s another way to see this'
  ]
};

export function getCrisisResponseText(): string {
  const validationMessages = CRISIS_RESPONSE_TEMPLATES.validation;
  return validationMessages[Math.floor(Math.random() * validationMessages.length)];
}

export function getCrisisConnectionText(): string {
  const connectionMessages = CRISIS_RESPONSE_TEMPLATES.gentle_connection;
  return connectionMessages[Math.floor(Math.random() * connectionMessages.length)];
}