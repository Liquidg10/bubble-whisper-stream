/**
 * P4 - Contemplative Neuroscience Integration
 * Evidence-based meditation, breathing techniques, and DMN monitoring
 */

import { behavioralScienceEngine } from './behavioralScienceEngine';
import { logger } from '@/utils/logger';

export interface DMNActivity {
  level: number; // 0-1, higher = more default mode activity
  indicators: string[];
  confidence: number;
  timestamp: number;
  suggestedIntervention?: AttentionIntervention;
}

export interface AttentionIntervention {
  type: 'physiological_sigh' | 'focused_breathing' | 'body_scan' | 'mindful_transition' | 'open_monitoring';
  duration: number; // seconds
  instructions: string[];
  evidenceBasis: string;
  contraindications?: string[];
}

export interface BreathingSession {
  technique: string;
  duration: number;
  completed: boolean;
  effectiveness?: number; // 0-1, user-reported or inferred
  timestamp: number;
  context: {
    preMood?: number;
    postMood?: number;
    stressLevel?: number;
    attentionState?: string;
  };
}

export interface MeditationTechnique {
  name: string;
  category: 'concentration' | 'mindfulness' | 'loving_kindness' | 'body_awareness';
  duration: number[];
  instructions: string[];
  evidenceBasis: string;
  suitableFor: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

class ContemplativeNeuroscience {
  private dmnHistory: DMNActivity[] = [];
  private breathingSessions: BreathingSession[] = [];
  private techniques: MeditationTechnique[] = [];
  private lastInterventionTime: number = 0;
  private interventionCooldown: number = 3600000; // 1 hour

  constructor() {
    this.initializeTechniques();
  }

  private initializeTechniques(): void {
    this.techniques = [
      {
        name: 'Physiological Sigh',
        category: 'concentration',
        duration: [60, 120],
        instructions: [
          'Double inhale through nose (short, then long)',
          'Long exhale through mouth',
          'Repeat 1-3 times as needed'
        ],
        evidenceBasis: 'Huberman Lab: Rapid stress reduction via vagal activation',
        suitableFor: ['stress', 'transition', 'quick_reset'],
        difficulty: 'beginner'
      },
      {
        name: 'Box Breathing',
        category: 'concentration',
        duration: [180, 300, 600],
        instructions: [
          'Inhale for 4 counts',
          'Hold for 4 counts',
          'Exhale for 4 counts',
          'Hold empty for 4 counts',
          'Repeat cycle'
        ],
        evidenceBasis: 'Navy SEAL technique: Autonomic nervous system regulation',
        suitableFor: ['focus', 'anxiety', 'performance'],
        difficulty: 'beginner'
      },
      {
        name: 'Extended Exhale',
        category: 'mindfulness',
        duration: [300, 600],
        instructions: [
          'Natural inhale',
          'Exhale twice as long as inhale',
          'No forcing, find natural rhythm',
          'Notice the pause after exhale'
        ],
        evidenceBasis: 'Parasympathetic activation research',
        suitableFor: ['relaxation', 'sleep_prep', 'overwhelm'],
        difficulty: 'beginner'
      },
      {
        name: 'Mindful Body Scan',
        category: 'body_awareness',
        duration: [600, 900, 1200],
        instructions: [
          'Start with feet, notice sensations',
          'Move systematically up the body',
          'No judgment, just observation',
          'Include areas of tension or ease'
        ],
        evidenceBasis: 'MBSR research: Reduced rumination and increased interoception',
        suitableFor: ['stress', 'body_awareness', 'grounding'],
        difficulty: 'intermediate'
      },
      {
        name: 'Open Monitoring',
        category: 'mindfulness',
        duration: [600, 1200, 1800],
        instructions: [
          'Sit comfortably, eyes closed',
          'Notice whatever arises in awareness',
          'Don\'t follow thoughts, just note "thinking"',
          'Return to open awareness'
        ],
        evidenceBasis: 'Default Mode Network deactivation studies',
        suitableFor: ['creativity', 'spaciousness', 'rumination'],
        difficulty: 'advanced'
      }
    ];
  }

  // DMN Monitoring & Detection
  assessDMNActivity(
    taskSwitches: number,
    timeOnTask: number,
    thoughtContent?: string,
    rumination?: boolean
  ): DMNActivity {
    const indicators: string[] = [];
    let level = 0.5; // Baseline

    // High task switching indicates DMN dominance
    if (taskSwitches > 5) {
      level += 0.3;
      indicators.push('high_task_switching');
    }

    // Very short time on task
    if (timeOnTask < 60000) { // Less than 1 minute
      level += 0.2;
      indicators.push('short_attention_span');
    }

    // Rumination detection
    if (rumination) {
      level += 0.4;
      indicators.push('rumination_detected');
    }

    // Content analysis for DMN patterns
    if (thoughtContent) {
      const dmnKeywords = ['worry', 'what if', 'should have', 'always', 'never', 'why me'];
      const hasRuminativeContent = dmnKeywords.some(keyword =>
        thoughtContent.toLowerCase().includes(keyword)
      );
      
      if (hasRuminativeContent) {
        level += 0.3;
        indicators.push('ruminative_content');
      }
    }

    // Mind-wandering to past/future
    const currentActivity = behavioralScienceEngine.getNeuromodulatorContext();
    if (currentActivity.noradrenergineLevel > 0.7) {
      level += 0.2;
      indicators.push('high_stress_activation');
    }

    level = Math.min(1, level);
    const confidence = indicators.length > 0 ? Math.min(1, indicators.length * 0.3) : 0.3;

    const dmn: DMNActivity = {
      level,
      indicators,
      confidence,
      timestamp: Date.now()
    };

    // Suggest intervention if appropriate
    if (level > 0.7 && this.shouldOfferIntervention()) {
      dmn.suggestedIntervention = this.selectIntervention(indicators, currentActivity);
    }

    this.dmnHistory.push(dmn);
    this.trimHistory();

    logger.debug('DMN activity assessed', { level, indicators, confidence });
    
    return dmn;
  }

  private shouldOfferIntervention(): boolean {
    const timeSinceLastIntervention = Date.now() - this.lastInterventionTime;
    return timeSinceLastIntervention > this.interventionCooldown;
  }

  private selectIntervention(
    indicators: string[], 
    neuroContext: any
  ): AttentionIntervention {
    // Select technique based on indicators and context
    if (indicators.includes('high_stress_activation') || neuroContext.noradrenergineLevel > 0.8) {
      return {
        type: 'physiological_sigh',
        duration: 60,
        instructions: [
          'Take a double inhale through your nose',
          'Short inhale, then a longer deeper inhale',
          'Long exhale through your mouth',
          'Repeat 1-3 times as feels right'
        ],
        evidenceBasis: 'Rapid autonomic reset via parasympathetic activation'
      };
    }

    if (indicators.includes('rumination_detected') || indicators.includes('ruminative_content')) {
      return {
        type: 'focused_breathing',
        duration: 180,
        instructions: [
          'Focus on natural breath rhythm',
          'Count breaths from 1 to 10',
          'When mind wanders, gently return to 1',
          'No judgment, just gentle redirection'
        ],
        evidenceBasis: 'Concentration practice reduces rumination',
        contraindications: ['severe_anxiety']
      };
    }

    if (indicators.includes('high_task_switching')) {
      return {
        type: 'mindful_transition',
        duration: 30,
        instructions: [
          'Pause whatever you\'re doing',
          'Take three conscious breaths',
          'Notice where you are and what you\'re doing',
          'Choose your next action intentionally'
        ],
        evidenceBasis: 'Mindful transitions improve focus continuity'
      };
    }

    // Default to simple breathing reset
    return {
      type: 'focused_breathing',
      duration: 120,
      instructions: [
        'Find your natural breath rhythm',
        'Breathe normally, just pay attention',
        'When mind wanders, return to breath',
        'No need to change anything'
      ],
      evidenceBasis: 'Basic mindfulness training'
    };
  }

  // Breathing Session Management
  startBreathingSession(techniqueId: string, context?: Partial<BreathingSession['context']>): BreathingSession {
    const technique = this.techniques.find(t => t.name === techniqueId);
    if (!technique) {
      throw new Error(`Unknown technique: ${techniqueId}`);
    }

    const session: BreathingSession = {
      technique: techniqueId,
      duration: technique.duration[0], // Start with shortest duration
      completed: false,
      timestamp: Date.now(),
      context: context || {}
    };

    this.breathingSessions.push(session);
    this.lastInterventionTime = Date.now();

    logger.debug('Breathing session started', { technique: techniqueId, duration: session.duration });
    
    return session;
  }

  completeBreathingSession(sessionId: number, effectiveness?: number, postMood?: number): void {
    const session = this.breathingSessions[sessionId];
    if (!session) return;

    session.completed = true;
    session.effectiveness = effectiveness;
    if (postMood !== undefined) {
      session.context.postMood = postMood;
    }

    // Update intervention cooldown based on effectiveness
    if (effectiveness !== undefined) {
      if (effectiveness > 0.7) {
        this.interventionCooldown = Math.max(1800000, this.interventionCooldown * 0.8); // Reduce cooldown
      } else if (effectiveness < 0.3) {
        this.interventionCooldown = Math.min(7200000, this.interventionCooldown * 1.2); // Increase cooldown
      }
    }

    logger.debug('Breathing session completed', { 
      technique: session.technique, 
      effectiveness, 
      newCooldown: this.interventionCooldown 
    });
  }

  // Technique Recommendations
  recommendTechnique(
    context: {
      situation: 'stress' | 'focus' | 'transition' | 'sleep_prep' | 'creativity';
      timeAvailable: number; // seconds
      experience: 'beginner' | 'intermediate' | 'advanced';
      currentMood?: number;
    }
  ): MeditationTechnique | null {
    const suitable = this.techniques.filter(technique => {
      // Check suitability for situation
      const situationMatch = technique.suitableFor.includes(context.situation);
      
      // Check duration fits available time
      const durationFits = technique.duration.some(d => d <= context.timeAvailable);
      
      // Check difficulty level
      const difficultyMatch = technique.difficulty === context.experience || 
        (context.experience === 'intermediate' && technique.difficulty === 'beginner') ||
        (context.experience === 'advanced');

      return situationMatch && durationFits && difficultyMatch;
    });

    if (suitable.length === 0) return null;

    // Prefer techniques with better recent effectiveness
    const withHistory = suitable.map(technique => {
      const recentSessions = this.breathingSessions
        .filter(s => s.technique === technique.name && s.completed && s.effectiveness !== undefined)
        .slice(-5); // Last 5 sessions

      const avgEffectiveness = recentSessions.length > 0 
        ? recentSessions.reduce((sum, s) => sum + s.effectiveness!, 0) / recentSessions.length
        : 0.5; // Default to neutral

      return { technique, avgEffectiveness };
    });

    // Sort by effectiveness and return best
    withHistory.sort((a, b) => b.avgEffectiveness - a.avgEffectiveness);
    
    return withHistory[0].technique;
  }

  // Contextual Breath Prompts
  getContextualBreathPrompt(
    stressLevel: number,
    attentionState: string,
    timeAvailable: number
  ): AttentionIntervention | null {
    if (timeAvailable < 30) return null; // Need at least 30 seconds
    
    if (stressLevel > 0.8) {
      return {
        type: 'physiological_sigh',
        duration: Math.min(60, timeAvailable),
        instructions: [
          'Quick stress reset',
          'Double inhale through nose',
          'Long exhale through mouth',
          'Just 1-3 breaths'
        ],
        evidenceBasis: 'Rapid autonomic reset'
      };
    }

    if (attentionState === 'high_switching' && timeAvailable >= 120) {
      return {
        type: 'focused_breathing',
        duration: Math.min(180, timeAvailable),
        instructions: [
          'Gentle attention training',
          'Count breaths 1 to 10',
          'Start over when you reach 10',
          'Return to 1 when mind wanders'
        ],
        evidenceBasis: 'Concentration practice for attention stability'
      };
    }

    return null;
  }

  // Analytics & Learning
  getEffectivenessAnalytics(): any {
    const completedSessions = this.breathingSessions.filter(s => s.completed && s.effectiveness !== undefined);
    
    const byTechnique = completedSessions.reduce((acc, session) => {
      if (!acc[session.technique]) {
        acc[session.technique] = {
          sessions: 0,
          avgEffectiveness: 0,
          totalEffectiveness: 0
        };
      }
      
      acc[session.technique].sessions++;
      acc[session.technique].totalEffectiveness += session.effectiveness!;
      acc[session.technique].avgEffectiveness = 
        acc[session.technique].totalEffectiveness / acc[session.technique].sessions;
      
      return acc;
    }, {} as Record<string, any>);

    return {
      totalSessions: completedSessions.length,
      avgOverallEffectiveness: completedSessions.length > 0 
        ? completedSessions.reduce((sum, s) => sum + s.effectiveness!, 0) / completedSessions.length
        : 0,
      byTechnique,
      interventionCooldown: this.interventionCooldown
    };
  }

  private trimHistory(): void {
    // Keep only last 100 DMN assessments
    if (this.dmnHistory.length > 100) {
      this.dmnHistory = this.dmnHistory.slice(-100);
    }

    // Keep only last 50 breathing sessions
    if (this.breathingSessions.length > 50) {
      this.breathingSessions = this.breathingSessions.slice(-50);
    }
  }

  exportContemplativeData(): any {
    return {
      dmnHistory: this.dmnHistory.slice(-50), // Last 50 assessments
      breathingSessions: this.breathingSessions.slice(-20), // Last 20 sessions
      techniques: this.techniques,
      analytics: this.getEffectivenessAnalytics()
    };
  }
}

export const contemplativeNeuroscience = new ContemplativeNeuroscience();
