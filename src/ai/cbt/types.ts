/**
 * CBT Module Types - Core type definitions for thought analysis and intervention
 */

export type DistortionType = 
  | 'all_or_nothing'
  | 'catastrophizing' 
  | 'overgeneralization'
  | 'should_statements'
  | 'mind_reading';

export interface CBTAnnotation {
  messageId: string;
  timestamp: number;
  distortions: {
    type: DistortionType;
    confidence: number; // 0-1
    evidence: string[];
    keywords: string[];
  }[];
  sentiment: {
    score: number; // -1 to 1
    magnitude: number; // 0-1
  };
  crisisFlags: CrisisFlag[];
  context: {
    recentMood?: string;
    timeOfDay: number;
    messageLength: number;
    conversationDepth: number;
  };
}

export interface CBTDecision {
  shouldIntervene: boolean;
  interventionType: 'none' | 'chip';
  reason: string;
  targetDistortions: DistortionType[];
  priority: 'low' | 'medium' | 'high' | 'crisis';
  cooldownMinutes: number;
  metadata: {
    fatigueScore: number;
    policyMatch: string;
    confidence: number;
    isCrisis?: boolean;
  };
}

export interface CBTTrace {
  id: string;
  conversationId: string;
  messageId: string;
  userId: string;
  distortion: DistortionType;
  reframe?: string;
  createdAt: number;
  privacyLayer: 'surface' | 'context' | 'deep';
  consent: boolean;
  archived?: boolean;
  sensitive?: boolean; // PROMPT 6: Mark crisis traces as sensitive
  // Legacy fields for backward compatibility
  timestamp: number;
  annotation: CBTAnnotation;
  decision: CBTDecision;
  action?: CBTAction;
  outcome?: {
    userEngaged: boolean;
    userResponse?: string;
    helpfulness?: number; // 1-5 rating
  };
  pseudonymousId: string; // For telemetry
}

export interface CBTPolicyContext {
  userSettings: {
    assistLevel: 'off' | 'subtle' | 'standard';
    privacyLayer: 'surface' | 'context' | 'deep';
    autoLogMode: 'ask' | 'off' | 'on';
    quietHours?: {
      enabled: boolean;
      start: string; // HH:MM
      end: string; // HH:MM
    };
    topicExclusions: string[];
    neverInterveneOn: string[];
  };
  fatigueState: {
    globalInterventions: number;
    topicCooldowns: Partial<Record<DistortionType, number>>; // timestamp
    lastIntervention: number;
    dailyCount: number;
    topicDeclines: Partial<Record<DistortionType, number>>; // 24h auto-snooze on decline
  };
  conversationContext: {
    messageCount: number;
    averageSentiment: number;
    recentTopics: string[];
    timeSpan: number; // minutes
  };
}

export interface CrisisFlag {
  type: 'self_harm' | 'suicide' | 'severe_distress' | 'emergency';
  confidence: number;
  keywords: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CBTAction {
  type: 'chip' | 'ack' | 'question' | 'crisis_support';
  text: string;
  data?: {
    distortionType?: DistortionType;
    reframes?: string[];
    resources?: string[];
    followUpQuestions?: string[];
    explainability?: string; // PROMPT 4: For "Because..." pills
  };
}

export interface FatigueRule {
  name: string;
  condition: (context: CBTPolicyContext) => boolean;
  cooldownMinutes: number;
  maxDailyInterventions?: number;
  topicSpecific?: DistortionType;
}

export interface RetentionPolicy {
  defaultDays: number;
  crisisTraces: number; // Keep crisis traces longer
  anonymizeAfterDays: number;
  purgeAfterDays: number;
  archiveExemption: boolean; // Archived traces exempt from auto-delete
}