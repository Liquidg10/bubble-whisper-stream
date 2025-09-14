/**
 * Cast Synthesizer - Unified Voice Implementation
 * Synthesizes input from all Cast members into single assistant response
 * Zero persona name leakage while maintaining expertise diversity
 */

import { isFeatureEnabled } from '@/config/flags';
import { cbtConversationPipeline } from './cbtConversationPipeline';
import { cognitiveLoadGovernor } from './cognitiveLoadGovernor';
import { correctPersonaViolations } from '@/utils/assistantCohesion';

export interface CastInput {
  userId: string;
  messageText: string;
  currentContext?: {
    taskCount?: number;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    energyLevel?: 'low' | 'medium' | 'high';
    recentActions?: string[];
    upcomingEvents?: number;
    mood?: string;
  };
  userPersona?: 'executive' | 'parent' | 'builder' | 'mixed';
}

export interface CastResponse {
  message: string;
  tone: 'supportive' | 'neutral' | 'encouraging';
  confidence: number;
  breathPrompt?: {
    show: boolean;
    type: 'two-breath' | 'physiological-sigh';
    trigger: 'pre-effort' | 'post-stress';
  };
  microCelebration?: {
    show: boolean;
    type: 'progress-pulse' | 'completion-glow';
    message: string;
  };
  implementationIntention?: {
    show: boolean;
    ifThen: string;
  };
  becauseText: string;
  metadata: {
    castMembersActive: string[];
    decisionTrace: any;
    neurologyTiming: boolean;
    buddhismApplied: boolean;
    positivePsychFraming: boolean;
  };
}

class CastSynthesizer {
  private markAsEndUser = {
    name: 'Builder Mode',
    priorities: ['momentum', 'chaos-to-order', 'no-homework', 'fast-capture'],
    preferences: {
      brevity: true,
      inferContext: true,
      autoCommit: true,
      oneStepBetter: true
    }
  };

  private systemsArchitect = {
    name: 'Systems Architect',
    priorities: ['coherence', 'undo-always', 'idempotency', 'feature-flags'],
    patterns: {
      ensureUndo: true,
      flagGate: true,
      auditTrail: true,
      consistency: true
    }
  };

  private uiMaster = {
    name: 'UI Master',
    priorities: ['minimal', 'fast', 'accessible', 'progressive-disclosure'],
    constraints: {
      targetSize: '44px',
      dragFree: true,
      motionReduction: true,
      oneHandUse: true
    }
  };

  private uxMaster = {
    name: 'UX Master',
    priorities: ['fatigue-guard', 'one-step-better', 'progressive-disclosure'],
    patterns: {
      maxNudgesPerDay: 3,
      cooldownRespect: true,
      explainability: true,
      autonomySupport: true
    }
  };

  private clinicalPsych = {
    name: 'Clinical Psych (ND)',
    priorities: ['self-compassion', 'crisis-safety', 'evidence-based', 'rsd-aware'],
    language: {
      forbiddenPhrases: ['should', 'discipline', 'fail', 'lazy'],
      preferredPhrases: ['future-you', 'small wins', 'momentum comes in sips'],
      tone: 'compassionate-non-judgmental'
    }
  };

  private neurologist = {
    name: 'Neurologist',
    priorities: ['reward-prediction-error', 'working-memory-limits', 'dmn-awareness'],
    patterns: {
      microWins: true,
      focusBlocks: '25-45min',
      startCues: true,
      completionPulse: true,
      workingMemoryLimit: 4
    }
  };

  private buddhistNeuroscience = {
    name: 'Buddhist/Breathwork Expert',
    priorities: ['dmn-downregulation', 'physiological-sigh', 'metta-compassion'],
    practices: {
      twoBreathPrompts: true,
      exhaleEmphasis: true,
      preEffortBreath: true,
      metaMicroPrompts: true,
      sensoryAnchors: ['hand-on-chest', 'eyes-soften']
    }
  };

  private positivePsych = {
    name: 'Positive Psych (Seligman)',
    priorities: ['perma-lens', 'strengths-first', 'meaning-breadcrumbs'],
    frameworks: {
      permaMicroSignals: true,
      strengthsFraming: true,
      gratitudeProcess: true,
      meaningLinks: true
    }
  };

  async synthesizeResponse(input: CastInput): Promise<CastResponse> {
    const castMembersActive: string[] = [];
    let synthesizedMessage = '';
    let tone: 'supportive' | 'neutral' | 'encouraging' = 'supportive';
    let breathPrompt: CastResponse['breathPrompt'];
    let microCelebration: CastResponse['microCelebration'];
    let implementationIntention: CastResponse['implementationIntention'];
    let becauseText = '';

    // Mark-as-End-User: Fast, momentum-focused response
    if (this.shouldActivateMark(input)) {
      castMembersActive.push('Builder Mode');
      synthesizedMessage = this.applyMarkPerspective(input, synthesizedMessage);
    }

    // Clinical Psych: Self-compassion and safety
    if (this.shouldActivateClinicalPsych(input)) {
      castMembersActive.push('Clinical Psych');
      const clinicalInput = this.applyClinicalPsychPerspective(input, synthesizedMessage);
      synthesizedMessage = clinicalInput.message;
      tone = clinicalInput.tone;
    }

    // Neurologist: Timing and cognitive load
    if (this.shouldActivateNeurologist(input)) {
      castMembersActive.push('Neurologist');
      const neuroInput = this.applyNeurologistPerspective(input);
      microCelebration = neuroInput.microCelebration;
      becauseText = neuroInput.becauseText || becauseText;
    }

    // Buddhist/Breathwork: DMN down-regulation
    if (this.shouldActivateBuddhist(input)) {
      castMembersActive.push('Buddhist/Breathwork');
      breathPrompt = this.applyBuddhistPerspective(input);
    }

    // Positive Psych: PERMA framing
    if (this.shouldActivatePositivePsych(input)) {
      castMembersActive.push('Positive Psych');
      const positiveInput = this.applyPositivePsychPerspective(input, synthesizedMessage);
      synthesizedMessage = positiveInput.message;
      implementationIntention = positiveInput.implementationIntention;
    }

    // UX Master: Ensure explainability and fatigue protection
    if (this.shouldActivateUXMaster(input)) {
      castMembersActive.push('UX Master');
      becauseText = becauseText || this.generateBecauseText(input, castMembersActive);
    }

    // Systems Architect: Ensure traceability
    const decisionTrace = this.createDecisionTrace(input, castMembersActive);

    // Final message polish through assistant cohesion
    const polishedMessage = correctPersonaViolations(
      synthesizedMessage || this.getDefaultResponse(input),
      'general'
    );

    return {
      message: polishedMessage,
      tone,
      confidence: this.calculateConfidence(castMembersActive),
      breathPrompt,
      microCelebration,
      implementationIntention,
      becauseText,
      metadata: {
        castMembersActive,
        decisionTrace,
        neurologyTiming: castMembersActive.includes('Neurologist'),
        buddhismApplied: castMembersActive.includes('Buddhist/Breathwork'),
        positivePsychFraming: castMembersActive.includes('Positive Psych')
      }
    };
  }

  private shouldActivateMark(input: CastInput): boolean {
    // Activate for users wanting fast, momentum-focused interactions
    return input.userPersona === 'builder' || 
           input.messageText.length < 50 ||
           input.currentContext?.energyLevel === 'high';
  }

  private shouldActivateClinicalPsych(input: CastInput): boolean {
    // Always active for safety and compassion
    return true;
  }

  private shouldActivateNeurologist(input: CastInput): boolean {
    // Activate for cognitive load and timing concerns
    return input.currentContext?.taskCount && input.currentContext.taskCount > 5 ||
           input.currentContext?.timeOfDay === 'morning' ||
           input.messageText.includes('overwhelm') ||
           input.messageText.includes('stress');
  }

  private shouldActivateBuddhist(input: CastInput): boolean {
    // Activate for stress signals or pre-effort contexts  
    return (input.messageText.includes('anxious') ||
            input.messageText.includes('difficult') ||
            input.currentContext?.energyLevel === 'low');
  }

  private shouldActivatePositivePsych(input: CastInput): boolean {
    // Activate for goal-setting and meaning contexts
    return input.messageText.includes('goal') ||
           input.messageText.includes('plan') ||
           input.messageText.includes('why');
  }

  private shouldActivateUXMaster(input: CastInput): boolean {
    // Always active to ensure explainability
    return true;
  }

  private applyMarkPerspective(input: CastInput, current: string): string {
    // Fast, no-homework approach
    if (input.messageText.includes('add') || input.messageText.includes('create')) {
      return "Got it. Creating that now.";
    }
    if (input.messageText.includes('plan')) {
      return "I'll draft the next steps.";
    }
    return current || "Ready when you are.";
  }

  private applyClinicalPsychPerspective(input: CastInput, current: string): { message: string; tone: 'supportive' | 'neutral' | 'encouraging' } {
    // Self-compassion and non-judgmental language
    let message = current;
    
    // Replace shame language
    message = message.replace(/should/gi, 'could');
    message = message.replace(/fail/gi, 'learn');
    
    // Add self-compassion if stress detected
    if (input.messageText.includes('behind') || input.messageText.includes('late')) {
      message = "Momentum comes in sips, not gulps. " + message;
    }

    return {
      message: message || "I understand. How can I support you with that?",
      tone: 'supportive'
    };
  }

  private applyNeurologistPerspective(input: CastInput): { microCelebration?: CastResponse['microCelebration']; becauseText?: string } {
    const result: { microCelebration?: CastResponse['microCelebration']; becauseText?: string } = {};

    // Reward prediction error - micro wins
    if (input.messageText.includes('done') || input.messageText.includes('complete')) {
      result.microCelebration = {
        show: true,
        type: 'completion-glow',
        message: 'Progress made'
      };
    }

    // Working memory limits - simplify if complex
    if (input.currentContext?.taskCount && input.currentContext.taskCount > 4) {
      result.becauseText = 'Focusing on fewer items helps working memory.';
    }

    return result;
  }

  private applyBuddhistPerspective(input: CastInput): CastResponse['breathPrompt'] {
    // Two-breath prompts before effortful tasks
    if (input.messageText.includes('difficult') || input.messageText.includes('hard')) {
      return {
        show: true,
        type: 'two-breath',
        trigger: 'pre-effort'
      };
    }

    // Physiological sigh for stress
    if (input.messageText.includes('stress') || input.messageText.includes('overwhelm')) {
      return {
        show: true,
        type: 'physiological-sigh',
        trigger: 'post-stress'
      };
    }

    return undefined;
  }

  private applyPositivePsychPerspective(input: CastInput, current: string): { message: string; implementationIntention?: CastResponse['implementationIntention'] } {
    let message = current;

    // PERMA framing - meaning breadcrumbs
    if (input.messageText.includes('why') || input.messageText.includes('meaning')) {
      message = message + " This connects to what matters to you.";
    }

    // Strengths-first approach
    if (input.messageText.includes('plan') || input.messageText.includes('goal')) {
      return {
        message: message || "Building on your strengths, here's what we could try.",
        implementationIntention: {
          show: true,
          ifThen: "If you feel stuck, then break it into a 5-minute step."
        }
      };
    }

    return { message: message || current };
  }

  private generateBecauseText(input: CastInput, activeMembers: string[]): string {
    // UX Master ensures explainability
    if (activeMembers.includes('Neurologist')) {
      return 'Based on your current cognitive load and energy patterns.';
    }
    if (activeMembers.includes('Clinical Psych')) {
      return 'Approaching this with self-compassion tends to work better.';
    }
    return 'This timing feels right for a gentle nudge.';
  }

  private createDecisionTrace(input: CastInput, activeMembers: string[]): any {
    return {
      id: `cast-${Date.now()}`,
      input: {
        messageLength: input.messageText.length,
        context: input.currentContext,
        persona: input.userPersona
      },
      castMembersActivated: activeMembers,
      timestamp: Date.now(),
      revertHook: () => console.log('Cast decision reverted')
    };
  }

  private calculateConfidence(activeMembers: string[]): number {
    // Higher confidence with more Cast member consensus
    const baseConfidence = 0.7;
    const memberBoost = activeMembers.length * 0.05;
    return Math.min(0.95, baseConfidence + memberBoost);
  }

  private getDefaultResponse(input: CastInput): string {
    // Clinical Psych default - always compassionate
    return "I'm here to help. What would feel most supportive right now?";
  }

  // Executive user patterns
  getExecutiveOptimization(input: CastInput): string[] {
    return [
      'meeting-triage',
      'focus-auto-slot', 
      'draft-recap',
      'time-saved-report'
    ];
  }

  // Parent user patterns  
  getParentOptimization(input: CastInput): string[] {
    return [
      'batch-chores',
      'school-calendar-sync',
      'quiet-hours-respect',
      'energy-window-learning'
    ];
  }
}

export const castSynthesizer = new CastSynthesizer();