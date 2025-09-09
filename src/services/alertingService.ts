/**
 * Alerting Service
 * Monitors metrics and triggers alerts when thresholds are exceeded
 */

import { metricsService, MetricType, MetricSummary } from './metricsService';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metricType: MetricType;
  condition: 'greater_than' | 'less_than' | 'equals' | 'spike' | 'trend';
  threshold: number;
  timeWindow: number; // milliseconds
  cooldown: number; // milliseconds between alerts
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  message: string;
  severity: AlertRule['severity'];
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
  acknowledged: boolean;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

export interface AlertingStats {
  totalAlerts: number;
  activeAlerts: number;
  alertsByServerity: Record<AlertRule['severity'], number>;
  avgTimeToAcknowledge: number;
  mostTriggeredRule: string;
}

class AlertingService {
  private rules: AlertRule[] = [];
  private alerts: Alert[] = [];
  private lastAlertTime: Map<string, number> = new Map();
  private checkInterval: number | null = null;

  constructor() {
    this.initializeDefaultRules();
    this.startMonitoring();
  }

  private initializeDefaultRules(): void {
    this.rules = [
      {
        id: 'undo_spike',
        name: 'Undo Spike Alert',
        description: 'Alert when undo rate spikes above normal',
        metricType: 'undo_rate',
        condition: 'spike',
        threshold: 5, // 5 undos in time window
        timeWindow: 60 * 60 * 1000, // 1 hour
        cooldown: 30 * 60 * 1000, // 30 minutes
        enabled: true,
        severity: 'high'
      },
      {
        id: 'channel_expiry',
        name: 'Channel Expiry Alert',
        description: 'Alert when watch channels are expiring',
        metricType: 'channel_expiry',
        condition: 'greater_than',
        threshold: 0, // Any channel expiry
        timeWindow: 60 * 60 * 1000, // 1 hour
        cooldown: 15 * 60 * 1000, // 15 minutes
        enabled: true,
        severity: 'medium'
      },
      {
        id: 'webhook_retry_high',
        name: 'High Webhook Retry Rate',
        description: 'Alert when webhook retries exceed threshold',
        metricType: 'webhook_retry',
        condition: 'greater_than',
        threshold: 3, // More than 3 retries
        timeWindow: 30 * 60 * 1000, // 30 minutes
        cooldown: 20 * 60 * 1000, // 20 minutes
        enabled: true,
        severity: 'high'
      },
      {
        id: 'channel_health_low',
        name: 'Low Channel Health',
        description: 'Alert when channel health score drops below threshold',
        metricType: 'watch_channel_health',
        condition: 'less_than',
        threshold: 0.8, // Below 80% health
        timeWindow: 60 * 60 * 1000, // 1 hour
        cooldown: 45 * 60 * 1000, // 45 minutes
        enabled: true,
        severity: 'medium'
      },
      {
        id: 'edit_distance_high',
        name: 'High Edit Distance',
        description: 'Alert when users heavily edit AI output',
        metricType: 'edit_distance',
        condition: 'greater_than',
        threshold: 0.7, // 70% of content changed
        timeWindow: 2 * 60 * 60 * 1000, // 2 hours
        cooldown: 60 * 60 * 1000, // 1 hour
        enabled: true,
        severity: 'low'
      },
      {
        id: 'auto_write_failure',
        name: 'Auto-write Failure Rate',
        description: 'Alert when auto-write success rate drops',
        metricType: 'auto_write_rate',
        condition: 'less_than',
        threshold: 0.5, // Below 50% success rate
        timeWindow: 60 * 60 * 1000, // 1 hour
        cooldown: 30 * 60 * 1000, // 30 minutes
        enabled: true,
        severity: 'critical'
      },
      {
        id: 'scope_decay_frequent',
        name: 'Frequent Scope Decay',
        description: 'Alert when OAuth scope decay happens frequently',
        metricType: 'scope_decay_action',
        condition: 'greater_than',
        threshold: 2, // More than 2 scope decay events
        timeWindow: 24 * 60 * 60 * 1000, // 24 hours
        cooldown: 6 * 60 * 60 * 1000, // 6 hours
        enabled: true,
        severity: 'medium'
      }
    ];
  }

  /**
   * Start monitoring metrics for alert conditions
   */
  private startMonitoring(): void {
    if (this.checkInterval) return;
    
    this.checkInterval = window.setInterval(() => {
      this.checkAlertRules();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check all alert rules and trigger alerts if conditions are met
   */
  private checkAlertRules(): void {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      const lastAlert = this.lastAlertTime.get(rule.id);
      if (lastAlert && Date.now() - lastAlert < rule.cooldown) continue;

      const shouldAlert = this.evaluateRule(rule);
      if (shouldAlert) {
        this.triggerAlert(rule, shouldAlert);
      }
    }
  }

  /**
   * Evaluate if a rule should trigger an alert
   */
  private evaluateRule(rule: AlertRule): { value: number; metadata?: Record<string, any> } | null {
    const summary = metricsService.getSummary(rule.metricType, rule.timeWindow);
    
    switch (rule.condition) {
      case 'greater_than':
        if (summary.count > 0 && summary.lastValue > rule.threshold) {
          return { value: summary.lastValue, metadata: { summary } };
        }
        break;
        
      case 'less_than':
        if (summary.count > 0 && summary.average < rule.threshold) {
          return { value: summary.average, metadata: { summary } };
        }
        break;
        
      case 'equals':
        if (summary.count > 0 && summary.lastValue === rule.threshold) {
          return { value: summary.lastValue, metadata: { summary } };
        }
        break;
        
      case 'spike':
        if (summary.count >= rule.threshold) {
          // Check if this is significantly higher than usual
          const longerSummary = metricsService.getSummary(rule.metricType, rule.timeWindow * 4);
          const baseline = longerSummary.count / 4; // Average per window
          if (summary.count > baseline * 2) { // 2x spike
            return { value: summary.count, metadata: { baseline, summary } };
          }
        }
        break;
        
      case 'trend':
        if (summary.trend === 'up' && summary.average > rule.threshold) {
          return { value: summary.average, metadata: { trend: summary.trend, summary } };
        }
        break;
    }
    
    return null;
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, result: { value: number; metadata?: Record<string, any> }): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      message: this.generateAlertMessage(rule, result.value),
      severity: rule.severity,
      timestamp: Date.now(),
      value: result.value,
      metadata: result.metadata,
      acknowledged: false
    };

    this.alerts.unshift(alert); // Add to beginning
    this.lastAlertTime.set(rule.id, Date.now());

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(0, 100);
    }

    // Emit the alert
    this.emitAlert(alert);
    
    console.warn(`[ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`, alert);
  }

  /**
   * Generate human-readable alert message
   */
  private generateAlertMessage(rule: AlertRule, value: number): string {
    const timeWindowStr = this.formatTimeWindow(rule.timeWindow);
    
    switch (rule.condition) {
      case 'greater_than':
        return `${rule.name}: Value ${value.toFixed(2)} exceeds threshold ${rule.threshold} in the last ${timeWindowStr}`;
      case 'less_than':
        return `${rule.name}: Average ${value.toFixed(2)} below threshold ${rule.threshold} in the last ${timeWindowStr}`;
      case 'spike':
        return `${rule.name}: Spike detected with ${value} events in the last ${timeWindowStr}`;
      case 'trend':
        return `${rule.name}: Upward trend detected with average ${value.toFixed(2)} in the last ${timeWindowStr}`;
      default:
        return `${rule.name}: Alert condition met with value ${value.toFixed(2)}`;
    }
  }

  /**
   * Format time window for human reading
   */
  private formatTimeWindow(milliseconds: number): string {
    const minutes = milliseconds / (60 * 1000);
    const hours = minutes / 60;
    const days = hours / 24;
    
    if (days >= 1) return `${Math.floor(days)} day${days >= 2 ? 's' : ''}`;
    if (hours >= 1) return `${Math.floor(hours)} hour${hours >= 2 ? 's' : ''}`;
    return `${Math.floor(minutes)} minute${minutes >= 2 ? 's' : ''}`;
  }

  /**
   * Emit alert to external systems
   */
  private emitAlert(alert: Alert): void {
    // Could send to Slack, email, push notifications, etc.
    // For now, just browser notification and console
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${alert.severity.toUpperCase()}: ${alert.ruleName}`, {
        body: alert.message,
        icon: '/favicon.ico'
      });
    }

    // Store to localStorage for persistence
    try {
      const stored = localStorage.getItem('bubble_alerts') || '[]';
      const alerts = JSON.parse(stored);
      alerts.unshift(alert);
      
      // Keep only last 50 alerts in storage
      if (alerts.length > 50) {
        alerts.splice(50);
      }
      
      localStorage.setItem('bubble_alerts', JSON.stringify(alerts));
    } catch (error) {
      console.warn('Failed to store alert:', error);
    }
  }

  /**
   * Get all alerts
   */
  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * Get active (unacknowledged) alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId?: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = userId;
    
    return true;
  }

  /**
   * Get alerting statistics
   */
  getStats(): AlertingStats {
    const totalAlerts = this.alerts.length;
    const activeAlerts = this.getActiveAlerts().length;
    
    const alertsByServerity = this.alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<AlertRule['severity'], number>);

    // Average time to acknowledge
    const acknowledgedAlerts = this.alerts.filter(a => a.acknowledged && a.acknowledgedAt);
    const avgTimeToAcknowledge = acknowledgedAlerts.length > 0
      ? acknowledgedAlerts.reduce((sum, alert) => sum + (alert.acknowledgedAt! - alert.timestamp), 0) / acknowledgedAlerts.length
      : 0;

    // Most triggered rule
    const ruleCounts = this.alerts.reduce((acc, alert) => {
      acc[alert.ruleId] = (acc[alert.ruleId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostTriggeredRule = Object.entries(ruleCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    return {
      totalAlerts,
      activeAlerts,
      alertsByServerity,
      avgTimeToAcknowledge,
      mostTriggeredRule
    };
  }

  /**
   * Add or update alert rule
   */
  updateRule(rule: AlertRule): void {
    const existingIndex = this.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return [...this.rules];
  }

  /**
   * Clear all alerts (for testing)
   */
  clearAlerts(): void {
    this.alerts = [];
    this.lastAlertTime.clear();
  }

  /**
   * Simulate alerts for testing
   */
  simulateAlert(ruleId: string): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return;

    this.triggerAlert(rule, { 
      value: rule.threshold + 1,
      metadata: { simulated: true }
    });
  }
}

export const alertingService = new AlertingService();
