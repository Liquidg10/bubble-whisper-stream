/**
 * @fileoverview Seed data for Phase 2 Intelligence Layer
 * Provides sample data for development and testing
 */

import type { CBTEntry, Glimmer, SelfModelV2, PatternHint, DistortionKey } from '../types/bubble';

export const sampleCBTEntries: CBTEntry[] = [
  {
    id: 'cbt-1',
    createdAt: Date.now() - 86400000, // 1 day ago
    thought: 'I always mess things up at work',
    distortions: ['AllOrNothing', 'Overgeneralization'] as DistortionKey[],
    evidenceFor: 'I made a mistake in the presentation yesterday',
    evidenceAgainst: 'I completed 5 successful projects this month and received positive feedback',
    reframe: 'Making occasional mistakes is normal and doesn\'t define my overall performance. I learn from errors and have many successes.',
    tags: ['work', 'anxiety']
  },
  {
    id: 'cbt-2',
    createdAt: Date.now() - 172800000, // 2 days ago
    thought: 'Nobody likes me',
    distortions: ['MindReading', 'AllOrNothing'] as DistortionKey[],
    evidenceFor: 'People seemed quiet in the meeting',
    evidenceAgainst: 'My friend texted me funny memes today, and my colleague asked for my advice on a project',
    reframe: 'I can\'t read minds, and people have different communication styles. I have meaningful relationships and positive interactions.',
    tags: ['social', 'self-worth']
  }
];

export const sampleGlimmers: Glimmer[] = [
  {
    id: 'glimmer-1',
    createdAt: Date.now() - 3600000, // 1 hour ago
    tone: 'Friend',
    message: 'Hey, I noticed you\'ve been feeling overwhelmed lately. Remember that it\'s okay to take things one step at a time. You\'ve handled difficult situations before.',
    cause: 'overwhelmed_pattern_detected',
    deliveredVia: 'text'
  },
  {
    id: 'glimmer-2',
    createdAt: Date.now() - 7200000, // 2 hours ago
    tone: 'FutureYou',
    message: 'Looking back, I\'m proud of how you pushed through that challenging moment. Your resilience is one of your strengths.',
    cause: 'stress_recovery_pattern',
    deliveredVia: 'both'
  }
];

export const sampleSelfModel: SelfModelV2 = {
  id: 'self',
  layers: {
    surface: true,
    context: true,
    deep: false
  },
  preferences: {
    preferredTone: 'Friend',
    quietHours: { start: '22:00', end: '08:00' },
    reminderStyle: 'gentle'
  },
  routines: [
    { name: 'Morning meditation', timeOfDay: '07:30' },
    { name: 'Evening journaling', timeOfDay: '21:00' }
  ],
  medicationTimes: [
    { name: 'Vitamin D', at: '08:00' },
    { name: 'Evening supplements', at: '20:00' }
  ],
  triggers: ['work deadlines', 'social events', 'unexpected changes']
};

export const samplePatternHints: PatternHint[] = [
  {
    id: 'pattern-1',
    key: 'overwhelmed_afternoon',
    value: 'true',
    confidence: 0.8,
    lastUpdated: Date.now() - 86400000
  },
  {
    id: 'pattern-2',
    key: 'productive_morning',
    value: 'true',
    confidence: 0.9,
    lastUpdated: Date.now() - 172800000
  },
  {
    id: 'pattern-3',
    key: 'social_anxiety_weekends',
    value: 'moderate',
    confidence: 0.6,
    lastUpdated: Date.now() - 259200000
  }
];

export const distortionTypes: DistortionKey[] = [
  'AllOrNothing',
  'Catastrophizing',
  'Overgeneralization',
  'MindReading',
  'ShouldStatements',
  'Labeling',
  'EmotionalReasoning',
  'FortuneTelling',
  'DisqualifyingPositive'
];

export const distortionDescriptions: Record<DistortionKey, string> = {
  AllOrNothing: 'Seeing things in black and white - either perfect or a complete failure',
  Catastrophizing: 'Expecting the worst possible outcome',
  Overgeneralization: 'Drawing broad conclusions from single events',
  MindReading: 'Assuming you know what others are thinking',
  ShouldStatements: 'Having rigid rules about how things "should" be',
  Labeling: 'Defining yourself or others with negative labels',
  EmotionalReasoning: 'Believing that feelings reflect reality',
  FortuneTelling: 'Predicting negative outcomes without evidence',
  DisqualifyingPositive: 'Dismissing positive experiences as unimportant'
};

export const sampleReminderReasons = [
  'Because you selected "Overwhelmed" twice this week, we\'re slowing your reminders today.',
  'Because it\'s your quiet hours, we won\'t escalate this reminder.',
  'Because you\'ve been consistent with morning routines, we\'re maintaining your schedule.',
  'Because you snoozed similar reminders when "With Pepper," we\'ve moved this to evening.',
  'Because you prefer gentle nudges, this reminder will stay at Level 1.'
];

export const initializeSampleData = async (): Promise<void> => {
  // This would integrate with your storage service
  console.log('Sample data initialized for Phase 2 Intelligence Layer');
  
  // In a real implementation, this would:
  // 1. Check if sample data flag is enabled
  // 2. Clear existing data if needed
  // 3. Insert sample data into IndexedDB
  // 4. Set up initial pattern hints
  // 5. Configure sample self-model
};

export const clearSampleData = async (): Promise<void> => {
  console.log('Sample data cleared');
  
  // In a real implementation, this would:
  // 1. Remove all sample CBT entries
  // 2. Clear sample glimmers
  // 3. Reset self-model to defaults
  // 4. Remove sample pattern hints
};