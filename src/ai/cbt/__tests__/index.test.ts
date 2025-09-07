import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCBTMessage, recordCBTEngagement, getCBTStats, deleteCBTData } from '../index';
import type { CBTPolicyContext } from '../types';

// Mock all services
vi.mock('../crisis', () => ({
  detectCrisisInMessage: vi.fn(() => ({ hasCrisis: false, crisisTypes: [], confidence: 0 })),
  getCrisisResources: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../observer', () => ({
  annotate: vi.fn(() => ({
    distortions: [{ type: 'AllOrNothing', confidence: 0.8, evidence: 'always/never language' }],
    crisisFlags: [],
    messageLength: 20,
    emotionalIntensity: 0.6,
  })),
}));

vi.mock('../policy', () => ({
  decide: vi.fn(() => ({
    shouldIntervene: true,
    reason: 'High confidence distortion detected',
    priority: 'medium',
    targetDistortions: ['AllOrNothing'],
    interventionType: 'gentle_chip',
  })),
}));

vi.mock('../acts', () => ({
  render: vi.fn(() => ({
    type: 'gentle_chip',
    title: 'Another way to see this',
    description: 'Consider that there might be middle ground here.',
    actions: [{ label: 'Explore this', type: 'primary' }],
  })),
}));

vi.mock('../trace', () => ({
  traceService: {
    recordTrace: vi.fn(() => Promise.resolve('trace-123')),
    recordEngagement: vi.fn(() => Promise.resolve(true)),
    getStatistics: vi.fn(() => Promise.resolve({
      totalTraces: 10,
      interventions: 5,
      averageHelpfulness: 4.2,
      distortionBreakdown: { AllOrNothing: 3, Catastrophizing: 2 },
    })),
    deleteUserData: vi.fn(() => Promise.resolve(8)),
  },
}));

vi.mock('../fatigue', () => ({
  fatigueService: {
    canIntervene: vi.fn(() => true),
    recordIntervention: vi.fn(),
  },
}));

describe('CBT Main Pipeline', () => {
  const mockContext: CBTPolicyContext = {
    userSettings: {
      assistLevel: 'standard',
      autoLogMode: 'ask',
      privacyLayer: 'context',
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      topicExclusions: [],
      neverInterveningPhrases: [],
    },
    fatigueState: {
      dailyCount: 0,
      lastInterventionTime: 0,
      declineStreak: 0,
      topicCooldowns: {},
      lastResetDate: new Date().toDateString(),
    },
    conversationContext: {
      recentMessages: [],
      conversationLength: 1,
      topicContinuity: 0.5,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
          expect.objectContaining({ type: 'AllOrNothing' })
        ]),
      }),
      decision: expect.objectContaining({
        shouldIntervene: true,
        reason: expect.any(String),
      }),
      action: expect.objectContaining({
        type: 'gentle_chip',
        title: expect.any(String),
      }),
      traceId: expect.any(String),
    });
  });

  it('skips intervention when fatigue limits reached', async () => {
    const fatigueModule = await import('../fatigue');
    vi.mocked(fatigueModule.fatigueService.canIntervene).mockReturnValue(false);

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
    const crisisModule = await import('../crisis');
    vi.mocked(crisisModule.detectCrisisInMessage).mockReturnValue({
      hasCrisis: true,
      crisisTypes: ['suicide'],
      confidence: 0.9,
      urgency: 'immediate',
    });

    const result = await processCBTMessage(
      'I want to end it all',
      'msg-125',
      'user-456',
      mockContext
    );

    expect(result.action?.type).toBe('crisis_support');
    expect(result.annotation.crisisFlags).toContain('suicide');
  });

  it('records engagement and updates fatigue', async () => {
    const success = await recordCBTEngagement(
      'trace-123',
      true,
      4,
      'This was helpful',
      'user-456'
    );

    expect(success).toBe(true);
    
    const traceModule = await import('../trace');
    expect(traceModule.traceService.recordEngagement).toHaveBeenCalledWith(
      'trace-123',
      true,
      4,
      'This was helpful',
      'user-456'
    );
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
    const deletedCount = await deleteCBTData('user-456');

    expect(deletedCount).toBe(8);
    
    const traceModule = await import('../trace');
    expect(traceModule.traceService.deleteUserData).toHaveBeenCalledWith('user-456');
  });

  it('respects quiet hours setting', async () => {
    const quietHoursContext = {
      ...mockContext,
      userSettings: {
        ...mockContext.userSettings,
        quietHours: { enabled: true, start: '22:00', end: '08:00' },
      },
    };

    // Mock current time to be in quiet hours
    const mockDate = new Date();
    mockDate.setHours(23, 0, 0, 0); // 11 PM
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

    const result = await processCBTMessage(
      'I hate everything',
      'msg-126',
      'user-456',
      quietHoursContext
    );

    expect(result.action).toBeNull();
    expect(result.decision.reason).toContain('quiet hours');

    vi.restoreAllMocks();
  });

  it('handles topic exclusions', async () => {
    const exclusionContext = {
      ...mockContext,
      userSettings: {
        ...mockContext.userSettings,
        topicExclusions: ['work', 'career'],
      },
    };

    const result = await processCBTMessage(
      'My work is absolutely terrible',
      'msg-127',
      'user-456',
      exclusionContext
    );

    expect(result.action).toBeNull();
    expect(result.decision.reason).toContain('topic exclusion');
  });
});