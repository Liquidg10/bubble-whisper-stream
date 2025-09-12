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

  // Legacy methods for backward compatibility
  /**
   * Generate context score (legacy compatibility)
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
      const context: DerivationContext = {
        inputText: input.content || input.text || '',
        viewContext: { viewId: 'legacy', mode: 'bubble', now: Date.now() },
        currentTime: Date.now()
      };

      const analysis = await this.analyzeContext(context);
      
      // Map new analysis to legacy format
      const urgencyInsight = analysis.insights.find(i => i.type === 'urgency');
      const domainInsight = analysis.insights.find(i => i.type === 'domain');
      
      return {
        confidence: analysis.confidenceScore,
        priority: this.calculateLegacyPriority(analysis.insights),
        urgency: urgencyInsight?.confidence || 0.5,
        domain: domainInsight?.data?.domain || 'General',
        reasoning: analysis.insights.map(i => i.explanation),
        score: analysis.confidenceScore,
        signals: this.convertInsightsToSignals(analysis.insights),
        because: analysis.insights.map(i => i.explanation),
        metadata: analysis.metadata
      };
    } catch (error) {
      logger.error('Legacy generateScore failed', error);
      return {
        confidence: 0.5,
        priority: 50,
        urgency: 0.5,
        domain: 'General',
        reasoning: ['Analysis failed'],
        score: 0.5,
        signals: [],
        because: ['Analysis failed'],
        metadata: {}
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
   * Reset signal weights to defaults (legacy compatibility)
   */
  resetSignalWeights(): void {
    this.signalWeights.clear();
    this.signalWeights.set('urgency_keywords', 0.8);
    this.signalWeights.set('time_references', 0.7);
    this.signalWeights.set('domain_patterns', 0.6);
    this.signalWeights.set('habit_similarity', 0.5);
    this.signalWeights.set('task_load', 0.4);
  }

  private calculateLegacyPriority(insights: ContextInsight[]): number {
    let priority = 50; // default
    
    insights.forEach(insight => {
      switch (insight.type) {
        case 'urgency':
          priority += insight.confidence * 30;
          break;
        case 'time':
          if (insight.data?.timeReference === 'immediate') {
            priority += 20;
          }
          break;
        case 'optimization':
          if (insight.data?.recommendation === 'lower_priority') {
            priority -= 15;
          }
          break;
      }
    });

    return Math.max(0, Math.min(100, priority));
  }

  private convertInsightsToSignals(insights: ContextInsight[]): ContextSignal[] {
    return insights.map(insight => ({
      type: insight.type,
      weight: insight.confidence,
      value: insight.confidence,
      source: 'context_engine',
      confidence: insight.confidence,
      reason: insight.explanation
    }));
  }
}

export const contextEngineService = new ContextEngineService();