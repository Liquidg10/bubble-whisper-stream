/**
 * CBT Actions - Renders intervention decisions into user-facing actions
 */

import type { CBTDecision, CBTAction, DistortionType } from './types';

// Response templates for different distortion types - PROMPT 4: Friend tone only
const DISTORTION_RESPONSES: Record<DistortionType, {
  chips: string[];
  explainability: string[];
}> = {
  all_or_nothing: {
    chips: [
      'That sounds heavy. Want to sanity-check that "always/never" feeling together?',
      'I hear how absolute this feels. Wonder if there might be some middle ground?'
    ],
    explainability: [
      'noticed absolute words like "always" or "never"',
      'picked up on all-or-nothing language'
    ]
  },
  catastrophizing: {
    chips: [
      'I hear how overwhelming this feels. Wonder if we could look at what\'s most likely?',
      'That sounds really scary. Want to explore what you can actually control?'
    ],
    explainability: [
      'noticed worry about worst-case scenarios',
      'picked up on catastrophic thinking patterns'
    ]
  },
  overgeneralization: {
    chips: [
      'That pattern feels really strong right now. Curious if there might be exceptions?',
      'This sounds like a big universal truth. Wonder if this specific situation is different?'
    ],
    explainability: [
      'noticed generalizing from one situation',
      'picked up on "always happens" type thinking'
    ]
  },
  should_statements: {
    chips: [
      'Those expectations sound intense. What if we explored what would be helpful instead?',
      'I hear a lot of "shoulds" there. Wonder what would feel kinder to yourself?'
    ],
    explainability: [
      'noticed self-critical "should" statements',
      'picked up on harsh expectations for yourself'
    ]
  },
  mind_reading: {
    chips: [
      'Uncertainty about what others think is tough. Wonder what you actually know for sure?',
      'That sounds like a lot of guessing about their thoughts. What if we focused on what\'s real?'
    ],
    explainability: [
      'noticed assumptions about what others are thinking',
      'picked up on mind-reading patterns'
    ]
  }
};

const CRISIS_RESPONSES = {
  crisis_support: {
    text: 'I\'m here with you. You don\'t have to go through this alone. 💙',
    data: {
      resources: [
        'Crisis Text Line: Text HOME to 741741',
        '988 Suicide & Crisis Lifeline: Call or text 988',
        'In immediate danger: Call 911'
      ],
      followUpQuestions: [
        'Would it help to talk about what\'s going on?',
        'Is there someone you trust who could be with you right now?',
        'What has helped you feel safer in the past?'
      ]
    }
  }
};

export function render(decision: CBTDecision): CBTAction | null {
  if (!decision.shouldIntervene) {
    return null;
  }
  
  // Crisis interventions always take priority
  if (decision.priority === 'crisis') {
    return {
      type: 'crisis_support',
      text: CRISIS_RESPONSES.crisis_support.text,
      data: CRISIS_RESPONSES.crisis_support.data
    };
  }
  
  // No specific distortions to target
  if (decision.targetDistortions.length === 0) {
    return generateGenericResponse(decision.interventionType);
  }
  
  // Target the first/primary distortion
  const primaryDistortion = decision.targetDistortions[0];
  const responses = DISTORTION_RESPONSES[primaryDistortion];
  
  if (!responses) {
    return generateGenericResponse(decision.interventionType);
  }
  
  return generateDistortionResponseAction(decision.interventionType, primaryDistortion, responses);
}

function generateGenericResponse(interventionType: CBTDecision['interventionType']): CBTAction {
  switch (interventionType) {
    case 'chip':
      return {
        type: 'chip',
        text: 'That sounds like a lot to hold. Want to explore this together?',
        data: {
          explainability: 'noticed you might be working through something difficult'
        }
      };
      
    case 'none':
      return {
        type: 'ack',
        text: 'I hear that this is difficult right now.',
        data: {
          explainability: 'checking in because this seems important to you'
        }
      };
  }
}

function generateDistortionResponseAction(
  interventionType: CBTDecision['interventionType'],
  distortionType: DistortionType,
  responses: typeof DISTORTION_RESPONSES[DistortionType]
): CBTAction {
  
  // PROMPT 4: Friend tone only, with explainability
  if (interventionType === 'chip') {
    return {
      type: 'chip',
      text: getRandomItem(responses.chips),
      data: {
        distortionType,
        explainability: getRandomItem(responses.explainability)
      }
    };
  }
  
  // Default case for 'none' or fallback
  return {
    type: 'ack',
    text: 'I\'m here with you.',
    data: {
      distortionType,
      explainability: getRandomItem(responses.explainability)
    }
  };
}

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function formatActionForDisplay(action: CBTAction): {
  primary: string;
  secondary?: string;
  interactive: boolean;
} {
  switch (action.type) {
    case 'chip':
      return {
        primary: action.text,
        interactive: true
      };
      
    case 'ack':
      return {
        primary: action.text,
        secondary: action.data?.followUpQuestions?.[0],
        interactive: !!action.data?.followUpQuestions?.length
      };
      
    case 'question':
      return {
        primary: action.text,
        secondary: 'Tap to explore this together',
        interactive: true
      };
      
    case 'crisis_support':
      return {
        primary: action.text,
        secondary: 'Immediate support available',
        interactive: true
      };
      
    default:
      return {
        primary: action.text,
        interactive: false
      };
  }
}

export { formatActionForDisplay };