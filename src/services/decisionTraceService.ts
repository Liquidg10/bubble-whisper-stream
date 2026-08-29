interface DecisionSignal {
  type: string;
  value: any;
  confidence: number;
  source: string;
  privacyLayer?: 'surface' | 'context' | 'deep';
}

export type DecisionUserAction = 'accept' | 'reject' | 'modify' | 'undo';
export type DecisionExecutionStatus = 'pending' | 'succeeded' | 'failed' | 'reverted';

export type DecisionOutcomeEvent =
  | {
      kind: 'user-action';
      eventId: string;
      action: DecisionUserAction;
      at: number;
      source: string;
      artifactId?: string;
      latencyMs?: number;
      editDistance?: number;
      result: 'succeeded';
    }
  | {
      kind: 'execution';
      eventId: string;
      status: DecisionExecutionStatus;
      at: number;
      source: string;
      reference?: string;
    };

export interface DecisionTraceMetadata extends Record<string, any> {
  /** Separates learning telemetry from operational audit-only traces. */
  telemetryKind?: 'acceptance' | 'operational';
  /** A failed storage write leaves the trace available for audit this session only. */
  telemetryPersistence?: 'memory-only';
  /** Compatibility mirror for older readers. Prefer the append-only outcomes. */
  userAction?: DecisionUserAction;
  userActionAt?: number;
  userActionSource?: string;
  executionStatus?: DecisionExecutionStatus;
  executionStatusAt?: number;
  executionStatusSource?: string;
  executionReference?: string;
  undoHandle?: string;
  idempotencyKey?: string;
  outcomes?: DecisionOutcomeEvent[];
}

interface DecisionTrace {
  id: string;
  timestamp: number;
  feature: 'calendar' | 'email' | 'finance' | 'context' | 'system' | 'task-calendar' | 'behavioral' | 'mood' | 'perma' | 'contemplative' | 'task';
  userId?: string;
  signals: DecisionSignal[];
  confidenceThreshold: number;
  finalConfidence: number;
  decision: 'suggest' | 'draft' | 'draft-ask' | 'auto-write' | 'skip' | 'calibrate' | 'rollback';
  action: string;
  becauseText: string;
  privacyWatermark?: 'surface' | 'context' | 'deep';
  castMember?: string;
  metadata: DecisionTraceMetadata;
  undoable: boolean;
  undoId?: string;
}

export interface DecisionOutcomeSummary {
  totalDecisions: number;
  resolvedDecisions: number;
  accepted: number;
  rejected: number;
  modified: number;
  undone: number;
  acceptanceRate: number | null;
  outcomeCoverage: number;
}

interface OutcomeEventOptions {
  eventId?: string;
  source: string;
}

interface UserActionOptions extends OutcomeEventOptions {
  artifactId?: string;
  latencyMs?: number;
  editDistance?: number;
}

interface ExecutionOptions extends OutcomeEventOptions {
  reference?: string;
}

const USER_ACTIONS = new Set<DecisionUserAction>(['accept', 'reject', 'modify', 'undo']);

/**
 * Return the latest explicit user outcome. Legacy aliases are read-only
 * compatibility; new writers always persist the canonical action values.
 */
export function getDecisionUserAction(trace: DecisionTrace): DecisionUserAction | null {
  const latestUserEvent = [...(trace.metadata?.outcomes || [])]
    .reverse()
    .find((event): event is Extract<DecisionOutcomeEvent, { kind: 'user-action' }> =>
      event.kind === 'user-action'
    );
  if (latestUserEvent) return latestUserEvent.action;

  const mirroredAction = trace.metadata?.userAction;
  if (USER_ACTIONS.has(mirroredAction as DecisionUserAction)) {
    return mirroredAction as DecisionUserAction;
  }

  const legacyAliases: Record<string, DecisionUserAction> = {
    accepted: 'accept',
    dismissed: 'reject',
    rejected: 'reject',
    modified: 'modify',
    undone: 'undo'
  };
  if (typeof mirroredAction === 'string' && legacyAliases[mirroredAction]) {
    return legacyAliases[mirroredAction];
  }

  return null;
}

/**
 * Restrict acceptance dashboards and calibration to real decision telemetry.
 * Precision-gate traces predate the explicit marker, so their stable nested
 * input/result shape remains a read-only compatibility path. A historical
 * trace with an explicit outcome is also eligible; no outcome is fabricated.
 */
export function isAcceptanceTelemetryTrace(trace: DecisionTrace): boolean {
  const metadata = trace.metadata || {};
  // An explicit operational marker is a hard exclusion. Manual provider
  // actions may contain real user-action events for audit/undo without being
  // evidence that an AI suggestion or auto-write decision was accepted.
  if (metadata.telemetryKind === 'operational') return false;
  if (metadata.telemetryPersistence === 'memory-only') return false;
  const hasPrecisionGateShape = Boolean(
    metadata.input?.feature && metadata.result
  );

  return metadata.telemetryKind === 'acceptance' ||
    hasPrecisionGateShape ||
    getDecisionUserAction(trace) !== null;
}

/** Resolve the feature users actually acted on (reminders are stored as context traces). */
export function getAcceptanceTelemetryFeature(trace: DecisionTrace): string {
  return trace.metadata?.input?.feature ||
    trace.metadata?.outcomeFeature ||
    trace.feature;
}

/**
 * Acceptance is intentionally based only on observed user outcomes. A gate
 * tier or a successful automatic execution is not evidence that the user
 * accepted the decision.
 */
export function summarizeDecisionOutcomes(traces: DecisionTrace[]): DecisionOutcomeSummary {
  const summary: DecisionOutcomeSummary = {
    totalDecisions: traces.length,
    resolvedDecisions: 0,
    accepted: 0,
    rejected: 0,
    modified: 0,
    undone: 0,
    acceptanceRate: null,
    outcomeCoverage: 0
  };

  for (const trace of traces) {
    const action = getDecisionUserAction(trace);
    if (!action) continue;

    summary.resolvedDecisions += 1;
    if (action === 'accept') summary.accepted += 1;
    else if (action === 'reject') summary.rejected += 1;
    else if (action === 'modify') summary.modified += 1;
    else summary.undone += 1;
  }

  if (summary.resolvedDecisions > 0) {
    summary.acceptanceRate = summary.accepted / summary.resolvedDecisions;
  }
  if (summary.totalDecisions > 0) {
    summary.outcomeCoverage = summary.resolvedDecisions / summary.totalDecisions;
  }

  return summary;
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
    const idempotencyKey = trace.metadata?.idempotencyKey;
    if (idempotencyKey) {
      const existing = this.traces.find(
        candidate => candidate.metadata?.idempotencyKey === idempotencyKey
      );
      if (existing) return existing.id;
    }

    const newTrace: DecisionTrace = {
      ...trace,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      privacyWatermark: trace.privacyWatermark || 'surface',
      metadata: { ...(trace.metadata || {}) }
    };

    this.traces.unshift(newTrace);

    // Maintain max traces
    if (this.traces.length > this.maxTraces) {
      this.traces = this.traces.slice(0, this.maxTraces);
    }

    if (!this.saveToStorage()) {
      newTrace.metadata.telemetryPersistence = 'memory-only';
    }
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

  getPersistenceStatus(traceId: string): 'durable' | 'memory-only' | 'missing' {
    const trace = this.traces.find(candidate => candidate.id === traceId);
    if (!trace) return 'missing';
    return trace.metadata?.telemetryPersistence === 'memory-only'
      ? 'memory-only'
      : 'durable';
  }

  /**
   * Get a specific trace by ID
   */
  getTrace(id: string): DecisionTrace | null {
    return this.traces.find(t => t.id === id) || null;
  }

  /**
   * Record an observed user action after its corresponding side effect has
   * succeeded. Deterministic event IDs make retries and double-clicks safe.
   */
  recordUserAction(
    traceId: string,
    action: DecisionUserAction,
    options: UserActionOptions
  ): boolean {
    return this.updateTrace(traceId, trace => {
      trace.metadata ||= {};
      const eventId = options.eventId || [
        traceId,
        'user-action',
        action,
        options.source,
        options.artifactId || ''
      ].join(':');
      const outcomes = [...(trace.metadata.outcomes || [])];
      const existingEvent = outcomes.find(event => event.eventId === eventId);
      const at = existingEvent?.at || Date.now();

      if (!existingEvent) {
        outcomes.push({
          kind: 'user-action',
          eventId,
          action,
          at,
          source: options.source,
          artifactId: options.artifactId,
          latencyMs: options.latencyMs,
          editDistance: options.editDistance,
          result: 'succeeded'
        });
      }

      trace.metadata.outcomes = outcomes;
      const latestUserEvent = [...outcomes]
        .reverse()
        .find((event): event is Extract<DecisionOutcomeEvent, { kind: 'user-action' }> =>
          event.kind === 'user-action'
        );
      if (latestUserEvent) {
        trace.metadata.userAction = latestUserEvent.action;
        trace.metadata.userActionAt = latestUserEvent.at;
        trace.metadata.userActionSource = latestUserEvent.source;
      }
    });
  }

  /** Record provider/local execution independently from the user's choice. */
  recordExecution(
    traceId: string,
    status: DecisionExecutionStatus,
    options: ExecutionOptions
  ): boolean {
    return this.updateTrace(traceId, trace => {
      trace.metadata ||= {};
      const eventId = options.eventId || [
        traceId,
        'execution',
        status,
        options.source,
        options.reference || ''
      ].join(':');
      const outcomes = [...(trace.metadata.outcomes || [])];
      const existingEvent = outcomes.find(event => event.eventId === eventId);
      const at = existingEvent?.at || Date.now();

      if (!existingEvent) {
        outcomes.push({
          kind: 'execution',
          eventId,
          status,
          at,
          source: options.source,
          reference: options.reference
        });
      }

      trace.metadata.outcomes = outcomes;
      const latestExecutionEvent = [...outcomes]
        .reverse()
        .find((event): event is Extract<DecisionOutcomeEvent, { kind: 'execution' }> =>
          event.kind === 'execution'
        );
      if (latestExecutionEvent) {
        trace.metadata.executionStatus = latestExecutionEvent.status;
        trace.metadata.executionStatusAt = latestExecutionEvent.at;
        trace.metadata.executionStatusSource = latestExecutionEvent.source;
        if (latestExecutionEvent.reference) {
          trace.metadata.executionReference = latestExecutionEvent.reference;
        }
      }
    });
  }

  /** Record undo only after the compensating action has succeeded. */
  recordUndoCompleted(traceId: string, undoId: string, source: string): boolean {
    return this.updateTrace(traceId, trace => {
      trace.metadata ||= {};
      const eventId = `${traceId}:user-action:undo:${undoId}`;
      const outcomes = [...(trace.metadata.outcomes || [])];
      const existingEvent = outcomes.find(event => event.eventId === eventId);
      const at = existingEvent?.at || Date.now();

      if (!existingEvent) {
        outcomes.push({
          kind: 'user-action',
          eventId,
          action: 'undo',
          at,
          source,
          artifactId: undoId,
          result: 'succeeded'
        });
      }

      trace.undoId = undoId;
      trace.metadata.outcomes = outcomes;
      const latestUserEvent = [...outcomes]
        .reverse()
        .find((event): event is Extract<DecisionOutcomeEvent, { kind: 'user-action' }> =>
          event.kind === 'user-action'
        );
      if (latestUserEvent) {
        trace.metadata.userAction = latestUserEvent.action;
        trace.metadata.userActionAt = latestUserEvent.at;
        trace.metadata.userActionSource = latestUserEvent.source;
      }

      const executionEventId = `${traceId}:execution:reverted:${source}:${undoId}`;
      if (!outcomes.some(event => event.eventId === executionEventId)) {
        outcomes.push({
          kind: 'execution',
          eventId: executionEventId,
          status: 'reverted',
          at,
          source,
          reference: undoId
        });
      }
      trace.metadata.outcomes = outcomes;
      const latestExecutionEvent = [...outcomes]
        .reverse()
        .find((event): event is Extract<DecisionOutcomeEvent, { kind: 'execution' }> =>
          event.kind === 'execution'
        );
      if (latestExecutionEvent) {
        trace.metadata.executionStatus = latestExecutionEvent.status;
        trace.metadata.executionStatusAt = latestExecutionEvent.at;
        trace.metadata.executionStatusSource = latestExecutionEvent.source;
        if (latestExecutionEvent.reference) {
          trace.metadata.executionReference = latestExecutionEvent.reference;
        }
      }
    });
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
      wasUndone: !!trace.undoId,
      userAction: getDecisionUserAction(trace),
      executionStatus: trace.metadata?.executionStatus || null
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

  private saveToStorage(): boolean {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.traces));
      return true;
    } catch (error) {
      console.warn('Failed to save decision traces to storage:', error);
      return false;
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.traces]));
  }

  private updateTrace(traceId: string, update: (trace: DecisionTrace) => void): boolean {
    const trace = this.traces.find(candidate => candidate.id === traceId);
    if (!trace) return false;

    trace.metadata = { ...(trace.metadata || {}) };
    update(trace);
    delete trace.metadata.telemetryPersistence;
    if (!this.saveToStorage()) {
      trace.metadata.telemetryPersistence = 'memory-only';
    }
    this.notifyListeners();
    return true;
  }
}

export const decisionTraceService = new DecisionTraceService();
export type {
  DecisionTrace,
  DecisionSignal,
  DecisionTraceFilters,
  ExecutionOptions,
  UserActionOptions
};
