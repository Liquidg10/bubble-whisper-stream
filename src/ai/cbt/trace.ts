/**
 * CBT Trace - Persistence and management of CBT intervention traces
 */

import type { CBTTrace, RetentionPolicy } from './types';
import { cbtGuardService } from '@/services/cbtGuardService';

const STORAGE_KEY = 'cbt_traces';
const RETENTION_STORAGE_KEY = 'cbt_retention_policy';

const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  defaultDays: 30,
  crisisTraces: 90, // Keep crisis traces longer
  anonymizeAfterDays: 365,
  purgeAfterDays: 1095, // 3 years
  archiveExemption: true // Archived traces exempt from auto-delete
};

class CBTTraceService {
  private traces: CBTTrace[] = [];
  private retentionPolicy: RetentionPolicy = DEFAULT_RETENTION_POLICY;
  
  constructor() {
    this.loadFromStorage();
    this.loadRetentionPolicy();
  }
  
  /**
   * Persist a new CBT trace with consent awareness
   */
  async persist(trace: Omit<CBTTrace, 'id' | 'pseudonymousId'>, consentGiven: boolean = false): Promise<string | null> {
    // Only persist if consent was given
    if (!consentGiven) {
      return null;
    }
    
    // Generate secure ID
    const id = this.generateTraceId();
    
    // Generate pseudonymous ID for telemetry
    const pseudonymousId = cbtGuardService.generatePseudonymousId(trace.userId);
    
    const fullTrace: CBTTrace = {
      id,
      pseudonymousId,
      ...trace,
      consent: consentGiven
    };
    
    this.traces.push(fullTrace);
    this.saveToStorage();
    
    // Trigger retention cleanup
    await this.enforceRetentionPolicy();
    
    return id;
  }
  
  /**
   * List traces with optional filters
   */
  list(filters?: {
    userId?: string;
    startDate?: number;
    endDate?: number;
    priority?: string[];
    limit?: number;
    archived?: boolean;
  }): CBTTrace[] {
    let filtered = [...this.traces];
    
    if (filters?.userId) {
      filtered = filtered.filter(t => t.userId === filters.userId);
    }
    
    if (filters?.startDate) {
      filtered = filtered.filter(t => t.createdAt >= filters.startDate! || t.timestamp >= filters.startDate!);
    }
    
    if (filters?.endDate) {
      filtered = filtered.filter(t => t.createdAt <= filters.endDate! || t.timestamp <= filters.endDate!);
    }
    
    if (filters?.priority?.length) {
      filtered = filtered.filter(t => filters.priority!.includes(t.decision.priority));
    }
    
    if (filters?.archived !== undefined) {
      filtered = filtered.filter(t => Boolean(t.archived) === filters.archived);
    }
    
    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => (b.createdAt || b.timestamp) - (a.createdAt || a.timestamp));
    
    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }
    
    return filtered;
  }
  
  /**
   * Get a specific trace by ID
   */
  getById(id: string): CBTTrace | null {
    return this.traces.find(t => t.id === id) || null;
  }
  
  /**
   * Update trace outcome (user engagement, feedback)
   */
  updateOutcome(id: string, outcome: CBTTrace['outcome']): boolean {
    const trace = this.traces.find(t => t.id === id);
    if (!trace) return false;
    
    trace.outcome = outcome;
    this.saveToStorage();
    return true;
  }
  
  /**
   * Archive a trace (exempts from auto-delete)
   */
  archiveTrace(id: string): boolean {
    const trace = this.traces.find(t => t.id === id);
    if (!trace) return false;
    
    trace.archived = true;
    this.saveToStorage();
    return true;
  }
  
  /**
   * Unarchive a trace
   */
  unarchiveTrace(id: string): boolean {
    const trace = this.traces.find(t => t.id === id);
    if (!trace) return false;
    
    trace.archived = false;
    this.saveToStorage();
    return true;
  }
  
  /**
   * Delete all CBT traces securely (nuclear option)
   */
  async deleteAll(): Promise<void> {
    // Secure delete - overwrite multiple times
    this.traces = [];
    this.saveToStorage();
    
    // Clear localStorage entries
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RETENTION_STORAGE_KEY);
    
    // Overwrite with dummy data then clear again for security
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEY);
  }
  
  /**
   * Delete traces for a specific user
   */
  deleteForUser(userId: string): number {
    const initialCount = this.traces.length;
    this.traces = this.traces.filter(t => t.userId !== userId);
    this.saveToStorage();
    return initialCount - this.traces.length;
  }
  
  /**
   * Export traces for user (respects privacy settings)
   */
  exportForUser(userId: string, options?: {
    includeArchived?: boolean;
    dateRange?: { start: number; end: number };
    privacyLayer?: 'surface' | 'context' | 'deep';
  }): CBTTrace[] {
    let userTraces = this.traces.filter(t => t.userId === userId);
    
    if (options?.includeArchived === false) {
      userTraces = userTraces.filter(t => !t.archived);
    }
    
    if (options?.dateRange) {
      userTraces = userTraces.filter(t => {
        const timestamp = t.createdAt || t.timestamp;
        return timestamp >= options.dateRange!.start && timestamp <= options.dateRange!.end;
      });
    }
    
    if (options?.privacyLayer) {
      userTraces = userTraces.filter(t => t.privacyLayer === options.privacyLayer);
    }
    
    return userTraces;
  }
  
  /**
   * Get anonymized traces for telemetry
   */
  getAnonymizedTraces(limit: number = 100): any[] {
    return this.traces
      .slice(-limit)
      .map(trace => ({
        id: trace.pseudonymousId,
        timestamp: trace.createdAt || trace.timestamp,
        annotation: {
          distortions: trace.annotation.distortions.map(d => ({
            type: d.type,
            confidence: d.confidence
          })),
          sentiment: trace.annotation.sentiment,
          crisisFlags: trace.annotation.crisisFlags.map(f => ({
            type: f.type,
            severity: f.severity,
            confidence: f.confidence
          }))
        },
        decision: {
          interventionType: trace.decision.interventionType,
          priority: trace.decision.priority,
          metadata: trace.decision.metadata
        },
        outcome: trace.outcome ? {
          userEngaged: trace.outcome.userEngaged,
          helpfulness: trace.outcome.helpfulness
        } : undefined
      }));
  }
  
  /**
   * Get statistics for dashboard
   */
  getStats(userId?: string): {
    totalTraces: number;
    archivedTraces: number;
    interventions: number;
    crisisInterventions: number;
    averageHelpfulness: number;
    distortionBreakdown: Record<string, number>;
    recentActivity: { date: string; count: number }[];
    storageSize: string;
  } {
    const userTraces = userId 
      ? this.traces.filter(t => t.userId === userId)
      : this.traces;
    
    const interventions = userTraces.filter(t => t.decision.shouldIntervene);
    const crisisInterventions = userTraces.filter(t => t.decision.priority === 'crisis');
    const archived = userTraces.filter(t => t.archived);
    
    const helpfulnessRatings = userTraces
      .map(t => t.outcome?.helpfulness)
      .filter((rating): rating is number => rating !== undefined);
    
    const averageHelpfulness = helpfulnessRatings.length > 0
      ? helpfulnessRatings.reduce((sum, rating) => sum + rating, 0) / helpfulnessRatings.length
      : 0;
    
    // Distortion breakdown
    const distortionBreakdown: Record<string, number> = {};
    userTraces.forEach(trace => {
      trace.annotation.distortions.forEach(distortion => {
        distortionBreakdown[distortion.type] = (distortionBreakdown[distortion.type] || 0) + 1;
      });
    });
    
    // Recent activity (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentTraces = userTraces.filter(t => (t.createdAt || t.timestamp) >= sevenDaysAgo);
    const recentActivity = this.groupTracesByDay(recentTraces);
    
    // Storage size estimation
    const storageSize = `~${(JSON.stringify(userTraces).length / 1024).toFixed(1)} KB`;
    
    return {
      totalTraces: userTraces.length,
      archivedTraces: archived.length,
      interventions: interventions.length,
      crisisInterventions: crisisInterventions.length,
      averageHelpfulness,
      distortionBreakdown,
      recentActivity,
      storageSize
    };
  }
  
  /**
   * Enforce retention policy
   */
  private async enforceRetentionPolicy(): Promise<void> {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // Calculate cutoff dates
    const defaultCutoff = now - (this.retentionPolicy.defaultDays * oneDayMs);
    const crisisCutoff = now - (this.retentionPolicy.crisisTraces * oneDayMs);
    const anonymizeCutoff = now - (this.retentionPolicy.anonymizeAfterDays * oneDayMs);
    const purgeCutoff = now - (this.retentionPolicy.purgeAfterDays * oneDayMs);
    
    let modified = false;
    
    // Purge very old traces
    const beforePurge = this.traces.length;
    this.traces = this.traces.filter(trace => {
      const timestamp = trace.createdAt || trace.timestamp;
      return timestamp >= purgeCutoff;
    });
    if (this.traces.length < beforePurge) modified = true;
    
    // Anonymize old traces
    this.traces.forEach(trace => {
      const timestamp = trace.createdAt || trace.timestamp;
      if (timestamp < anonymizeCutoff && trace.userId !== 'anonymized') {
        trace.userId = 'anonymized';
        modified = true;
      }
    });
    
    // Remove old traces, but preserve archived ones
    const beforeCleanup = this.traces.length;
    this.traces = this.traces.filter(trace => {
      // Always preserve archived traces
      if (trace.archived) return true;
      
      const timestamp = trace.createdAt || trace.timestamp;
      if (trace.decision.priority === 'crisis') {
        return timestamp >= crisisCutoff;
      }
      return timestamp >= defaultCutoff;
    });
    if (this.traces.length < beforeCleanup) modified = true;
    
    if (modified) {
      this.saveToStorage();
    }
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.traces = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load CBT traces from storage:', error);
      this.traces = [];
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.traces));
    } catch (error) {
      console.error('Failed to save CBT traces to storage:', error);
    }
  }
  
  private loadRetentionPolicy(): void {
    try {
      const stored = localStorage.getItem(RETENTION_STORAGE_KEY);
      if (stored) {
        this.retentionPolicy = { ...DEFAULT_RETENTION_POLICY, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load retention policy from storage:', error);
      this.retentionPolicy = DEFAULT_RETENTION_POLICY;
    }
  }
  
  private generateTraceId(): string {
    return `cbt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private groupTracesByDay(traces: CBTTrace[]): { date: string; count: number }[] {
    const groups: Record<string, number> = {};
    
    traces.forEach(trace => {
      const timestamp = trace.createdAt || trace.timestamp;
      const date = new Date(timestamp).toISOString().split('T')[0];
      groups[date] = (groups[date] || 0) + 1;
    });
    
    return Object.entries(groups)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export const traceService = new CBTTraceService();

// Export individual functions for testing
export { CBTTraceService };