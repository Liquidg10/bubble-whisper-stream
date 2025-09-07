/**
 * CBT Pilot Alerting Service - Monitor pilot performance and safety metrics
 * Local alerts for crisis false-negatives, decline spikes, and prompt overflow
 */

export interface PilotAlert {
  id: string;
  type: 'crisis_false_negative' | 'decline_spike' | 'prompt_overflow';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: number;
  data?: any;
  acknowledged?: boolean;
}

export interface PilotMetrics {
  date: string;
  crisisFalseNegatives: number;
  dailyDeclineRate: number;
  averagePromptsPerUser: number;
  totalUsers: number;
  totalPrompts: number;
  totalDeclines: number;
}

class CBTPilotAlerts {
  private readonly STORAGE_KEY = 'cbt_pilot_alerts';
  private readonly METRICS_KEY = 'cbt_pilot_metrics';
  private readonly MAX_ALERTS = 100;
  private readonly ALERT_THRESHOLDS = {
    CRISIS_FALSE_NEGATIVES: 0, // Any false negative triggers alert
    DECLINE_RATE_SPIKE: 0.20, // 20% decline rate
    PROMPTS_PER_USER_LIMIT: 2.0 // More than 2 prompts per user per day
  };

  /**
   * Record a crisis false negative
   */
  recordCrisisFalseNegative(details: { message: string; userId?: string; context?: any }): void {
    const alert: PilotAlert = {
      id: this.generateAlertId(),
      type: 'crisis_false_negative',
      severity: 'high',
      message: `Crisis false negative detected: ${details.message}`,
      timestamp: Date.now(),
      data: details
    };

    this.addAlert(alert);
    console.error('[CBT Pilot Alert] Crisis false negative:', details);
  }

  /**
   * Check and record decline rate spike
   */
  checkDeclineRateSpike(currentRate: number, previousRate: number): void {
    const rateIncrease = currentRate - previousRate;
    const isSpike = currentRate > this.ALERT_THRESHOLDS.DECLINE_RATE_SPIKE && rateIncrease > 0.05;

    if (isSpike) {
      const alert: PilotAlert = {
        id: this.generateAlertId(),
        type: 'decline_spike',
        severity: 'medium',
        message: `Decline rate spike detected: ${(currentRate * 100).toFixed(1)}% (was ${(previousRate * 100).toFixed(1)}%)`,
        timestamp: Date.now(),
        data: { currentRate, previousRate, increase: rateIncrease }
      };

      this.addAlert(alert);
      console.warn('[CBT Pilot Alert] Decline rate spike:', { currentRate, previousRate });
    }
  }

  /**
   * Check and record prompt overflow
   */
  checkPromptOverflow(promptsPerUser: number, totalUsers: number, totalPrompts: number): void {
    if (promptsPerUser > this.ALERT_THRESHOLDS.PROMPTS_PER_USER_LIMIT) {
      const alert: PilotAlert = {
        id: this.generateAlertId(),
        type: 'prompt_overflow',
        severity: 'medium',
        message: `Prompt overflow detected: ${promptsPerUser.toFixed(1)} prompts per user (limit: ${this.ALERT_THRESHOLDS.PROMPTS_PER_USER_LIMIT})`,
        timestamp: Date.now(),
        data: { promptsPerUser, totalUsers, totalPrompts }
      };

      this.addAlert(alert);
      console.warn('[CBT Pilot Alert] Prompt overflow:', { promptsPerUser, totalUsers, totalPrompts });
    }
  }

  /**
   * Record daily metrics
   */
  recordDailyMetrics(metrics: Omit<PilotMetrics, 'date'>): void {
    const today = new Date().toISOString().split('T')[0];
    const dailyMetrics: PilotMetrics = {
      date: today,
      ...metrics
    };

    const allMetrics = this.getMetrics();
    const existingIndex = allMetrics.findIndex(m => m.date === today);
    
    if (existingIndex >= 0) {
      allMetrics[existingIndex] = dailyMetrics;
    } else {
      allMetrics.push(dailyMetrics);
    }

    // Keep last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffString = cutoff.toISOString().split('T')[0];
    const filtered = allMetrics.filter(m => m.date >= cutoffString);

    this.saveMetrics(filtered);

    // Check for alerts
    if (allMetrics.length > 1) {
      const previousMetrics = allMetrics[allMetrics.length - 2];
      const previousDeclineRate = previousMetrics.totalPrompts > 0 ? 
        previousMetrics.totalDeclines / previousMetrics.totalPrompts : 0;
      const currentDeclineRate = metrics.totalPrompts > 0 ? 
        metrics.totalDeclines / metrics.totalPrompts : 0;
      
      this.checkDeclineRateSpike(currentDeclineRate, previousDeclineRate);
    }

    this.checkPromptOverflow(metrics.averagePromptsPerUser, metrics.totalUsers, metrics.totalPrompts);

    if (metrics.crisisFalseNegatives > 0) {
      this.recordCrisisFalseNegative({
        message: `${metrics.crisisFalseNegatives} crisis false negatives in daily metrics`
      });
    }
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): PilotAlert[] {
    return this.getAlerts().filter(alert => !alert.acknowledged);
  }

  /**
   * Get all alerts
   */
  getAlerts(): PilotAlert[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('[CBT Pilot Alerts] Failed to load alerts:', error);
      return [];
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alerts = this.getAlerts();
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.saveAlerts(alerts);
    }
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.saveAlerts([]);
  }

  /**
   * Get metrics history
   */
  getMetrics(): PilotMetrics[] {
    try {
      const stored = localStorage.getItem(this.METRICS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('[CBT Pilot Alerts] Failed to load metrics:', error);
      return [];
    }
  }

  /**
   * Export alerts and metrics as CSV
   */
  exportCSV(): string {
    const alerts = this.getAlerts();
    const metrics = this.getMetrics();

    const alertsCSV = [
      'Alert Type,Severity,Message,Timestamp,Acknowledged',
      ...alerts.map(alert => [
        alert.type,
        alert.severity,
        `\"${alert.message}\"`,
        new Date(alert.timestamp).toISOString(),
        alert.acknowledged ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const metricsCSV = [
      'Date,Crisis False Negatives,Decline Rate,Avg Prompts Per User,Total Users,Total Prompts,Total Declines',
      ...metrics.map(metric => [
        metric.date,
        metric.crisisFalseNegatives,
        (metric.totalPrompts > 0 ? metric.totalDeclines / metric.totalPrompts : 0).toFixed(3),
        metric.averagePromptsPerUser.toFixed(2),
        metric.totalUsers,
        metric.totalPrompts,
        metric.totalDeclines
      ].join(','))
    ].join('\n');

    return `=== CBT PILOT ALERTS ===\n${alertsCSV}\n\n=== CBT PILOT METRICS ===\n${metricsCSV}`;
  }

  /**
   * Get alert summary for dev panel
   */
  getAlertSummary(): {
    activeAlerts: number;
    highSeverityAlerts: number;
    lastAlert?: PilotAlert;
    alertTypes: Record<string, number>;
  } {
    const alerts = this.getActiveAlerts();
    const alertTypes = alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedAlerts = alerts.sort((a, b) => b.timestamp - a.timestamp);

    return {
      activeAlerts: alerts.length,
      highSeverityAlerts: alerts.filter(a => a.severity === 'high').length,
      lastAlert: sortedAlerts[0],
      alertTypes
    };
  }

  // Private methods

  private addAlert(alert: PilotAlert): void {
    const alerts = this.getAlerts();
    alerts.unshift(alert); // Add to beginning
    
    // Keep only max alerts
    if (alerts.length > this.MAX_ALERTS) {
      alerts.splice(this.MAX_ALERTS);
    }
    
    this.saveAlerts(alerts);
  }

  private saveAlerts(alerts: PilotAlert[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    } catch (error) {
      console.warn('[CBT Pilot Alerts] Failed to save alerts:', error);
    }
  }

  private saveMetrics(metrics: PilotMetrics[]): void {
    try {
      localStorage.setItem(this.METRICS_KEY, JSON.stringify(metrics));
    } catch (error) {
      console.warn('[CBT Pilot Alerts] Failed to save metrics:', error);
    }
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const cbtPilotAlerts = new CBTPilotAlerts();

// Export for testing
export { CBTPilotAlerts };
