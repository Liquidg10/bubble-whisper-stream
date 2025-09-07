/**
 * CBT Trace Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CBTTraceService } from '../trace';
import type { CBTTrace, CBTAnnotation, CBTDecision } from '../types';

describe('CBTTraceService', () => {
  let traceService: CBTTraceService;

  const mockAnnotation: CBTAnnotation = {
    messageId: 'test-message-123',
    timestamp: Date.now(),
    distortions: [{
      type: 'all_or_nothing',
      confidence: 0.8,
      evidence: ['always', 'never'],
      keywords: ['always', 'never']
    }],
    sentiment: { score: -0.5, magnitude: 0.7 },
    crisisFlags: [],
    context: {
      timeOfDay: 14,
      messageLength: 50,
      conversationDepth: 3
    }
  };

  const mockDecision: CBTDecision = {
    shouldIntervene: true,
    interventionType: 'chip',
    reason: 'Detected all-or-nothing thinking',
    targetDistortions: ['all_or_nothing'],
    priority: 'medium',
    cooldownMinutes: 60,
    metadata: {
      fatigueScore: 0.2,
      policyMatch: 'default',
      confidence: 0.8
    }
  };

  const mockTrace = {
    conversationId: 'test-conversation',
    messageId: 'test-message-123',
    userId: 'test-user',
    distortion: 'all_or_nothing' as const,
    createdAt: Date.now(),
    privacyLayer: 'context' as const,
    consent: true,
    timestamp: Date.now(),
    annotation: mockAnnotation,
    decision: mockDecision
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    traceService = new CBTTraceService();
  });

  describe('Trace Persistence', () => {
    it('should persist a new trace with consent', async () => {
      const traceId = await traceService.persist(mockTrace, true);
      
      expect(traceId).toBeDefined();
      expect(traceId).toMatch(/^cbt_\d+_\w+$/);
      
      const retrieved = traceService.getById(traceId!);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.userId).toBe(mockTrace.userId);
      expect(retrieved!.pseudonymousId).toBeDefined();
    });

    it('should not persist trace without consent', async () => {
      const traceId = await traceService.persist(mockTrace, false);
      
      expect(traceId).toBeNull();
      expect(traceService.list().length).toBe(0);
    });

    it('should filter traces by user', async () => {
      await traceService.persist({
        ...mockTrace,
        userId: 'test-user-1'
      }, true);
      await traceService.persist({
        ...mockTrace,
        userId: 'test-user-2',
        createdAt: Date.now() - 1000,
        timestamp: Date.now() - 1000
      }, true);

      const user1Traces = traceService.list({ userId: 'test-user-1' });
      expect(user1Traces).toHaveLength(1);
      expect(user1Traces[0].userId).toBe('test-user-1');
    });

    it('should update trace outcome', async () => {
      const traceId = await traceService.persist(mockTrace, true);
      expect(traceId).toBeDefined();

      const success = traceService.updateOutcome(traceId!, {
        userEngaged: true,
        helpfulness: 4
      });
      
      expect(success).toBe(true);
      const updated = traceService.getById(traceId!);
      expect(updated!.outcome?.userEngaged).toBe(true);
      expect(updated!.outcome?.helpfulness).toBe(4);
    });
  });

  describe('Trace Management', () => {
    it('should archive and unarchive traces', async () => {
      const traceId = await traceService.persist(mockTrace, true);
      expect(traceId).toBeDefined();

      const archived = traceService.archiveTrace(traceId!);
      expect(archived).toBe(true);

      const trace = traceService.getById(traceId!);
      expect(trace!.archived).toBe(true);

      const unarchived = traceService.unarchiveTrace(traceId!);
      expect(unarchived).toBe(true);

      const unArchivedTrace = traceService.getById(traceId!);
      expect(unArchivedTrace!.archived).toBe(false);
    });

    it('should filter by archived status', async () => {
      const traceId1 = await traceService.persist(mockTrace, true);
      const traceId2 = await traceService.persist({
        ...mockTrace,
        messageId: 'test-message-456'
      }, true);

      traceService.archiveTrace(traceId1!);

      const archived = traceService.list({ archived: true });
      const nonArchived = traceService.list({ archived: false });

      expect(archived).toHaveLength(1);
      expect(nonArchived).toHaveLength(1);
    });

    it('should delete traces for specific user', async () => {
      await traceService.persist({
        ...mockTrace,
        userId: 'user-1'
      }, true);
      await traceService.persist({
        ...mockTrace,
        userId: 'user-2',
        messageId: 'test-message-456'
      }, true);

      const deletedCount = traceService.deleteForUser('user-1');
      expect(deletedCount).toBe(1);

      const remainingTraces = traceService.list();
      expect(remainingTraces).toHaveLength(1);
      expect(remainingTraces[0].userId).toBe('user-2');
    });

    it('should delete all traces securely', async () => {
      await traceService.persist(mockTrace, true);
      await traceService.persist({
        ...mockTrace,
        messageId: 'test-message-456'
      }, true);

      await traceService.deleteAll();
      
      const remainingTraces = traceService.list();
      expect(remainingTraces).toHaveLength(0);
    });
  });

  describe('Statistics and Reporting', () => {
    beforeEach(async () => {
      // Create test data
      await traceService.persist(mockTrace, true);
      await traceService.persist({
        ...mockTrace,
        messageId: 'test-message-456',
        decision: { ...mockDecision, priority: 'crisis' as const }
      }, true);
    });

    it('should generate correct statistics', () => {
      const stats = traceService.getStats('test-user');
      
      expect(stats.totalTraces).toBe(2);
      expect(stats.interventions).toBe(2);
      expect(stats.crisisInterventions).toBe(1);
      expect(stats.distortionBreakdown['all_or_nothing']).toBe(2);
      expect(stats.storageSize).toMatch(/^\~\d+\.\d+ KB$/);
    });

    it('should export traces with privacy controls', () => {
      const exported = traceService.exportForUser('test-user', {
        privacyLayer: 'context'
      });
      
      expect(exported).toHaveLength(2);
      expect(exported[0].privacyLayer).toBe('context');
    });

    it('should generate anonymized traces for telemetry', () => {
      const anonymized = traceService.getAnonymizedTraces(10);
      
      expect(anonymized).toHaveLength(2);
      expect(anonymized[0].id).toBeDefined(); // pseudonymousId
      expect(anonymized[0]).not.toHaveProperty('userId');
      expect(anonymized[0]).not.toHaveProperty('messageId');
    });
  });

  describe('Privacy and Retention', () => {
    it('should preserve archived traces during retention cleanup', async () => {
      // Create an old trace and archive it
      const oldTrace = {
        ...mockTrace,
        createdAt: Date.now() - (40 * 24 * 60 * 60 * 1000), // 40 days old
        timestamp: Date.now() - (40 * 24 * 60 * 60 * 1000)
      };
      
      const traceId = await traceService.persist(oldTrace, true);
      traceService.archiveTrace(traceId!);

      // Simulate retention policy enforcement
      await (traceService as any).enforceRetentionPolicy();

      const archivedTraces = traceService.list({ archived: true });
      expect(archivedTraces).toHaveLength(1);
    });

    it('should handle consent properly', async () => {
      const noConsentTrace = await traceService.persist(mockTrace, false);
      const consentTrace = await traceService.persist(mockTrace, true);

      expect(noConsentTrace).toBeNull();
      expect(consentTrace).toBeDefined();
      
      const allTraces = traceService.list();
      expect(allTraces).toHaveLength(1);
      expect(allTraces[0].consent).toBe(true);
    });
  });
});