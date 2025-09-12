/**
 * P14 Weekly Metrics Service - Track over-nudge reduction week-over-week
 * Provides analytics for cognitive load governor effectiveness
 */

import type { WeeklyMetrics, DomainBudget, BudgetAnalytics } from '@/types/cognitiveLoad';

interface WeeklySnapshot {
  weekStart: string;
  weekEnd: string;
  totalNudges: number;
  nudgesShown: number;
  nudgesBlocked: number;
  overNudgeIncidents: number;
  domainMetrics: Record<string, {
    totalNudges: number;
    shown: number;
    blocked: number;
    dismissed: number;
    accepted: number;
    cooldowns: number;
  }>;
  userEngagement: {
    acceptanceRate: number;
    dismissalRate: number;
    averageResponseTime: number;
  };
}

class WeeklyMetricsService {
  private weeklySnapshots: Map<string, WeeklySnapshot> = new Map();
  private currentWeekData: WeeklySnapshot | null = null;

  /**
   * Update metrics with new budget data
   */
  updateMetrics(budgets: DomainBudget[]): void {
    const weekKey = this.getCurrentWeekKey();
    let snapshot = this.weeklySnapshots.get(weekKey);
    
    if (!snapshot) {
      snapshot = this.createEmptySnapshot(weekKey);
      this.weeklySnapshots.set(weekKey, snapshot);
    }
    
    // Update snapshot with current budget data
    budgets.forEach(budget => {
      if (!snapshot!.domainMetrics[budget.domain]) {
        snapshot!.domainMetrics[budget.domain] = {
          totalNudges: 0,
          shown: 0,
          blocked: 0,
          dismissed: 0,
          accepted: 0,
          cooldowns: 0
        };
      }
      
      const domainMetric = snapshot!.domainMetrics[budget.domain];
      domainMetric.totalNudges = budget.used;
      domainMetric.shown = budget.used;
      domainMetric.dismissed = budget.dismissCount;
      domainMetric.accepted = budget.acceptCount;
      
      // Count as over-nudge if budget exceeded
      if (budget.remaining === 0) {
        snapshot!.overNudgeIncidents += budget.weeklyOverNudges;
      }
      
      // Count active cooldowns
      if (budget.cooldownUntil && budget.cooldownUntil > Date.now()) {
        domainMetric.cooldowns += 1;
      }
    });
    
    // Update totals
    snapshot.totalNudges = Object.values(snapshot.domainMetrics)
      .reduce((sum, metric) => sum + metric.totalNudges, 0);
    snapshot.nudgesShown = snapshot.totalNudges;
    
    // Calculate engagement rates
    const totalShown = snapshot.nudgesShown;
    const totalDismissed = Object.values(snapshot.domainMetrics)
      .reduce((sum, metric) => sum + metric.dismissed, 0);
    const totalAccepted = Object.values(snapshot.domainMetrics)
      .reduce((sum, metric) => sum + metric.accepted, 0);
    
    snapshot.userEngagement = {
      acceptanceRate: totalShown > 0 ? totalAccepted / totalShown : 0,
      dismissalRate: totalShown > 0 ? totalDismissed / totalShown : 0,
      averageResponseTime: 0 // TODO: Track response times
    };
    
    this.currentWeekData = snapshot;
    this.saveMetrics();
  }

  /**
   * Get weekly metrics for analytics
   */
  getWeeklyMetrics(): WeeklyMetrics {
    const currentWeek = this.currentWeekData;
    const previousWeek = this.getPreviousWeekData();
    
    if (!currentWeek) {
      return this.createEmptyWeeklyMetrics();
    }
    
    const metrics: WeeklyMetrics = {
      weekStart: currentWeek.weekStart,
      totalNudges: currentWeek.totalNudges,
      overNudgeIncidents: currentWeek.overNudgeIncidents,
      domainsOverBudget: Object.entries(currentWeek.domainMetrics)
        .filter(([_, metric]) => metric.totalNudges > 0 && metric.blocked > 0)
        .map(([domain, _]) => domain),
      avgAcceptanceRate: currentWeek.userEngagement.acceptanceRate,
      avgDismissalRate: currentWeek.userEngagement.dismissalRate,
      fatigueReports: this.getFatigueReportCount(),
      cooldownExtensions: this.getCooldownExtensionCount(),
      recapConversions: this.getRecapConversionCount(),
      userSatisfactionScore: this.calculateSatisfactionScore(currentWeek)
    };
    
    return metrics;
  }

  /**
   * Get week-over-week comparison
   */
  getWeekOverWeekComparison(): {
    current: WeeklyMetrics;
    previous: WeeklyMetrics;
    changes: {
      overNudgeReduction: number;
      acceptanceRateChange: number;
      cooldownReduction: number;
    };
  } {
    const current = this.getWeeklyMetrics();
    const previous = this.getPreviousWeekMetrics();
    
    const changes = {
      overNudgeReduction: previous.overNudgeIncidents > 0 
        ? ((previous.overNudgeIncidents - current.overNudgeIncidents) / previous.overNudgeIncidents) * 100
        : 0,
      acceptanceRateChange: (current.avgAcceptanceRate - previous.avgAcceptanceRate) * 100,
      cooldownReduction: previous.cooldownExtensions > 0
        ? ((previous.cooldownExtensions - current.cooldownExtensions) / previous.cooldownExtensions) * 100
        : 0
    };
    
    return { current, previous, changes };
  }

  /**
   * Get budget analytics for specific domain
   */
  getBudgetAnalytics(domain: string, period: 'daily' | 'weekly' | 'monthly'): BudgetAnalytics {
    const snapshots = this.getSnapshotsForPeriod(period);
    const domainData = snapshots.map(snapshot => snapshot.domainMetrics[domain]).filter(Boolean);
    
    if (domainData.length === 0) {
      return this.createEmptyBudgetAnalytics(domain, period);
    }
    
    const totalNudges = domainData.reduce((sum, data) => sum + data.totalNudges, 0);
    const totalShown = domainData.reduce((sum, data) => sum + data.shown, 0);
    const totalAccepted = domainData.reduce((sum, data) => sum + data.accepted, 0);
    const totalDismissed = domainData.reduce((sum, data) => sum + data.dismissed, 0);
    const totalCooldowns = domainData.reduce((sum, data) => sum + data.cooldowns, 0);
    
    return {
      domain,
      period,
      budgetUtilization: totalNudges / (domainData.length * 10), // Assume 10 as max budget
      acceptanceRate: totalShown > 0 ? totalAccepted / totalShown : 0,
      dismissalRate: totalShown > 0 ? totalDismissed / totalShown : 0,
      cooldownFrequency: totalCooldowns / domainData.length,
      recapConversions: this.getRecapConversionsForDomain(domain, period),
      userSatisfaction: this.calculateDomainSatisfaction(domainData),
      optimalBudgetSuggestion: this.suggestOptimalBudget(domainData)
    };
  }

  /**
   * Get trending data for dashboard
   */
  getTrendingData(): {
    overNudgeTrend: Array<{ week: string; incidents: number }>;
    acceptanceTrend: Array<{ week: string; rate: number }>;
    cooldownTrend: Array<{ week: string; count: number }>;
  } {
    const recentWeeks = this.getRecentWeeks(8); // Last 8 weeks
    
    return {
      overNudgeTrend: recentWeeks.map(snapshot => ({
        week: this.formatWeekForDisplay(snapshot.weekStart),
        incidents: snapshot.overNudgeIncidents
      })),
      acceptanceTrend: recentWeeks.map(snapshot => ({
        week: this.formatWeekForDisplay(snapshot.weekStart),
        rate: snapshot.userEngagement.acceptanceRate * 100
      })),
      cooldownTrend: recentWeeks.map(snapshot => ({
        week: this.formatWeekForDisplay(snapshot.weekStart),
        count: Object.values(snapshot.domainMetrics).reduce((sum, m) => sum + m.cooldowns, 0)
      }))
    };
  }

  /**
   * Record blocked nudge for metrics
   */
  recordBlockedNudge(domain: string, reason: string): void {
    const weekKey = this.getCurrentWeekKey();
    let snapshot = this.weeklySnapshots.get(weekKey);
    
    if (!snapshot) {
      snapshot = this.createEmptySnapshot(weekKey);
      this.weeklySnapshots.set(weekKey, snapshot);
    }
    
    if (!snapshot.domainMetrics[domain]) {
      snapshot.domainMetrics[domain] = {
        totalNudges: 0,
        shown: 0,
        blocked: 0,
        dismissed: 0,
        accepted: 0,
        cooldowns: 0
      };
    }
    
    snapshot.domainMetrics[domain].blocked += 1;
    snapshot.nudgesBlocked += 1;
    
    // Count as over-nudge incident if blocked due to budget
    if (reason === 'budget_exceeded') {
      snapshot.overNudgeIncidents += 1;
    }
    
    this.saveMetrics();
  }

  /**
   * Create empty snapshot for new week
   */
  private createEmptySnapshot(weekKey: string): WeeklySnapshot {
    const weekStart = new Date(weekKey);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalNudges: 0,
      nudgesShown: 0,
      nudgesBlocked: 0,
      overNudgeIncidents: 0,
      domainMetrics: {},
      userEngagement: {
        acceptanceRate: 0,
        dismissalRate: 0,
        averageResponseTime: 0
      }
    };
  }

  /**
   * Get current week key (Monday start)
   */
  private getCurrentWeekKey(): string {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0];
  }

  /**
   * Get previous week data
   */
  private getPreviousWeekData(): WeeklySnapshot | null {
    const currentWeek = new Date(this.getCurrentWeekKey());
    const previousWeek = new Date(currentWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);
    const previousWeekKey = previousWeek.toISOString().split('T')[0];
    
    return this.weeklySnapshots.get(previousWeekKey) || null;
  }

  /**
   * Get previous week metrics
   */
  private getPreviousWeekMetrics(): WeeklyMetrics {
    const previousWeek = this.getPreviousWeekData();
    if (!previousWeek) {
      return this.createEmptyWeeklyMetrics();
    }
    
    return {
      weekStart: previousWeek.weekStart,
      totalNudges: previousWeek.totalNudges,
      overNudgeIncidents: previousWeek.overNudgeIncidents,
      domainsOverBudget: Object.keys(previousWeek.domainMetrics),
      avgAcceptanceRate: previousWeek.userEngagement.acceptanceRate,
      avgDismissalRate: previousWeek.userEngagement.dismissalRate,
      fatigueReports: 0, // Historical data not available
      cooldownExtensions: 0, // Historical data not available  
      recapConversions: 0, // Historical data not available
      userSatisfactionScore: this.calculateSatisfactionScore(previousWeek)
    };
  }

  /**
   * Create empty weekly metrics
   */
  private createEmptyWeeklyMetrics(): WeeklyMetrics {
    return {
      weekStart: new Date().toISOString(),
      totalNudges: 0,
      overNudgeIncidents: 0,
      domainsOverBudget: [],
      avgAcceptanceRate: 0,
      avgDismissalRate: 0,
      fatigueReports: 0,
      cooldownExtensions: 0,
      recapConversions: 0
    };
  }

  /**
   * Calculate user satisfaction score (0-100)
   */
  private calculateSatisfactionScore(snapshot: WeeklySnapshot): number {
    const acceptance = snapshot.userEngagement.acceptanceRate;
    const dismissal = snapshot.userEngagement.dismissalRate;
    const overNudgeRatio = snapshot.totalNudges > 0 ? snapshot.overNudgeIncidents / snapshot.totalNudges : 0;
    
    // Higher acceptance and lower dismissal/over-nudging = higher satisfaction
    const score = (acceptance * 60) + ((1 - dismissal) * 25) + ((1 - overNudgeRatio) * 15);
    return Math.round(Math.max(0, Math.min(100, score * 100)));
  }

  /**
   * Get fatigue report count for current week
   */
  private getFatigueReportCount(): number {
    try {
      const stored = localStorage.getItem('cognitiveLoadFatigueReports');
      if (!stored) return 0;
      
      const reports = JSON.parse(stored);
      const weekStart = new Date(this.getCurrentWeekKey()).getTime();
      const weekEnd = weekStart + (7 * 24 * 60 * 60 * 1000);
      
      return reports.filter((report: any) => 
        report.timestamp >= weekStart && report.timestamp < weekEnd
      ).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get cooldown extension count for current week
   */
  private getCooldownExtensionCount(): number {
    try {
      const stored = localStorage.getItem('cognitiveLoadExtensionCounts');
      if (!stored) return 0;
      
      const counts = JSON.parse(stored);
      return Object.values(counts).reduce((sum: number, count: unknown) => sum + Number(count), 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get recap conversion count for current week
   */
  private getRecapConversionCount(): number {
    try {
      const stored = localStorage.getItem('cognitiveLoadRecapDeliveries');
      if (!stored) return 0;
      
      const deliveries = JSON.parse(stored);
      const weekStart = new Date(this.getCurrentWeekKey()).getTime();
      const weekEnd = weekStart + (7 * 24 * 60 * 60 * 1000);
      
      return deliveries.filter((delivery: any) => 
        delivery.deliveredAt >= weekStart && delivery.deliveredAt < weekEnd
      ).length;
    } catch {
      return 0;
    }
  }

  // Additional helper methods...
  private getSnapshotsForPeriod(period: 'daily' | 'weekly' | 'monthly'): WeeklySnapshot[] {
    // Implementation for getting snapshots based on period
    return Array.from(this.weeklySnapshots.values()).slice(-4); // Last 4 snapshots as example
  }

  private createEmptyBudgetAnalytics(domain: string, period: 'daily' | 'weekly' | 'monthly'): BudgetAnalytics {
    return {
      domain,
      period,
      budgetUtilization: 0,
      acceptanceRate: 0,
      dismissalRate: 0,
      cooldownFrequency: 0,
      recapConversions: 0,
      userSatisfaction: 0
    };
  }

  private getRecapConversionsForDomain(domain: string, period: 'daily' | 'weekly' | 'monthly'): number {
    // Implementation for domain-specific recap conversions
    return 0;
  }

  private calculateDomainSatisfaction(domainData: any[]): number {
    // Implementation for calculating domain-specific satisfaction
    return 75; // Placeholder
  }

  private suggestOptimalBudget(domainData: any[]): number {
    // Implementation for budget optimization suggestions
    return 5; // Placeholder
  }

  private getRecentWeeks(count: number): WeeklySnapshot[] {
    return Array.from(this.weeklySnapshots.values()).slice(-count);
  }

  private formatWeekForDisplay(weekStart: string): string {
    return new Date(weekStart).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }

  /**
   * Save metrics to localStorage
   */
  private saveMetrics(): void {
    try {
      const data = Object.fromEntries(this.weeklySnapshots);
      localStorage.setItem('cognitiveLoadWeeklyMetrics', JSON.stringify(data));
    } catch (error) {
      console.error('[Weekly Metrics] Failed to save metrics:', error);
    }
  }

  /**
   * Load metrics from localStorage
   */
  private loadMetrics(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadWeeklyMetrics');
      if (stored) {
        const data = JSON.parse(stored);
        this.weeklySnapshots = new Map(Object.entries(data));
        
        // Set current week data if available
        const currentWeekKey = this.getCurrentWeekKey();
        this.currentWeekData = this.weeklySnapshots.get(currentWeekKey) || null;
      }
    } catch (error) {
      console.error('[Weekly Metrics] Failed to load metrics:', error);
    }
  }

  /**
   * Initialize service
   */
  initialize(): void {
    this.loadMetrics();
  }
}

export const weeklyMetricsService = new WeeklyMetricsService();

// Initialize on module load
weeklyMetricsService.initialize();