// Core data model for the Bubble Universe cognitive companion

export type BubbleType = 'Thought' | 'Task' | 'Memory' | 'Mood' | 'ReminderNote';

export interface Tag {
  id: string;
  name: string;         // e.g., "Emotion: Joy", "Person: Pepper"
  emoji?: string;
  colorHex?: string;
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