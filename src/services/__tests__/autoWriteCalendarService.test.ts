/**
 * Auto-Write Calendar Service Tests
 * 
 * Tests for Context Engine gating, decision traces, and undo compensation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autoWriteCalendarService, CalendarIntent } from '../autoWriteCalendarService';
import { contextEngineService } from '../contextEngineService';
import { policyDecisionEngine } from '../policyDecisionEngine';
import { decisionTraceService } from '../decisionTraceService';
import { THRESHOLD_LEVELS } from '../thresholdLadderService';

// Mock dependencies
vi.mock('../contextEngineService');
vi.mock('../policyDecisionEngine');
vi.mock('../decisionTraceService');
vi.mock('@/integrations/supabase/client');
vi.mock('@/stores/bubbleStore');

const mockContextEngineService = vi.mocked(contextEngineService);
const mockPolicyDecisionEngine = vi.mocked(policyDecisionEngine);
const mockDecisionTraceService = vi.mocked(decisionTraceService);

describe('AutoWriteCalendarService', () => {
  const mockIntent: CalendarIntent = {
    title: 'Team meeting',
    description: 'Weekly sync with development team',
    location: 'Conference Room A',
    startTime: new Date('2024-01-15T14:00:00Z'),
    endTime: new Date('2024-01-15T15:00:00Z'),
    attendees: ['john@example.com', 'jane@example.com'],
    confidence: 0.9,
    source: 'email',
    originalContent: 'Can we schedule our team meeting for Monday at 2pm in Conference Room A?'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    };
  });

  describe('processCalendarIntent', () => {
    it('should skip when auto-write is disabled', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      service.updateAutoWriteSettings({ enabled: false });

      // Act
      const result = await service.processCalendarIntent(mockIntent);

      // Assert
      expect(result.decision).toBe('skip');
      expect(result.becauseText).toBe('Auto-write calendar is disabled');
      expect(result.confidence).toBe(0);
    });

    it('should auto-write for high confidence scores', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      service.updateAutoWriteSettings({ enabled: true });

      const mockContextScore = {
        score: 0.9,
        signals: [
          { type: 'content_certainty' as const, value: 0.95, confidence: 0.9, weight: 0.3, reason: 'Clear date and time', source: 'context_engine' },
          { type: 'sender_trust' as const, value: 0.85, confidence: 0.8, weight: 0.2, reason: 'Known sender', source: 'context_engine' }
        ],
        because: ['Clear date and time detected', 'High sender trust'],
        metadata: { signalCount: 2, totalWeight: 0.5, deterministic: true, timestamp: Date.now() },
        confidence: 0.9,
        priority: 75,
        urgency: 0.8,
        domain: 'Calendar',
        reasoning: ['Clear date and time detected', 'High sender trust']
      };

      const mockPolicyDecision = {
        decision: 'auto-write' as const,
        score: 0.9,
        baseThreshold: 'HIGH',
        appliedOverrides: [],
        reason: 'High confidence with clear intent',
        confidence: 0.9,
        contextScore: mockContextScore,
        timestamp: new Date()
      };

      mockContextEngineService.generateScore.mockResolvedValue({
        ...mockContextScore,
        confidence: 0.85,
        priority: 75,
        urgency: 0.8,
        domain: 'Calendar',
        reasoning: ['High confidence calendar event']
      });
      mockPolicyDecisionEngine.makeDecision.mockResolvedValue(mockPolicyDecision);
      mockDecisionTraceService.addTrace.mockReturnValue('trace-123');

      // Mock successful calendar account and API
      vi.mocked(require('@/integrations/supabase/client').supabase).auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } }
      });
      
      vi.mocked(require('@/integrations/supabase/client').supabase).from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'account-123', calendar_id: 'primary' }]
              })
            })
          })
        })
      });

      vi.mocked(require('@/integrations/supabase/client').supabase).functions.invoke.mockResolvedValue({
        data: { event: { id: 'event-123', summary: 'Team meeting', htmlLink: 'https://calendar.google.com/event/123' } },
        error: null
      });

      // Act
      const result = await service.processCalendarIntent(mockIntent);

      // Assert
      expect(result.decision).toBe('auto-write');
      expect(result.eventId).toBe('event-123');
      expect(result.traceId).toBe('trace-123');
      expect(result.becauseText).toContain('Auto-wrote because');
      expect(result.confidence).toBe(0.9);
      expect(result.undoInfo).toBeDefined();
      expect(mockDecisionTraceService.addTrace).toHaveBeenCalledTimes(2); // Initial trace + success trace
    });

    it('should create draft for medium confidence scores', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      service.updateAutoWriteSettings({ enabled: true });

      const mockContextScore = {
        score: 0.7,
        signals: [
          { type: 'content_certainty' as const, value: 0.8, confidence: 0.7, weight: 0.3, reason: 'Some ambiguity in time', source: 'context_engine' },
          { type: 'sender_trust' as const, value: 0.6, confidence: 0.8, weight: 0.2, reason: 'Moderate sender trust', source: 'context_engine' }
        ],
        because: ['Some time ambiguity detected', 'Moderate confidence'],
        metadata: { signalCount: 2, totalWeight: 0.5, deterministic: true, timestamp: Date.now() },
        confidence: 0.7,
        priority: 60,
        urgency: 0.6,
        domain: 'Calendar',
        reasoning: ['Some time ambiguity detected', 'Moderate confidence']
      };

      const mockPolicyDecision = {
        decision: 'draft' as const,
        score: 0.7,
        baseThreshold: 'MEDIUM',
        appliedOverrides: [],
        reason: 'Medium confidence requires review',
        confidence: 0.7,
        contextScore: mockContextScore,
        timestamp: new Date()
      };

      mockContextEngineService.generateScore.mockResolvedValue(mockContextScore);
      mockPolicyDecisionEngine.makeDecision.mockResolvedValue(mockPolicyDecision);
      mockDecisionTraceService.addTrace.mockReturnValue('trace-456');

      // Act
      const result = await service.processCalendarIntent(mockIntent);

      // Assert
      expect(result.decision).toBe('draft');
      expect(result.draftId).toBeDefined();
      expect(result.traceId).toBe('trace-456');
      expect(result.becauseText).toContain('Created draft because');
      expect(result.confidence).toBe(0.7);
    });

    it('should create suggestion for low confidence scores', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      service.updateAutoWriteSettings({ enabled: true });

      const mockContextScore = {
        score: 0.4,
        signals: [
          { type: 'content_certainty' as const, value: 0.3, confidence: 0.5, weight: 0.3, reason: 'Unclear timing', source: 'context_engine' },
          { type: 'ambiguity' as const, value: 0.7, confidence: 0.8, weight: 0.2, reason: 'High ambiguity detected', source: 'context_engine' }
        ],
        because: ['Unclear timing information', 'High ambiguity detected'],
        metadata: { signalCount: 2, totalWeight: 0.5, deterministic: true, timestamp: Date.now() },
        confidence: 0.4,
        priority: 30,
        urgency: 0.3,
        domain: 'Calendar',
        reasoning: ['Unclear timing information', 'High ambiguity detected']
      };

      const mockPolicyDecision = {
        decision: 'suggest' as const,
        score: 0.4,
        baseThreshold: 'LOW',
        appliedOverrides: [],
        reason: 'Low confidence suggests user review',
        confidence: 0.4,
        contextScore: mockContextScore,
        timestamp: new Date()
      };

      mockContextEngineService.generateScore.mockResolvedValue(mockContextScore);
      mockPolicyDecisionEngine.makeDecision.mockResolvedValue(mockPolicyDecision);
      mockDecisionTraceService.addTrace.mockReturnValue('trace-789');

      // Mock bubble store
      const mockBubbleStore = {
        addBubble: vi.fn()
      };
      vi.mocked(require('@/stores/bubbleStore').useBubbleStore).getState.mockReturnValue(mockBubbleStore);

      // Act
      const result = await service.processCalendarIntent(mockIntent);

      // Assert
      expect(result.decision).toBe('suggest');
      expect(result.traceId).toBe('trace-789');
      expect(result.becauseText).toContain('Created suggestion because');
      expect(result.confidence).toBe(0.4);
      expect(mockBubbleStore.addBubble).toHaveBeenCalled();
    });
  });

  describe('undoCalendarWrite', () => {
    it('should successfully undo calendar write with compensation', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      const traceId = 'trace-123';
      
      // Set up undo registry manually for test
      service['undoRegistry'].set(traceId, {
        eventId: 'event-123',
        linkedReminders: ['reminder-1', 'reminder-2']
      });

      // Mock calendar account
      vi.mocked(require('@/integrations/supabase/client').supabase).from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'account-123' }]
              })
            })
          })
        })
      });

      // Mock successful delete
      vi.mocked(require('@/integrations/supabase/client').supabase).functions.invoke.mockResolvedValue({
        data: { success: true },
        error: null
      });

      // Mock bubble store for reminder compensation
      const mockBubbleStore = {
        reminders: [
          { id: 'reminder-1' },
          { id: 'reminder-2' }
        ],
        bubbles: [
          { id: 'bubble-1', reminderId: 'reminder-1', content: 'Original content' }
        ],
        updateReminder: vi.fn(),
        updateBubble: vi.fn()
      };
      vi.mocked(require('@/stores/bubbleStore').useBubbleStore).getState.mockReturnValue(mockBubbleStore);

      mockDecisionTraceService.markAsUndone.mockReturnValue(true);

      // Act
      const result = await service.undoCalendarWrite(traceId);

      // Assert
      expect(result).toBe(true);
      expect(mockDecisionTraceService.markAsUndone).toHaveBeenCalledWith(traceId, expect.any(String));
      expect(mockBubbleStore.updateReminder).toHaveBeenCalledTimes(2);
      expect(mockBubbleStore.updateBubble).toHaveBeenCalledWith({
        id: 'bubble-1',
        reminderId: 'reminder-1',
        content: 'Original content [Event cancelled - needs review]'
      });
    });

    it('should handle missing undo information gracefully', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      const traceId = 'nonexistent-trace';

      // Act
      const result = await service.undoCalendarWrite(traceId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('should detect and skip duplicate events', async () => {
      // Arrange
      const service = autoWriteCalendarService;
      service.updateAutoWriteSettings({ enabled: true });

      // Mock existing event
      vi.mocked(require('@/integrations/supabase/client').supabase).from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{
                  id: 'existing-event',
                  title: 'Team meeting',
                  start_time: mockIntent.startTime.toISOString()
                }]
              })
            })
          })
        })
      });

      const mockContextScore = {
        score: 0.9,
        signals: [],
        because: ['High confidence'],
        metadata: { signalCount: 1, totalWeight: 1, deterministic: true, timestamp: Date.now() },
        confidence: 0.9,
        priority: 85,
        urgency: 0.9,
        domain: 'Calendar',
        reasoning: ['High confidence']
      };

      const mockPolicyDecision = {
        decision: 'auto-write' as const,
        score: 0.9,
        baseThreshold: 'HIGH',
        appliedOverrides: [],
        reason: 'High confidence',
        confidence: 0.9,
        contextScore: mockContextScore,
        timestamp: new Date()
      };

      mockContextEngineService.generateScore.mockResolvedValue(mockContextScore);
      mockPolicyDecisionEngine.makeDecision.mockResolvedValue(mockPolicyDecision);
      mockDecisionTraceService.addTrace.mockReturnValue('trace-123');

      // Act
      const result = await service.processCalendarIntent(mockIntent);

      // Assert
      expect(result.decision).toBe('skip');
      expect(result.becauseText).toBe('Similar event already exists at this time');
    });
  });

  describe('threshold configuration', () => {
    it('should update and persist settings correctly', () => {
      // Arrange
      const service = autoWriteCalendarService;
      const newSettings = {
        enabled: true,
        autoWriteThreshold: 0.8,
        allowFirstTimeRecipients: true
      };

      // Act
      service.updateAutoWriteSettings(newSettings);

      // Assert
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'mm-auto-write-calendar-settings',
        expect.stringContaining('"enabled":true')
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'mm-auto-write-calendar-settings',
        expect.stringContaining('"autoWriteThreshold":0.8')
      );
    });

    it('should load default settings when none exist', () => {
      // Arrange
      const service = autoWriteCalendarService;
      
      // Act
      const settings = service['getAutoWriteSettings']();

      // Assert
      expect(settings.enabled).toBe(false);
      expect(settings.autoWriteThreshold).toBe(THRESHOLD_LEVELS.HIGH);
      expect(settings.draftThreshold).toBe(THRESHOLD_LEVELS.MEDIUM);
      expect(settings.quietHoursEnabled).toBe(true);
    });
  });
});