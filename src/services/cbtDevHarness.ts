/**
 * CBT Development Harness
 * Utilities and mock data for CBT dev routes testing
 */

import type { CBTAnnotation } from '@/ai/cbt/types';
import { annotate } from '@/ai/cbt/observer';
import { decide } from '@/ai/cbt/policy';

export interface MockUserSettings {
  assistLevel: 'off' | 'subtle' | 'standard';
  quietHours: { start: number; end: number };
  topicExclusions: string[];
  cbtEnabled: boolean;
}

export interface MockFatigueState {
  dailyCount: number;
  lastInteraction: number;
  topicCooldowns: Record<string, number>;
  declineCountsByTopic: Record<string, number>;
  userThresholds: Record<string, number>;
}

export interface PolicyTestResult {
  annotation: CBTAnnotation | null;
  decision: any;
  reasoning: string[];
  timingMs: {
    annotation: number;
    decision: number;
    total: number;
  };
}

export class CBTDevHarness {
  private mockUserSettings: MockUserSettings = {
    assistLevel: 'standard',
    quietHours: { start: 22, end: 7 },
    topicExclusions: [],
    cbtEnabled: true
  };

  private mockFatigueState: MockFatigueState = {
    dailyCount: 0,
    lastInteraction: 0,
    topicCooldowns: {},
    declineCountsByTopic: {},
    userThresholds: {}
  };

  // Mock user settings management
  setMockUserSettings(settings: Partial<MockUserSettings>): void {
    this.mockUserSettings = { ...this.mockUserSettings, ...settings };
  }

  getMockUserSettings(): MockUserSettings {
    return { ...this.mockUserSettings };
  }

  // Mock fatigue state management
  setMockFatigueState(state: Partial<MockFatigueState>): void {
    this.mockFatigueState = { ...this.mockFatigueState, ...state };
  }

  getMockFatigueState(): MockFatigueState {
    return { ...this.mockFatigueState };
  }

  // Simulate policy decision with performance tracking
  async testPolicyDecision(
    message: string,
    options: {
      messageId?: string;
      timestamp?: number;
      conversationHistory?: any[];
      currentContext?: any;
    } = {}
  ): Promise<PolicyTestResult> {
    const messageId = options.messageId || `test_${Date.now()}`;
    const timestamp = options.timestamp || Date.now();
    const reasoning: string[] = [];

    // Track annotation timing
    const annotationStart = performance.now();
    const annotation = annotate(message, {
      messageId,
      timestamp,
      userSettings: this.mockUserSettings
    });
    const annotationTime = performance.now() - annotationStart;

    reasoning.push(`Annotation took ${annotationTime.toFixed(2)}ms`);
    
    if (!annotation) {
      reasoning.push('No annotation generated (below threshold or filtered out)');
      return {
        annotation: null,
        decision: { shouldShowCBT: false },
        reasoning,
        timingMs: {
          annotation: annotationTime,
          decision: 0,
          total: annotationTime
        }
      };
    }

    reasoning.push(`Found ${annotation.distortions.length} distortions, ${annotation.crisisFlags.length} crisis flags`);

    // Track decision timing
    const decisionStart = performance.now();
    const decision = decide(annotation, this.mockUserSettings, this.mockFatigueState);
    const decisionTime = performance.now() - decisionStart;

    reasoning.push(`Decision took ${decisionTime.toFixed(2)}ms`);

    // Add reasoning based on decision
    if (decision.shouldShowCBT) {
      reasoning.push(`Intervention recommended: ${decision.intervention || 'unknown'}`);
      if (decision.priority) {
        reasoning.push(`Priority level: ${decision.priority}`);
      }
    } else {
      reasoning.push('No intervention recommended');
      if (decision.reason) {
        reasoning.push(`Reason: ${decision.reason}`);
      }
    }

    return {
      annotation,
      decision,
      reasoning,
      timingMs: {
        annotation: annotationTime,
        decision: decisionTime,
        total: annotationTime + decisionTime
      }
    };
  }

  // Generate mock conversation history
  generateMockConversation(): Array<{ message: string; timestamp: number; type: 'user' | 'assistant' }> {
    const conversations = [
      { message: "How's your day going?", timestamp: Date.now() - 3600000, type: 'assistant' as const },
      { message: "It's been okay, just work stuff", timestamp: Date.now() - 3500000, type: 'user' as const },
      { message: "What kind of work stuff?", timestamp: Date.now() - 3400000, type: 'assistant' as const },
      { message: "Just the usual meetings and deadlines", timestamp: Date.now() - 3300000, type: 'user' as const },
      { message: "Sounds like a typical day", timestamp: Date.now() - 3200000, type: 'assistant' as const }
    ];

    return conversations;
  }

  // Simulate fatigue scenarios
  simulateFatigueScenario(scenario: 'fresh' | 'moderate' | 'high' | 'exhausted'): void {
    const now = Date.now();
    
    switch (scenario) {
      case 'fresh':
        this.setMockFatigueState({
          dailyCount: 0,
          lastInteraction: 0,
          topicCooldowns: {},
          declineCountsByTopic: {}
        });
        break;
      case 'moderate':
        this.setMockFatigueState({
          dailyCount: 3,
          lastInteraction: now - 1800000, // 30 minutes ago
          topicCooldowns: {
            'all_or_nothing': now - 900000 // 15 minutes ago
          },
          declineCountsByTopic: {
            'catastrophizing': 1
          }
        });
        break;
      case 'high':
        this.setMockFatigueState({
          dailyCount: 7,
          lastInteraction: now - 600000, // 10 minutes ago
          topicCooldowns: {
            'all_or_nothing': now - 300000, // 5 minutes ago
            'catastrophizing': now - 1200000 // 20 minutes ago
          },
          declineCountsByTopic: {
            'all_or_nothing': 2,
            'mind_reading': 1
          }
        });
        break;
      case 'exhausted':
        this.setMockFatigueState({
          dailyCount: 12,
          lastInteraction: now - 300000, // 5 minutes ago
          topicCooldowns: {
            'all_or_nothing': now - 60000, // 1 minute ago
            'catastrophizing': now - 180000, // 3 minutes ago
            'mind_reading': now - 120000 // 2 minutes ago
          },
          declineCountsByTopic: {
            'all_or_nothing': 4,
            'catastrophizing': 3,
            'mind_reading': 2,
            'should_statements': 1
          }
        });
        break;
    }
  }

  // Simulate quiet hours
  simulateQuietHours(isQuietTime: boolean): void {
    const now = new Date();
    if (isQuietTime) {
      // Set quiet hours to include current time
      this.setMockUserSettings({
        quietHours: { start: now.getHours() - 1, end: now.getHours() + 1 }
      });
    } else {
      // Set quiet hours to exclude current time
      this.setMockUserSettings({
        quietHours: { start: 22, end: 7 }
      });
    }
  }

  // Reset all mock state
  resetMockState(): void {
    this.mockUserSettings = {
      assistLevel: 'standard',
      quietHours: { start: 22, end: 7 },
      topicExclusions: [],
      cbtEnabled: true
    };

    this.mockFatigueState = {
      dailyCount: 0,
      lastInteraction: 0,
      topicCooldowns: {},
      declineCountsByTopic: {},
      userThresholds: {}
    };
  }

  // Performance testing
  async performanceTest(messages: string[], iterations: number = 10): Promise<{
    avgAnnotationTime: number;
    avgDecisionTime: number;
    avgTotalTime: number;
    maxTime: number;
    minTime: number;
    results: number[];
  }> {
    const times: number[] = [];
    let totalAnnotationTime = 0;
    let totalDecisionTime = 0;

    for (let i = 0; i < iterations; i++) {
      for (const message of messages) {
        const result = await this.testPolicyDecision(message, {
          messageId: `perf_test_${i}_${Date.now()}`
        });
        
        times.push(result.timingMs.total);
        totalAnnotationTime += result.timingMs.annotation;
        totalDecisionTime += result.timingMs.decision;
      }
    }

    return {
      avgAnnotationTime: totalAnnotationTime / (iterations * messages.length),
      avgDecisionTime: totalDecisionTime / (iterations * messages.length),
      avgTotalTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      maxTime: Math.max(...times),
      minTime: Math.min(...times),
      results: times
    };
  }

  // Crisis protocol testing
  simulateCrisisProtocol(severity: 'medium' | 'high' | 'critical'): any {
    return {
      triggered: true,
      severity,
      actions: [
        'Display crisis resources',
        'Log crisis event',
        severity === 'critical' ? 'Suggest emergency contacts' : 'Provide support resources',
        'Track for follow-up'
      ],
      resources: [
        { name: 'National Suicide Prevention Lifeline', number: '988' },
        { name: 'Crisis Text Line', number: 'Text HOME to 741741' },
        { name: 'Emergency Services', number: '911' }
      ]
    };
  }
}

export const cbtDevHarness = new CBTDevHarness();