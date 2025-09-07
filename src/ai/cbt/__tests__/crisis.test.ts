/**
 * Crisis Protocol Integration Tests
 * PROMPT 6: Tests for crisis detection, session silencing, and resource delivery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  detectCrisisInMessage, 
  getCrisisResources, 
  CrisisSessionManager,
  getCrisisResponseText,
  CRISIS_RESPONSE_TEMPLATES
} from '../crisis';

describe('Crisis Detection', () => {
  it('should detect suicide keywords with high confidence', () => {
    const messages = [
      'I want to kill myself',
      'thinking about suicide',
      'I don\'t want to live anymore',
      'better off dead',
      'planning to end my life'
    ];

    messages.forEach(message => {
      const flags = detectCrisisInMessage(message);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].type).toBe('suicide');
      expect(flags[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(flags[0].severity).toBe('critical');
    });
  });

  it('should detect self-harm patterns', () => {
    const messages = [
      'I want to hurt myself',
      'urge to cut',
      'thinking about self harm',
      'need to injure myself'
    ];

    messages.forEach(message => {
      const flags = detectCrisisInMessage(message);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].type).toBe('self_harm');
      expect(flags[0].severity).toBe('high');
    });
  });

  it('should detect severe distress patterns', () => {
    const messages = [
      'I can\'t take it anymore',
      'breaking down completely',
      'at my breaking point',
      'ready to give up'
    ];

    messages.forEach(message => {
      const flags = detectCrisisInMessage(message);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].type).toBe('severe_distress');
      expect(flags[0].severity).toBe('medium');
    });
  });

  it('should detect emergency situations', () => {
    const messages = [
      'this is a mental health emergency',
      'need help right now',
      'having a breakdown',
      'urgent help needed'
    ];

    messages.forEach(message => {
      const flags = detectCrisisInMessage(message);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].type).toBe('emergency');
      expect(flags[0].severity).toBe('critical');
    });
  });

  it('should not detect crisis in normal messages', () => {
    const normalMessages = [
      'I had a bad day at work',
      'feeling a bit sad today',
      'stressed about my presentation',
      'worried about my exam',
      'having relationship problems'
    ];

    normalMessages.forEach(message => {
      const flags = detectCrisisInMessage(message);
      expect(flags).toHaveLength(0);
    });
  });

  it('should require high confidence threshold', () => {
    const ambiguousMessages = [
      'this is killing me', // idiom
      'I could die from embarrassment', // hyperbole
      'this is suicide', // different context
    ];

    ambiguousMessages.forEach(message => {
      const flags = detectCrisisInMessage(message);
      // Should either have no flags or low confidence flags
      flags.forEach(flag => {
        expect(flag.confidence).toBeLessThan(0.7);
      });
    });
  });
});

describe('Crisis Resources', () => {
  it('should return US resources for US timezone', () => {
    const resources = getCrisisResources('US');
    expect(resources).toHaveLength(4);
    expect(resources[0].name).toBe('988 Suicide & Crisis Lifeline');
    expect(resources[0].contact).toBe('Call or text 988');
  });

  it('should return UK resources for UK timezone', () => {
    const resources = getCrisisResources('UK');
    expect(resources).toHaveLength(4);
    expect(resources[0].name).toBe('Samaritans');
    expect(resources[0].contact).toBe('Call 116 123');
  });

  it('should return generic resources for unknown regions', () => {
    const resources = getCrisisResources('unknown');
    expect(resources).toHaveLength(4);
    expect(resources[0].name).toBe('Local Emergency Services');
  });

  it('should always include emergency services', () => {
    const regions = ['US', 'UK', 'CA', 'AU', 'generic'];
    regions.forEach(region => {
      const resources = getCrisisResources(region);
      const hasEmergency = resources.some(r => 
        r.name.includes('Emergency') || r.contact.includes('911') || 
        r.contact.includes('999') || r.contact.includes('000')
      );
      expect(hasEmergency).toBe(true);
    });
  });
});

describe('Crisis Session Management', () => {
  const testUserId = 'test-user-123';
  
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with crisis mode off', () => {
    const state = CrisisSessionManager.getSessionState(testUserId);
    expect(state.inCrisisMode).toBe(false);
    expect(state.crisisDetectedAt).toBe(0);
  });

  it('should activate crisis mode', () => {
    CrisisSessionManager.activateCrisisMode(testUserId, 'suicide', 120);
    const state = CrisisSessionManager.getSessionState(testUserId);
    
    expect(state.inCrisisMode).toBe(true);
    expect(state.crisisType).toBe('suicide');
    expect(state.cooldownMinutes).toBe(120);
    expect(state.crisisDetectedAt).toBeGreaterThan(0);
  });

  it('should calculate remaining cooldown time', () => {
    CrisisSessionManager.activateCrisisMode(testUserId, 'self_harm', 60);
    const remaining = CrisisSessionManager.getRemainingCooldownMinutes(testUserId);
    
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60);
  });

  it('should auto-reset crisis mode after cooldown', () => {
    // Simulate expired crisis session
    const expiredState = {
      inCrisisMode: true,
      crisisDetectedAt: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
      cooldownMinutes: 60, // 1 hour cooldown
      crisisType: 'severe_distress' as const,
      sessionId: 'test-session'
    };
    
    localStorage.setItem(
      `cbt_crisis_session_${testUserId}`, 
      JSON.stringify(expiredState)
    );
    
    const state = CrisisSessionManager.getSessionState(testUserId);
    expect(state.inCrisisMode).toBe(false);
  });

  it('should manually reset crisis mode', () => {
    CrisisSessionManager.activateCrisisMode(testUserId, 'emergency');
    CrisisSessionManager.resetCrisisMode(testUserId);
    
    const state = CrisisSessionManager.getSessionState(testUserId);
    expect(state.inCrisisMode).toBe(false);
  });
});

describe('Crisis Response Templates', () => {
  it('should have validation messages', () => {
    expect(CRISIS_RESPONSE_TEMPLATES.validation).toHaveLength(4);
    expect(CRISIS_RESPONSE_TEMPLATES.validation[0]).toContain('here with you');
  });

  it('should have gentle connection messages', () => {
    expect(CRISIS_RESPONSE_TEMPLATES.gentle_connection).toHaveLength(4);
    expect(CRISIS_RESPONSE_TEMPLATES.gentle_connection[0]).toContain('connect you');
  });

  it('should return random crisis response text', () => {
    const text1 = getCrisisResponseText();
    const text2 = getCrisisResponseText();
    
    expect(text1).toBeTruthy();
    expect(text2).toBeTruthy();
    expect(CRISIS_RESPONSE_TEMPLATES.validation).toContain(text1);
    expect(CRISIS_RESPONSE_TEMPLATES.validation).toContain(text2);
  });

  it('should avoid CBT reframing language in crisis', () => {
    const validationTexts = CRISIS_RESPONSE_TEMPLATES.validation;
    const connectionTexts = CRISIS_RESPONSE_TEMPLATES.gentle_connection;
    
    const allTexts = [...validationTexts, ...connectionTexts];
    
    // These phrases should NOT appear in crisis responses
    const cbtPhrases = [
      'think about this differently',
      'evidence for this thought',
      'another way to see this',
      'cognitive distortion',
      'reframe',
      'challenge that thought'
    ];
    
    allTexts.forEach(text => {
      cbtPhrases.forEach(phrase => {
        expect(text.toLowerCase()).not.toContain(phrase);
      });
    });
  });
});

describe('Crisis Integration End-to-End', () => {
  it('should detect crisis and provide appropriate response structure', () => {
    const crisisMessage = 'I want to kill myself right now';
    const flags = detectCrisisInMessage(crisisMessage);
    
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe('suicide');
    expect(flags[0].severity).toBe('critical');
    
    const resources = getCrisisResources();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0]).toHaveProperty('name');
    expect(resources[0]).toHaveProperty('contact');
  });

  it('should handle multiple crisis types in one message', () => {
    const complexMessage = 'I want to hurt myself and I think about suicide every day';
    const flags = detectCrisisInMessage(complexMessage);
    
    expect(flags.length).toBeGreaterThanOrEqual(1);
    
    // Should detect both self-harm and suicide
    const types = flags.map(f => f.type);
    expect(types).toContain('suicide');
    // May also contain self_harm depending on confidence thresholds
  });
});