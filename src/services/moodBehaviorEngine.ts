/**
 * P2 - Mood & Behavior Engine  
 * Timeline 2.0, mood inference, and on-device personalization
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import { behavioralScienceEngine } from './behavioralScienceEngine';
import { logger } from '@/utils/logger';

export interface MoodRibbon {
  date: string; // YYYY-MM-DD
  mood: number; // 0-1 scale
  energy: number; // 0-1 scale
  confidence: number; // How confident we are in this inference
  drivers: BecauseDriver[];
  explicitMood?: number; // User-provided mood if any
}

export interface BecauseDriver {
  factor: string;
  impact: number; // -1 to 1
  confidence: number; // 0-1
  privacyLayer: 'surface' | 'context' | 'deep';
  explanation: string;
}

export interface MoodInference {
  mood: number;
  energy: number;
  confidence: number;
  signals: MoodSignal[];
  timestamp: number;
}

export interface MoodSignal {
  type: 'completion_pattern' | 'timing_pattern' | 'content_sentiment' | 'task_difficulty' | 'external_calendar';
  value: number; // -1 to 1
  confidence: number; // 0-1
  timestamp: number;
  metadata?: Record<string, any>;
}

class MoodBehaviorEngine {
  private moodRibbons: Map<string, MoodRibbon> = new Map();
  private moodSignals: MoodSignal[] = [];
  private lastExplicitMood: { value: number; timestamp: number } | null = null;

  // Timeline 2.0 Implementation
  generateTimelineRibbons(startDate: Date, endDate: Date): MoodRibbon[] {
    const ribbons: MoodRibbon[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateKey = this.formatDate(current);
      let ribbon = this.moodRibbons.get(dateKey);
      
      if (!ribbon) {
        ribbon = this.inferDailyMood(current);
        this.moodRibbons.set(dateKey, ribbon);
      }

      ribbons.push(ribbon);
      current.setDate(current.getDate() + 1);
    }

    return ribbons;
  }

  private inferDailyMood(date: Date): MoodRibbon {
    const dateKey = this.formatDate(date);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Get signals for this day
    const daySignals = this.moodSignals.filter(s => 
      s.timestamp >= dayStart.getTime() && s.timestamp < dayEnd.getTime()
    );

    if (daySignals.length === 0) {
      return {
        date: dateKey,
        mood: 0.5,
        energy: 0.5,
        confidence: 0.1,
        drivers: [{ 
          factor: 'insufficient_data', 
          impact: 0, 
          confidence: 0.1, 
          privacyLayer: 'surface',
          explanation: 'Not enough activity to infer mood'
        }]
      };
    }

    // Calculate weighted averages
    const moodSignals = daySignals.filter(s => 
      ['completion_pattern', 'content_sentiment'].includes(s.type)
    );
    const energySignals = daySignals.filter(s => 
      ['timing_pattern', 'task_difficulty'].includes(s.type)
    );

    const mood = this.calculateWeightedAverage(moodSignals);
    const energy = this.calculateWeightedAverage(energySignals);
    const confidence = Math.min(1, daySignals.length / 10); // Higher confidence with more signals

    const drivers = this.generateBecauseDrivers(daySignals);

    return {
      date: dateKey,
      mood: Math.max(0, Math.min(1, mood + 0.5)), // Normalize from [-1,1] to [0,1]
      energy: Math.max(0, Math.min(1, energy + 0.5)),
      confidence,
      drivers
    };
  }

  private calculateWeightedAverage(signals: MoodSignal[]): number {
    if (signals.length === 0) return 0;

    const weightedSum = signals.reduce((sum, signal) => 
      sum + (signal.value * signal.confidence), 0);
    const totalWeight = signals.reduce((sum, signal) => sum + signal.confidence, 0);

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private generateBecauseDrivers(signals: MoodSignal[]): BecauseDriver[] {
    const drivers: BecauseDriver[] = [];
    const signalGroups = this.groupSignalsByType(signals);

    for (const [type, typeSignals] of signalGroups) {
      const avgImpact = this.calculateWeightedAverage(typeSignals);
      const avgConfidence = typeSignals.reduce((sum, s) => sum + s.confidence, 0) / typeSignals.length;

      if (Math.abs(avgImpact) > 0.1 && avgConfidence > 0.3) {
        drivers.push({
          factor: this.getFactorName(type),
          impact: avgImpact,
          confidence: avgConfidence,
          privacyLayer: this.getPrivacyLayer(type),
          explanation: this.generateDriverExplanation(type, avgImpact)
        });
      }
    }

    // Sort by impact magnitude and keep top 3
    return drivers
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 3);
  }

  private groupSignalsByType(signals: MoodSignal[]): Map<string, MoodSignal[]> {
    const groups = new Map<string, MoodSignal[]>();
    
    for (const signal of signals) {
      if (!groups.has(signal.type)) {
        groups.set(signal.type, []);
      }
      groups.get(signal.type)!.push(signal);
    }

    return groups;
  }

  private getFactorName(type: string): string {
    const names: Record<string, string> = {
      'completion_pattern': 'Task completion',
      'timing_pattern': 'Daily rhythm',
      'content_sentiment': 'Note sentiment',
      'task_difficulty': 'Challenge level',
      'external_calendar': 'Calendar density'
    };
    return names[type] || type;
  }

  private getPrivacyLayer(type: string): 'surface' | 'context' | 'deep' {
    const layers: Record<string, 'surface' | 'context' | 'deep'> = {
      'completion_pattern': 'surface',
      'timing_pattern': 'context',
      'content_sentiment': 'deep',
      'task_difficulty': 'context',
      'external_calendar': 'surface'
    };
    return layers[type] || 'context';
  }

  private generateDriverExplanation(type: string, impact: number): string {
    const isPositive = impact > 0;
    const intensity = Math.abs(impact) > 0.5 ? 'strong' : 'moderate';

    const explanations: Record<string, { positive: string; negative: string }> = {
      'completion_pattern': {
        positive: `${intensity} completion momentum`,
        negative: `${intensity} completion challenges`
      },
      'timing_pattern': {
        positive: `good energy alignment`,
        negative: `energy-timing mismatch`
      },
      'content_sentiment': {
        positive: `positive note content`,
        negative: `challenging note content`
      },
      'task_difficulty': {
        positive: `well-matched challenge`,
        negative: `overwhelming difficulty`
      },
      'external_calendar': {
        positive: `manageable schedule`,
        negative: `dense schedule`
      }
    };

    const explanation = explanations[type];
    return explanation ? (isPositive ? explanation.positive : explanation.negative) : 'unknown factor';
  }

  // Mood Inference System
  addMoodSignal(signal: MoodSignal): void {
    this.moodSignals.push(signal);
    
    // Keep only last 30 days
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    this.moodSignals = this.moodSignals.filter(s => s.timestamp > cutoff);

    // Update today's ribbon if needed
    const today = this.formatDate(new Date());
    this.moodRibbons.delete(today); // Force re-inference

    logger.debug('Mood signal added', { type: signal.type, value: signal.value });
  }

  setExplicitMood(mood: number): void {
    this.lastExplicitMood = { value: mood, timestamp: Date.now() };
    
    // Update today's ribbon with explicit mood
    const today = this.formatDate(new Date());
    const existing = this.moodRibbons.get(today);
    
    if (existing) {
      existing.explicitMood = mood;
      existing.confidence = Math.max(existing.confidence, 0.9);
    }

    logger.debug('Explicit mood set', { mood });
  }

  shouldShowMoodChip(): boolean {
    const settings = useBubbleStore.getState().settings;
    if (!settings.intelligenceEnabled) return false;

    const lastShown = localStorage.getItem('lastMoodChipShown');
    if (lastShown) {
      const timeSince = Date.now() - parseInt(lastShown);
      if (timeSince < 24 * 60 * 60 * 1000) return false; // Once per day max
    }

    // Show if we have low confidence for today
    const today = this.formatDate(new Date());
    const todayRibbon = this.moodRibbons.get(today);
    
    return !todayRibbon || todayRibbon.confidence < 0.5;
  }

  recordMoodChipShown(): void {
    localStorage.setItem('lastMoodChipShown', Date.now().toString());
  }

  // Joy Highlights
  detectJoyMoments(ribbons: MoodRibbon[]): Array<{ date: string; reason: string; intensity: number }> {
    const joyMoments: Array<{ date: string; reason: string; intensity: number }> = [];

    for (let i = 1; i < ribbons.length; i++) {
      const current = ribbons[i];
      const previous = ribbons[i - 1];

      // Look for positive mood jumps
      const moodImprovement = current.mood - previous.mood;
      if (moodImprovement > 0.2 && current.confidence > 0.5) {
        const primaryDriver = current.drivers.find(d => d.impact > 0.2);
        
        if (primaryDriver) {
          joyMoments.push({
            date: current.date,
            reason: primaryDriver.explanation,
            intensity: moodImprovement
          });
        }
      }

      // Look for high absolute mood with good reasons
      if (current.mood > 0.75 && current.confidence > 0.6) {
        const strongPositiveDriver = current.drivers.find(d => d.impact > 0.3);
        
        if (strongPositiveDriver) {
          joyMoments.push({
            date: current.date,
            reason: `High ${strongPositiveDriver.factor.toLowerCase()}`,
            intensity: current.mood
          });
        }
      }
    }

    return joyMoments
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 5); // Top 5 joy moments
  }

  // Utility
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  exportMoodData(): any {
    return {
      ribbons: Object.fromEntries(this.moodRibbons),
      signals: this.moodSignals.slice(-1000), // Last 1000 signals
      lastExplicitMood: this.lastExplicitMood
    };
  }
}

export const moodBehaviorEngine = new MoodBehaviorEngine();
