/**
 * PROMPT 10: CBT A/B Testing Framework
 * Simple wording variations for chips with consistent user bucketing
 */

import type { DistortionType } from '@/ai/cbt/types';

export interface ABVariant {
  id: string;
  name: string;
  weight: number; // 0-1, should sum to 1 across variants
  active: boolean;
}

export interface ChipWording {
  label: string;
  actionText: string;
  becauseText: string;
  tone: 'encouraging' | 'neutral' | 'questioning';
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABVariant[];
  wordings: Record<string, ChipWording>; // variant.id -> wording
  active: boolean;
  startDate: string;
  endDate?: string;
}

export interface ABAssignment {
  userId: string;
  testId: string;
  variantId: string;
  assignedAt: number;
}

export interface ABMetrics {
  testId: string;
  variantId: string;
  impressions: number;
  acceptances: number;
  declines: number;
  acceptanceRate: number;
  avgLatency?: number;
}

class CBTABTestingService {
  private readonly STORAGE_KEY = 'cbt_ab_assignments';
  private readonly METRICS_KEY = 'cbt_ab_metrics';
  private readonly TESTS_KEY = 'cbt_ab_tests';

  // Default A/B test for chip wordings
  private defaultTest: ABTest = {
    id: 'chip_wording_v1',
    name: 'Chip Wording Variations',
    description: 'Testing different tones and phrasings for CBT suggestions',
    variants: [
      { id: 'encouraging', name: 'Encouraging', weight: 0.33, active: true },
      { id: 'neutral', name: 'Neutral', weight: 0.33, active: true },
      { id: 'questioning', name: 'Questioning', weight: 0.34, active: true }
    ],
    wordings: {
      encouraging: {
        label: 'Try this perspective',
        actionText: 'Consider this',
        becauseText: 'This could help reframe your thinking',
        tone: 'encouraging'
      },
      neutral: {
        label: 'Alternative view',
        actionText: 'Review this',
        becauseText: 'Here\'s another way to look at this',
        tone: 'neutral'
      },
      questioning: {
        label: 'What if...',
        actionText: 'Explore this',
        becauseText: 'What might happen if you considered this?',
        tone: 'questioning'
      }
    },
    active: true,
    startDate: new Date().toISOString().split('T')[0]
  };

  /**
   * Get user's variant assignment for a test
   */
  getUserVariant(userId: string, testId: string = 'chip_wording_v1'): string {
    // Check existing assignment
    const existing = this.getAssignment(userId, testId);
    if (existing) {
      return existing.variantId;
    }

    // Create new assignment
    const test = this.getTest(testId);
    if (!test || !test.active) {
      return test?.variants[0]?.id || 'encouraging';
    }

    const variantId = this.assignUserToVariant(userId, test);
    this.saveAssignment(userId, testId, variantId);
    
    return variantId;
  }

  /**
   * Get chip wording for user
   */
  getChipWording(userId: string, distortionType?: DistortionType): ChipWording {
    const variantId = this.getUserVariant(userId);
    const test = this.getTest('chip_wording_v1');
    
    if (test?.wordings[variantId]) {
      return test.wordings[variantId];
    }

    // Fallback to encouraging tone
    return this.defaultTest.wordings.encouraging;
  }

  /**
   * Record impression (chip shown)
   */
  recordImpression(userId: string, testId: string = 'chip_wording_v1'): void {
    const variantId = this.getUserVariant(userId, testId);
    this.updateMetrics(testId, variantId, 'impression');
  }

  /**
   * Record acceptance (user clicked helpful/accepted)
   */
  recordAcceptance(userId: string, testId: string = 'chip_wording_v1'): void {
    const variantId = this.getUserVariant(userId, testId);
    this.updateMetrics(testId, variantId, 'acceptance');
  }

  /**
   * Record decline (user clicked not helpful/declined)
   */
  recordDecline(userId: string, testId: string = 'chip_wording_v1'): void {
    const variantId = this.getUserVariant(userId, testId);
    this.updateMetrics(testId, variantId, 'decline');
  }

  /**
   * Get A/B test metrics
   */
  getTestMetrics(testId: string = 'chip_wording_v1'): ABMetrics[] {
    const test = this.getTest(testId);
    if (!test) return [];

    const allMetrics = this.getAllMetrics();
    
    return test.variants.map(variant => {
      const key = `${testId}_${variant.id}`;
      const metrics = allMetrics[key] || { impressions: 0, acceptances: 0, declines: 0 };
      
      return {
        testId,
        variantId: variant.id,
        impressions: metrics.impressions,
        acceptances: metrics.acceptances,
        declines: metrics.declines,
        acceptanceRate: metrics.impressions > 0 ? metrics.acceptances / metrics.impressions : 0
      };
    });
  }

  /**
   * Get comparative A/B results
   */
  getComparativeResults(testId: string = 'chip_wording_v1'): {
    winner?: string;
    confidence: 'low' | 'medium' | 'high';
    metrics: ABMetrics[];
    summary: string;
  } {
    const metrics = this.getTestMetrics(testId);
    
    if (metrics.length === 0) {
      return {
        confidence: 'low',
        metrics: [],
        summary: 'No data available'
      };
    }

    // Find variant with highest acceptance rate
    const sorted = [...metrics].sort((a, b) => b.acceptanceRate - a.acceptanceRate);
    const winner = sorted[0];
    const runnerUp = sorted[1];

    // Calculate confidence based on sample size and difference
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const rateDifference = winner && runnerUp ? winner.acceptanceRate - runnerUp.acceptanceRate : 0;
    
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (totalImpressions > 100 && rateDifference > 0.1) {
      confidence = 'high';
    } else if (totalImpressions > 50 && rateDifference > 0.05) {
      confidence = 'medium';
    }

    const summary = winner 
      ? `${winner.variantId} leading with ${(winner.acceptanceRate * 100).toFixed(1)}% acceptance rate`
      : 'Insufficient data for comparison';

    return {
      winner: winner?.variantId,
      confidence,
      metrics,
      summary
    };
  }

  /**
   * Create new A/B test
   */
  createTest(test: Omit<ABTest, 'id'>): string {
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullTest: ABTest = {
      ...test,
      id: testId
    };

    try {
      const tests = this.getAllTests();
      tests[testId] = fullTest;
      localStorage.setItem(this.TESTS_KEY, JSON.stringify(tests));
      console.log('[CBT A/B] Created test:', testId);
      return testId;
    } catch (error) {
      console.warn('[CBT A/B] Failed to create test:', error);
      return testId;
    }
  }

  /**
   * Export A/B test data as CSV
   */
  exportTestDataCSV(testId: string = 'chip_wording_v1'): string {
    const metrics = this.getTestMetrics(testId);
    const headers = ['variant_id', 'impressions', 'acceptances', 'declines', 'acceptance_rate'].join(',');
    
    const rows = metrics.map(m => [
      m.variantId,
      m.impressions,
      m.acceptances,
      m.declines,
      m.acceptanceRate.toFixed(4)
    ].join(','));

    return [headers, ...rows].join('\n');
  }

  /**
   * Clear A/B test data (for testing)
   */
  clearData(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.METRICS_KEY);
    } catch (error) {
      console.warn('[CBT A/B] Failed to clear data:', error);
    }
  }

  // Private methods

  private assignUserToVariant(userId: string, test: ABTest): string {
    // Deterministic assignment based on user ID hash
    const hash = this.hashString(userId + test.id);
    const normalizedHash = (hash % 10000) / 10000; // 0-1
    
    let cumulativeWeight = 0;
    for (const variant of test.variants) {
      if (!variant.active) continue;
      
      cumulativeWeight += variant.weight;
      if (normalizedHash <= cumulativeWeight) {
        return variant.id;
      }
    }
    
    // Fallback to first active variant
    return test.variants.find(v => v.active)?.id || test.variants[0]?.id || 'encouraging';
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getAssignment(userId: string, testId: string): ABAssignment | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const assignments: ABAssignment[] = JSON.parse(stored);
        return assignments.find(a => a.userId === userId && a.testId === testId) || null;
      }
    } catch (error) {
      console.warn('[CBT A/B] Failed to get assignment:', error);
    }
    return null;
  }

  private saveAssignment(userId: string, testId: string, variantId: string): void {
    try {
      const assignments = this.getAllAssignments();
      const assignment: ABAssignment = {
        userId,
        testId,
        variantId,
        assignedAt: Date.now()
      };

      // Remove existing assignment for this user/test
      const filtered = assignments.filter(a => !(a.userId === userId && a.testId === testId));
      filtered.push(assignment);

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.warn('[CBT A/B] Failed to save assignment:', error);
    }
  }

  private getAllAssignments(): ABAssignment[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const assignments = JSON.parse(stored);
        return Array.isArray(assignments) ? assignments : [];
      }
    } catch (error) {
      console.warn('[CBT A/B] Failed to load assignments:', error);
    }
    return [];
  }

  private updateMetrics(testId: string, variantId: string, event: 'impression' | 'acceptance' | 'decline'): void {
    try {
      const allMetrics = this.getAllMetrics();
      const key = `${testId}_${variantId}`;
      
      if (!allMetrics[key]) {
        allMetrics[key] = { impressions: 0, acceptances: 0, declines: 0 };
      }

      switch (event) {
        case 'impression':
          allMetrics[key].impressions++;
          break;
        case 'acceptance':
          allMetrics[key].acceptances++;
          break;
        case 'decline':
          allMetrics[key].declines++;
          break;
      }

      localStorage.setItem(this.METRICS_KEY, JSON.stringify(allMetrics));
    } catch (error) {
      console.warn('[CBT A/B] Failed to update metrics:', error);
    }
  }

  private getAllMetrics(): Record<string, { impressions: number; acceptances: number; declines: number }> {
    try {
      const stored = localStorage.getItem(this.METRICS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[CBT A/B] Failed to load metrics:', error);
    }
    return {};
  }

  private getTest(testId: string): ABTest | null {
    // Return default test for chip wording
    if (testId === 'chip_wording_v1') {
      return this.defaultTest;
    }

    try {
      const tests = this.getAllTests();
      return tests[testId] || null;
    } catch (error) {
      console.warn('[CBT A/B] Failed to get test:', error);
      return null;
    }
  }

  private getAllTests(): Record<string, ABTest> {
    try {
      const stored = localStorage.getItem(this.TESTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[CBT A/B] Failed to load tests:', error);
    }
    return {};
  }
}

export const cbtABTestingService = new CBTABTestingService();