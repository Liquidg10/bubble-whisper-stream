/**
 * Production Telemetry Service - P20 Phase 3
 * Centralized metrics collection for production monitoring
 */

interface TelemetryEvent {
  id: string;
  timestamp: number;
  event: string;
  data: Record<string, any>;
  userId?: string;
  sessionId: string;
  version: string;
}

interface StabilityMetrics {
  errorRate: number;
  performanceScore: number;
  completionRate: number;
  userSatisfaction: number;
  crashRate: number;
  responseTime: number;
}

interface CanaryMetrics {
  cohort: '5%' | '25%' | '100%';
  stability: StabilityMetrics;
  userFeedback: {
    positive: number;
    negative: number;
    neutral: number;
  };
  featureUsage: Record<string, number>;
}

class TelemetryService {
  private readonly sessionId: string;
  private readonly batchSize = 50;
  private eventQueue: TelemetryEvent[] = [];
  private version: string;
  private lastFlush = Date.now();

  constructor() {
    this.sessionId = this.generateSessionId();
    this.version = '1.0.0'; // Would come from package.json in real app
    
    // Flush events periodically
    setInterval(() => this.flushEvents(), 30000);
    
    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flushEvents());
  }

  /**
   * Track a telemetry event
   */
  track(event: string, data: Record<string, any> = {}, userId?: string): void {
    const telemetryEvent: TelemetryEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      event,
      data,
      userId,
      sessionId: this.sessionId,
      version: this.version
    };

    this.eventQueue.push(telemetryEvent);
    
    // Flush if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  /**
   * Calculate current stability metrics
   */
  calculateStabilityMetrics(): StabilityMetrics {
    const events = this.getRecentEvents(60 * 60 * 1000); // Last hour
    
    const errorEvents = events.filter(e => e.event.includes('error') || e.event.includes('crash'));
    const performanceEvents = events.filter(e => e.event === 'performance_measure');
    const completionEvents = events.filter(e => e.event === 'task_completed');
    const startEvents = events.filter(e => e.event === 'task_created');
    const feedbackEvents = events.filter(e => e.event === 'user_feedback');

    return {
      errorRate: errorEvents.length / Math.max(events.length, 1),
      performanceScore: this.calculatePerformanceScore(performanceEvents),
      completionRate: completionEvents.length / Math.max(startEvents.length, 1),
      userSatisfaction: this.calculateSatisfactionScore(feedbackEvents),
      crashRate: events.filter(e => e.event === 'crash').length / Math.max(events.length, 1),
      responseTime: this.calculateAverageResponseTime(performanceEvents)
    };
  }

  /**
   * Get canary rollout metrics
   */
  getCanaryMetrics(cohort: '5%' | '25%' | '100%'): CanaryMetrics {
    const stability = this.calculateStabilityMetrics();
    const feedbackEvents = this.getRecentEvents(24 * 60 * 60 * 1000) // Last 24 hours
      .filter(e => e.event === 'user_feedback');
    
    const featureEvents = this.getRecentEvents(24 * 60 * 60 * 1000)
      .filter(e => e.event.startsWith('feature_used_'));

    const featureUsage: Record<string, number> = {};
    featureEvents.forEach(event => {
      const feature = event.event.replace('feature_used_', '');
      featureUsage[feature] = (featureUsage[feature] || 0) + 1;
    });

    const userFeedback = {
      positive: feedbackEvents.filter(e => e.data.sentiment === 'positive').length,
      negative: feedbackEvents.filter(e => e.data.sentiment === 'negative').length,
      neutral: feedbackEvents.filter(e => e.data.sentiment === 'neutral').length
    };

    return {
      cohort,
      stability,
      userFeedback,
      featureUsage
    };
  }

  /**
   * Check if rollback should be triggered
   */
  shouldTriggerRollback(): { shouldRollback: boolean; reason?: string } {
    const metrics = this.calculateStabilityMetrics();
    
    // Critical thresholds for rollback
    if (metrics.errorRate > 0.05) { // 5% error rate
      return { shouldRollback: true, reason: `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%` };
    }
    
    if (metrics.crashRate > 0.01) { // 1% crash rate
      return { shouldRollback: true, reason: `High crash rate: ${(metrics.crashRate * 100).toFixed(1)}%` };
    }
    
    if (metrics.performanceScore < 0.7) { // Performance score below 70%
      return { shouldRollback: true, reason: `Poor performance: ${(metrics.performanceScore * 100).toFixed(1)}%` };
    }
    
    if (metrics.userSatisfaction < 0.6) { // User satisfaction below 60%
      return { shouldRollback: true, reason: `Low user satisfaction: ${(metrics.userSatisfaction * 100).toFixed(1)}%` };
    }

    return { shouldRollback: false };
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(feature: string, context?: Record<string, any>): void {
    this.track(`feature_used_${feature}`, {
      feature,
      context: context || {},
      timestamp: Date.now()
    });
  }

  /**
   * Track performance measurement
   */
  trackPerformance(metric: string, value: number, context?: Record<string, any>): void {
    this.track('performance_measure', {
      metric,
      value,
      context: context || {}
    });
  }

  /**
   * Track user feedback
   */
  trackUserFeedback(sentiment: 'positive' | 'negative' | 'neutral', feedback?: string): void {
    this.track('user_feedback', {
      sentiment,
      feedback: feedback || '',
      timestamp: Date.now()
    });
  }

  /**
   * Track error
   */
  trackError(error: Error, context?: Record<string, any>): void {
    this.track('error', {
      message: error.message,
      stack: error.stack,
      context: context || {}
    });
  }

  /**
   * Get production readiness score
   */
  getProductionReadinessScore(): number {
    const metrics = this.calculateStabilityMetrics();
    
    // Weighted score calculation
    const weights = {
      errorRate: 0.25,      // 25% weight - inverted (lower is better)
      performanceScore: 0.25, // 25% weight
      completionRate: 0.2,   // 20% weight  
      userSatisfaction: 0.2, // 20% weight
      crashRate: 0.1         // 10% weight - inverted (lower is better)
    };

    return (
      (1 - metrics.errorRate) * weights.errorRate +
      metrics.performanceScore * weights.performanceScore +
      metrics.completionRate * weights.completionRate +
      metrics.userSatisfaction * weights.userSatisfaction +
      (1 - metrics.crashRate) * weights.crashRate
    );
  }

  /**
   * Flush events to analytics backend
   */
  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];
    this.lastFlush = Date.now();

    try {
      // In production, this would send to analytics backend
      console.log(`[Telemetry] Flushing ${events.length} events`, {
        sessionId: this.sessionId,
        events: events.slice(0, 3) // Log first few for debugging
      });
      
      // Store locally for development
      const existingEvents = JSON.parse(localStorage.getItem('telemetry_events') || '[]');
      const updatedEvents = [...existingEvents, ...events].slice(-1000); // Keep last 1000 events
      localStorage.setItem('telemetry_events', JSON.stringify(updatedEvents));
      
    } catch (error) {
      console.error('[Telemetry] Failed to flush events:', error);
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Get recent events from storage
   */
  private getRecentEvents(timeWindow: number): TelemetryEvent[] {
    try {
      const events = JSON.parse(localStorage.getItem('telemetry_events') || '[]');
      const cutoff = Date.now() - timeWindow;
      return events.filter((event: TelemetryEvent) => event.timestamp > cutoff);
    } catch {
      return [];
    }
  }

  /**
   * Calculate performance score from performance events
   */
  private calculatePerformanceScore(performanceEvents: TelemetryEvent[]): number {
    if (performanceEvents.length === 0) return 0.8; // Default score

    const targetMetrics = {
      fps: 55,           // Target FPS
      memory: 50,        // Target memory usage (MB)
      responseTime: 200  // Target response time (ms)
    };

    let totalScore = 0;
    let validMetrics = 0;

    performanceEvents.forEach(event => {
      const { metric, value } = event.data;
      
      if (metric === 'fps' && value !== undefined) {
        totalScore += Math.min(1.0, value / targetMetrics.fps);
        validMetrics++;
      } else if (metric === 'memory' && value !== undefined) {
        totalScore += Math.max(0, 1.0 - (value / 100)); // Inverted - lower is better
        validMetrics++;
      } else if (metric === 'responseTime' && value !== undefined) {
        totalScore += Math.max(0, 1.0 - (value / 1000)); // Inverted - lower is better  
        validMetrics++;
      }
    });

    return validMetrics > 0 ? totalScore / validMetrics : 0.8;
  }

  /**
   * Calculate user satisfaction score
   */
  private calculateSatisfactionScore(feedbackEvents: TelemetryEvent[]): number {
    if (feedbackEvents.length === 0) return 0.7; // Neutral default

    const sentimentScores = {
      positive: 1.0,
      neutral: 0.5,
      negative: 0.0
    };

    let totalScore = 0;
    feedbackEvents.forEach(event => {
      const sentiment = event.data.sentiment;
      totalScore += sentimentScores[sentiment] || 0.5;
    });

    return totalScore / feedbackEvents.length;
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(performanceEvents: TelemetryEvent[]): number {
    const responseTimeEvents = performanceEvents.filter(e => e.data.metric === 'responseTime');
    
    if (responseTimeEvents.length === 0) return 0;

    const total = responseTimeEvents.reduce((sum, event) => sum + (event.data.value || 0), 0);
    return total / responseTimeEvents.length;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const telemetryService = new TelemetryService();