import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Activity,
  Bell,
  BellOff,
  Eye,
  BarChart3
} from 'lucide-react';
import { metricsService, KPIData, MetricSummary, MetricType } from '@/services/metricsService';
import { alertingService, Alert as AlertData, AlertingStats } from '@/services/alertingService';

interface MetricsDashboardProps {
  className?: string;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ className }) => {
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [alertStats, setAlertStats] = useState<AlertingStats | null>(null);
  const [metricSummaries, setMetricSummaries] = useState<Map<MetricType, MetricSummary>>(new Map());
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(24 * 60 * 60 * 1000); // 24 hours
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    refreshData();
    
    if (autoRefresh) {
      const interval = setInterval(refreshData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [selectedTimeWindow, autoRefresh]);

  const refreshData = () => {
    setKpis(metricsService.getKPIs(selectedTimeWindow));
    setAlerts(alertingService.getAlerts());
    setAlertStats(alertingService.getStats());
    
    // Get summaries for all metric types
    const metricTypes: MetricType[] = [
      'auto_write_rate',
      'downgrade_rate',
      'undo_rate', 
      'edit_distance',
      'watch_channel_health',
      'webhook_error',
      'scope_decay_action'
    ];
    
    const summaries = new Map<MetricType, MetricSummary>();
    metricTypes.forEach(type => {
      summaries.set(type, metricsService.getSummary(type, selectedTimeWindow));
    });
    setMetricSummaries(summaries);
  };

  const acknowledgeAlert = (alertId: string) => {
    alertingService.acknowledgeAlert(alertId, 'current_user');
    refreshData();
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTimeWindow = (ms: number) => {
    const hours = ms / (60 * 60 * 1000);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num === 0) return '0';
    if (num < 0.01) return '<0.01';
    return num.toFixed(decimals);
  };

  const activeAlerts = alerts.filter(alert => !alert.acknowledged);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            System Metrics Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time KPIs, alerts, and system health monitoring
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={selectedTimeWindow}
            onChange={(e) => setSelectedTimeWindow(Number(e.target.value))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value={60 * 60 * 1000}>1 Hour</option>
            <option value={6 * 60 * 60 * 1000}>6 Hours</option>
            <option value={24 * 60 * 60 * 1000}>24 Hours</option>
            <option value={7 * 24 * 60 * 60 * 1000}>7 Days</option>
          </select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>
          
          <Button variant="outline" size="sm" onClick={refreshData}>
            <Activity className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {activeAlerts.length} active alert{activeAlerts.length > 1 ? 's' : ''} requiring attention
              </span>
              <Button variant="outline" size="sm" onClick={() => document.getElementById('alerts-section')?.scrollIntoView()}>
                View Alerts
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Overview */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Auto-Write Success</p>
                  <p className="text-2xl font-bold">{formatNumber(kpis.autoWriteSuccessRate * 100, 0)}%</p>
                </div>
                <CheckCircle className={`h-8 w-8 ${kpis.autoWriteSuccessRate > 0.8 ? 'text-green-600' : 'text-yellow-600'}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Edit Distance</p>
                  <p className="text-2xl font-bold">{formatNumber(kpis.avgEditDistance * 100, 0)}%</p>
                </div>
                <Activity className={`h-8 w-8 ${kpis.avgEditDistance < 0.3 ? 'text-green-600' : 'text-yellow-600'}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Channel Health</p>
                  <p className="text-2xl font-bold">{formatNumber(kpis.channelHealthScore * 100, 0)}%</p>
                </div>
                <Clock className={`h-8 w-8 ${kpis.channelHealthScore > 0.9 ? 'text-green-600' : 'text-orange-600'}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Alerts</p>
                  <p className="text-2xl font-bold">{kpis.alertsTriggered}</p>
                </div>
                <AlertTriangle className={`h-8 w-8 ${kpis.alertsTriggered === 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { type: 'auto_write_rate' as MetricType, label: 'Auto-Write Rate', format: (v: number) => `${formatNumber(v * 100, 0)}%` },
              { type: 'downgrade_rate' as MetricType, label: 'Downgrade Rate', format: (v: number) => `${v.toFixed(0)} events` },
              { type: 'undo_rate' as MetricType, label: 'Undo Rate', format: (v: number) => `${v.toFixed(0)} undos` },
              { type: 'edit_distance' as MetricType, label: 'Edit Distance', format: (v: number) => `${formatNumber(v * 100, 0)}%` }
            ].map(metric => {
              const summary = metricSummaries.get(metric.type);
              if (!summary) return null;
              
              return (
                <div key={metric.type} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{metric.label}</span>
                      {getTrendIcon(summary.trend)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {summary.count} events • Avg: {metric.format(summary.average)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{metric.format(summary.lastValue)}</p>
                    <p className="text-xs text-muted-foreground">Latest</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { type: 'watch_channel_health' as MetricType, label: 'Channel Health', format: (v: number) => `${formatNumber(v * 100, 0)}%` },
              { type: 'webhook_error' as MetricType, label: 'Webhook Errors', format: (v: number) => `${v.toFixed(0)} errors` },
              { type: 'scope_decay_action' as MetricType, label: 'Scope Decay', format: (v: number) => `${v.toFixed(0)} events` }
            ].map(metric => {
              const summary = metricSummaries.get(metric.type);
              if (!summary) return null;
              
              return (
                <div key={metric.type} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{metric.label}</span>
                      {getTrendIcon(summary.trend)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {summary.count} events • Avg: {metric.format(summary.average)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{metric.format(summary.lastValue)}</p>
                    <p className="text-xs text-muted-foreground">Latest</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <Card id="alerts-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alert Management
            {activeAlerts.length > 0 && (
              <Badge variant="destructive">{activeAlerts.length} active</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No alerts recorded</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 10).map(alert => (
                <div key={alert.id} className={`p-3 border rounded-lg ${getSeverityColor(alert.severity)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{alert.ruleName}</h4>
                        <Badge variant="outline" className="text-xs">
                          {alert.severity}
                        </Badge>
                        {alert.acknowledged && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Acknowledged
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mb-2">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(alert.timestamp).toLocaleString()} • Value: {formatNumber(alert.value)}
                      </p>
                    </div>
                    {!alert.acknowledged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="ml-2"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ack
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              
              {alerts.length > 10 && (
                <p className="text-sm text-muted-foreground text-center">
                  Showing latest 10 of {alerts.length} alerts
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Statistics */}
      {alertStats && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{alertStats.totalAlerts}</p>
                <p className="text-sm text-muted-foreground">Total Alerts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{alertStats.activeAlerts}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {alertStats.avgTimeToAcknowledge > 0 
                    ? formatTimeWindow(alertStats.avgTimeToAcknowledge)
                    : 'N/A'
                  }
                </p>
                <p className="text-sm text-muted-foreground">Avg Response Time</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {(alertStats.alertsByServerity.critical || 0) + (alertStats.alertsByServerity.high || 0)}
                </p>
                <p className="text-sm text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};