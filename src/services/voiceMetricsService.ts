/**
 * Voice Metrics Service - Phase 3 telemetry and validation
 * Comprehensive voice system performance tracking
 */

import { devLog } from '@/devtools/devLog';

export interface VoiceMetric {
  id: string;
  timestamp: number;
  type: 'session' | 'processing' | 'intent' | 'error' | 'user_action';
  sessionId: string;
  source: string;
  data: Record<string, any>;
}

export interface VoiceSessionMetrics {
  sessionId: string;
  source: string;
  mode: string;
  backend: string;
  startTime: number;
  endTime?: number;
  
  // Core performance metrics
  timeToFirstTranscript: number; // Time to first speech recognition
  timeToChip: number; // Time to intent chip appearance
  totalProcessingTime: number;
  
  // Quality metrics
  transcriptAccuracy: number; // 0-1, estimated
  intentConfidence: number; // 0-1
  finalTranscript: string;
  detectedIntent: string;
  
  // User interaction metrics
  userAccepted: boolean;
  userUndid: boolean;
  userConfusion: boolean; // Multiple back-to-back attempts
  fallbackTriggered: boolean;
  
  // Resource usage
  audioQuality: number; // 0-1, based on audio levels
  networkLatency?: number;
  memoryUsage?: number;
}

export interface VoicePerformanceSnapshot {
  timestamp: number;
  totalSessions: number;
  successRate: number; // % sessions with user acceptance
  avgTimeToChip: number;
  avgProcessingTime: number;
  confusionRate: number; // % sessions with user confusion
  fallbackRate: number; // % sessions requiring fallback
  topIntents: Array<{ intent: string; count: number; avgConfidence: number }>;
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

export interface VoiceMetricsSummary {
  timeRange: { start: number; end: number };
  totalSessions: number;
  successMetrics: {
    acceptanceRate: number;
    completionRate: number;
    undoRate: number;
  };
  performanceMetrics: {
    avgTimeToChip: number;
    avgProcessingTime: number;
    p95TimeToChip: number;
    p95ProcessingTime: number;
  };
  qualityMetrics: {
    avgIntentConfidence: number;
    fallbackRate: number;
    confusionRate: number;
  };
  resourceMetrics: {
    avgAudioQuality: number;
    avgNetworkLatency: number;
    memoryPressure: number;
  };
}

class VoiceMetricsService {
  private metrics: VoiceMetric[] = [];
  private sessionMetrics: Map<string, VoiceSessionMetrics> = new Map();
  private performanceSnapshots: VoicePerformanceSnapshot[] = [];
  private readonly MAX_METRICS = 10000;
  private readonly MAX_SNAPSHOTS = 100;

  // Session lifecycle tracking
  startSession(sessionId: string, source: string, mode: string, backend: string): void {
    const sessionMetric: VoiceSessionMetrics = {
      sessionId,
      source,
      mode,
      backend,
      startTime: Date.now(),
      timeToFirstTranscript: 0,
      timeToChip: 0,
      totalProcessingTime: 0,
      transcriptAccuracy: 0,
      intentConfidence: 0,
      finalTranscript: '',
      detectedIntent: '',
      userAccepted: false,
      userUndid: false,
      userConfusion: false,
      fallbackTriggered: false,
      audioQuality: 0,
    };

    this.sessionMetrics.set(sessionId, sessionMetric);
    this.recordMetric('session', sessionId, source, {
      action: 'start',
      mode,
      backend,
    });
  }

  // Performance tracking
  recordFirstTranscript(sessionId: string, timeMs: number): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.timeToFirstTranscript = timeMs;
      this.recordMetric('processing', sessionId, session.source, {
        milestone: 'first_transcript',
        timeMs,
      });
    }
  }

  recordIntentChip(sessionId: string, timeMs: number, intent: string, confidence: number): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.timeToChip = timeMs;
      session.detectedIntent = intent;
      session.intentConfidence = confidence;
      this.recordMetric('intent', sessionId, session.source, {
        milestone: 'chip_shown',
        timeMs,
        intent,
        confidence,
      });
    }
  }

  recordSessionComplete(
    sessionId: string,
    finalTranscript: string,
    totalTime: number,
    audioQuality: number = 0.8
  ): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      session.finalTranscript = finalTranscript;
      session.totalProcessingTime = totalTime;
      session.audioQuality = audioQuality;
      session.transcriptAccuracy = this.estimateTranscriptAccuracy(finalTranscript);

      this.recordMetric('session', sessionId, session.source, {
        action: 'complete',
        totalTime,
        transcript: finalTranscript,
        audioQuality,
      });
    }
  }

  // User interaction tracking
  recordUserAcceptance(sessionId: string, accepted: boolean): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.userAccepted = accepted;
      this.recordMetric('user_action', sessionId, session.source, {
        action: accepted ? 'accept' : 'decline',
      });
    }
  }

  recordUserUndo(sessionId: string): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.userUndid = true;
      this.recordMetric('user_action', sessionId, session.source, {
        action: 'undo',
      });
    }
  }

  recordUserConfusion(sessionId: string): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.userConfusion = true;
      this.recordMetric('user_action', sessionId, session.source, {
        action: 'confusion',
      });
    }
  }

  recordFallback(sessionId: string, reason: string): void {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.fallbackTriggered = true;
      this.recordMetric('error', sessionId, session.source, {
        type: 'fallback',
        reason,
      });
    }
  }

  // Analytics and reporting
  getPerformanceSnapshot(): VoicePerformanceSnapshot {
    const sessions = Array.from(this.sessionMetrics.values()).filter(s => s.endTime);
    const now = Date.now();
    const recentSessions = sessions.filter(s => now - s.startTime < 3600000); // Last hour

    const successRate = recentSessions.length > 0 
      ? recentSessions.filter(s => s.userAccepted).length / recentSessions.length 
      : 0;

    const avgTimeToChip = recentSessions.length > 0
      ? recentSessions.reduce((sum, s) => sum + s.timeToChip, 0) / recentSessions.length
      : 0;

    const avgProcessingTime = recentSessions.length > 0
      ? recentSessions.reduce((sum, s) => sum + s.totalProcessingTime, 0) / recentSessions.length
      : 0;

    const confusionRate = recentSessions.length > 0
      ? recentSessions.filter(s => s.userConfusion).length / recentSessions.length
      : 0;

    const fallbackRate = recentSessions.length > 0
      ? recentSessions.filter(s => s.fallbackTriggered).length / recentSessions.length
      : 0;

    // Intent analysis
    const intentMap = new Map<string, { count: number; totalConfidence: number }>();
    recentSessions.forEach(s => {
      if (s.detectedIntent) {
        const existing = intentMap.get(s.detectedIntent) || { count: 0, totalConfidence: 0 };
        existing.count++;
        existing.totalConfidence += s.intentConfidence;
        intentMap.set(s.detectedIntent, existing);
      }
    });

    const topIntents = Array.from(intentMap.entries())
      .map(([intent, data]) => ({
        intent,
        count: data.count,
        avgConfidence: data.totalConfidence / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Performance trend analysis
    const performanceTrend = this.calculatePerformanceTrend(recentSessions);

    const snapshot: VoicePerformanceSnapshot = {
      timestamp: now,
      totalSessions: recentSessions.length,
      successRate,
      avgTimeToChip,
      avgProcessingTime,
      confusionRate,
      fallbackRate,
      topIntents,
      performanceTrend,
    };

    // Store snapshot
    this.performanceSnapshots.push(snapshot);
    if (this.performanceSnapshots.length > this.MAX_SNAPSHOTS) {
      this.performanceSnapshots.shift();
    }

    return snapshot;
  }

  getSummary(timeRangeMs: number = 3600000): VoiceMetricsSummary {
    const now = Date.now();
    const sessions = Array.from(this.sessionMetrics.values())
      .filter(s => s.endTime && (now - s.startTime) <= timeRangeMs);

    if (sessions.length === 0) {
      return this.getEmptySummary(now - timeRangeMs, now);
    }

    // Success metrics
    const acceptanceRate = sessions.filter(s => s.userAccepted).length / sessions.length;
    const completionRate = sessions.filter(s => s.endTime).length / sessions.length;
    const undoRate = sessions.filter(s => s.userUndid).length / sessions.length;

    // Performance metrics
    const timeToChipValues = sessions.map(s => s.timeToChip).sort((a, b) => a - b);
    const processingTimeValues = sessions.map(s => s.totalProcessingTime).sort((a, b) => a - b);
    
    const avgTimeToChip = timeToChipValues.reduce((sum, val) => sum + val, 0) / timeToChipValues.length;
    const avgProcessingTime = processingTimeValues.reduce((sum, val) => sum + val, 0) / processingTimeValues.length;
    const p95TimeToChip = timeToChipValues[Math.floor(timeToChipValues.length * 0.95)] || 0;
    const p95ProcessingTime = processingTimeValues[Math.floor(processingTimeValues.length * 0.95)] || 0;

    // Quality metrics
    const avgIntentConfidence = sessions.reduce((sum, s) => sum + s.intentConfidence, 0) / sessions.length;
    const fallbackRate = sessions.filter(s => s.fallbackTriggered).length / sessions.length;
    const confusionRate = sessions.filter(s => s.userConfusion).length / sessions.length;

    // Resource metrics
    const avgAudioQuality = sessions.reduce((sum, s) => sum + s.audioQuality, 0) / sessions.length;
    const avgNetworkLatency = sessions
      .filter(s => s.networkLatency)
      .reduce((sum, s) => sum + (s.networkLatency || 0), 0) / sessions.length;

    return {
      timeRange: { start: now - timeRangeMs, end: now },
      totalSessions: sessions.length,
      successMetrics: {
        acceptanceRate,
        completionRate,
        undoRate,
      },
      performanceMetrics: {
        avgTimeToChip,
        avgProcessingTime,
        p95TimeToChip,
        p95ProcessingTime,
      },
      qualityMetrics: {
        avgIntentConfidence,
        fallbackRate,
        confusionRate,
      },
      resourceMetrics: {
        avgAudioQuality,
        avgNetworkLatency,
        memoryPressure: this.getMemoryPressure(),
      },
    };
  }

  getRecentSnapshots(count: number = 10): VoicePerformanceSnapshot[] {
    return this.performanceSnapshots.slice(-count);
  }

  // Performance budget validation
  checkPerformanceBudget(): { passed: boolean; violations: string[] } {
    const snapshot = this.getPerformanceSnapshot();
    const violations: string[] = [];

    // Performance budgets (as per Phase 3 plan)
    if (snapshot.avgTimeToChip > 500) { // 500ms budget
      violations.push(`Time to chip: ${snapshot.avgTimeToChip}ms exceeds 500ms budget`);
    }

    if (snapshot.avgProcessingTime > 1000) { // 1s budget
      violations.push(`Processing time: ${snapshot.avgProcessingTime}ms exceeds 1000ms budget`);
    }

    if (snapshot.successRate < 0.85) { // 85% success rate budget
      violations.push(`Success rate: ${(snapshot.successRate * 100).toFixed(1)}% below 85% budget`);
    }

    if (snapshot.confusionRate > 0.1) { // 10% confusion budget
      violations.push(`Confusion rate: ${(snapshot.confusionRate * 100).toFixed(1)}% exceeds 10% budget`);
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  // Cleanup and maintenance
  clearMetrics(): void {
    this.metrics = [];
    this.sessionMetrics.clear();
    this.performanceSnapshots = [];
  }

  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      sessionMetrics: Array.from(this.sessionMetrics.entries()),
      snapshots: this.performanceSnapshots,
      summary: this.getSummary(),
    }, null, 2);
  }

  // Private helpers
  private recordMetric(type: VoiceMetric['type'], sessionId: string, source: string, data: Record<string, any>): void {
    const metric: VoiceMetric = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      sessionId,
      source,
      data,
    };

    this.metrics.push(metric);
    
    // Prevent memory bloat
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.splice(0, this.metrics.length - this.MAX_METRICS);
    }

    devLog('voice-metrics', `${type}:${data.action || data.milestone || 'event'}`); // Fixed argument count
  }

  private estimateTranscriptAccuracy(transcript: string): number {
    // Simple heuristic: longer, more coherent transcripts score higher
    // In production, this could use NLP or user feedback
    const length = transcript.length;
    const words = transcript.split(/\s+/).length;
    const avgWordLength = length / words;
    
    // Penalty for very short or very long average word lengths
    let score = 0.7; // Base score
    if (avgWordLength >= 3 && avgWordLength <= 8) score += 0.2;
    if (words >= 3) score += 0.1;
    if (!/[^\w\s]/.test(transcript)) score -= 0.1; // Penalty for special chars
    
    return Math.max(0, Math.min(1, score));
  }

  private calculatePerformanceTrend(sessions: VoiceSessionMetrics[]): 'improving' | 'stable' | 'degrading' {
    if (sessions.length < 10) return 'stable';
    
    const mid = Math.floor(sessions.length / 2);
    const early = sessions.slice(0, mid);
    const recent = sessions.slice(mid);
    
    const earlyAvgTime = early.reduce((sum, s) => sum + s.timeToChip, 0) / early.length;
    const recentAvgTime = recent.reduce((sum, s) => sum + s.timeToChip, 0) / recent.length;
    
    const improvement = (earlyAvgTime - recentAvgTime) / earlyAvgTime;
    
    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'degrading';
    return 'stable';
  }

  private getEmptySummary(start: number, end: number): VoiceMetricsSummary {
    return {
      timeRange: { start, end },
      totalSessions: 0,
      successMetrics: { acceptanceRate: 0, completionRate: 0, undoRate: 0 },
      performanceMetrics: { avgTimeToChip: 0, avgProcessingTime: 0, p95TimeToChip: 0, p95ProcessingTime: 0 },
      qualityMetrics: { avgIntentConfidence: 0, fallbackRate: 0, confusionRate: 0 },
      resourceMetrics: { avgAudioQuality: 0, avgNetworkLatency: 0, memoryPressure: 0 },
    };
  }

  private getMemoryPressure(): number {
    // Estimate memory pressure based on metrics count
    const pressure = this.metrics.length / this.MAX_METRICS;
    return Math.max(0, Math.min(1, pressure));
  }
}

export const voiceMetricsService = new VoiceMetricsService();