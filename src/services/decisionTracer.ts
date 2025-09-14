/**
 * Decision Tracer - Phase 2 Architecture
 * Provides audit trail for all AI-driven decisions with explainability
 */

export interface DecisionTrace {
  id: string;
  action: string;
  input: any;
  output?: any;
  confidence: number;
  reasoning: string;
  timestamp: number;
  metadata?: Record<string, any>;
  undoId?: string;
  dependencies?: string[];
}

class DecisionTracer {
  private traces: DecisionTrace[] = [];
  private maxTraces = 1000; // Keep last 1000 decisions
  private isEnabled = true;

  /**
   * Record a decision trace
   */
  trace(decision: Omit<DecisionTrace, 'id' | 'timestamp'>): string {
    if (!this.isEnabled) return '';

    const trace: DecisionTrace = {
      id: `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      ...decision
    };

    this.traces.unshift(trace);

    // Keep only the most recent traces
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(0, this.maxTraces);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Decision Trace:', {
        action: trace.action,
        reasoning: trace.reasoning,
        confidence: trace.confidence,
        metadata: trace.metadata
      });
    }

    return trace.id;
  }

  /**
   * Get all traces
   */
  getTraces(): DecisionTrace[] {
    return [...this.traces];
  }

  /**
   * Get traces by action type
   */
  getTracesByAction(action: string): DecisionTrace[] {
    return this.traces.filter(trace => trace.action === action);
  }

  /**
   * Get trace by ID
   */
  getTrace(id: string): DecisionTrace | undefined {
    return this.traces.find(trace => trace.id === id);
  }

  /**
   * Get recent traces (last N)
   */
  getRecentTraces(count: number = 50): DecisionTrace[] {
    return this.traces.slice(0, count);
  }

  /**
   * Search traces by reasoning text
   */
  searchTraces(query: string): DecisionTrace[] {
    const lowerQuery = query.toLowerCase();
    return this.traces.filter(trace => 
      trace.reasoning.toLowerCase().includes(lowerQuery) ||
      trace.action.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get traces within time range
   */
  getTracesInRange(startTime: number, endTime: number): DecisionTrace[] {
    return this.traces.filter(trace => 
      trace.timestamp >= startTime && trace.timestamp <= endTime
    );
  }

  /**
   * Clear all traces
   */
  clearTraces(): void {
    this.traces = [];
  }

  /**
   * Enable/disable tracing
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Get tracing status
   */
  isTracingEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Export traces to JSON
   */
  exportTraces(): string {
    return JSON.stringify(this.traces, null, 2);
  }

  /**
   * Import traces from JSON
   */
  importTraces(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        this.traces = imported.slice(0, this.maxTraces);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get statistics about decisions
   */
  getStats() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    const recentHour = this.getTracesInRange(now - oneHour, now);
    const recentDay = this.getTracesInRange(now - oneDay, now);

    const actionCounts = this.traces.reduce((acc, trace) => {
      acc[trace.action] = (acc[trace.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgConfidence = this.traces.length > 0
      ? this.traces.reduce((sum, trace) => sum + trace.confidence, 0) / this.traces.length
      : 0;

    return {
      totalTraces: this.traces.length,
      tracesLastHour: recentHour.length,
      tracesLastDay: recentDay.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      topActions: Object.entries(actionCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      isEnabled: this.isEnabled
    };
  }
}

export const decisionTracer = new DecisionTracer();
