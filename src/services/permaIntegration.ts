/**
 * P3 - PERMA & Positive Psychology Integration
 * Martin Seligman-aligned micro-signals and weekly value reports
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import { logger } from '@/utils/logger';

export interface PERMASignal {
  dimension: 'positive_emotion' | 'engagement' | 'relationships' | 'meaning' | 'accomplishment';
  value: number; // 0-1 scale
  confidence: number; // 0-1
  source: string;
  timestamp: number;
  context?: Record<string, any>;
}

export interface PERMAProfile {
  positive_emotion: number;
  engagement: number;
  relationships: number;
  meaning: number;
  accomplishment: number;
  overall: number;
  lastUpdated: number;
}

export interface StrengthSignal {
  strength: string;
  frequency: number;
  effectiveness: number;
  recentUse: number;
  opportunities: string[];
}

export interface WeeklyValueReport {
  week: string; // YYYY-WW format
  timeSaved: number; // minutes
  tasksCompleted: number;
  permaHighlights: Array<{
    dimension: keyof PERMAProfile;
    highlight: string;
    impact: number;
  }>;
  accomplishments: string[];
  meaningBreadcrumbs: string[];
  relationshipNotes: string[];
  strengths: StrengthSignal[];
  generated: number;
}

class PERMAIntegration {
  private signals: PERMASignal[] = [];
  private profile: PERMAProfile | null = null;
  private strengths: Map<string, StrengthSignal> = new Map();
  private weeklyReports: Map<string, WeeklyValueReport> = new Map();

  // PERMA Micro-Signals Detection
  addPERMASignal(signal: PERMASignal): void {
    this.signals.push(signal);
    
    // Keep only last 30 days
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    this.signals = this.signals.filter(s => s.timestamp > cutoff);

    // Update profile
    this.updatePERMAProfile();
    
    logger.debug('PERMA signal added', { dimension: signal.dimension, value: signal.value });
  }

  private updatePERMAProfile(): void {
    const recent = this.signals.filter(s => Date.now() - s.timestamp < (7 * 24 * 60 * 60 * 1000)); // 7 days
    
    if (recent.length === 0) return;

    const dimensions: Array<keyof PERMAProfile> = ['positive_emotion', 'engagement', 'relationships', 'meaning', 'accomplishment'];
    const profile: Partial<PERMAProfile> = {};

    for (const dimension of dimensions) {
      const dimensionSignals = recent.filter(s => s.dimension === dimension);
      
      if (dimensionSignals.length > 0) {
        const weightedSum = dimensionSignals.reduce((sum, signal) => {
          const age = Date.now() - signal.timestamp;
          const weight = Math.exp(-age / (3 * 24 * 60 * 60 * 1000)); // 3-day decay
          return sum + (signal.value * signal.confidence * weight);
        }, 0);

        const totalWeight = dimensionSignals.reduce((sum, signal) => {
          const age = Date.now() - signal.timestamp;
          const weight = Math.exp(-age / (3 * 24 * 60 * 60 * 1000));
          return sum + (signal.confidence * weight);
        }, 0);

        profile[dimension] = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
      } else {
        profile[dimension] = 0.5; // Neutral default
      }
    }

    // Calculate overall PERMA score
    const overall = (
      profile.positive_emotion! +
      profile.engagement! +
      profile.relationships! +
      profile.meaning! +
      profile.accomplishment!
    ) / 5;

    this.profile = {
      ...profile as Required<Omit<PERMAProfile, 'overall' | 'lastUpdated'>>,
      overall,
      lastUpdated: Date.now()
    };
  }

  // Task Content Analysis for PERMA
  analyzeTaskContent(content: string, completed: boolean): PERMASignal[] {
    const signals: PERMASignal[] = [];
    const lower = content.toLowerCase();

    // Positive Emotion indicators
    if (this.containsWords(lower, ['fun', 'enjoy', 'celebrate', 'happy', 'excited', 'love'])) {
      signals.push({
        dimension: 'positive_emotion',
        value: completed ? 0.8 : 0.6,
        confidence: 0.7,
        source: 'task_content',
        timestamp: Date.now(),
        context: { completed, contentHint: 'positive_language' }
      });
    }

    // Engagement indicators
    if (this.containsWords(lower, ['focus', 'deep work', 'flow', 'create', 'build', 'learn'])) {
      signals.push({
        dimension: 'engagement',
        value: completed ? 0.8 : 0.5,
        confidence: 0.6,
        source: 'task_content',
        timestamp: Date.now(),
        context: { completed, contentHint: 'engagement_language' }
      });
    }

    // Relationships indicators
    if (this.containsWords(lower, ['call', 'meet', 'team', 'family', 'friend', 'together', 'collaborate'])) {
      signals.push({
        dimension: 'relationships',
        value: completed ? 0.7 : 0.4,
        confidence: 0.8,
        source: 'task_content',
        timestamp: Date.now(),
        context: { completed, contentHint: 'relationship_language' }
      });
    }

    // Meaning indicators
    if (this.containsWords(lower, ['purpose', 'help', 'impact', 'contribute', 'value', 'mission', 'important'])) {
      signals.push({
        dimension: 'meaning',
        value: completed ? 0.9 : 0.6,
        confidence: 0.7,
        source: 'task_content',
        timestamp: Date.now(),
        context: { completed, contentHint: 'meaning_language' }
      });
    }

    // Accomplishment indicators
    if (this.containsWords(lower, ['complete', 'finish', 'achieve', 'goal', 'milestone', 'success', 'done'])) {
      signals.push({
        dimension: 'accomplishment',
        value: completed ? 1.0 : 0.3,
        confidence: 0.9,
        source: 'task_content',
        timestamp: Date.now(),
        context: { completed, contentHint: 'accomplishment_language' }
      });
    }

    return signals;
  }

  private containsWords(text: string, words: string[]): boolean {
    return words.some(word => text.includes(word));
  }

  // Strengths-Based Task Framing
  suggestStrengthsFrame(content: string): { strength: string; frame: string } | null {
    const lower = content.toLowerCase();
    
    // Common VIA strengths that can be detected from task content
    const strengthPatterns: Array<{ strength: string; patterns: string[]; frame: string }> = [
      {
        strength: 'Creativity',
        patterns: ['create', 'design', 'brainstorm', 'innovate', 'original'],
        frame: 'Use your creative strength to approach this with fresh perspective'
      },
      {
        strength: 'Perseverance',
        patterns: ['difficult', 'challenging', 'persist', 'continue', 'push through'],
        frame: 'Apply your perseverance strength to work through this steadily'
      },
      {
        strength: 'Leadership',
        patterns: ['lead', 'manage', 'guide', 'organize', 'coordinate'],
        frame: 'Channel your leadership strength to guide this forward'
      },
      {
        strength: 'Love of Learning',
        patterns: ['learn', 'study', 'research', 'explore', 'understand'],
        frame: 'Engage your love of learning to dive deep into this'
      },
      {
        strength: 'Zest',
        patterns: ['energy', 'enthusiasm', 'excited', 'passion', 'vigor'],
        frame: 'Bring your natural zest and energy to this task'
      }
    ];

    for (const pattern of strengthPatterns) {
      if (pattern.patterns.some(p => lower.includes(p))) {
        this.recordStrengthUse(pattern.strength);
        return {
          strength: pattern.strength,
          frame: pattern.frame
        };
      }
    }

    return null;
  }

  recordStrengthUse(strength: string): void {
    const existing = this.strengths.get(strength) || {
      strength,
      frequency: 0,
      effectiveness: 0.5,
      recentUse: Date.now(),
      opportunities: []
    };

    existing.frequency++;
    existing.recentUse = Date.now();
    
    this.strengths.set(strength, existing);
  }

  // Weekly Value Reports
  generateWeeklyReport(week: string): WeeklyValueReport {
    const existing = this.weeklyReports.get(week);
    if (existing) return existing;

    const weekStart = this.getWeekStart(week);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekSignals = this.signals.filter(s => 
      s.timestamp >= weekStart.getTime() && s.timestamp < weekEnd.getTime()
    );

    const report: WeeklyValueReport = {
      week,
      timeSaved: this.calculateTimeSaved(weekSignals),
      tasksCompleted: this.countCompletedTasks(weekSignals),
      permaHighlights: this.generatePERMAHighlights(weekSignals),
      accomplishments: this.extractAccomplishments(weekSignals),
      meaningBreadcrumbs: this.extractMeaningBreadcrumbs(weekSignals),
      relationshipNotes: this.extractRelationshipNotes(weekSignals),
      strengths: Array.from(this.strengths.values()).filter(s => 
        s.recentUse >= weekStart.getTime()
      ),
      generated: Date.now()
    };

    this.weeklyReports.set(week, report);
    return report;
  }

  private getWeekStart(week: string): Date {
    const [year, weekNum] = week.split('-W').map(n => parseInt(n));
    const jan1 = new Date(year, 0, 1);
    const days = (weekNum - 1) * 7;
    const weekStart = new Date(jan1);
    weekStart.setDate(jan1.getDate() + days - jan1.getDay());
    return weekStart;
  }

  private calculateTimeSaved(signals: PERMASignal[]): number {
    // Simplified time saved calculation based on efficiency signals
    const efficiencySignals = signals.filter(s => 
      s.dimension === 'engagement' || s.dimension === 'accomplishment'
    );
    
    return efficiencySignals.reduce((total, signal) => {
      return total + (signal.value * 10); // Rough estimate: 10 minutes per high-value signal
    }, 0);
  }

  private countCompletedTasks(signals: PERMASignal[]): number {
    return signals.filter(s => 
      s.dimension === 'accomplishment' && 
      s.context?.completed === true
    ).length;
  }

  private generatePERMAHighlights(signals: PERMASignal[]): WeeklyValueReport['permaHighlights'] {
    const highlights: WeeklyValueReport['permaHighlights'] = [];
    const dimensions: Array<keyof PERMAProfile> = ['positive_emotion', 'engagement', 'relationships', 'meaning', 'accomplishment'];

    for (const dimension of dimensions) {
      const dimensionSignals = signals.filter(s => s.dimension === dimension);
      if (dimensionSignals.length === 0) continue;

      const avgValue = dimensionSignals.reduce((sum, s) => sum + s.value, 0) / dimensionSignals.length;
      
      if (avgValue > 0.6) {
        highlights.push({
          dimension,
          highlight: this.getDimensionHighlight(dimension, avgValue),
          impact: avgValue
        });
      }
    }

    return highlights.sort((a, b) => b.impact - a.impact).slice(0, 3);
  }

  private getDimensionHighlight(dimension: keyof PERMAProfile, value: number): string {
    const highlights: Record<keyof PERMAProfile, string[]> = {
      positive_emotion: ['Found joy in daily tasks', 'Maintained positive outlook', 'Celebrated small wins'],
      engagement: ['Achieved focused work states', 'Applied strengths effectively', 'Maintained task absorption'],
      relationships: ['Strengthened connections', 'Collaborated meaningfully', 'Supported others'],
      meaning: ['Aligned with purpose', 'Made meaningful contributions', 'Connected to values'],
      accomplishment: ['Completed key objectives', 'Made progress on goals', 'Achieved meaningful outcomes'],
      overall: [], // Not used for highlights
      lastUpdated: [] // Not used for highlights
    };

    const dimensionHighlights = highlights[dimension];
    return dimensionHighlights[Math.floor(Math.random() * dimensionHighlights.length)];
  }

  private extractAccomplishments(signals: PERMASignal[]): string[] {
    return signals
      .filter(s => s.dimension === 'accomplishment' && s.value > 0.7)
      .map(s => s.context?.contentHint || 'Task completed successfully')
      .slice(0, 5);
  }

  private extractMeaningBreadcrumbs(signals: PERMASignal[]): string[] {
    return signals
      .filter(s => s.dimension === 'meaning' && s.value > 0.6)
      .map(s => s.context?.contentHint || 'Meaningful work completed')
      .slice(0, 3);
  }

  private extractRelationshipNotes(signals: PERMASignal[]): string[] {
    return signals
      .filter(s => s.dimension === 'relationships' && s.value > 0.5)
      .map(s => s.context?.contentHint || 'Positive social interaction')
      .slice(0, 3);
  }

  // Optional PERMA Enhancement Suggestions
  suggestPERMAEnhancement(): { dimension: keyof PERMAProfile; suggestion: string } | null {
    if (!this.profile) return null;

    // Find lowest PERMA dimension
    const dimensions: Array<keyof PERMAProfile> = ['positive_emotion', 'engagement', 'relationships', 'meaning', 'accomplishment'];
    const lowest = dimensions.reduce((min, dim) => 
      this.profile![dim] < this.profile![min] ? dim : min
    );

    if (this.profile[lowest] > 0.6) return null; // All dimensions are doing well

    const suggestions: Record<keyof PERMAProfile, string[]> = {
      positive_emotion: ['Take a moment to appreciate something good today', 'Add a fun element to an upcoming task'],
      engagement: ['Try focusing on one task for 25 minutes', 'Apply a personal strength to today\'s work'],
      relationships: ['Reach out to someone you appreciate', 'Consider collaborating on an upcoming task'],
      meaning: ['Reflect on why this work matters to you', 'Connect today\'s tasks to your broader goals'],
      accomplishment: ['Celebrate a recent completion', 'Break a large task into achievable steps'],
      overall: [], // Not used
      lastUpdated: [] // Not used
    };

    const dimensionSuggestions = suggestions[lowest];
    const suggestion = dimensionSuggestions[Math.floor(Math.random() * dimensionSuggestions.length)];

    return { dimension: lowest, suggestion };
  }

  exportPERMAData(): any {
    return {
      profile: this.profile,
      signals: this.signals.slice(-500), // Last 500 signals
      strengths: Object.fromEntries(this.strengths),
      weeklyReports: Object.fromEntries(this.weeklyReports)
    };
  }
}

export const permaIntegration = new PERMAIntegration();
