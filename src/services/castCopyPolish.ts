/**
 * Cast-Informed Copy Polish - Unified voice with expert-backed language
 * Replaces persona-specific copy with cohesive assistant voice
 */

import { correctPersonaViolations } from '@/utils/assistantCohesion';

interface CopyContext {
  situation: 'encouragement' | 'guidance' | 'celebration' | 'error' | 'explanation' | 'planning';
  userPersona?: 'executive' | 'parent' | 'builder' | 'mixed';
  energyLevel?: 'low' | 'medium' | 'high';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  urgency?: 'low' | 'medium' | 'high';
}

interface CastPolishedCopy {
  message: string;
  tone: 'supportive' | 'neutral' | 'encouraging';
  castInfluences: string[];
  becauseText?: string;
}

class CastCopyPolishService {
  private clinicalPsychPhrases = {
    selfCompassion: [
      "Momentum comes in sips, not gulps.",
      "This is how progress actually works.",
      "You're exactly where you need to be right now.",
      "Small steps count more than perfect plans.",
      "Being gentle with yourself isn't giving up."
    ],
    rsdAware: [
      "No judgment here - just next steps.",
      "This isn't about you as a person.",
      "Progress isn't linear, and that's completely normal.",
      "Your effort matters, regardless of the outcome."
    ]
  };

  private neurologistPhrases = {
    workingMemory: [
      "Let's focus on just this one thing.",
      "Breaking this down makes it easier to process.",
      "Your brain works better with clear, simple steps.",
      "One task at a time prevents cognitive overload."
    ],
    rewardPrediction: [
      "You'll feel the satisfaction as soon as this is done.",
      "Each small completion builds momentum.",
      "Your brain will thank you for this clear win.",
      "Progress feels good - and you're about to feel it."
    ]
  };

  private buddhistPhrases = {
    presence: [
      "Right here, right now, this is what matters.",
      "Breathe. Center. Continue.",
      "This moment is enough.",
      "Find stillness in the movement."
    ],
    compassion: [
      "May this bring you ease.",
      "Wishing you peace with this process.",
      "Be kind to yourself as you work through this.",
      "Gentle persistence opens doors."
    ]
  };

  private positivePsychPhrases = {
    perma: [
      "This connects to what brings you meaning.",
      "Building on your natural strengths here.",
      "Each step increases your sense of accomplishment.",
      "This contributes to your larger purpose."
    ],
    growth: [
      "You're developing mastery through practice.",
      "This challenge is growing your capabilities.",
      "Every attempt teaches you something valuable.",
      "Your skills are expanding with each effort."
    ]
  };

  private executivePhrases = [
    "This saves you time later.",
    "Clear next action: ",
    "ROI on this effort: ",
    "Efficiency gain: ",
    "Strategic value: "
  ];

  private parentPhrases = [
    "One less thing to worry about.",
    "This makes tomorrow easier.",
    "Gentle progress counts.",
    "You're modeling resilience.",
    "Family time protected by getting this done."
  ];

  private builderPhrases = [
    "Chaos becoming order.",
    "Building momentum with this.",
    "Creating something from nothing.",
    "The satisfaction of making progress.",
    "Shipping beats perfecting."
  ];

  polishCopy(
    originalText: string, 
    context: CopyContext
  ): CastPolishedCopy {
    let polishedMessage = originalText;
    const castInfluences: string[] = [];
    let tone: 'supportive' | 'neutral' | 'encouraging' = 'supportive';

    // Always apply Clinical Psych (safety and compassion)
    polishedMessage = this.applyClinicalPsychPolish(polishedMessage, context);
    castInfluences.push('Clinical Psych');

    // Apply Neurologist for cognitive load considerations
    if (this.shouldApplyNeurologist(context)) {
      polishedMessage = this.applyNeurologistPolish(polishedMessage, context);
      castInfluences.push('Neurologist');
    }

    // Apply Buddhist for stress/fatigue situations
    if (this.shouldApplyBuddhist(context)) {
      polishedMessage = this.applyBuddhistPolish(polishedMessage, context);
      castInfluences.push('Buddhist/Breathwork');
    }

    // Apply Positive Psych for goal/planning contexts
    if (this.shouldApplyPositivePsych(context)) {
      polishedMessage = this.applyPositivePsychPolish(polishedMessage, context);
      castInfluences.push('Positive Psych');
      tone = 'encouraging';
    }

    // Apply user persona adaptations
    polishedMessage = this.applyPersonaAdaptation(polishedMessage, context);

    // Final persona violation cleanup
    polishedMessage = correctPersonaViolations(polishedMessage, 'general');

    return {
      message: polishedMessage,
      tone,
      castInfluences,
      becauseText: this.generateBecauseText(context, castInfluences)
    };
  }

  private applyClinicalPsychPolish(text: string, context: CopyContext): string {
    let result = text;

    // Remove shame language
    result = result.replace(/\b(should|must|need to|have to)\b/gi, 'could');
    result = result.replace(/\b(failed?|failing)\b/gi, 'learning');
    result = result.replace(/\b(lazy|procrastinating)\b/gi, 'taking time');
    result = result.replace(/\b(behind|late)\b/gi, 'progressing at your pace');

    // Add self-compassion for error contexts
    if (context.situation === 'error') {
      const compassionPhrase = this.getRandomPhrase(this.clinicalPsychPhrases.selfCompassion);
      result = `${compassionPhrase} ${result}`;
    }

    // RSD-aware language for sensitive contexts
    if (context.energyLevel === 'low' || context.situation === 'guidance') {
      const rsaPhrase = this.getRandomPhrase(this.clinicalPsychPhrases.rsdAware);
      result = `${rsaPhrase} ${result}`;
    }

    return result;
  }

  private applyNeurologistPolish(text: string, context: CopyContext): string {
    let result = text;

    // Working memory considerations
    if (text.includes('list') || text.includes('multiple') || text.includes('several')) {
      const memoryPhrase = this.getRandomPhrase(this.neurologistPhrases.workingMemory);
      result = `${memoryPhrase} ${result}`;
    }

    // Reward prediction error for completion contexts
    if (context.situation === 'celebration' || context.situation === 'encouragement') {
      const rewardPhrase = this.getRandomPhrase(this.neurologistPhrases.rewardPrediction);
      result = `${result} ${rewardPhrase}`;
    }

    return result;
  }

  private applyBuddhistPolish(text: string, context: CopyContext): string {
    let result = text;

    // Presence for overwhelming contexts
    if (context.energyLevel === 'low' || context.urgency === 'high') {
      const presencePhrase = this.getRandomPhrase(this.buddhistPhrases.presence);
      result = `${presencePhrase} ${result}`;
    }

    // Compassion for guidance and errors
    if (context.situation === 'guidance' || context.situation === 'error') {
      const compassionPhrase = this.getRandomPhrase(this.buddhistPhrases.compassion);
      result = `${result} ${compassionPhrase}`;
    }

    return result;
  }

  private applyPositivePsychPolish(text: string, context: CopyContext): string {
    let result = text;

    // PERMA framing for planning
    if (context.situation === 'planning' || context.situation === 'explanation') {
      const permaPhrase = this.getRandomPhrase(this.positivePsychPhrases.perma);
      result = `${result} ${permaPhrase}`;
    }

    // Growth mindset for challenges
    if (context.situation === 'guidance' && context.urgency !== 'low') {
      const growthPhrase = this.getRandomPhrase(this.positivePsychPhrases.growth);
      result = `${result} ${growthPhrase}`;
    }

    return result;
  }

  private applyPersonaAdaptation(text: string, context: CopyContext): string {
    if (!context.userPersona) return text;

    let adaptation = '';

    switch (context.userPersona) {
      case 'executive':
        adaptation = this.getRandomPhrase(this.executivePhrases);
        break;
      case 'parent':
        adaptation = this.getRandomPhrase(this.parentPhrases);
        break;
      case 'builder':
        adaptation = this.getRandomPhrase(this.builderPhrases);
        break;
    }

    return adaptation ? `${adaptation} ${text}` : text;
  }

  private shouldApplyNeurologist(context: CopyContext): boolean {
    return context.situation === 'planning' || 
           context.situation === 'guidance' ||
           context.energyLevel === 'low';
  }

  private shouldApplyBuddhist(context: CopyContext): boolean {
    return context.energyLevel === 'low' ||
           context.urgency === 'high' ||
           context.situation === 'error';
  }

  private shouldApplyPositivePsych(context: CopyContext): boolean {
    return context.situation === 'planning' ||
           context.situation === 'celebration' ||
           context.situation === 'encouragement';
  }

  private getRandomPhrase(phrases: string[]): string {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  private generateBecauseText(context: CopyContext, influences: string[]): string {
    if (influences.includes('Buddhist/Breathwork')) {
      return 'Gentle approaches tend to work better when energy is low.';
    }
    if (influences.includes('Neurologist')) {
      return 'Breaking things down helps your brain process them more easily.';
    }
    if (influences.includes('Positive Psych')) {
      return 'This connects to your larger goals and values.';
    }
    return 'This timing feels right for moving forward.';
  }

  // Quick copy generation for common scenarios
  getEncouragement(context: CopyContext): CastPolishedCopy {
    const baseMessage = "You're making progress. Keep going.";
    return this.polishCopy(baseMessage, { ...context, situation: 'encouragement' });
  }

  getCelebration(context: CopyContext): CastPolishedCopy {
    const baseMessage = "Nice work on completing that.";
    return this.polishCopy(baseMessage, { ...context, situation: 'celebration' });
  }

  getGuidance(context: CopyContext): CastPolishedCopy {
    const baseMessage = "Here's what might help with this.";
    return this.polishCopy(baseMessage, { ...context, situation: 'guidance' });
  }

  getErrorHelp(context: CopyContext): CastPolishedCopy {
    const baseMessage = "This didn't work as expected. Let's try a different approach.";
    return this.polishCopy(baseMessage, { ...context, situation: 'error' });
  }
}

export const castCopyPolish = new CastCopyPolishService();
export type { CopyContext, CastPolishedCopy };