/**
 * P2 Enhanced - Crisis Detection Service
 * Implements advanced crisis safety with nudge suppression
 */

import { logger } from '@/utils/logger';
import { isFeatureEnabled } from '@/config/flags';
import { cognitiveLoadGovernor } from './cognitiveLoadGovernor';

export interface CrisisSignal {
  type: 'language' | 'behavior' | 'context' | 'escalation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  source: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface CrisisState {
  isActive: boolean;
  level: 'none' | 'watch' | 'intervention' | 'emergency';
  signals: CrisisSignal[];
  activatedAt?: number;
  suppressNudges: boolean;
  emergencyResources: {
    hotline: string;
    text: string;
    web: string;
  };
}

class CrisisDetectionService {
  private readonly STORAGE_KEY = 'crisis_state';
  private currentState: CrisisState | null = null;

  // Language patterns that may indicate crisis (conservative patterns)
  private readonly CRISIS_PATTERNS = {
    high: [
      /\b(want to die|kill myself|end it all|can't go on|no point|better off dead)\b/i,
      /\b(suicide|self-harm|self harm|hurt myself|cutting)\b/i
    ],
    medium: [
      /\b(hopeless|worthless|meaningless|can't take it|giving up|done with life)\b/i,
      /\b(everyone would be better|burden to everyone|hate myself)\b/i
    ],
    low: [
      /\b(overwhelmed|exhausted|can't cope|falling apart|breaking down)\b/i,
      /\b(alone|isolated|nobody cares|nobody understands)\b/i
    ]
  };

  private readonly EMERGENCY_RESOURCES = {
    us: {
      hotline: '988',
      text: 'Text HOME to 741741',
      web: 'https://suicidepreventionlifeline.org'
    },
    uk: {
      hotline: '116 123',
      text: 'Text SHOUT to 85258',
      web: 'https://www.samaritans.org'
    },
    // Default to US resources
    default: {
      hotline: '988',
      text: 'Text HOME to 741741',
      web: 'https://suicidepreventionlifeline.org'
    }
  };

  initialize(): void {
    this.loadState();
  }

  analyzeText(text: string, context?: { userId?: string; source?: string }): CrisisSignal[] {
    if (!isFeatureEnabled('cbtCrisisEnabled')) {
      return [];
    }

    const signals: CrisisSignal[] = [];
    const lowerText = text.toLowerCase();

    // Check language patterns
    for (const [severity, patterns] of Object.entries(this.CRISIS_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(lowerText)) {
          signals.push({
            type: 'language',
            severity: severity as CrisisSignal['severity'],
            confidence: 0.8,
            source: context?.source || 'text_analysis',
            timestamp: Date.now(),
            metadata: {
              pattern: pattern.source,
              matchLength: text.length,
              userId: context?.userId
            }
          });
        }
      }
    }

    return signals;
  }

  checkBehavioralSignals(context: {
    rapidDismissals?: number;
    lateNightActivity?: boolean;
    isolationSignals?: number;
    negativitySpike?: boolean;
  }): CrisisSignal[] {
    const signals: CrisisSignal[] = [];

    // Rapid dismissal of multiple nudges (fatigue + overwhelm)
    if (context.rapidDismissals && context.rapidDismissals >= 5) {
      signals.push({
        type: 'behavior',
        severity: 'medium',
        confidence: 0.6,
        source: 'dismissal_pattern',
        timestamp: Date.now(),
        metadata: { dismissalCount: context.rapidDismissals }
      });
    }

    // Late night activity combined with negative patterns
    if (context.lateNightActivity && context.negativitySpike) {
      signals.push({
        type: 'behavior',
        severity: 'medium',
        confidence: 0.5,
        source: 'temporal_pattern',
        timestamp: Date.now(),
        metadata: { timeOfDay: 'late_night', sentiment: 'negative' }
      });
    }

    return signals;
  }

  processSignals(signals: CrisisSignal[]): CrisisState {
    const state = this.getCurrentState();
    
    // Add new signals
    state.signals.push(...signals);
    
    // Keep only recent signals (last 24 hours)
    const now = Date.now();
    state.signals = state.signals.filter(signal => 
      now - signal.timestamp < 24 * 60 * 60 * 1000
    );

    // Determine crisis level
    const highSeverityCount = state.signals.filter(s => s.severity === 'high' || s.severity === 'critical').length;
    const mediumSeverityCount = state.signals.filter(s => s.severity === 'medium').length;

    if (highSeverityCount > 0) {
      state.level = 'emergency';
      state.isActive = true;
      state.suppressNudges = true;
      state.activatedAt = now;
    } else if (mediumSeverityCount >= 2) {
      state.level = 'intervention';
      state.isActive = true;
      state.suppressNudges = true;
      state.activatedAt = now;
    } else if (mediumSeverityCount >= 1 || state.signals.length >= 3) {
      state.level = 'watch';
      state.isActive = true;
      state.suppressNudges = false; // Don't suppress for watch level
    } else {
      state.level = 'none';
      state.isActive = false;
      state.suppressNudges = false;
    }

    // Set appropriate resources
    state.emergencyResources = this.EMERGENCY_RESOURCES.default;

    this.saveState(state);
    this.currentState = state;

    // Log for monitoring (anonymized)
    logger.info('Crisis state updated', {
      level: state.level,
      signalCount: state.signals.length,
      suppressNudges: state.suppressNudges,
      timestamp: now
    });

    return state;
  }

  getCurrentState(): CrisisState {
    if (!this.currentState) {
      this.loadState();
    }
    return this.currentState!;
  }

  shouldSuppressNudges(): boolean {
    const state = this.getCurrentState();
    return state.suppressNudges;
  }

  getCrisisResources(): CrisisState['emergencyResources'] | null {
    const state = this.getCurrentState();
    return state.isActive ? state.emergencyResources : null;
  }

  // Allow manual override for false positives
  dismissCrisisAlert(reason?: string): void {
    const state = this.getCurrentState();
    state.isActive = false;
    state.level = 'none';
    state.suppressNudges = false;
    state.signals = []; // Clear signals on manual dismiss
    
    this.saveState(state);
    this.currentState = state;

    logger.info('Crisis alert manually dismissed', { reason });
  }

  private loadState(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.currentState = JSON.parse(stored);
      } else {
        this.currentState = this.createDefaultState();
      }
    } catch (error) {
      logger.error('Failed to load crisis state', error);
      this.currentState = this.createDefaultState();
    }
  }

  private saveState(state: CrisisState): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      logger.error('Failed to save crisis state', error);
    }
  }

  private createDefaultState(): CrisisState {
    return {
      isActive: false,
      level: 'none',
      signals: [],
      suppressNudges: false,
      emergencyResources: this.EMERGENCY_RESOURCES.default
    };
  }
}

export const crisisDetectionService = new CrisisDetectionService();
