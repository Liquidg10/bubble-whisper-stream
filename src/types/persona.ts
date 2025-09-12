/**
 * Persona Type Definitions for P18 Cast System
 * Evidence-based character archetypes for guidance without constraint
 */

// Core persona identifiers aligned with evidence anchors
export type PersonaId = 
  | 'coach_autonomy'      // SDT-based motivation
  | 'sous_chef'           // Detail prep without drag
  | 'risk_wrangler'       // Friendly pre-mortems
  | 'planner_kernel'      // Thread-to-task integration
  | 'dr_seligman'         // PERMA positive psychology
  | 'dr_anila'            // Contemplative neuroscience
  | 'dr_anand'            // Reward & habit loops
  | 'dr_rhea'             // 2e/ND support
  | 'pixelcraft'          // UI accessibility
  | 'sparkles'            // UX simplicity
  | 'codex'               // Engineering safety
  | 'gemini'              // Data/ML ethics
  | 'claude'              // Privacy & crisis
  | 'venture'             // Business ethics
  | 'grok'                // Edge-case QA
  | 'jordan'              // Exec user persona
  | 'tasha'               // Parent/creator persona
  | 'mark_mode';          // High-iteration user

// Context-aware activation triggers
export interface PersonaActivation {
  personaId: PersonaId;
  trigger: string;
  confidence: number;
  contextFactors: string[];
  evidenceAnchors: string[];
}

// Persona response with evidence grounding
export interface PersonaResponse {
  personaId: PersonaId;
  message: string;
  actionOptions?: PersonaAction[];
  evidenceNote?: string;
  becauseText: string;
  canDismiss: boolean;
  cooldownMinutes?: number;
}

// Actionable suggestions with autonomy preservation
export interface PersonaAction {
  id: string;
  label: string;
  type: 'accept' | 'modify' | 'defer' | 'decline';
  consequences?: string;
  undoable: boolean;
  implementationMethod?: 'auto_write' | 'draft' | 'suggest';
}

// User interaction tracking for learning
export interface PersonaInteraction {
  personaId: PersonaId;
  timestamp: number;
  trigger: string;
  response: 'engaged' | 'dismissed' | 'deferred' | 'no_response';
  actionTaken?: string;
  helpfulnessRating?: number; // 1-5 scale
  followedThrough?: boolean;
}

// Persona configuration with evidence backing
export interface PersonaConfig {
  id: PersonaId;
  name: string;
  description: string;
  personality: string;
  evidenceAnchors: string[];
  activationPatterns: string[];
  defaultCooldownMinutes: number;
  respectsAutonomy: boolean;
  canBeDisabled: boolean;
}

// Context for persona decision-making
export interface PersonaContext {
  userId: string;
  currentTask?: any;
  userContext: any;
  timeContext: {
    timeOfDay: string;
    dayOfWeek: string;
    mood?: string;
  };
  recentInteractions: PersonaInteraction[];
  privacyLayer: 'surface' | 'context' | 'deep';
  autonomyPreferences: {
    nudgeFrequency: 'minimal' | 'occasional' | 'regular';
    interventionStyle: 'suggest' | 'draft' | 'auto_gentle';
    respectQuietHours: boolean;
  };
}