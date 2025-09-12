/**
 * Persona Orchestration Service - P18 Cast System
 * Evidence-based guidance choreography with autonomy preservation
 */

import { isFeatureEnabled } from '@/config/flags';
import { userContextService } from './userContextService';
import { progressiveOnboardingService } from './progressiveOnboardingService';
import { useBubbleStore } from '@/stores/bubbleStore';
import { 
  PersonaId, 
  PersonaResponse, 
  PersonaContext, 
  PersonaConfig, 
  PersonaInteraction,
  PersonaActivation 
} from '@/types/persona';

// Evidence-backed persona configurations
const PERSONA_CONFIGS: PersonaConfig[] = [
  {
    id: 'coach_autonomy',
    name: 'Coach Autonomy',
    description: 'SDT-based motivation with choice preservation',
    personality: 'Warm, curious, non-pushy; speaks in options',
    evidenceAnchors: ['Self-Determination Theory', 'WOOP', 'Implementation intentions'],
    activationPatterns: ['goal_setting', 'motivation_drop', 'choice_paralysis'],
    defaultCooldownMinutes: 120,
    respectsAutonomy: true,
    canBeDisabled: true
  },
  {
    id: 'dr_seligman',
    name: 'Dr. Seligman',
    description: 'PERMA positive psychology strategist',
    personality: 'Encouraging, never saccharine',
    evidenceAnchors: ['PERMA model', 'UPenn practice programs', 'Positive emotion research'],
    activationPatterns: ['wellbeing_opportunity', 'accomplishment_moment', 'relationship_cue'],
    defaultCooldownMinutes: 240,
    respectsAutonomy: true,
    canBeDisabled: true
  },
  {
    id: 'dr_anila',
    name: 'Dr. Anila',
    description: 'Contemplative neuroscientist for attention training',
    personality: 'Even-keeled, precise; gives 60-120s nudges',
    evidenceAnchors: ['DMN research', 'Mindfulness meta-analysis', 'Attention networks'],
    activationPatterns: ['rumination_detected', 'attention_drift', 'focus_needed'],
    defaultCooldownMinutes: 60,
    respectsAutonomy: true,
    canBeDisabled: true
  },
  {
    id: 'sous_chef',
    name: 'The Sous-Chef',
    description: 'Detail prep without drag',
    personality: 'Discreet, fast, never pedantic',
    evidenceAnchors: ['Implementation intentions', 'Cognitive load theory'],
    activationPatterns: ['complex_task', 'preparation_needed', 'detail_overwhelm'],
    defaultCooldownMinutes: 30,
    respectsAutonomy: true,
    canBeDisabled: true
  },
  {
    id: 'dr_rhea',
    name: 'Dr. Rhea',
    description: '2e/ND support specialist',
    personality: 'Protective, blunt-kind',
    evidenceAnchors: ['Twice-exceptional research', 'Strengths-based approaches'],
    activationPatterns: ['overwhelm_spike', 'strength_opportunity', 'friction_detected'],
    defaultCooldownMinutes: 180,
    respectsAutonomy: true,
    canBeDisabled: true
  }
];

class PersonaOrchestrationService {
  private interactionHistory: PersonaInteraction[] = [];
  private activePersonas: Set<PersonaId> = new Set();
  private cooldowns: Map<PersonaId, number> = new Map();

  /**
   * Main orchestration method - determines which personas should activate
   */
  async orchestrate(trigger: string, context?: any): Promise<PersonaResponse[]> {
    if (!isFeatureEnabled('personaOrchestration')) {
      return [];
    }

    try {
      const personaContext = await this.buildPersonaContext(trigger, context);
      const candidatePersonas = await this.identifyCandidatePersonas(trigger, personaContext);
      const responses: PersonaResponse[] = [];

      for (const activation of candidatePersonas) {
        if (this.shouldActivatePersona(activation.personaId, personaContext)) {
          const response = await this.generatePersonaResponse(activation, personaContext);
          if (response) {
            responses.push(response);
            this.recordActivation(activation.personaId, trigger);
          }
        }
      }

      return this.prioritizeResponses(responses, personaContext);
    } catch (error) {
      console.error('Persona orchestration error:', error);
      return [];
    }
  }

  /**
   * Handle user interaction with persona suggestion
   */
  async handlePersonaInteraction(
    personaId: PersonaId,
    interaction: 'engaged' | 'dismissed' | 'deferred',
    actionTaken?: string,
    helpfulnessRating?: number
  ): Promise<void> {
    const record: PersonaInteraction = {
      personaId,
      timestamp: Date.now(),
      trigger: 'user_interaction',
      response: interaction,
      actionTaken,
      helpfulnessRating
    };

    this.interactionHistory.push(record);
    
    // Apply cooldown based on interaction
    if (interaction === 'dismissed') {
      this.applyCooldown(personaId, 240); // 4 hour cooldown for dismissal
    } else if (interaction === 'deferred') {
      this.applyCooldown(personaId, 60); // 1 hour for defer
    }

    // Store interaction for learning
    this.persistInteractionHistory();
  }

  /**
   * Get persona-specific communication style for existing systems
   */
  getPersonaCommunicationStyle(personaId: PersonaId): string {
    const config = PERSONA_CONFIGS.find(p => p.id === personaId);
    if (!config) return 'friend';

    // Map personas to existing tone system
    switch (personaId) {
      case 'coach_autonomy':
        return 'coach';
      case 'dr_seligman':
      case 'dr_anila':
      case 'dr_anand':
      case 'dr_rhea':
        return 'scientist';
      case 'sous_chef':
      case 'planner_kernel':
        return 'future-you';
      default:
        return 'friend';
    }
  }

  /**
   * Check if user has disabled specific persona
   */
  isPersonaEnabled(personaId: PersonaId): boolean {
    const disabledPersonas = JSON.parse(
      localStorage.getItem('disabledPersonas') || '[]'
    );
    return !disabledPersonas.includes(personaId);
  }

  /**
   * Enable/disable specific persona
   */
  setPersonaEnabled(personaId: PersonaId, enabled: boolean): void {
    const disabledPersonas = JSON.parse(
      localStorage.getItem('disabledPersonas') || '[]'
    );
    
    if (enabled) {
      const filtered = disabledPersonas.filter((id: PersonaId) => id !== personaId);
      localStorage.setItem('disabledPersonas', JSON.stringify(filtered));
    } else {
      if (!disabledPersonas.includes(personaId)) {
        disabledPersonas.push(personaId);
        localStorage.setItem('disabledPersonas', JSON.stringify(disabledPersonas));
      }
    }
  }

  // Private methods

  private async buildPersonaContext(trigger: string, context?: any): Promise<PersonaContext> {
    const userContext = await userContextService.getUserContext();
    const now = new Date();

    return {
      userId: 'current_user', // TODO: Get from auth
      currentTask: context?.task,
      userContext,
      timeContext: {
        timeOfDay: this.getTimeOfDay(now),
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        mood: context?.mood || 'neutral'
      },
      recentInteractions: this.getRecentInteractions(60), // Last hour
      privacyLayer: userContext.preferences.privacyLayer || 'context',
      autonomyPreferences: {
        nudgeFrequency: userContext.preferences.nudgeFrequency || 'occasional',
        interventionStyle: userContext.preferences.interventionStyle || 'suggest',
        respectQuietHours: true
      }
    };
  }

  private async identifyCandidatePersonas(
    trigger: string, 
    context: PersonaContext
  ): Promise<PersonaActivation[]> {
    const candidates: PersonaActivation[] = [];

    for (const config of PERSONA_CONFIGS) {
      if (!this.isPersonaEnabled(config.id)) continue;

      const confidence = this.calculateActivationConfidence(config, trigger, context);
      
      if (confidence > 0.3) { // Minimum threshold
        candidates.push({
          personaId: config.id,
          trigger,
          confidence,
          contextFactors: this.extractContextFactors(config, context),
          evidenceAnchors: config.evidenceAnchors
        });
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  private calculateActivationConfidence(
    config: PersonaConfig,
    trigger: string,
    context: PersonaContext
  ): number {
    let confidence = 0;

    // Pattern matching
    for (const pattern of config.activationPatterns) {
      if (trigger.toLowerCase().includes(pattern.toLowerCase())) {
        confidence += 0.4;
      }
    }

    // User context relevance
    if (config.id === 'dr_rhea' && context.userContext.patterns.some(p => 
      p.key.includes('neurodivergent') || p.key.includes('2e'))) {
      confidence += 0.3;
    }

    // Time-based factors
    if (config.id === 'dr_anila' && 
        (context.timeContext.timeOfDay === 'morning' || context.timeContext.timeOfDay === 'evening')) {
      confidence += 0.2;
    }

    // Recent interaction penalty
    const recentInteraction = context.recentInteractions.find(i => i.personaId === config.id);
    if (recentInteraction && recentInteraction.response === 'dismissed') {
      confidence -= 0.5;
    }

    return Math.min(confidence, 1.0);
  }

  private shouldActivatePersona(personaId: PersonaId, context: PersonaContext): boolean {
    // Check cooldown
    const cooldownEnd = this.cooldowns.get(personaId) || 0;
    if (Date.now() < cooldownEnd) return false;

    // Check quiet hours
    if (context.autonomyPreferences.respectQuietHours) {
      const hour = new Date().getHours();
      if (hour < 7 || hour > 22) return false;
    }

    // Check frequency preferences
    const recentCount = context.recentInteractions
      .filter(i => i.personaId === personaId && i.timestamp > Date.now() - 24 * 60 * 60 * 1000)
      .length;

    const maxDaily = context.autonomyPreferences.nudgeFrequency === 'minimal' ? 1 :
                     context.autonomyPreferences.nudgeFrequency === 'occasional' ? 3 : 6;

    return recentCount < maxDaily;
  }

  private async generatePersonaResponse(
    activation: PersonaActivation,
    context: PersonaContext
  ): Promise<PersonaResponse | null> {
    const config = PERSONA_CONFIGS.find(p => p.id === activation.personaId);
    if (!config) return null;

    // Generate contextual response based on persona
    switch (config.id) {
      case 'coach_autonomy':
        return this.generateCoachAutonomyResponse(activation, context);
      case 'dr_seligman':
        return this.generateSeligmanResponse(activation, context);
      case 'dr_anila':
        return this.generateAnilaResponse(activation, context);
      case 'sous_chef':
        return this.generateSousChefResponse(activation, context);
      case 'dr_rhea':
        return this.generateRheaResponse(activation, context);
      default:
        return null;
    }
  }

  private generateCoachAutonomyResponse(
    activation: PersonaActivation, 
    context: PersonaContext
  ): PersonaResponse {
    return {
      personaId: 'coach_autonomy',
      message: "Would you rather break this into smaller steps, or tackle it all at once?",
      actionOptions: [
        { id: 'break_down', label: 'Break it down', type: 'accept', undoable: true },
        { id: 'all_at_once', label: 'All at once', type: 'accept', undoable: true },
        { id: 'not_now', label: 'Not now', type: 'decline', undoable: false }
      ],
      becauseText: "Choice preserves motivation (Self-Determination Theory)",
      canDismiss: true,
      cooldownMinutes: 120
    };
  }

  private generateSeligmanResponse(
    activation: PersonaActivation,
    context: PersonaContext
  ): PersonaResponse {
    const permaOptions = [
      "Text thanks to a collaborator?",
      "Use your strengths for this task?",
      "Connect this to your bigger purpose?"
    ];
    
    const randomOption = permaOptions[Math.floor(Math.random() * permaOptions.length)];

    return {
      personaId: 'dr_seligman',
      message: randomOption,
      actionOptions: [
        { id: 'perma_yes', label: 'Yes, good idea', type: 'accept', undoable: true },
        { id: 'perma_later', label: 'Maybe later', type: 'defer', undoable: false }
      ],
      becauseText: "PERMA elements boost wellbeing when woven into daily tasks",
      canDismiss: true,
      cooldownMinutes: 240
    };
  }

  private generateAnilaResponse(
    activation: PersonaActivation,
    context: PersonaContext
  ): PersonaResponse {
    return {
      personaId: 'dr_anila',
      message: "Mind wandering detected. Try 4-7-8 breathing to reset attention?",
      actionOptions: [
        { id: 'breath_reset', label: '60s breathing', type: 'accept', undoable: false },
        { id: 'keep_wandering', label: 'Keep wandering', type: 'decline', undoable: false }
      ],
      becauseText: "Exhale-weighted breathing reduces default mode network activity",
      canDismiss: true,
      cooldownMinutes: 60
    };
  }

  private generateSousChefResponse(
    activation: PersonaActivation,
    context: PersonaContext
  ): PersonaResponse {
    return {
      personaId: 'sous_chef',
      message: "I've prepped 3 sub-steps for this task. Pull them in?",
      actionOptions: [
        { id: 'show_substeps', label: 'Show steps', type: 'accept', undoable: true },
        { id: 'hide_substeps', label: 'Keep hidden', type: 'decline', undoable: false }
      ],
      becauseText: "Pre-chopped details reduce cognitive load during execution",
      canDismiss: true,
      cooldownMinutes: 30
    };
  }

  private generateRheaResponse(
    activation: PersonaActivation,
    context: PersonaContext
  ): PersonaResponse {
    return {
      personaId: 'dr_rhea',
      message: "Sensing overwhelm. Try a 2-minute start instead?",
      actionOptions: [
        { id: 'micro_start', label: '2-minute version', type: 'modify', undoable: true },
        { id: 'voice_capture', label: 'Voice note instead', type: 'modify', undoable: true },
        { id: 'full_task', label: 'Continue as planned', type: 'decline', undoable: false }
      ],
      becauseText: "Strengths-first approach reduces shame triggers",
      canDismiss: true,
      cooldownMinutes: 180
    };
  }

  private prioritizeResponses(responses: PersonaResponse[], context: PersonaContext): PersonaResponse[] {
    // Limit to max 2 responses to avoid overwhelm
    return responses.slice(0, 2);
  }

  private recordActivation(personaId: PersonaId, trigger: string): void {
    this.activePersonas.add(personaId);
    const config = PERSONA_CONFIGS.find(p => p.id === personaId);
    if (config) {
      this.applyCooldown(personaId, config.defaultCooldownMinutes);
    }
  }

  private applyCooldown(personaId: PersonaId, minutes: number): void {
    this.cooldowns.set(personaId, Date.now() + (minutes * 60 * 1000));
  }

  private getRecentInteractions(minutesBack: number): PersonaInteraction[] {
    const cutoff = Date.now() - (minutesBack * 60 * 1000);
    return this.interactionHistory.filter(i => i.timestamp > cutoff);
  }

  private getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    if (hour < 6) return 'late night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  private extractContextFactors(config: PersonaConfig, context: PersonaContext): string[] {
    // Extract relevant context factors for this persona
    return [context.timeContext.timeOfDay, context.timeContext.mood || 'neutral'];
  }

  private persistInteractionHistory(): void {
    // Keep only last 100 interactions
    const recent = this.interactionHistory.slice(-100);
    localStorage.setItem('personaInteractions', JSON.stringify(recent));
  }

  private loadInteractionHistory(): void {
    try {
      const stored = localStorage.getItem('personaInteractions');
      if (stored) {
        this.interactionHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load persona interaction history:', error);
    }
  }
}

export const personaOrchestrationService = new PersonaOrchestrationService();
