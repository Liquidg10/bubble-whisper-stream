import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCBTMessage, recordCBTEngagement, getCBTStats, deleteCBTData } from '../index';
import { annotate } from '../observer';
import { decide } from '../policy';
import type { CBTPolicyContext } from '../types';

// Mock all services
vi.mock('../crisis', () => ({
  detectCrisisInMessage: vi.fn(() => ({ 
    crisisFlags: [],
    severity: 'low'
  })),
  getCrisisResources: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../observer', () => ({
  annotate: vi.fn(() => ({
    messageId: 'msg-123',
    timestamp: Date.now(),
    distortions: [{
      type: 'all_or_nothing',
      confidence: 0.8,
      evidence: ['always', 'never'],
      keywords: ['always', 'never']
    }],
    sentiment: { score: -0.3, magnitude: 0.7 },
    crisisFlags: [],
    context: {
      timeOfDay: 14,
      messageLength: 20,
      conversationDepth: 5
    }
  })),
}));

vi.mock('../policy', () => ({
  decide: vi.fn(() => ({
    shouldIntervene: true,
    interventionType: 'chip',
    reason: 'High confidence distortion detected',
    targetDistortions: ['all_or_nothing'],
    priority: 'medium',
    cooldownMinutes: 30,
    metadata: {
      fatigueScore: 0.3,
      policyMatch: 'distortion_intervention',
      confidence: 0.85
    }
  })),
}));

vi.mock('../acts', () => ({
  render: vi.fn(() => ({
    type: 'chip',
    text: 'Want to explore another perspective?',
    data: {
      distortionType: 'all_or_nothing',
      reframes: ['Maybe there\'s some middle ground here?']
    }
  })),
}));

vi.mock('../trace', () => ({
  traceService: {
    persist: vi.fn(() => Promise.resolve('trace-123')),
    updateOutcome: vi.fn(() => Promise.resolve(true)),
    getStats: vi.fn(() => Promise.resolve({
      totalTraces: 10,
      interventions: 5,
      averageHelpfulness: 4.2,
      distortionBreakdown: { all_or_nothing: 3, catastrophizing: 2 },
    })),
    deleteForUser: vi.fn(() => Promise.resolve(2)),
  },
}));

vi.mock('../fatigue', () => ({
  fatigueService: {
    canIntervene: vi.fn(() => ({
      allowed: true,
      fatigueScore: 0.3
    })),
    recordIntervention: vi.fn(),
    // Incomplete mock previously omitted resetFatigue, which index.ts's
    // getCurrentFatigueState() calls on every processCBTMessage() invocation.
    resetFatigue: vi.fn(() => ({
      globalInterventions: 0,
      topicCooldowns: {},
      lastIntervention: 0,
      dailyCount: 0,
      topicDeclines: {}
    })),
  },
}));

describe('CBT Main Pipeline', () => {
  const defaultAnnotation = {
    messageId: 'msg-123',
    timestamp: Date.now(),
    distortions: [{
      type: 'all_or_nothing' as const,
      confidence: 0.8,
      evidence: ['always', 'never'],
      keywords: ['always', 'never']
    }],
    sentiment: { score: -0.3, magnitude: 0.7 },
    crisisFlags: [],
    context: {
      timeOfDay: 14,
      messageLength: 20,
      conversationDepth: 5
    }
  };

  const defaultDecision = {
    shouldIntervene: true,
    interventionType: 'chip' as const,
    reason: 'High confidence distortion detected',
    targetDistortions: ['all_or_nothing' as const],
    priority: 'medium' as const,
    cooldownMinutes: 30,
    metadata: {
      fatigueScore: 0.3,
      policyMatch: 'distortion_intervention',
      confidence: 0.85
    }
  };

  const mockContext: CBTPolicyContext = {
    userSettings: {
      assistLevel: 'standard',
      privacyLayer: 'context',
      autoLogMode: 'ask',
      topicExclusions: [],
      neverInterveneOn: []
    },
    fatigueState: {
      globalInterventions: 2,
      lastIntervention: Date.now() - 3600000,
      dailyCount: 3,
      topicCooldowns: {},
      topicDeclines: {}
    },
    conversationContext: {
      messageCount: 10,
      averageSentiment: -0.3,
      recentTopics: ['work', 'fatigue'],
      timeSpan: 60
    }
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(annotate).mockReturnValue(defaultAnnotation);
    vi.mocked(decide).mockReturnValue(defaultDecision);
  });

  it('processes message through complete CBT pipeline', async () => {
    const result = await processCBTMessage(
      'I always mess everything up',
      'msg-123',
      'user-456',
      mockContext
    );

    expect(result).toMatchObject({
      annotation: expect.objectContaining({
        distortions: expect.arrayContaining([
          expect.objectContaining({ type: 'all_or_nothing' })
        ]),
      }),
      decision: expect.objectContaining({
        shouldIntervene: true,
        reason: expect.any(String),
      }),
      action: expect.objectContaining({
        type: 'chip',
        text: expect.any(String),
      }),
      traceId: expect.any(String),
    });
  });

  it('skips intervention when fatigue limits reached', async () => {
    vi.mocked(decide).mockReturnValue({
      ...defaultDecision,
      shouldIntervene: false,
      interventionType: 'none',
      reason: 'Daily intervention limit reached (2/day)',
      targetDistortions: []
    });

    const result = await processCBTMessage(
      'Everything is terrible',
      'msg-124',
      'user-456',
      mockContext
    );

    expect(result.action).toBeNull();
    expect(result.decision.shouldIntervene).toBe(false);
  });

  it('handles crisis detection and blocks normal CBT', async () => {
    vi.mocked(annotate).mockReturnValue({
      ...defaultAnnotation,
      crisisFlags: [{
        type: 'suicide',
        confidence: 0.9,
        keywords: ['ending it all'],
        severity: 'critical'
      }]
    });

    const result = await processCBTMessage(
      'I want to end it all',
      'msg-125',
      'user-456',
      mockContext
    );

    expect(result.action?.type).toBe('crisis_support');
    expect(result.annotation.crisisFlags).toHaveLength(1);
  });

  it('records engagement and updates fatigue', async () => {
    await recordCBTEngagement('trace-456', true, 4);
    
    const traceModule = await import('../trace');
    expect(traceModule.traceService.updateOutcome).toHaveBeenCalledWith('trace-456', expect.objectContaining({
      userEngaged: true,
      helpfulness: 4
    }));
  });

  it('retrieves user statistics', async () => {
    const stats = await getCBTStats('user-456');

    expect(stats).toMatchObject({
      totalTraces: expect.any(Number),
      interventions: expect.any(Number),
      averageHelpfulness: expect.any(Number),
      distortionBreakdown: expect.any(Object),
    });
  });

  it('deletes all user data', async () => {
    const deletedCount = await deleteCBTData('user-789');
    
    const traceModule = await import('../trace');
    expect(traceModule.traceService.deleteForUser).toHaveBeenCalledWith('user-789');
    expect(deletedCount).toBe(2);
  });

  it('respects quiet hours setting', async () => {
    const quietHoursContext = {
      ...mockContext,
      userSettings: {
        ...mockContext.userSettings,
        quietHours: { enabled: true, start: '22:00', end: '08:00' },
      },
    };

    vi.mocked(decide).mockReturnValue({
      ...defaultDecision,
      shouldIntervene: false,
      interventionType: 'none',
      reason: 'Quiet hours active',
      targetDistortions: []
    });

    const result = await processCBTMessage(
      'I hate everything',
      'msg-126',
      'user-456',
      quietHoursContext
    );

    expect(result.action).toBeNull();
    expect(result.decision.reason).toBe('Quiet hours active');

  });

  it('handles topic exclusions', async () => {
    const exclusionContext = {
      ...mockContext,
      userSettings: {
        ...mockContext.userSettings,
        topicExclusions: ['work', 'career'],
      },
    };

    vi.mocked(decide).mockReturnValue({
      ...defaultDecision,
      shouldIntervene: false,
      interventionType: 'none',
      reason: 'Message contains excluded topic',
      targetDistortions: []
    });

    const result = await processCBTMessage(
      'My work is absolutely terrible',
      'msg-127',
      'user-456',
      exclusionContext
    );

    expect(result.action).toBeNull();
    expect(result.decision.reason).toBe('Message contains excluded topic');
  });
});
