/**
 * Type definitions for the Atomic View system
 */

export enum TimeHorizon {
  Today = 'today',
  Week = 'week', 
  Later = 'later'
}

export const TIME_HORIZON_EMOJIS: Record<TimeHorizon, string> = {
  [TimeHorizon.Today]: '🔥',
  [TimeHorizon.Week]: '📅',
  [TimeHorizon.Later]: '🌙'
};

export const TIME_HORIZON_ARRAY = [
  TimeHorizon.Today,
  TimeHorizon.Week,
  TimeHorizon.Later
];

export interface DomainConfig {
  defaultType: 'Thought' | 'Task' | 'Memory' | 'Mood' | 'ReminderNote';
  emoji: string;
}

export const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  Financial: { defaultType: 'Task', emoji: '💰' },
  Parenting: { defaultType: 'Memory', emoji: '👨‍👩‍👧‍👦' },
  Mental: { defaultType: 'Thought', emoji: '🧠' },
  Work: { defaultType: 'Task', emoji: '💼' },
  Home: { defaultType: 'Task', emoji: '🏠' },
  Relationships: { defaultType: 'Memory', emoji: '❤️' },
  Default: { defaultType: 'Thought', emoji: '💭' }
};