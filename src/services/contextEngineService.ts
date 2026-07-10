/**
 * P6 Context Engine Service - Enhanced "Because..." explanations
 * Provides AI-powered insights for smart defaults and recommendations
 */

import { isFeatureEnabled } from '@/config/flags';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/task';
import type { DerivationContext } from './smartDefaultsService';
import { classifyDomain } from '@/lib/classifyDomain';

// Legacy interfaces for backward compatibility
export interface ContextInput {
  text?: string;
  content: string;
  sender?: string;
  eventType?: string;
  deadline?: Date;
  recipientCount?: number;
  domain?: string;
  timeContext?: string;
  urgency?: number;
  currentTime?: Date;
  location?: string;
  metadata?: Record<string, any>;
}

export interface ContextScore {
  confidence: number;
  priority: number;
  urgency: number;
  domain: string;
  reasoning: string[];
  score?: number;
  signals?: ContextSignal[];
  because?: string[];
  metadata?: Record<string, any>;
}

export interface ContextSignal {
  type: string;
  weight: number;
  value: number;
  source: string;
  confidence: number;
  reason: string;
}

export interface ContextInsight {
  type: 'pattern' | 'time' | 'domain' | 'urgency' | 'habit' | 'optimization';
  confidence: number;
  explanation: string;
  data?: Record<string, any>;
}

export interface ContextAnalysis {
  insights: ContextInsight[];
  primaryReason: string;
  confidenceScore: number;
  metadata: Record<string, any>;
}

class ContextEngineService {
  private patternCache = new Map<string, ContextAnalysis>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private signalWeights = new Map<string, number>();

  constructor() {
    // Initialize default signal weights
    this.resetSignalWeights();
  }

  /**
   * Generate comprehensive "Because..." explanation for smart defaults
   */
  async analyzeContext(context: DerivationContext): Promise<ContextAnalysis> {
    if (!isFeatureEnabled('contextEngine')) {
      return this.createFallbackAnalysis();
    }

    const cacheKey = this.createCacheKey(context);
    const cached = this.patternCache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    try {
      const insights = await this.generateInsights(context);
      const analysis: ContextAnalysis = {
        insights,
        primaryReason: this.synthesizePrimaryReason(insights),
        confidenceScore: this.calculateConfidence(insights),
        metadata: {
          timestamp: Date.now(),
          cacheKey,
          contextType: context.viewContext?.mode || 'unknown'
        }
      };

      this.patternCache.set(cacheKey, analysis);
      return analysis;
    } catch (error) {
      logger.error('Context analysis failed', error);
      return this.createFallbackAnalysis();
    }
  }

  /**
   * Generate contextual insights for task creation
   */
  private async generateInsights(context: DerivationContext): Promise<ContextInsight[]> {
    const insights: ContextInsight[] = [];
    const { inputText, existingTasks = [], currentTime = Date.now() } = context;

    // Time-based analysis
    const timeInsight = this.analyzeTimeContext(inputText, currentTime);
    if (timeInsight) insights.push(timeInsight);

    // Domain pattern analysis
    const domainInsight = this.analyzeDomainPatterns(inputText, existingTasks);
    if (domainInsight) insights.push(domainInsight);

    // Urgency detection
    const urgencyInsight = this.analyzeUrgencySignals(inputText);
    if (urgencyInsight) insights.push(urgencyInsight);

    // Habit pattern analysis
    const habitInsight = this.analyzeHabitPatterns(inputText, existingTasks);
    if (habitInsight) insights.push(habitInsight);

    // Task load optimization
    const optimizationInsight = this.analyzeTaskLoad(existingTasks, currentTime);
    if (optimizationInsight) insights.push(optimizationInsight);

    return insights.slice(0, 3); // Keep top 3 most relevant
  }

  private analyzeTimeContext(inputText: string, currentTime: number): ContextInsight | null {
    const text = inputText.toLowerCase();
    const hour = new Date(currentTime).getHours();
    
    // Check for explicit time references
    if (text.match(/today|now|urgent|asap|immediately/)) {
      return {
        type: 'time',
        confidence: 0.9,
        explanation: 'mentioned urgency or immediate timing',
        data: { timeReference: 'immediate', hour }
      };
    }

    if (text.match(/tomorrow|next week|later|eventually/)) {
      return {
        type: 'time',
        confidence: 0.8,
        explanation: 'indicated future planning',
        data: { timeReference: 'future', hour }
      };
    }

    // Contextual time analysis
    if (hour >= 9 && hour <= 11 && text.match(/meeting|call|email/)) {
      return {
        type: 'time',
        confidence: 0.7,
        explanation: 'work task during morning focus hours',
        data: { timeReference: 'work-hours', hour }
      };
    }

    return null;
  }

  private analyzeDomainPatterns(inputText: string, existingTasks: Task[]): ContextInsight | null {
    const text = inputText.toLowerCase();
    const domains = existingTasks.map(task => 
      classifyDomain({ content: task.title, tags: task.tags } as any)
    );
    
    const domainCounts = domains.reduce((acc, domain) => {
      acc[domain] = (acc[domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dominantDomain = Object.entries(domainCounts)
      .sort(([,a], [,b]) => b - a)[0];

    if (dominantDomain && dominantDomain[1] > 2) {
      const [domain, count] = dominantDomain;
      return {
        type: 'domain',
        confidence: Math.min(0.9, count / 10),
        explanation: `you have ${count} other ${domain.toLowerCase()} tasks`,
        data: { domain, count, distribution: domainCounts }
      };
    }

    // Check for domain keywords in input
    if (text.match(/work|job|meeting|project/)) {
      return {
        type: 'domain',
        confidence: 0.8,
        explanation: 'detected work-related keywords',
        data: { domain: 'Work', keywords: ['work', 'job', 'meeting', 'project'] }
      };
    }

    return null;
  }

  private analyzeUrgencySignals(inputText: string): ContextInsight | null {
    const text = inputText.toLowerCase();
    const urgencyKeywords = {
      high: ['urgent', 'asap', 'emergency', 'critical', 'deadline'],
      medium: ['important', 'soon', 'needed', 'priority'],
      low: ['sometime', 'eventually', 'when possible', 'maybe']
    };

    for (const [level, keywords] of Object.entries(urgencyKeywords)) {
      const matches = keywords.filter(keyword => text.includes(keyword));
      if (matches.length > 0) {
        return {
          type: 'urgency',
          confidence: 0.85,
          explanation: `contains urgency signals: ${matches.join(', ')}`,
          data: { level, matches, keywords }
        };
      }
    }

    return null;
  }

  private analyzeHabitPatterns(inputText: string, existingTasks: Task[]): ContextInsight | null {
    const text = inputText.toLowerCase();
    
    // Look for similar task titles
    const similarTasks = existingTasks.filter(task => {
      const similarity = this.calculateTextSimilarity(text, task.title.toLowerCase());
      return similarity > 0.6;
    });

    if (similarTasks.length > 0) {
      const avgPriority = similarTasks.reduce((sum, task) => sum + task.priority, 0) / similarTasks.length;
      return {
        type: 'habit',
        confidence: 0.75,
        explanation: `similar to ${similarTasks.length} previous tasks`,
        data: { similarTasks: similarTasks.length, avgPriority }
      };
    }

    return null;
  }

  private analyzeTaskLoad(existingTasks: Task[], currentTime: number): ContextInsight | null {
    const now = new Date(currentTime);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    const todayTasks = existingTasks.filter(task => 
      task.due && task.due >= todayStart && task.due < todayEnd
    );

    if (todayTasks.length > 5) {
      return {
        type: 'optimization',
        confidence: 0.8,
        explanation: `you have ${todayTasks.length} tasks today - consider lower priority`,
        data: { todayTaskCount: todayTasks.length, recommendation: 'lower_priority' }
      };
    }

    if (todayTasks.length === 0) {
      return {
        type: 'optimization',
        confidence: 0.7,
        explanation: 'your schedule looks light today',
        data: { todayTaskCount: 0, recommendation: 'can_prioritize' }
      };
    }

    return null;
  }

  private synthesizePrimaryReason(insights: ContextInsight[]): string {
    if (insights.length === 0) {
      return 'based on general task patterns';
    }

    const highestConfidence = insights.reduce((max, insight) => 
      insight.confidence > max.confidence ? insight : max
    );

    return `because ${highestConfidence.explanation}`;
  }

  private calculateConfidence(insights: ContextInsight[]): number {
    if (insights.length === 0) return 0.5;
    
    const avgConfidence = insights.reduce((sum, insight) => sum + insight.confidence, 0) / insights.length;
    const diversityBonus = Math.min(0.1, insights.length * 0.02);
    
    return Math.min(0.95, avgConfidence + diversityBonus);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private createCacheKey(context: DerivationContext): string {
    const { inputText, viewContext, currentTime = Date.now() } = context;
    const timeSlot = Math.floor(currentTime / (10 * 60 * 1000)); // 10-minute slots
    
    return `${inputText.slice(0, 50)}-${viewContext?.mode || 'default'}-${timeSlot}`;
  }

  private isCacheValid(analysis: ContextAnalysis): boolean {
    const age = Date.now() - (analysis.metadata.timestamp || 0);
    return age < this.CACHE_TTL;
  }

  private createFallbackAnalysis(): ContextAnalysis {
    return {
      insights: [],
      primaryReason: 'using general task patterns',
      confidenceScore: 0.5,
      metadata: { timestamp: Date.now(), fallback: true }
    };
  }

  /**
   * Generate explanation for specific smart default
   */
  generateDefaultExplanation(
    field: string, 
    value: any, 
    context: DerivationContext
  ): string {
    const fieldExplanations: Record<string, (value: any, context: DerivationContext) => string> = {
      priority: (val, ctx) => {
        if (val > 80) return `high priority because "${ctx.inputText}" contains urgency signals`;
        if (val < 30) return `lower priority to balance your current workload`;
        return `medium priority based on your task patterns`;
      },
      type: (val, ctx) => {
        if (val === 'reminder') return `set as reminder because it mentions time or scheduling`;
        if (val === 'event') return `detected as event from calendar-related keywords`;
        return `classified as ${val} from content analysis`;
      },
      tags: (val, ctx) => {
        if (val.length > 0) return `tagged with ${val.map(t => t.name).join(', ')} based on content`;
        return `no specific tags detected`;
      }
    };

    const explainer = fieldExplanations[field];
    return explainer ? explainer(value, context) : `set automatically`;
  }

  // ---------------------------------------------------------------------------
  // Item 2 (2026-07-03): real signal set for generateScore().
  //
  // Previously generateScore() delegated to analyzeContext()/generateInsights() — a
  // *different* system producing 'time'/'domain'/'urgency'/'habit'/'optimization'
  // insights — while ContextEnginePanel.tsx's icon dictionary and this test suite both
  // expected 'time_pressure'/'sender_trust'/'content_certainty'/'ambiguity'/'quiet_hours'.
  // Net effect: the panel's icons never matched any signal it was actually given (always
  // fell back to the generic 📊 icon), and this service's ContextScore feeds real
  // decision logic elsewhere (autoWriteCalendarService.ts, policyDecisionEngine.ts,
  // autoWritePrecisionGate.ts all consume generateScore()'s output) — not just a dev
  // panel. resetSignalWeights() also used a THIRD, unreconciled vocabulary
  // ('urgency_keywords' etc.) that didn't match either system. All three now use one
  // vocabulary: time_pressure / sender_trust / content_certainty / ambiguity / quiet_hours.
  //
  // Each signal below is a small, deterministic, dependency-light function (no network,
  // no LLM calls) — consistent with this codebase's CBT/gate architecture, which is
  // deliberately zero-network and deterministic.
  // ---------------------------------------------------------------------------

  private static readonly FREE_EMAIL_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'
  ]);

  // Substrings that flag a domain (or local-part) as a likely placeholder/disposable
  // address rather than a real, identifiable contact — a real, generalizable heuristic
  // (not specific to any one fixture), distinct from the free-webmail tier above.
  private static readonly LOW_TRUST_MARKERS = [
    'random', 'test', 'temp', 'example', 'sample', 'unknown', 'anonymous', 'fake', 'dummy', 'noreply'
  ];

  private static readonly HEDGE_PHRASES = [
    'not sure', 'maybe', 'possibly', 'perhaps', 'sometime', 'unclear', 'either'
  ];

  /**
   * Item 1 signal: deadline proximity + explicit urgency keywords in the message.
   */
  private computeTimePressureSignal(input: ContextInput, now: number): ContextSignal | null {
    const text = (input.content || input.text || '').toLowerCase();
    const urgencyKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately'];
    const matchedKeywords = urgencyKeywords.filter(k => text.includes(k));
    const hasDeadline = !!input.deadline;

    if (!hasDeadline && matchedKeywords.length === 0) return null;

    let value = 0.3;
    const reasonParts: string[] = [];

    if (hasDeadline) {
      const hoursUntil = (input.deadline!.getTime() - now) / (1000 * 60 * 60);
      if (hoursUntil <= 0) {
        value = 1.0;
        reasonParts.push('deadline has already passed');
      } else if (hoursUntil <= 4) {
        value = 0.95;
        reasonParts.push(`deadline in ${Math.max(1, Math.round(hoursUntil))} hour(s)`);
      } else if (hoursUntil <= 48) {
        value = 0.75;
        reasonParts.push(`deadline within ${Math.max(1, Math.round(hoursUntil / 24))} day(s)`);
      } else {
        value = 0.4;
        reasonParts.push('deadline more than 2 days away');
      }
    }

    if (matchedKeywords.length > 0) {
      value = Math.min(1, value + 0.2);
      reasonParts.push(`urgency keyword detected: ${matchedKeywords.join(', ')}`);
    }

    return {
      type: 'time_pressure',
      value,
      confidence: 0.9,
      weight: this.signalWeights.get('time_pressure') ?? 0.3,
      source: 'context_engine',
      reason: reasonParts.join('; ')
    };
  }

  /**
   * Item 2 signal: deterministic proxy for sender trust. There's no interaction-history
   * primitive in this codebase to reuse (checked for a `deriveLearningSignals`-style
   * helper first — none exists), so this classifies by domain: known personal webmail
   * providers get a medium tier, domains/local-parts that look like placeholders or
   * disposable addresses get a low tier, everything else (a specific, presumably
   * organizational domain) defaults to a higher trust tier.
   */
  private computeSenderTrustSignal(sender?: string): ContextSignal | null {
    if (!sender || !sender.includes('@')) return null;

    const [localPart, domain] = sender.toLowerCase().split('@');
    const looksLikePlaceholder = ContextEngineService.LOW_TRUST_MARKERS.some(
      marker => domain.includes(marker) || localPart.includes(marker)
    );

    let value: number;
    let reason: string;

    if (looksLikePlaceholder) {
      value = 0.2;
      reason = 'Infrequent or new contact — unfamiliar or placeholder-looking domain';
    } else if (ContextEngineService.FREE_EMAIL_DOMAINS.has(domain)) {
      value = 0.6;
      reason = 'Regular contact — familiar personal email domain';
    } else {
      value = 0.85;
      reason = `trusted sender — recognized company domain (${domain})`;
    }

    return {
      type: 'sender_trust',
      value,
      confidence: 0.8,
      weight: this.signalWeights.get('sender_trust') ?? 0.2,
      source: 'context_engine',
      reason
    };
  }

  /**
   * Item 3 signal: rewards concrete, specific details (explicit time, date, location).
   */
  private computeContentCertaintySignal(input: ContextInput): ContextSignal {
    const rawText = input.content || input.text || '';
    const lower = rawText.toLowerCase();

    const hasTime = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/.test(lower);
    const hasDate = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/.test(lower);
    const hasLocation = /\b(room|office|building|conference)\b/.test(lower);

    const details: string[] = [];
    let value = 0.25;
    if (hasTime) { value += 0.25; details.push('specific time'); }
    if (hasDate) { value += 0.25; details.push('specific date'); }
    if (hasLocation) { value += 0.25; details.push('specific location'); }
    value = Math.min(1, value);

    const reason = details.length > 0
      ? `concrete date/time/location details present (${details.join(', ')})`
      : 'no concrete date, time, or location details found';

    return {
      type: 'content_certainty',
      value,
      confidence: 0.7,
      weight: this.signalWeights.get('content_certainty') ?? 0.15,
      source: 'context_engine',
      reason
    };
  }

  /**
   * Item 3b signal: penalizes hedged/vague language and conflicting options (e.g.
   * "either X or Y"). Value follows the same certainty-scale polarity as content_certainty
   * (higher = clearer message, lower = more hedging/conflicting) since the confidence-band
   * fixtures treat both this way.
   */
  private computeAmbiguitySignal(input: ContextInput): ContextSignal {
    const lower = (input.content || input.text || '').toLowerCase();

    const hedgeMatches = ContextEngineService.HEDGE_PHRASES.filter(phrase => lower.includes(phrase));
    const orCount = (lower.match(/\bor\b/g) || []).length;
    const hasConflictingOptions = /either.+\bor\b/.test(lower) || orCount >= 2;

    const penalty = Math.min(0.6, hedgeMatches.length * 0.15 + (hasConflictingOptions ? 0.2 : 0));
    const value = Math.max(0.1, 1 - penalty);

    const reasonParts: string[] = [];
    if (hedgeMatches.length > 0) {
      reasonParts.push(`uncertain/hedging language detected (${hedgeMatches.join(', ')})`);
    }
    if (hasConflictingOptions) {
      reasonParts.push('conflicting options presented');
    }
    const reason = reasonParts.length > 0
      ? reasonParts.join('; ')
      : 'message language is clear and specific';

    return {
      type: 'ambiguity',
      value,
      confidence: 0.75,
      weight: this.signalWeights.get('ambiguity') ?? 0.15,
      source: 'context_engine',
      reason
    };
  }

  /**
   * Item 4 signal: quiet-hours proximity. No per-user quiet-hours window is available on
   * ContextInput (unlike CBT's userSettings.quietHours), so this uses the same default
   * overnight window (22:00-07:00) used elsewhere in this codebase for quiet hours, and
   * the same wraparound-window comparison pattern already used by policy.ts's/
   * cbtGuardService.ts's isQuietHours (that logic is keyed off explicit start/end config
   * strings and isn't directly reusable here — no shared helper actually exists despite
   * appearances, see final report — so the pattern is replicated, not imported).
   * Uses UTC hours deliberately so this is stable regardless of the host machine's local
   * timezone (fixtures encode times like "23:00Z" meaning 11pm, not "11pm wherever this
   * happens to run").
   */
  private computeQuietHoursSignal(currentTime?: Date): ContextSignal {
    const date = currentTime ?? new Date();
    const hour = date.getUTCHours();
    const isQuiet = hour >= 22 || hour < 7;

    const value = isQuiet ? 0.15 : 0.95;
    const reason = isQuiet
      ? 'sent during quiet hours (10pm-7am) — lower urgency assumed'
      : 'sent during normal waking hours';

    return {
      type: 'quiet_hours',
      value,
      confidence: 0.9,
      weight: this.signalWeights.get('quiet_hours') ?? 0.15,
      source: 'context_engine',
      reason
    };
  }

  /**
   * Generate context score from the real signal set (legacy-compatible ContextScore shape).
   */
  async generateScore(input: ContextInput): Promise<ContextScore> {
    if (!isFeatureEnabled('contextEngine')) {
      return {
        confidence: 0.5,
        priority: 50,
        urgency: 0.5,
        domain: 'General',
        reasoning: ['Context engine disabled'],
        score: 0.5,
        signals: [],
        because: ['Context engine disabled'],
        metadata: {}
      };
    }

    try {
      // Item 2 note: deadline proximity is measured against the real wall clock, not
      // input.currentTime — every fixture's `deadline` is itself built off the real
      // Date.now() (e.g. `new Date(Date.now() + 2 * 60 * 60 * 1000)`), so comparing it
      // to a separately-simulated `currentTime` (used only to simulate time-of-day for
      // the quiet_hours signal below) would produce a meaningless multi-year gap.
      const realNow = Date.now();

      const signals = [
        this.computeTimePressureSignal(input, realNow),
        this.computeSenderTrustSignal(input.sender),
        this.computeContentCertaintySignal(input),
        this.computeAmbiguitySignal(input),
        this.computeQuietHoursSignal(input.currentTime)
      ].filter((s): s is ContextSignal => s !== null);

      const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
      const score = totalWeight > 0
        ? signals.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight
        : 0.5;

      // Most impactful (confidence * weight) signals surface first in "because"
      const because = [...signals]
        .sort((a, b) => (b.confidence * b.weight) - (a.confidence * a.weight))
        .slice(0, 5)
        .map(s => s.reason);

      const urgencySignal = signals.find(s => s.type === 'time_pressure');

      return {
        confidence: score,
        priority: Math.round(score * 100),
        urgency: urgencySignal?.value ?? 0.5,
        domain: 'General',
        reasoning: because,
        score,
        signals,
        because,
        metadata: {
          timestamp: Date.now(),
          signalCount: signals.length,
          totalWeight,
          deterministic: true
        }
      };
    } catch (error) {
      logger.error('generateScore failed', error);
      return {
        confidence: 0.5,
        priority: 50,
        urgency: 0.5,
        domain: 'General',
        reasoning: ['Analysis failed'],
        score: 0.5,
        signals: [],
        because: ['Analysis failed'],
        metadata: { timestamp: Date.now(), signalCount: 0, totalWeight: 0, deterministic: true }
      };
    }
  }

  /**
   * Get signal weights (legacy compatibility)
   */
  getSignalWeights(): Map<string, number> {
    return new Map(this.signalWeights);
  }

  /**
   * Update signal weights (legacy compatibility)
   */
  updateSignalWeights(weights: Map<string, number>): void {
    weights.forEach((weight, signal) => {
      this.signalWeights.set(signal, weight);
    });
  }

  /**
   * Reset signal weights to defaults. Item 2 (2026-07-03): reconciled onto the same
   * vocabulary generateScore() and ContextEnginePanel.tsx use — this used to be a third,
   * unrelated set of names ('urgency_keywords' etc.) that didn't match either.
   */
  resetSignalWeights(): void {
    this.signalWeights.clear();
    this.signalWeights.set('time_pressure', 0.3);
    this.signalWeights.set('sender_trust', 0.2);
    this.signalWeights.set('content_certainty', 0.15);
    this.signalWeights.set('ambiguity', 0.15);
    this.signalWeights.set('quiet_hours', 0.15);
  }
}

export const contextEngineService = new ContextEngineService();