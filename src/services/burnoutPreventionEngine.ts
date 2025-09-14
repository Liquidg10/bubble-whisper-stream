/**
 * Phase 4B: Burnout Prevention Early Warning System
 * Monitors patterns and provides early intervention
 */

import { behavioralScienceEngine } from './behavioralScienceEngine';
import { moodBehaviorEngine } from './moodBehaviorEngine';
import { useBubbleStore } from '@/stores/bubbleStore';

interface BurnoutIndicator {
  type: 'completion_decline' | 'energy_crash' | 'mood_spiral' | 'overcommitment' | 'isolation';
  severity: number; // 0-1
  confidence: number; // 0-1
  timestamp: number;
  evidence: string[];
  trendDuration: number; // How long this pattern has been observed
}

interface BurnoutRisk {
  overall: number; // 0-1 risk level
  timeframe: 'immediate' | 'days' | 'weeks';
  primaryFactors: BurnoutIndicator[];
  recommendations: Recommendation[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

interface Recommendation {
  type: 'reduce_load' | 'energy_recovery' | 'mood_support' | 'social_connection' | 'professional_help';
  priority: number; // 1-5
  content: string;
  actionable: boolean;
  estimatedImpact: number; // 0-1
}

interface EnergyTrend {
  period: 'daily' | 'weekly' | 'monthly';
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  confidence: number;
  rate: number; // Rate of change
}

class BurnoutPreventionEngine {
  private indicators: BurnoutIndicator[] = [];
  private baselineMetrics: Map<string, number> = new Map();
  private lastAssessment: number = 0;
  private assessmentInterval = 2 * 60 * 60 * 1000; // 2 hours

  async assessBurnoutRisk(): Promise<BurnoutRisk> {
    const now = Date.now();
    if (now - this.lastAssessment < this.assessmentInterval) {
      return this.getLastAssessment();
    }

    await this.updateIndicators();
    const risk = this.calculateOverallRisk();
    
    this.lastAssessment = now;
    return risk;
  }

  async trackEnergyTrends(): Promise<EnergyTrend[]> {
    const windows = behavioralScienceEngine.getOptimalWindows(0.1); // Get all windows
    if (windows.length < 7) return []; // Need at least a week of data

    const trends: EnergyTrend[] = [];

    // Daily energy trend
    const dailyTrend = this.calculateEnergyTrend(windows, 'daily');
    if (dailyTrend) trends.push(dailyTrend);

    // Weekly energy trend
    const weeklyTrend = this.calculateEnergyTrend(windows, 'weekly');
    if (weeklyTrend) trends.push(weeklyTrend);

    return trends;
  }

  async getEarlyWarnings(): Promise<string[]> {
    const risk = await this.assessBurnoutRisk();
    const warnings: string[] = [];

    if (risk.overall > 0.3) {
      warnings.push('Energy levels showing concerning patterns');
    }

    if (risk.overall > 0.5) {
      warnings.push('Multiple burnout indicators detected');
    }

    if (risk.overall > 0.7) {
      warnings.push('High burnout risk - immediate intervention recommended');
    }

    const completionDecline = risk.primaryFactors.find(f => f.type === 'completion_decline');
    if (completionDecline && completionDecline.severity > 0.6) {
      warnings.push('Task completion rate significantly declining');
    }

    const moodSpiral = risk.primaryFactors.find(f => f.type === 'mood_spiral');
    if (moodSpiral && moodSpiral.severity > 0.7) {
      warnings.push('Persistent mood decline detected');
    }

    return warnings;
  }

  async shouldTriggerIntervention(): Promise<boolean> {
    const risk = await this.assessBurnoutRisk();
    return risk.urgency === 'high' || risk.urgency === 'critical';
  }

  async getPersonalizedRecommendations(): Promise<Recommendation[]> {
    const risk = await this.assessBurnoutRisk();
    const energyTrends = await this.trackEnergyTrends();
    
    const recommendations: Recommendation[] = [];

    // Based on primary risk factors
    for (const factor of risk.primaryFactors) {
      const recs = this.generateFactorRecommendations(factor);
      recommendations.push(...recs);
    }

    // Based on energy trends
    for (const trend of energyTrends) {
      const recs = this.generateTrendRecommendations(trend);
      recommendations.push(...recs);
    }

    // Sort by priority and estimated impact
    return recommendations
      .sort((a, b) => (b.priority * b.estimatedImpact) - (a.priority * a.estimatedImpact))
      .slice(0, 5); // Top 5 recommendations
  }

  setBaselineMetrics(): void {
    const currentStress = behavioralScienceEngine.detectStressLevel();
    const energyWindow = behavioralScienceEngine.getCurrentEnergyWindow();
    const bubbles = useBubbleStore.getState().bubbles;
    
    const completionRate = this.calculateRecentCompletionRate(bubbles);
    const moodRibbons = moodBehaviorEngine.generateTimelineRibbons(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      new Date()
    );
    const avgMood = moodRibbons.reduce((sum, r) => sum + r.mood, 0) / moodRibbons.length;

    this.baselineMetrics.set('stress', currentStress);
    this.baselineMetrics.set('energy', energyWindow?.energyLevel || 0.5);
    this.baselineMetrics.set('completion', completionRate);
    this.baselineMetrics.set('mood', avgMood || 0.5);

    console.log('🎯 Burnout prevention baseline set', Object.fromEntries(this.baselineMetrics));
  }

  private async updateIndicators(): Promise<void> {
    const newIndicators: BurnoutIndicator[] = [];

    // Check completion decline
    const completionIndicator = await this.assessCompletionDecline();
    if (completionIndicator) newIndicators.push(completionIndicator);

    // Check energy crash
    const energyIndicator = await this.assessEnergyLevels();
    if (energyIndicator) newIndicators.push(energyIndicator);

    // Check mood spiral
    const moodIndicator = await this.assessMoodTrend();
    if (moodIndicator) newIndicators.push(moodIndicator);

    // Check overcommitment
    const overcommitIndicator = await this.assessOvercommitment();
    if (overcommitIndicator) newIndicators.push(overcommitIndicator);

    // Update indicators list
    this.indicators.push(...newIndicators);
    
    // Keep only last 30 days
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    this.indicators = this.indicators.filter(i => i.timestamp > cutoff);
  }

  private async assessCompletionDecline(): Promise<BurnoutIndicator | null> {
    const bubbles = useBubbleStore.getState().bubbles;
    const currentRate = this.calculateRecentCompletionRate(bubbles);
    const baseline = this.baselineMetrics.get('completion') || 0.7;
    
    const decline = baseline - currentRate;
    if (decline < 0.15) return null; // Not significant enough

    return {
      type: 'completion_decline',
      severity: Math.min(1, decline / 0.5), // Normalize to 0-1
      confidence: 0.8,
      timestamp: Date.now(),
      evidence: [
        `Completion rate dropped from ${Math.round(baseline * 100)}% to ${Math.round(currentRate * 100)}%`,
        `${Math.round(decline * 100)}% decline observed`
      ],
      trendDuration: this.calculateTrendDuration('completion_decline')
    };
  }

  private async assessEnergyLevels(): Promise<BurnoutIndicator | null> {
    const currentWindow = behavioralScienceEngine.getCurrentEnergyWindow();
    if (!currentWindow) return null;

    const baseline = this.baselineMetrics.get('energy') || 0.5;
    const current = currentWindow.energyLevel;
    const decline = baseline - current;

    if (decline < 0.2) return null;

    return {
      type: 'energy_crash',
      severity: Math.min(1, decline / 0.4),
      confidence: 0.7,
      timestamp: Date.now(),
      evidence: [
        `Energy levels dropped ${Math.round(decline * 100)}%`,
        `Currently at ${Math.round(current * 100)}% of optimal`
      ],
      trendDuration: this.calculateTrendDuration('energy_crash')
    };
  }

  private async assessMoodTrend(): Promise<BurnoutIndicator | null> {
    const ribbons = moodBehaviorEngine.generateTimelineRibbons(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      new Date()
    );

    if (ribbons.length < 5) return null;

    const recentMood = ribbons.slice(-3).reduce((sum, r) => sum + r.mood, 0) / 3;
    const baseline = this.baselineMetrics.get('mood') || 0.5;
    const decline = baseline - recentMood;

    if (decline < 0.15) return null;

    return {
      type: 'mood_spiral',
      severity: Math.min(1, decline / 0.3),
      confidence: 0.75,
      timestamp: Date.now(),
      evidence: [
        `Mood declining for ${ribbons.length} days`,
        `Current mood ${Math.round(recentMood * 100)}% vs baseline ${Math.round(baseline * 100)}%`
      ],
      trendDuration: ribbons.length * 24 * 60 * 60 * 1000
    };
  }

  private async assessOvercommitment(): Promise<BurnoutIndicator | null> {
    const bubbles = useBubbleStore.getState().bubbles;
    const now = Date.now();
    const nextWeek = now + (7 * 24 * 60 * 60 * 1000);
    
    const upcomingTasks = bubbles.filter(b => 
      b.createdAt >= now && b.createdAt <= nextWeek && !b.completed
    );

    const dailyAverage = upcomingTasks.length / 7;
    if (dailyAverage < 6) return null; // Reasonable load

    return {
      type: 'overcommitment',
      severity: Math.min(1, (dailyAverage - 6) / 8), // Normalize excess above 6 tasks/day
      confidence: 0.9,
      timestamp: Date.now(),
      evidence: [
        `${upcomingTasks.length} tasks scheduled in next 7 days`,
        `${Math.round(dailyAverage)} average tasks per day`
      ],
      trendDuration: 7 * 24 * 60 * 60 * 1000
    };
  }

  private calculateOverallRisk(): BurnoutRisk {
    const recentIndicators = this.indicators.filter(i => 
      Date.now() - i.timestamp < 7 * 24 * 60 * 60 * 1000 // Last 7 days
    );

    if (recentIndicators.length === 0) {
      return {
        overall: 0.1,
        timeframe: 'weeks',
        primaryFactors: [],
        recommendations: [],
        urgency: 'low'
      };
    }

    const weightedRisk = recentIndicators.reduce((sum, indicator) => {
      return sum + (indicator.severity * indicator.confidence);
    }, 0) / recentIndicators.length;

    const urgency = this.calculateUrgency(weightedRisk, recentIndicators);
    const timeframe = this.calculateTimeframe(urgency, recentIndicators);

    return {
      overall: Math.min(1, weightedRisk),
      timeframe,
      primaryFactors: recentIndicators.sort((a, b) => b.severity - a.severity).slice(0, 3),
      recommendations: [], // Will be filled by getPersonalizedRecommendations
      urgency
    };
  }

  private calculateUrgency(risk: number, indicators: BurnoutIndicator[]): 'low' | 'medium' | 'high' | 'critical' {
    if (risk > 0.8) return 'critical';
    if (risk > 0.6) return 'high';
    if (risk > 0.4) return 'medium';
    return 'low';
  }

  private calculateTimeframe(urgency: string, indicators: BurnoutIndicator[]): 'immediate' | 'days' | 'weeks' {
    if (urgency === 'critical') return 'immediate';
    if (urgency === 'high') return 'days';
    return 'weeks';
  }

  private calculateRecentCompletionRate(bubbles: any[]): number {
    const recent = bubbles.filter(b => 
      Date.now() - b.createdAt < 7 * 24 * 60 * 60 * 1000 // Last 7 days
    );
    
    if (recent.length === 0) return 0.5;
    const completed = recent.filter(b => b.completed).length;
    return completed / recent.length;
  }

  private calculateTrendDuration(type: string): number {
    const similarIndicators = this.indicators.filter(i => i.type === type);
    if (similarIndicators.length === 0) return 0;

    const oldest = Math.min(...similarIndicators.map(i => i.timestamp));
    return Date.now() - oldest;
  }

  private calculateEnergyTrend(windows: any[], period: 'daily' | 'weekly'): EnergyTrend | null {
    if (windows.length < 5) return null;

    const sorted = windows.sort((a, b) => a.lastUpdated - b.lastUpdated);
    const energyLevels = sorted.map(w => w.energyLevel);
    
    // Simple linear regression to determine trend
    const n = energyLevels.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = energyLevels;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    let trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    if (Math.abs(slope) < 0.01) trend = 'stable';
    else if (slope > 0) trend = 'increasing';
    else trend = 'decreasing';
    
    // Check for volatility
    const variance = energyLevels.reduce((sum, val) => {
      const diff = val - (sumY / n);
      return sum + diff * diff;
    }, 0) / n;
    
    if (variance > 0.1) trend = 'volatile';

    return {
      period,
      trend,
      confidence: Math.min(1, n / 10), // Higher confidence with more data
      rate: slope
    };
  }

  private generateFactorRecommendations(factor: BurnoutIndicator): Recommendation[] {
    const recommendations: Recommendation[] = [];

    switch (factor.type) {
      case 'completion_decline':
        recommendations.push({
          type: 'reduce_load',
          priority: 4,
          content: 'Reduce task load by 25% for next week',
          actionable: true,
          estimatedImpact: 0.7
        });
        break;

      case 'energy_crash':
        recommendations.push({
          type: 'energy_recovery',
          priority: 5,
          content: 'Schedule 2-3 energy breaks daily',
          actionable: true,
          estimatedImpact: 0.8
        });
        break;

      case 'mood_spiral':
        recommendations.push({
          type: 'mood_support',
          priority: 4,
          content: 'Engage in 1 mood-boosting activity daily',
          actionable: true,
          estimatedImpact: 0.6
        });
        break;

      case 'overcommitment':
        recommendations.push({
          type: 'reduce_load',
          priority: 5,
          content: 'Postpone non-essential tasks',
          actionable: true,
          estimatedImpact: 0.9
        });
        break;
    }

    return recommendations;
  }

  private generateTrendRecommendations(trend: EnergyTrend): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (trend.trend === 'decreasing' && trend.confidence > 0.7) {
      recommendations.push({
        type: 'energy_recovery',
        priority: 3,
        content: 'Focus on energy restoration activities',
        actionable: true,
        estimatedImpact: 0.7
      });
    }

    if (trend.trend === 'volatile') {
      recommendations.push({
        type: 'reduce_load',
        priority: 3,
        content: 'Stabilize routine to reduce energy swings',
        actionable: true,
        estimatedImpact: 0.6
      });
    }

    return recommendations;
  }

  private getLastAssessment(): BurnoutRisk {
    // Return cached assessment - in real implementation this would be stored
    return {
      overall: 0.3,
      timeframe: 'days',
      primaryFactors: [],
      recommendations: [],
      urgency: 'medium'
    };
  }
}

export const burnoutPreventionEngine = new BurnoutPreventionEngine();
