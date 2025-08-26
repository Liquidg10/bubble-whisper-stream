// Core data model for the Bubble Universe cognitive companion

export type BubbleType = 'Thought' | 'Task' | 'Memory' | 'Mood' | 'ReminderNote';

export interface Tag {
  id: string;
  name: string;         // e.g., "Emotion: Joy", "Person: Pepper"
  emoji?: string;
  colorHex?: string;
}

export enum TimeHorizon {
  Today = 'today',
  Week = 'week',
  Later = 'later'
}

export interface Snooze {
  id: string;
  reminderId: string;
  at: number;           // epoch ms
  reason?: string;      // free text or preset key
}

export interface Reminder {
  id: string;
  bubbleId: string;
  scheduledAt: number;  // epoch ms
  status: 'Active' | 'Snoozed' | 'Done' | 'Dismissed';
  level: 1 | 2 | 3;     // gentle / persistent / full-screen
  snoozes: Snooze[];
}

export interface Bubble {
  id: string;
  type: BubbleType;
  content?: string;        // text (encrypted)
  audioUri?: string;       // local recording path
  imageUri?: string;       // sketch/photo
  createdAt: number;
  updatedAt: number;
  x: number; y: number;    // canvas coordinates (viewport-agnostic units)
  size: number;            // visual importance (0..1)
  moodColor?: string;      // '#RRGGBB' from theme tokens
  mood?: string;           // current mood state
  tags: Tag[];
  location?: { lat: number; lon: number };
  reminderId?: string;     // link to Reminder
  completed?: boolean;
}

// Self-model baseline
export interface SelfModel {
  id: 'self';
  routines: { name: string; timeOfDay?: string }[];
  medicationTimes: { name: string; at: string }[]; // e.g., '08:00'
  preferences: Record<string, unknown>;            // notificationSensitivity, theme, etc.
  triggers: string[];
}

// Settings
export interface Settings {
  ttsEnabled: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  bubbleDensity: 'low' | 'medium' | 'high';
  quietHours?: { start: string; end: string };
  biometricLock: boolean;
  intelligenceEnabled?: boolean; // Phase 2 master switch
  glimmersEnabled?: boolean;
  adaptiveReminders?: boolean;
  preferredGlimmerTone?: GlimmerTone;
  groceryHelperEnabled?: boolean;
  cleaningCuesEnabled?: boolean;
  personalVoiceEnabled?: boolean;
  biometricEnabled?: boolean;
  // AI Voice Settings
  globalVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  voiceVolume?: number;
  voiceSpeed?: number;
  voicePreferences?: {
    banking?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    companion?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    notes?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    cbt?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    reminders?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    glimmers?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  };
}

// Canvas viewport state
export interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

// Audio capture state
export interface AudioCaptureState {
  isRecording: boolean;
  isProcessing: boolean;
  duration: number;
  audioUrl?: string;
}

// Notification permission state
export type NotificationPermission = 'default' | 'granted' | 'denied';

// Reminder escalation presets
export const SNOOZE_PRESETS = [
  { key: 'busy', label: 'Busy right now', duration: 30 * 60 * 1000 }, // 30 minutes
  { key: 'overwhelmed', label: 'Feeling overwhelmed', duration: 2 * 60 * 60 * 1000 }, // 2 hours
  { key: 'need_info', label: 'Need more info', duration: 24 * 60 * 60 * 1000 }, // 1 day
  { key: 'low_energy', label: 'Low energy', duration: 4 * 60 * 60 * 1000 }, // 4 hours
  { key: 'with_pepper', label: 'With Pepper', duration: 60 * 60 * 1000 }, // 1 hour
] as const;

export type SnoozePresetKey = typeof SNOOZE_PRESETS[number]['key'];

// Phase 2: Intelligence Layer Types

// CBT (Cognitive Behavioral Therapy) Support
export type DistortionKey =
  | 'AllOrNothing' | 'Catastrophizing' | 'Overgeneralization'
  | 'MindReading' | 'ShouldStatements' | 'Labeling'
  | 'EmotionalReasoning' | 'FortuneTelling' | 'DisqualifyingPositive';

export interface CBTEntry {
  id: string;
  bubbleId?: string;        // optional link to originating bubble
  createdAt: number;        // epoch ms
  thought: string;
  distortions: DistortionKey[];
  evidenceFor?: string;
  evidenceAgainst?: string;
  reframe?: string;         // balanced alternative
  tags: string[];           // mood/context tags
}

// Self-Compassion Glimmers
export type GlimmerTone = 'FutureYou' | 'Friend' | 'Coach' | 'Scientist';

export interface Glimmer {
  id: string;
  createdAt: number;
  tone: GlimmerTone;
  message: string;          // resolved from template + context
  cause: string;            // explainability key(s)
  deliveredVia: 'text' | 'tts' | 'both';
  dismissed?: boolean;
}

// Enhanced Self-Model with Layers
export interface SelfModelV2 {
  id: 'self';
  layers: { surface: boolean; context: boolean; deep: boolean };
  preferences: Record<string, unknown>;
  routines: { name: string; timeOfDay?: string }[];
  medicationTimes: { name: string; at: string }[];
  triggers: string[];
}

export interface SelfModelAudit {
  id: string;
  at: number;
  change: string;           // json diff summary
  layer: 'surface' | 'context' | 'deep';
  userConfirmed: boolean;
}

// Pattern Recognition for Adaptive Behavior
export interface PatternHint {
  id: string;
  key: string;              // e.g., 'overwhelmed_afternoon'
  value: string;            // e.g., 'true'
  confidence: number;       // 0..1
  lastUpdated: number;
}

// Enhanced Reminder Types
export interface ReminderExplanation {
  reason: string;           // Human-readable explanation
  factors: string[];       // Contributing factors
  confidence: number;      // 0..1
}

// Consent Management
export interface ConsentRecord {
  id: string;
  feature: string;         // e.g., 'context_layer', 'glimmers', 'adaptive_reminders'
  granted: boolean;
  timestamp: number;
  version: string;         // consent version for compliance
}