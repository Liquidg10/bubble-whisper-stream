/**
 * CBT Trace Tests - Persistence and data management validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CBTTraceService } from '../trace';
import type { CBTTrace } from '../types';

describe('CBT Trace Service', () => {
  let traceService: CBTTraceService;

  const mockTrace = {
    userId: 'user-123',
    timestamp: Date.now(),
    annotation: {
      messageId: 'msg-1',
      timestamp: Date.now(),
      distortions: [
        {
          type: 'all_or_nothing' as const,
          confidence: 0.8,
          evidence: ['always'],
          keywords: ['always']
        }
      ],
      sentiment: { score: -0.5, magnitude: 0.7 },
      crisisFlags: [],
      context: {
        timeOfDay: 14,
        messageLength: 30,
        conversationDepth: 2
      }
    },
    decision: {
      shouldIntervene: true,
      interventionType: 'gentle' as const,
      reason: 'Distortion detected',
      targetDistortions: ['all_or_nothing' as const],
      priority: 'medium' as const,
      cooldownMinutes: 60,
      metadata: {
        fatigueScore: 0.3,
        policyMatch: 'distortion_threshold',
        confidence: 0.8
      }
    }
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    traceService = new CBTTraceService();
  });

  describe('Trace Persistence', () => {
    it('should persist a new trace', async () => {
      const traceId = await traceService.persist(mockTrace);
      
      expect(traceId).toBeDefined();
      expect(traceId).toMatch(/^cbt_\d+_\w+$/);
      
      const retrieved = traceService.getById(traceId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.userId).toBe(mockTrace.userId);
      expect(retrieved!.pseudonymousId).toBeDefined();
    });

    it('should generate unique IDs for multiple traces', async () => {
      const id1 = await traceService.persist(mockTrace);
      const id2 = await traceService.persist({ ...mockTrace, timestamp: Date.now() + 1000 });
      
      expect(id1).not.toBe(id2);
    });

    it('should generate pseudonymous IDs for telemetry', async () => {
      const traceId = await traceService.persist(mockTrace);
      const trace = traceService.getById(traceId);
      
      expect(trace!.pseudonymousId).toBeDefined();
      expect(trace!.pseudonymousId).toMatch(/^cbt_\w+$/);
      expect(trace!.pseudonymousId).not.toBe(mockTrace.userId);
    });
  });

  describe('Trace Retrieval', () => {
    it('should list all traces', async () => {
      await traceService.persist(mockTrace);
      await traceService.persist({ ...mockTrace, userId: 'user-456' });
      
      const traces = traceService.list();
      expect(traces).toHaveLength(2);
    });

    it('should filter traces by user ID', async () => {
      await traceService.persist(mockTrace);
      await traceService.persist({ ...mockTrace, userId: 'user-456' });
      
      const userTraces = traceService.list({ userId: 'user-123' });
      expect(userTraces).toHaveLength(1);
      expect(userTraces[0].userId).toBe('user-123');
    });

    it('should filter traces by date range', async () => {
      const oldTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      const newTimestamp = Date.now();
      
      await traceService.persist({ ...mockTrace, timestamp: oldTimestamp });
      await traceService.persist({ ...mockTrace, timestamp: newTimestamp });
      
      const recentTraces = traceService.list({ 
        startDate: newTimestamp - (1 * 24 * 60 * 60 * 1000) // 1 day ago
      });
      
      expect(recentTraces).toHaveLength(1);
      expect(recentTraces[0].timestamp).toBe(newTimestamp);
    });

    it('should filter traces by priority', async () => {
      const crisisTrace = {
        ...mockTrace,
        decision: { ...mockTrace.decision, priority: 'crisis' as const }
      };
      
      await traceService.persist(mockTrace);
      await traceService.persist(crisisTrace);
      
      const crisisTraces = traceService.list({ priority: ['crisis'] });
      expect(crisisTraces).toHaveLength(1);
      expect(crisisTraces[0].decision.priority).toBe('crisis');
    });

    it('should limit number of results', async () => {
      for (let i = 0; i < 5; i++) {
        await traceService.persist({ ...mockTrace, timestamp: Date.now() + i });
      }
      
      const limitedTraces = traceService.list({ limit: 3 });
      expect(limitedTraces).toHaveLength(3);
    });

    it('should sort traces by timestamp descending', async () => {
      const timestamp1 = Date.now() - 1000;
      const timestamp2 = Date.now();
      
      await traceService.persist({ ...mockTrace, timestamp: timestamp1 });
      await traceService.persist({ ...mockTrace, timestamp: timestamp2 });
      
      const traces = traceService.list();
      expect(traces[0].timestamp).toBe(timestamp2);
      expect(traces[1].timestamp).toBe(timestamp1);
    });
  });

  describe('Trace Updates', () => {
    it('should update trace outcome', async () => {
      const traceId = await traceService.persist(mockTrace);
      
      const outcome = {
        userEngaged: true,
        userResponse: 'That was helpful',
        helpfulness: 4
      };
      
      const success = traceService.updateOutcome(traceId, outcome);
      expect(success).toBe(true);
      
      const updated = traceService.getById(traceId);
      expect(updated!.outcome).toEqual(outcome);
    });

    it('should return false for non-existent trace update', () => {
      const success = traceService.updateOutcome('non-existent', { userEngaged: false });
      expect(success).toBe(false);
    });
  });

  describe('Trace Deletion', () => {
    it('should delete all traces', async () => {
      await traceService.persist(mockTrace);
      await traceService.persist({ ...mockTrace, userId: 'user-456' });
      
      await traceService.deleteAll();
      
      const traces = traceService.list();
      expect(traces).toHaveLength(0);
    });

    it('should delete traces for specific user', async () => {
      await traceService.persist(mockTrace);
      await traceService.persist({ ...mockTrace, userId: 'user-456' });
      
      const deletedCount = traceService.deleteForUser('user-123');
      expect(deletedCount).toBe(1);
      
      const remainingTraces = traceService.list();
      expect(remainingTraces).toHaveLength(1);
      expect(remainingTraces[0].userId).toBe('user-456');
    });
  });

  describe('Anonymized Data', () => {
    it('should return anonymized traces for telemetry', async () => {
      await traceService.persist(mockTrace);
      
      const anonymized = traceService.getAnonymizedTraces();
      expect(anonymized).toHaveLength(1);
      
      const trace = anonymized[0];
      expect(trace.id).toMatch(/^cbt_\w+$/); // Pseudonymous ID
      expect(trace.annotation).toBeDefined();
      expect(trace.decision).toBeDefined();
      
      // Should not contain sensitive data
      expect((trace as any).userId).toBeUndefined();
    });

    it('should limit anonymized trace count', async () => {
      for (let i = 0; i < 5; i++) {
        await traceService.persist({ ...mockTrace, timestamp: Date.now() + i });
      }
      
      const anonymized = traceService.getAnonymizedTraces(3);
      expect(anonymized).toHaveLength(3);
    });
  });

  describe('Statistics', () => {
    it('should calculate basic statistics', async () => {
      const crisisTrace = {
        ...mockTrace,
        decision: { ...mockTrace.decision, priority: 'crisis' as const }
      };
      
      await traceService.persist(mockTrace);
      await traceService.persist(crisisTrace);
      
      const stats = traceService.getStats();
      
      expect(stats.totalTraces).toBe(2);
      expect(stats.interventions).toBe(2);
      expect(stats.crisisInterventions).toBe(1);
      expect(stats.distortionBreakdown.all_or_nothing).toBe(2);
    });

    it('should calculate average helpfulness', async () => {
      const traceId1 = await traceService.persist(mockTrace);
      const traceId2 = await traceService.persist(mockTrace);
      
      traceService.updateOutcome(traceId1, { userEngaged: true, helpfulness: 4 });
      traceService.updateOutcome(traceId2, { userEngaged: true, helpfulness: 2 });
      
      const stats = traceService.getStats();
      expect(stats.averageHelpfulness).toBe(3);
    });

    it('should filter statistics by user', async () => {
      await traceService.persist(mockTrace);
      await traceService.persist({ ...mockTrace, userId: 'user-456' });
      
      const userStats = traceService.getStats('user-123');
      expect(userStats.totalTraces).toBe(1);
      
      const allStats = traceService.getStats();
      expect(allStats.totalTraces).toBe(2);
    });
  });
});