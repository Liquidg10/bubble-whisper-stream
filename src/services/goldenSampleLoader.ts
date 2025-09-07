/**
 * Golden Sample Loader for CBT Dev Routes
 * Provides test data for annotation testing, policy simulation, and E2E testing
 */

import type { CBTAnnotation, DistortionType, CrisisFlag } from '@/ai/cbt/types';

export interface GoldenSample {
  id: string;
  category: 'distortion' | 'crisis' | 'neutral' | 'sarcasm' | 'mixed';
  message: string;
  expectedAnnotations?: Partial<CBTAnnotation>;
  expectedDecision?: {
    shouldShowCBT: boolean;
    intervention?: string;
    priority?: 'low' | 'medium' | 'high' | 'crisis';
  };
  description: string;
  tags: string[];
}

export const GOLDEN_SAMPLES: GoldenSample[] = [
  // Distortion Samples
  {
    id: 'dist_all_nothing_1',
    category: 'distortion',
    message: "I always mess everything up and nothing ever goes right for me. Everyone thinks I'm a failure.",
    description: "High-confidence all-or-nothing thinking with overgeneralization",
    tags: ['all_or_nothing', 'overgeneralization', 'high_confidence'],
    expectedAnnotations: {
      distortions: [
        { type: 'all_or_nothing', confidence: 0.9, evidence: ['always', 'everything', 'nothing', 'ever'], keywords: ['always', 'everything', 'nothing', 'ever'] },
        { type: 'overgeneralization', confidence: 0.85, evidence: ['everyone'], keywords: ['everyone'] }
      ]
    }
  },
  {
    id: 'dist_catastrophizing_1',
    category: 'distortion',
    message: "If I fail this test, my life will be ruined forever and I'll never recover from it.",
    description: "Classic catastrophizing with future-focused disaster thinking",
    tags: ['catastrophizing', 'future_tense', 'high_confidence'],
    expectedAnnotations: {
      distortions: [
        { type: 'catastrophizing', confidence: 0.95, keywords: ['ruined', 'never', 'recover'] }
      ]
    }
  },
  {
    id: 'dist_mind_reading_1',
    category: 'distortion',
    message: "She probably thinks I'm weird and annoying. I can tell she doesn't like me.",
    description: "Mind reading with assumption about others' thoughts",
    tags: ['mind_reading', 'assumptions'],
    expectedAnnotations: {
      distortions: [
        { type: 'mind_reading', confidence: 0.85, keywords: ['probably thinks', 'can tell'] }
      ]
    }
  },
  {
    id: 'dist_should_1',
    category: 'distortion',
    message: "I should have done better. I must be perfect or I'm worthless.",
    description: "Should statements with perfectionism",
    tags: ['should_statements', 'perfectionism'],
    expectedAnnotations: {
      distortions: [
        { type: 'should_statements', confidence: 0.8, keywords: ['should', 'must'] }
      ]
    }
  },

  // Crisis Samples
  {
    id: 'crisis_self_harm_1',
    category: 'crisis',
    message: "I want to hurt myself right now. I have the urge to cut.",
    description: "Direct self-harm intent - critical priority",
    tags: ['self_harm', 'immediate_risk', 'critical'],
    expectedAnnotations: {
      crisisFlags: [
        { type: 'self_harm', confidence: 0.95, severity: 'high', keywords: ['hurt myself', 'urge', 'cut'] }
      ]
    },
    expectedDecision: {
      shouldShowCBT: true,
      intervention: 'crisis_protocol',
      priority: 'crisis'
    }
  },
  {
    id: 'crisis_suicide_1',
    category: 'crisis',
    message: "I'm thinking about suicide. I don't want to live anymore.",
    description: "Suicidal ideation - immediate intervention required",
    tags: ['suicide', 'immediate_risk', 'critical'],
    expectedAnnotations: {
      crisisFlags: [
        { type: 'suicide', confidence: 0.95, severity: 'critical', keywords: ['suicide', 'don\'t want to live'] }
      ]
    },
    expectedDecision: {
      shouldShowCBT: true,
      intervention: 'crisis_protocol',
      priority: 'crisis'
    }
  },
  {
    id: 'crisis_distress_1',
    category: 'crisis',
    message: "I can't take it anymore. I'm at my breaking point and falling apart.",
    description: "Severe distress - needs support but not immediate crisis",
    tags: ['severe_distress', 'breaking_point'],
    expectedAnnotations: {
      crisisFlags: [
        { type: 'severe_distress', confidence: 0.8, severity: 'medium', keywords: ['can\'t take it', 'breaking point', 'falling apart'] }
      ]
    }
  },

  // Neutral Samples
  {
    id: 'neutral_1',
    category: 'neutral',
    message: "I'm going to the store later to buy some groceries. Need milk and bread.",
    description: "Neutral message - should not trigger any interventions",
    tags: ['neutral', 'daily_life'],
    expectedDecision: {
      shouldShowCBT: false
    }
  },
  {
    id: 'neutral_2',
    category: 'neutral',
    message: "The weather is nice today. I might go for a walk in the park.",
    description: "Positive neutral message",
    tags: ['neutral', 'positive_activity'],
    expectedDecision: {
      shouldShowCBT: false
    }
  },
  {
    id: 'neutral_mild_negative',
    category: 'neutral',
    message: "I'm a bit tired from work today, but it was okay.",
    description: "Mild negative emotion without distortions",
    tags: ['neutral', 'mild_negative'],
    expectedDecision: {
      shouldShowCBT: false
    }
  },

  // Sarcasm & False Positive Prevention
  {
    id: 'sarcasm_1',
    category: 'sarcasm',
    message: "Oh sure, I always have perfect timing. Obviously I'm the best at everything, lol.",
    description: "Sarcastic statement - should not trigger all-or-nothing detection",
    tags: ['sarcasm', 'false_positive_prevention'],
    expectedDecision: {
      shouldShowCBT: false
    }
  },
  {
    id: 'sarcasm_2',
    category: 'sarcasm',
    message: "Yeah right, everyone totally loves my cooking. They're just being nice, clearly.",
    description: "Sarcasm with obvious indicators",
    tags: ['sarcasm', 'obvious_indicators'],
    expectedDecision: {
      shouldShowCBT: false
    }
  },
  {
    id: 'idiom_1',
    category: 'sarcasm',
    message: "I'm going to kill two birds with one stone and grab lunch while running errands.",
    description: "Common idiom - should not trigger crisis detection",
    tags: ['idiom', 'false_positive_prevention'],
    expectedDecision: {
      shouldShowCBT: false
    }
  },

  // Mixed & Complex Scenarios
  {
    id: 'mixed_1',
    category: 'mixed',
    message: "I always mess up presentations and everyone probably thinks I'm incompetent. I'll never be good at public speaking.",
    description: "Multiple distortions: all-or-nothing, mind reading, overgeneralization",
    tags: ['multiple_distortions', 'complex'],
    expectedAnnotations: {
      distortions: [
        { type: 'all_or_nothing', confidence: 0.85, keywords: ['always', 'never'] },
        { type: 'mind_reading', confidence: 0.8, keywords: ['probably thinks'] },
        { type: 'overgeneralization', confidence: 0.75, keywords: ['everyone'] }
      ]
    }
  },
  {
    id: 'mixed_2',
    category: 'mixed',
    message: "If I don't get this promotion, it means I'm a total failure and my career is over. I should have worked harder.",
    description: "Catastrophizing + all-or-nothing + should statements",
    tags: ['multiple_distortions', 'career_anxiety'],
    expectedAnnotations: {
      distortions: [
        { type: 'catastrophizing', confidence: 0.9, keywords: ['career is over'] },
        { type: 'all_or_nothing', confidence: 0.85, keywords: ['total failure'] },
        { type: 'should_statements', confidence: 0.8, keywords: ['should have'] }
      ]
    }
  },

  // Edge Cases
  {
    id: 'edge_long_message',
    category: 'mixed',
    message: "I've been thinking about this situation at work where my boss always criticizes everything I do. It makes me feel like nothing I do is ever good enough. Everyone else seems to get praise but I never do. Sometimes I think they all believe I'm not capable of doing my job properly. I should probably just quit because I'll never improve and this pattern will continue forever. Maybe I'm just not cut out for this kind of work and I'm fooling myself into thinking I can succeed.",
    description: "Long message with multiple distortions and complex patterns",
    tags: ['long_message', 'multiple_distortions', 'workplace'],
    expectedAnnotations: {
      distortions: [
        { type: 'all_or_nothing', confidence: 0.9, keywords: ['always', 'everything', 'nothing', 'never', 'all'] },
        { type: 'mind_reading', confidence: 0.85, keywords: ['they all believe'] },
        { type: 'should_statements', confidence: 0.8, keywords: ['should'] },
        { type: 'catastrophizing', confidence: 0.8, keywords: ['never improve', 'forever'] }
      ]
    }
  },
  {
    id: 'edge_performance_test',
    category: 'neutral',
    message: "This is a very long message designed to test the performance of the annotation system when processing large amounts of text content that contains no distortions or crisis flags but is lengthy enough to potentially cause performance issues if the system is not optimized properly for handling longer text inputs during real-time conversation analysis in the CBT pipeline system.",
    description: "Performance testing - long neutral message",
    tags: ['performance_test', 'long_neutral'],
    expectedDecision: {
      shouldShowCBT: false
    }
  }
];

export class GoldenSampleLoader {
  private samples: GoldenSample[] = GOLDEN_SAMPLES;

  // Get all samples
  getAllSamples(): GoldenSample[] {
    return this.samples;
  }

  // Get samples by category
  getSamplesByCategory(category: GoldenSample['category']): GoldenSample[] {
    return this.samples.filter(sample => sample.category === category);
  }

  // Get samples by tag
  getSamplesByTag(tag: string): GoldenSample[] {
    return this.samples.filter(sample => sample.tags.includes(tag));
  }

  // Get sample by ID
  getSampleById(id: string): GoldenSample | undefined {
    return this.samples.find(sample => sample.id === id);
  }

  // Get random sample from category
  getRandomSample(category?: GoldenSample['category']): GoldenSample {
    const pool = category ? this.getSamplesByCategory(category) : this.samples;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Get samples for specific testing scenarios
  getCrisisSamples(): GoldenSample[] {
    return this.getSamplesByCategory('crisis');
  }

  getDistortionSamples(): GoldenSample[] {
    return this.getSamplesByCategory('distortion');
  }

  getSarcasmSamples(): GoldenSample[] {
    return this.getSamplesByCategory('sarcasm');
  }

  getNeutralSamples(): GoldenSample[] {
    return this.getSamplesByCategory('neutral');
  }

  // Get performance testing samples
  getPerformanceTestSamples(): GoldenSample[] {
    return this.getSamplesByTag('performance_test');
  }

  // Get high-confidence samples for validation
  getHighConfidenceSamples(): GoldenSample[] {
    return this.getSamplesByTag('high_confidence');
  }

  // Statistics
  getCategoryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.samples.forEach(sample => {
      stats[sample.category] = (stats[sample.category] || 0) + 1;
    });
    return stats;
  }

  // Export samples as JSON
  exportSamples(): string {
    return JSON.stringify(this.samples, null, 2);
  }

  // Validate sample expectations against actual results
  validateSample(
    sample: GoldenSample, 
    actualAnnotation: any, 
    actualDecision: any
  ): {
    annotationMatch: boolean;
    decisionMatch: boolean;
    details: string[];
  } {
    const details: string[] = [];
    let annotationMatch = true;
    let decisionMatch = true;

    // Validate annotations if expected
    if (sample.expectedAnnotations) {
      if (sample.expectedAnnotations.distortions) {
        const expectedTypes = sample.expectedAnnotations.distortions.map(d => d.type);
        const actualTypes = actualAnnotation?.distortions?.map((d: any) => d.type) || [];
        
        expectedTypes.forEach(type => {
          if (!actualTypes.includes(type)) {
            annotationMatch = false;
            details.push(`Missing expected distortion: ${type}`);
          }
        });
      }

      if (sample.expectedAnnotations.crisisFlags) {
        const expectedCrisis = sample.expectedAnnotations.crisisFlags.map(c => c.type);
        const actualCrisis = actualAnnotation?.crisisFlags?.map((c: any) => c.type) || [];
        
        expectedCrisis.forEach(type => {
          if (!actualCrisis.includes(type)) {
            annotationMatch = false;
            details.push(`Missing expected crisis flag: ${type}`);
          }
        });
      }
    }

    // Validate decision if expected
    if (sample.expectedDecision) {
      if (sample.expectedDecision.shouldShowCBT !== actualDecision?.shouldShowCBT) {
        decisionMatch = false;
        details.push(`Decision mismatch: expected ${sample.expectedDecision.shouldShowCBT}, got ${actualDecision?.shouldShowCBT}`);
      }
    }

    return { annotationMatch, decisionMatch, details };
  }
}

export const goldenSampleLoader = new GoldenSampleLoader();