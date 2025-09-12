/**
 * Metrics Collection Service
 * Emits and tracks system performance metrics
 */

export interface MetricData {
  id: string;
  type: MetricType;
  value: number;
  metadata?: Record<string, any>;
  timestamp: number;
  userId?: string;
  sessionId?: string;
}

export type MetricType = 
  | 'auto_write_rate'
  | 'downgrade_rate' 
  | 'undo_rate'
  | 'edit_distance'
  | 'watch_channel_health'
  | 'webhook_error'
  | 'scope_decay_action'
  | 'channel_expiry'
  | 'webhook_retry'
  // P19 Suggestion System Metrics
  | 'suggestion_impression'
  | 'suggestion_accept'
  | 'suggestion_dismiss'
  | 'suggestion_undo'
  | 'over_nudge_rate'
  // P19 Planning Mode Metrics
  | 'planning_mode_start'
  | 'planning_mode_complete'
  | 'planning_mode_abandon'
  // P19 Calendar Conversion Metrics
  | 'calendar_draft_created'
  | 'calendar_draft_to_send'
  | 'calendar_send_manual'
  // P19 Task System Canary Metrics
  | 'task_attempted'
  | 'task_completed'
  | 'task_system_stability';

export interface MetricSummary {
  type: MetricType;
  count: number;
  average: number;
  min: number;
  max: number;
  sum: number;
  trend: 'up' | 'down' | 'stable';
  lastValue: number;
  lastTimestamp: number;
}

export interface KPIData {
  autoWriteSuccessRate: number;
  avgEditDistance: number;
  undoSpike: boolean;
  channelHealthScore: number;
  webhookErrorRate: number;
  scopeDecayFrequency: number;
  totalMetrics: number;
  alertsTriggered: number;
}

class MetricsService {
  private metrics: MetricData[] = [];
  private sessionId: string;
  private readonly maxMetrics = 10000; // Keep last 10k metrics in memory
  
  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Emit a metric data point
   */
  emit(type: MetricType, value: number, metadata?: Record<string, any>): void {
    const metric: MetricData = {
      id: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      value,
      metadata: metadata || {},
      timestamp: Date.now(),
      userId: this.getCurrentUserId(),
      sessionId: this.sessionId
    };

    this.metrics.push(metric);
    
    // Keep only recent metrics in memory
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Emit to external systems (console for now, could be analytics)
    this.emitToExternal(metric);
    
    console.log(`[METRICS] ${type}: ${value}`, metadata);
  }

  /**
   * Auto-write success/failure rate
   */
  emitAutoWriteAttempt(success: boolean, confidence: number, type: 'calendar' | 'email'): void {
    this.emit('auto_write_rate', success ? 1 : 0, {
      confidence,
      type,
      success
    });
  }

  /**
   * Downgrade from auto-write to draft
   */
  emitDowngrade(reason: string, originalConfidence: number, type: 'calendar' | 'email'): void {
    this.emit('downgrade_rate', 1, {
      reason,
      originalConfidence,
      type
    });
  }

  /**
   * User undo action
   */
  emitUndo(action: string, timeAfterAction: number): void {
    this.emit('undo_rate', 1, {
      action,
      timeAfterAction
    });
  }

  /**
   * Edit distance between AI output and user's final version
   */
  emitEditDistance(distance: number, originalLength: number, finalLength: number, type: 'email' | 'calendar'): void {
    const normalizedDistance = originalLength > 0 ? distance / originalLength : 0;
    this.emit('edit_distance', normalizedDistance, {
      rawDistance: distance,
      originalLength,
      finalLength,
      type
    });
  }

  /**
   * Watch channel health metrics
   */
  emitChannelHealth(channelId: string, status: 'healthy' | 'expiring' | 'expired' | 'error', expiresIn?: number): void {
    const healthScore = status === 'healthy' ? 1 : status === 'expiring' ? 0.5 : 0;
    this.emit('watch_channel_health', healthScore, {
      channelId,
      status,
      expiresIn
    });
  }

  /**
   * Webhook error tracking
   */
  emitWebhookError(endpoint: string, errorCode: number, errorMessage: string, retryCount: number): void {
    this.emit('webhook_error', 1, {
      endpoint,
      errorCode,
      errorMessage,
      retryCount
    });
    
    if (retryCount > 0) {
      this.emit('webhook_retry', retryCount, {
        endpoint,
        errorCode
      });
    }
  }

  /**
   * Scope decay action (OAuth permission reduction)
   */
  emitScopeDecay(service: string, oldScopes: string[], newScopes: string[], reason: string): void {
    const scopesLost = oldScopes.length - newScopes.length;
    this.emit('scope_decay_action', scopesLost, {
      service,
      oldScopes,
      newScopes,
      scopesLost,
      reason
    });
  }

  /**
   * Channel expiry event
   */
  emitChannelExpiry(channelId: string, service: string, autoRenewed: boolean): void {
    this.emit('channel_expiry', 1, {
      channelId,
      service,
      autoRenewed
    });
  }

  // ============= P19 SUGGESTION METRICS =============

  /**
   * Track suggestion impression (when suggestion is shown)
   */
  emitSuggestionImpression(suggestionType: string, context: string, confidence: number): void {
    this.emit('suggestion_impression', 1, {
      suggestionType,
      context,
      confidence,
      timestamp: Date.now()
    });
  }

  /**
   * Track suggestion acceptance (user applied suggestion)
   */
  emitSuggestionAccept(suggestionType: string, context: string, timeToAccept: number): void {
    this.emit('suggestion_accept', 1, {
      suggestionType,
      context,
      timeToAccept,
      timestamp: Date.now()
    });
  }

  /**
   * Track suggestion dismissal (user explicitly dismissed)
   */
  emitSuggestionDismiss(suggestionType: string, context: string, timeToReject: number): void {
    this.emit('suggestion_dismiss', 1, {
      suggestionType,
      context,
      timeToReject,
      timestamp: Date.now()
    });
  }

  /**
   * Track suggestion undo (user undid suggestion application)
   */
  emitSuggestionUndo(suggestionType: string, context: string, timeAfterAccept: number): void {
    this.emit('suggestion_undo', 1, {
      suggestionType,
      context,
      timeAfterAccept,
      timestamp: Date.now()
    });
  }

  /**
   * Track over-nudge rate (too many suggestions in short period)
   */
  emitOverNudge(suggestionCount: number, timeWindow: number, userFatigue: boolean): void {
    this.emit('over_nudge_rate', 1, {
      suggestionCount,
      timeWindow,
      userFatigue,
      timestamp: Date.now()
    });
  }

  // ============= P19 PLANNING MODE METRICS =============

  /**
   * Track planning mode session start
   */
  emitPlanningModeStart(context: string, trigger: string): void {
    this.emit('planning_mode_start', 1, {
      context,
      trigger,
      sessionId: this.generateSessionId(),
      timestamp: Date.now()
    });
  }

  /**
   * Track planning mode completion
   */
  emitPlanningModeComplete(sessionId: string, duration: number, tasksCreated: number): void {
    this.emit('planning_mode_complete', 1, {
      sessionId,
      duration,
      tasksCreated,
      timestamp: Date.now()
    });
  }

  /**
   * Track planning mode abandonment
   */
  emitPlanningModeAbandon(sessionId: string, duration: number, reason: string): void {
    this.emit('planning_mode_abandon', 1, {
      sessionId,
      duration,
      reason,
      timestamp: Date.now()
    });
  }

  // ============= P19 CALENDAR CONVERSION METRICS =============

  /**
   * Track calendar draft creation
   */
  emitCalendarDraftCreated(confidence: number, source: string): void {
    this.emit('calendar_draft_created', 1, {
      confidence,
      source,
      timestamp: Date.now()
    });
  }

  /**
   * Track calendar draft to send conversion
   */
  emitCalendarDraftToSend(draftId: string, timeToSend: number, editsCount: number): void {
    this.emit('calendar_draft_to_send', 1, {
      draftId,
      timeToSend,
      editsCount,
      conversion: true,
      timestamp: Date.now()
    });
  }

  /**
   * Track manual calendar send (bypassing draft)
   */
  emitCalendarSendManual(source: string, confidence: number): void {
    this.emit('calendar_send_manual', 1, {
      source,
      confidence,
      timestamp: Date.now()
    });
  }

  // ============= P19 TASK SYSTEM CANARY METRICS =============

  /**
   * Track task attempt (user tries to create/modify task)
   */
  emitTaskAttempted(taskType: string, complexity: number, canaryGroup: string): void {
    this.emit('task_attempted', 1, {
      taskType,
      complexity,
      canaryGroup,
      timestamp: Date.now()
    });
  }

  /**
   * Track task completion (task successfully saved/processed)
   */
  emitTaskCompleted(taskType: string, complexity: number, canaryGroup: string, processingTime: number): void {
    this.emit('task_completed', 1, {
      taskType,
      complexity,
      canaryGroup,
      processingTime,
      timestamp: Date.now()
    });
  }

  /**
   * Track task system stability (attempted vs completed delta)
   */
  emitTaskSystemStability(canaryGroup: string, stabilityScore: number, errors: string[]): void {
    this.emit('task_system_stability', stabilityScore, {
      canaryGroup,
      errors,
      timestamp: Date.now()
    });
  }

  /**
   * Get metrics summary for a specific type
   */
  getSummary(type: MetricType, timeWindow?: number): MetricSummary {
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;
    const filtered = this.metrics.filter(m => m.type === type && m.timestamp > cutoff);
    
    if (filtered.length === 0) {
      return {
        type,
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        sum: 0,
        trend: 'stable',
        lastValue: 0,
        lastTimestamp: 0
      };
    }

    const values = filtered.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    
    // Calculate trend (compare last 25% vs first 25%)
    const quarterSize = Math.max(1, Math.floor(filtered.length / 4));
    const firstQuarter = filtered.slice(0, quarterSize);
    const lastQuarter = filtered.slice(-quarterSize);
    
    const firstAvg = firstQuarter.reduce((sum, m) => sum + m.value, 0) / firstQuarter.length;
    const lastAvg = lastQuarter.reduce((sum, m) => sum + m.value, 0) / lastQuarter.length;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    const trendThreshold = 0.1; // 10% change
    if (lastAvg > firstAvg * (1 + trendThreshold)) trend = 'up';
    else if (lastAvg < firstAvg * (1 - trendThreshold)) trend = 'down';

    return {
      type,
      count: filtered.length,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      sum,
      trend,
      lastValue: filtered[filtered.length - 1].value,
      lastTimestamp: filtered[filtered.length - 1].timestamp
    };
  }

  /**
   * Get all metrics for a time window
   */
  getMetrics(timeWindow?: number): MetricData[] {
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Generate KPI dashboard data
   */
  getKPIs(timeWindow: number = 24 * 60 * 60 * 1000): KPIData { // 24 hours default
    const autoWriteMetrics = this.getMetrics(timeWindow).filter(m => m.type === 'auto_write_rate');
    const undoMetrics = this.getMetrics(timeWindow).filter(m => m.type === 'undo_rate');
    const editDistanceMetrics = this.getMetrics(timeWindow).filter(m => m.type === 'edit_distance');
    const channelHealthMetrics = this.getMetrics(timeWindow).filter(m => m.type === 'watch_channel_health');
    const webhookErrorMetrics = this.getMetrics(timeWindow).filter(m => m.type === 'webhook_error');
    const scopeDecayMetrics = this.getMetrics(timeWindow).filter(m => m.type === 'scope_decay_action');

    // Auto-write success rate
    const autoWriteSuccessRate = autoWriteMetrics.length > 0 
      ? autoWriteMetrics.reduce((sum, m) => sum + m.value, 0) / autoWriteMetrics.length
      : 0;

    // Average edit distance
    const avgEditDistance = editDistanceMetrics.length > 0
      ? editDistanceMetrics.reduce((sum, m) => sum + m.value, 0) / editDistanceMetrics.length
      : 0;

    // Undo spike detection (more than 5 undos in last hour)
    const lastHour = Date.now() - (60 * 60 * 1000);
    const recentUndos = undoMetrics.filter(m => m.timestamp > lastHour).length;
    const undoSpike = recentUndos > 5;

    // Channel health score
    const channelHealthScore = channelHealthMetrics.length > 0
      ? channelHealthMetrics.reduce((sum, m) => sum + m.value, 0) / channelHealthMetrics.length
      : 1;

    // Webhook error rate
    const webhookErrorRate = webhookErrorMetrics.length > 0
      ? webhookErrorMetrics.length / timeWindow * (60 * 60 * 1000) // errors per hour
      : 0;

    // Scope decay frequency  
    const scopeDecayFrequency = scopeDecayMetrics.length;

    // Total metrics and alerts
    const totalMetrics = this.getMetrics(timeWindow).length;
    const alertsTriggered = (undoSpike ? 1 : 0) + (channelHealthScore < 0.8 ? 1 : 0) + (webhookErrorRate > 10 ? 1 : 0);

    return {
      autoWriteSuccessRate,
      avgEditDistance,
      undoSpike,
      channelHealthScore,
      webhookErrorRate,
      scopeDecayFrequency,
      totalMetrics,
      alertsTriggered
    };
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.metrics = [];
  }

  private getCurrentUserId(): string | undefined {
    // Would integrate with auth system
    return 'user_123'; // Mock for now
  }

  private emitToExternal(metric: MetricData): void {
    // Could send to external analytics, Grafana, etc.
    // For now, just localStorage for persistence
    try {
      const stored = localStorage.getItem('bubble_metrics') || '[]';
      const metrics = JSON.parse(stored);
      metrics.push(metric);
      
      // Keep only last 1000 metrics in storage
      if (metrics.length > 1000) {
        metrics.splice(0, metrics.length - 1000);
      }
      
      localStorage.setItem('bubble_metrics', JSON.stringify(metrics));
    } catch (error) {
      console.warn('Failed to store metrics:', error);
    }
  }
}

export const metricsService = new MetricsService();
