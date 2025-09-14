interface DecisionSignal {
  type: string;
  value: any;
  confidence: number;
  source: string;
  privacyLayer?: 'surface' | 'context' | 'deep';
}

interface DecisionTrace {
  id: string;
  timestamp: number;
  feature: 'calendar' | 'email' | 'finance' | 'context' | 'system' | 'task-calendar' | 'behavioral' | 'mood' | 'perma' | 'contemplative' | 'task';
  userId?: string;
  signals: DecisionSignal[];
  confidenceThreshold: number;
  finalConfidence: number;
  decision: 'suggest' | 'draft' | 'auto-write' | 'skip' | 'calibrate' | 'rollback';
  action: string;
  becauseText: string;
  privacyWatermark?: 'surface' | 'context' | 'deep';
  castMember?: string;
  metadata: any;
  undoable: boolean;
  undoId?: string;
}

interface DecisionTraceFilters {
  feature?: string;
  decision?: string;
  startDate?: number;
  endDate?: number;
  undoableOnly?: boolean;
  limit?: number;
}

class DecisionTraceService {
  private traces: DecisionTrace[] = [];
  private maxTraces = 1000;
  private storageKey = 'mm-decision-traces';
  private listeners: ((traces: DecisionTrace[]) => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Add a new decision trace entry
   */
  addTrace(trace: Omit<DecisionTrace, 'id' | 'timestamp'>): string {
    const newTrace: DecisionTrace = {
      ...trace,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      privacyWatermark: trace.privacyWatermark || 'surface'
    };

    this.traces.unshift(newTrace);

    // Maintain max traces
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(0, this.maxTraces);
    }

    this.saveToStorage();
    this.notifyListeners();

    console.log(`📊 Decision trace: ${trace.feature} → ${trace.decision} (${trace.becauseText})`);
    return newTrace.id;
  }

  /**
   * Get traces with optional filtering
   */
  getTraces(filters?: DecisionTraceFilters): DecisionTrace[] {
    let filtered = [...this.traces];

    if (filters?.feature) {
      filtered = filtered.filter(t => t.feature === filters.feature);
    }

    if (filters?.decision) {
      filtered = filtered.filter(t => t.decision === filters.decision);
    }

    if (filters?.undoableOnly) {
      filtered = filtered.filter(t => t.undoable && !t.undoId);
    }

    if (filters?.startDate) {
      filtered = filtered.filter(t => t.timestamp >= filters.startDate!);
    }

    if (filters?.endDate) {
      filtered = filtered.filter(t => t.timestamp <= filters.endDate!);
    }

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Get a specific trace by ID
   */
  getTrace(id: string): DecisionTrace | null {
    return this.traces.find(t => t.id === id) || null;
  }

  /**
   * Mark a trace as undone
   */
  markAsUndone(traceId: string, undoId: string): boolean {
    const trace = this.traces.find(t => t.id === traceId);
    if (trace) {
      trace.undoId = undoId;
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Get recent undoable traces
   */
  getRecentUndoable(limit = 10): DecisionTrace[] {
    return this.traces
      .filter(t => t.undoable && !t.undoId)
      .slice(0, limit);
  }

  /**
   * Generate "Because..." text with privacy watermark
   */
  generateBecauseText(signals: DecisionSignal[], decision: string, privacyLayer: 'surface' | 'context' | 'deep' = 'surface'): string {
    const primarySignals = signals.filter(s => s.confidence > 0.6);
    
    if (primarySignals.length === 0) {
      return `Low confidence - ${decision} • ${privacyLayer.toUpperCase()}`;
    }

    const reasons = primarySignals.map(s => {
      switch (s.type) {
        case 'intent':
          return `clear intent detected`;
        case 'calendar':
          return `calendar shows availability`;
        case 'email':
          return `from trusted sender`;
        case 'time':
          return `specific time mentioned`;
        case 'location':
          return `familiar location`;
        case 'finance':
          return `matches spending pattern`;
        case 'energy':
          return `energy window optimal`;
        case 'mood':
          return `mood context positive`;
        case 'rhythm':
          return `timing aligns with pattern`;
        case 'stress':
          return `stress levels manageable`;
        case 'dmn':
          return `attention state focused`;
        case 'perma':
          return `wellbeing factor present`;
        default:
          return `${s.type} signal`;
      }
    });

    return `Because ${reasons.slice(0, 2).join(' and ')} • ${privacyLayer.toUpperCase()}`;
  }

  /**
   * Generate privacy-aware explanation with watermark
   */
  generatePrivacyAwareExplanation(privacyLayer: 'surface' | 'context' | 'deep', dataTypes: string[]): string {
    const layerDescriptions = {
      surface: 'Basic task and timing data',
      context: 'Behavioral patterns and preferences',
      deep: 'Personal insights and emotional context'
    };

    return `Using ${layerDescriptions[privacyLayer]} (${dataTypes.join(', ')}) • ${privacyLayer.toUpperCase()}`;
  }

  /**
   * Export traces for analysis
   */
  exportTraces(filters?: DecisionTraceFilters): any[] {
    const traces = this.getTraces(filters);
    
    return traces.map(trace => ({
      timestamp: new Date(trace.timestamp).toISOString(),
      feature: trace.feature,
      confidence: trace.finalConfidence,
      decision: trace.decision,
      signals: trace.signals.length,
      undoable: trace.undoable,
      wasUndone: !!trace.undoId
    }));
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this.traces = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Subscribe to trace changes
   */
  subscribe(listener: (traces: DecisionTrace[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.traces = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load decision traces from storage:', error);
      this.traces = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.traces));
    } catch (error) {
      console.warn('Failed to save decision traces to storage:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.traces]));
  }
}

export const decisionTraceService = new DecisionTraceService();
export type { DecisionTrace, DecisionSignal, DecisionTraceFilters };