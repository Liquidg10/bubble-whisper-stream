export interface Glimmer {
  id: string;
  message: string;
  tone: GlimmerTone;
  trigger: string;
  type: 'encouragement' | 'progress' | 'rest' | 'greeting' | 'overwhelmed';
  createdAt: string;
  dismissed: boolean;
  source?: 'ai' | 'local';
  cause?: string;
  deliveredVia?: string;
}

export type GlimmerTone = 'Friend' | 'Coach' | 'Scientist' | 'Future You' | 'friend' | 'coach' | 'scientist' | 'future-you';

export interface PatternHint {
  id: string;
  key: string;
  description: string;
  confidence: number;
  layer: 'surface' | 'context' | 'deep';
  lastUpdated: string;
}