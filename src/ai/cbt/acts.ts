/**
 * CBT Actions - Renders intervention decisions into user-facing actions
 */

import type { CBTDecision, CBTAction, DistortionType } from './types';

// Response templates for different distortion types
const DISTORTION_RESPONSES: Record<DistortionType, {
  chips: string[];
  questions: string[];
  acknowledgments: string[];
  reframes: string[];
}> = {
  all_or_nothing: {
    chips: ['Consider the middle ground', 'Not everything is black and white'],
    questions: [
      'What would be a more balanced way to see this?',
      'Are there any exceptions to this "always" or "never"?',
      'What would you tell a friend in this situation?'
    ],
    acknowledgments: [
      'I notice you might be seeing this in very absolute terms.',
      'It sounds like you\'re feeling like it\'s all or nothing right now.'
    ],
    reframes: [
      'Most situations exist on a spectrum rather than being perfect or complete failures.',
      'Even small steps forward are meaningful progress.'
    ]
  },
  catastrophizing: {
    chips: ['What\'s most likely to happen?', 'Focus on what you can control'],
    questions: [
      'What\'s the most realistic outcome here?',
      'What would you do if this worst-case scenario actually happened?',
      'What evidence do you have that this will definitely happen?'
    ],
    acknowledgments: [
      'This sounds really overwhelming and scary right now.',
      'I can hear that you\'re worried about the worst-case scenario.'
    ],
    reframes: [
      'While this feels huge right now, most of our worst fears don\'t actually come true.',
      'You\'ve handled difficult situations before and found ways through them.'
    ]
  },
  overgeneralization: {
    chips: ['Look for exceptions', 'This situation vs. all situations'],
    questions: [
      'Can you think of a time when this wasn\'t true?',
      'What makes this specific situation different?',
      'Is this pattern as universal as it feels right now?'
    ],
    acknowledgments: [
      'It sounds like this pattern feels really consistent to you.',
      'I hear that this feels like something that always happens.'
    ],
    reframes: [
      'One situation doesn\'t necessarily predict all future situations.',
      'Each experience is unique, even when they feel similar.'
    ]
  },
  should_statements: {
    chips: ['What would be helpful?', 'Replace "should" with "could"'],
    questions: [
      'What would be helpful or kind to yourself right now?',
      'If you replaced "should" with "could," how does that feel?',
      'Where did this "should" come from originally?'
    ],
    acknowledgments: [
      'I notice you have some strong expectations for yourself.',
      'It sounds like you\'re putting a lot of pressure on yourself.'
    ],
    reframes: [
      'Sometimes "could" gives us more space than "should."',
      'Being kind to yourself is often more motivating than being demanding.'
    ]
  },
  mind_reading: {
    chips: ['Ask instead of assuming', 'Focus on what you know'],
    questions: [
      'What evidence do you have for what they\'re thinking?',
      'Is there another possible explanation for their behavior?',
      'How could you find out what they actually think?'
    ],
    acknowledgments: [
      'It sounds like you\'re worried about what others are thinking.',
      'I can hear that uncertainty about others\' thoughts feels difficult.'
    ],
    reframes: [
      'We often can\'t know what others are thinking unless they tell us.',
      'People usually think about us much less than we imagine they do.'
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
        text: 'Take a moment to reflect',
        data: {
          followUpQuestions: [
            'How are you feeling right now?',
            'What would help in this moment?'
          ]
        }
      };
      
    case 'none':
      return {
        type: 'ack',
        text: 'I hear that this is difficult right now. 🤗',
        data: {
          followUpQuestions: [
            'Would it help to talk through this together?',
            'What would you say to a good friend in this situation?'
          ]
        }
      };
      
    default:
      return {
        type: 'question',
        text: 'What would help you see this differently?',
        data: {
          followUpQuestions: [
            'What evidence supports this thought?',
            'What evidence might challenge it?',
            'What would be a more balanced perspective?'
          ]
        }
      };
  }
}

function generateDistortionResponseAction(
  interventionType: CBTDecision['interventionType'],
  distortionType: DistortionType,
  responses: typeof DISTORTION_RESPONSES[DistortionType]
): CBTAction {
  
  // PROMPT 3: Simplified to chip|none only
  if (interventionType === 'chip') {
    return {
      type: 'chip',
      text: getRandomItem(responses.chips),
      data: {
        distortionType,
        followUpQuestions: responses.questions.slice(0, 1)
      }
    };
  }
  
  // Default case for 'none' or fallback
  return {
    type: 'ack',
    text: getRandomItem(responses.acknowledgments),
    data: {
      distortionType,
      followUpQuestions: responses.questions.slice(0, 1)
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