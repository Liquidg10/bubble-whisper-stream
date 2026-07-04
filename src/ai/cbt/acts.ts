/**
 * CBT Actions - Renders intervention decisions into user-facing actions
 * Run 9: ResponseSelector for deterministic testing
 * Run 12: Priority-based routing (priority→action type mapping)
 */

import type { CBTDecision, CBTAction, DistortionType } from './types';

// Run 9: Injectable selector for deterministic response selection in tests
export type ResponseSelector = (length: number) => number;
const defaultSelector: ResponseSelector = (length: number) => Math.floor(Math.random() * length);

// Response templates for different distortion types
const DISTORTION_RESPONSES: Record<DistortionType, {
  chips: string[];
  acks: string[];
  questions: string[];
  reframes: string[];
  explainability: string[];
}> = {
  all_or_nothing: {
    chips: [
      'That sounds heavy. Want to sanity-check that "always/never" feeling together?',
      'I hear how absolute this feels. Wonder if there might be some middle ground?'
    ],
    acks: [
      'It makes sense this feels so black and white right now. All-or-nothing thinking can feel very convincing.',
      'I notice the absolute language — that all-or-nothing pattern is worth exploring when you\'re ready.'
    ],
    questions: [
      'What might a "sometimes" or "partially" version of this look like?',
      'Can you think of even one small exception to this absolute rule?'
    ],
    reframes: [
      'Most situations exist on a spectrum rather than in absolutes.',
      'Even in difficult patterns, there are usually exceptions worth noticing.'
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
    acks: [
      'When our minds jump to worst-case scenarios, it\'s usually because we care deeply about the outcome.',
      'I hear the catastrophic thinking — your brain makes this feel overwhelming, even if it\'s trying to protect you.'
    ],
    questions: [
      'What\'s the most realistic outcome here, not the worst or best?',
      'If a friend described this situation, what would you tell them?'
    ],
    reframes: [
      'Catastrophizing often focuses on the worst outcome while ignoring the more likely middle ground.',
      'Our brains are wired to spot danger, but that same system can amplify fears beyond their realistic scale.'
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
    acks: [
      'It\'s natural to look for patterns, especially after painful experiences. That generalization makes sense.',
      'I can hear how much this one experience is shaping your bigger picture right now.'
    ],
    questions: [
      'Has there ever been a time when this pattern didn\'t hold true?',
      'What would it mean if this were a one-time thing rather than a permanent pattern?'
    ],
    reframes: [
      'One or two experiences can feel like evidence of a universal rule, but data points need more context.',
      'Patterns can feel very real even when the sample size is small.'
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
    acks: [
      'Those high standards often come from a place of caring — but they can be exhausting to carry.',
      'I notice the "should" language. Those rules we set for ourselves can feel very heavy sometimes.'
    ],
    questions: [
      'Where did this "should" come from — is it really yours?',
      'What would you say to a friend who was being this hard on themselves?'
    ],
    reframes: [
      '"Should" statements often reflect external rules we\'ve internalized rather than what we actually need.',
      'Replacing "should" with "could" or "want to" can open up a lot more space.'
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
    acks: [
      'Mind reading is exhausting — we can\'t know what others think, but that uncertainty is hard to sit with.',
      'I hear you anticipating their reaction. That kind of uncertainty can be really draining.'
    ],
    questions: [
      'What actual evidence do you have about what they\'re thinking?',
      'Is there a way you could find out what they actually think, rather than guessing?'
    ],
    reframes: [
      'Even people who know us well often don\'t think about us the way we assume.',
      'Our assumptions about others\' thoughts are filtered through our own fears and insecurities.'
    ],
    explainability: [
      'noticed assumptions about what others are thinking',
      'picked up on mind-reading patterns'
    ]
  }
};

// PROMPT 6: Enhanced crisis responses with region-aware resources
const CRISIS_RESPONSES = {
  crisis_support: {
    text: 'I\'m here with you. You don\'t have to go through this alone. \u{1F499}',
    data: {
      resources: [], // Will be populated by getCrisisResources()
      followUpQuestions: [
        'Would it help to talk about what\'s going on?',
        'Is there someone you trust who could be with you right now?',
        'What has helped you feel safer in the past?'
      ],
      supportiveMessages: [
        'Your life has value and meaning.',
        'This pain you\'re feeling is temporary, even though it doesn\'t feel that way.',
        'There are people who care about you and want to help.',
        'You don\'t have to face this alone.'
      ]
    }
  }
};

// Run 12: Map decision priority to CBTAction type
function getPriorityActionType(priority: CBTDecision['priority']): CBTAction['type'] {
  switch (priority) {
    case 'crisis':
      return 'crisis_support';
    case 'high':
      return 'question';
    case 'medium':
      return 'ack';
    case 'low':
    default:
      return 'chip';
  }
}

export function render(decision: CBTDecision, select: ResponseSelector = defaultSelector): CBTAction | null {
  if (!decision.shouldIntervene && !decision.metadata.isCrisis) {
    return null;
  }
  
  // PROMPT 6: Crisis interventions bypass all CBT and provide resources
  if (decision.priority === 'crisis' || decision.metadata.isCrisis) {
    return {
      type: 'crisis_support',
      text: CRISIS_RESPONSES.crisis_support.text,
      data: {
        ...CRISIS_RESPONSES.crisis_support.data,
        resources: [] // Will be filled by calling code
      }
    };
  }
  
  // No specific distortions to target
  if (decision.targetDistortions.length === 0) {
    return generateGenericResponse(decision.interventionType, decision.priority, select);
  }
  
  // Target the first/primary distortion
  const primaryDistortion = decision.targetDistortions[0];
  const responses = DISTORTION_RESPONSES[primaryDistortion];
  
  if (!responses) {
    return generateGenericResponse(decision.interventionType, decision.priority, select);
  }
  
  return generateDistortionResponseAction(
    decision.interventionType, decision.priority, primaryDistortion, responses, select
  );
}

function generateGenericResponse(
  interventionType: CBTDecision['interventionType'],
  priority: CBTDecision['priority'],
  select: ResponseSelector
): CBTAction {
  // Run 12: Route by interventionType first; if 'chip', use priority to determine action type
  if (interventionType === 'chip') {
    const actionType = getPriorityActionType(priority);
    switch (actionType) {
      case 'question':
        return {
          type: 'question',
          text: 'What would help you think through this more clearly?',
          data: {
            explainability: 'noticed you might be working through something difficult'
          }
        };
      case 'ack':
        return {
          type: 'ack',
          text: 'I hear that this is difficult right now.',
          data: {
            explainability: 'checking in because this seems important to you'
          }
        };
      case 'chip':
      default:
        return {
          type: 'chip',
          text: 'That sounds like a lot to hold. Want to explore this together?',
          data: {
            explainability: 'noticed you might be working through something difficult'
          }
        };
    }
  }
      
  // Fallback for non-chip interventionType (e.g., 'none' or any other value)
  return {
    type: 'ack',
    text: 'I\'m here to support you.',
    data: {
      explainability: 'checking in because this seems important to you'
    }
  };
}

function generateDistortionResponseAction(
  interventionType: CBTDecision['interventionType'],
  priority: CBTDecision['priority'],
  distortionType: DistortionType,
  responses: typeof DISTORTION_RESPONSES[DistortionType],
  select: ResponseSelector
): CBTAction {
  
  // Run 12: When interventionType is 'chip', route by priority to determine action type
  if (interventionType === 'chip') {
    const actionType = getPriorityActionType(priority);
    
    switch (actionType) {
      case 'question':
        return {
          type: 'question',
          text: responses.questions[select(responses.questions.length)],
          data: {
            distortionType,
            explainability: responses.explainability[select(responses.explainability.length)],
            reframes: responses.reframes
          }
        };
      
      case 'ack':
        return {
          type: 'ack',
          text: responses.acks[select(responses.acks.length)],
          data: {
            distortionType,
            explainability: responses.explainability[select(responses.explainability.length)],
            reframes: responses.reframes
          }
        };
      
      case 'chip':
      default:
        return {
          type: 'chip',
          text: responses.chips[select(responses.chips.length)],
          data: {
            distortionType,
            explainability: responses.explainability[select(responses.explainability.length)]
          }
        };
    }
  }
  
  // Fallback for non-'chip' interventionType
  return {
    type: 'ack',
    text: 'I\'m here to support you.',
    data: {
      distortionType,
      explainability: responses.explainability[select(responses.explainability.length)]
    }
  };
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
        interactive: true  // Run 12: acks are always interactive
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
