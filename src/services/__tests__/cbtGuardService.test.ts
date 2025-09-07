import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cbtGuardService } from '../cbtGuardService';
import * as flagsModule from '@/config/flags';
import * as bubbleStore from '@/stores/bubbleStore';

// Mock the modules
vi.mock('@/config/flags');
vi.mock('@/stores/bubbleStore');

const mockIsFeatureEnabled = vi.mocked(flagsModule.isFeatureEnabled);
const mockUseBubbleStore = vi.mocked(bubbleStore.useBubbleStore);

describe('CBTGuardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isFeatureAllowed', () => {
    it('should return false when feature flag is disabled', () => {
      mockIsFeatureEnabled.mockReturnValue(false);
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { cbtSettings: { cbtAssistEnabled: true } }
      });

      expect(cbtGuardService.isFeatureAllowed('assist')).toBe(false);
    });

    it('should return false when global kill switch is disabled', () => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { cbtSettings: { cbtAssistEnabled: false } }
      });

      expect(cbtGuardService.isFeatureAllowed('assist')).toBe(false);
    });

    it('should return true when both flag and kill switch are enabled', () => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { cbtSettings: { cbtAssistEnabled: true } }
      });

      expect(cbtGuardService.isFeatureAllowed('assist')).toBe(true);
    });
  });

  describe('canIntervene', () => {
    const mockContext = {
      userId: 'test-user',
      messageContent: 'I feel overwhelmed',
      timestamp: Date.now()
    };

    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
    });

    it('should deny intervention when CBT assist is disabled', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { cbtSettings: { cbtAssistEnabled: false } }
      });

      const result = cbtGuardService.canIntervene(mockContext);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('CBT assistance disabled');
    });

    it('should deny intervention when assist level is off', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            assistLevel: 'off',
            quietHours: { enabled: false },
            topicExclusions: [],
            neverInterveneOn: []
          } 
        }
      });

      const result = cbtGuardService.canIntervene(mockContext);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('User has disabled assistance');
    });

    it('should deny intervention during quiet hours', () => {
      // Mock current time to be 23:00 (11 PM)
      const mockDate = new Date();
      mockDate.setHours(23, 0, 0, 0);
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            assistLevel: 'subtle',
            quietHours: { 
              enabled: true,
              start: '22:00',
              end: '08:00'
            },
            topicExclusions: [],
            neverInterveneOn: []
          } 
        }
      });

      const result = cbtGuardService.canIntervene(mockContext);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Quiet hours active');
    });

    it('should deny intervention for excluded topics', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            assistLevel: 'subtle',
            quietHours: { enabled: false },
            topicExclusions: ['work', 'family'],
            neverInterveneOn: []
          } 
        }
      });

      const contextWithWork = {
        ...mockContext,
        messageContent: 'I hate my work situation'
      };

      const result = cbtGuardService.canIntervene(contextWithWork);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Excluded topic detected');
    });

    it('should deny intervention for never intervene phrases', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            assistLevel: 'subtle',
            quietHours: { enabled: false },
            topicExclusions: [],
            neverInterveneOn: ['just venting', 'don\'t help']
          } 
        }
      });

      const contextWithVenting = {
        ...mockContext,
        messageContent: 'I\'m just venting about my day'
      };

      const result = cbtGuardService.canIntervene(contextWithVenting);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Never intervene phrase detected');
    });

    it('should allow intervention when all checks pass', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            assistLevel: 'subtle',
            quietHours: { enabled: false },
            topicExclusions: [],
            neverInterveneOn: []
          } 
        }
      });

      const result = cbtGuardService.canIntervene(mockContext);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('getDataScopePermissions', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
    });

    it('should return all false when feature is disabled', () => {
      mockIsFeatureEnabled.mockReturnValue(false);
      
      const permissions = cbtGuardService.getDataScopePermissions('user-123');
      expect(permissions).toEqual({
        surface: false,
        context: false,
        deep: false
      });
    });

    it('should respect surface privacy layer', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            privacyLayer: 'surface'
          } 
        }
      });

      const permissions = cbtGuardService.getDataScopePermissions('user-123');
      expect(permissions).toEqual({
        surface: true,
        context: false,
        deep: false
      });
    });

    it('should respect context privacy layer', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            privacyLayer: 'context'
          } 
        }
      });

      const permissions = cbtGuardService.getDataScopePermissions('user-123');
      expect(permissions).toEqual({
        surface: true,
        context: true,
        deep: false
      });
    });

    it('should respect deep privacy layer', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            privacyLayer: 'deep'
          } 
        }
      });

      const permissions = cbtGuardService.getDataScopePermissions('user-123');
      expect(permissions).toEqual({
        surface: true,
        context: true,
        deep: true
      });
    });
  });

  describe('canAutoLog', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
    });

    it('should return true for auto-on mode', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            autoLogMode: 'on'
          } 
        }
      });

      expect(cbtGuardService.canAutoLog()).toBe(true);
    });

    it('should return false for auto-off mode', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            autoLogMode: 'off'
          } 
        }
      });

      expect(cbtGuardService.canAutoLog()).toBe(false);
    });

    it('should return false for ask mode', () => {
      mockUseBubbleStore.getState = vi.fn().mockReturnValue({
        settings: { 
          cbtSettings: { 
            cbtAssistEnabled: true,
            autoLogMode: 'ask'
          } 
        }
      });

      expect(cbtGuardService.canAutoLog()).toBe(false);
    });
  });

  describe('generatePseudonymousId', () => {
    it('should generate consistent pseudonymous IDs', () => {
      const userId = 'user-123';
      const id1 = cbtGuardService.generatePseudonymousId(userId);
      const id2 = cbtGuardService.generatePseudonymousId(userId);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^cbt_[a-z0-9]{8}$/);
      expect(id1).not.toContain('user-123');
    });

    it('should generate different IDs for different users', () => {
      const id1 = cbtGuardService.generatePseudonymousId('user-123');
      const id2 = cbtGuardService.generatePseudonymousId('user-456');
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('filterForNetworkTransmission', () => {
    it('should remove PII from data', () => {
      const sensitiveData = {
        userId: 'user-123',
        email: 'test@example.com',
        phone: '555-123-4567',
        location: 'New York',
        messageContent: 'My email is john@example.com and my phone is 555-987-6543',
        safeData: 'This is fine'
      };

      const filtered = cbtGuardService.filterForNetworkTransmission(sensitiveData);
      
      expect(filtered.userId).toBeUndefined();
      expect(filtered.email).toBeUndefined();
      expect(filtered.phone).toBeUndefined();
      expect(filtered.location).toBeUndefined();
      expect(filtered.messageContent).not.toContain('john@example.com');
      expect(filtered.messageContent).not.toContain('555-987-6543');
      expect(filtered.messageContent).toContain('[EMAIL]');
      expect(filtered.messageContent).toContain('[PHONE]');
      expect(filtered.safeData).toBe('This is fine');
    });
  });

  describe('canProvideCrisisSupport', () => {
    it('should return true when crisis feature is enabled', () => {
      mockIsFeatureEnabled.mockImplementation((flag) => flag === 'cbtCrisisEnabled');
      
      expect(cbtGuardService.canProvideCrisisSupport()).toBe(true);
    });

    it('should return false when crisis feature is disabled', () => {
      mockIsFeatureEnabled.mockReturnValue(false);
      
      expect(cbtGuardService.canProvideCrisisSupport()).toBe(false);
    });
  });
});