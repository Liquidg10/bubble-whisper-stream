import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Download, CheckCircle, XCircle, Activity } from 'lucide-react';
import { cbtPilotAlerts, type PilotAlert } from '@/services/cbtPilotAlerts';
import { cbtPilotService } from '@/services/cbtPilotService';
import { useToast } from '@/hooks/use-toast';

export function CBTPilotMonitor() {
  const [alerts, setAlerts] = useState<PilotAlert[]>([]);
  const [alertSummary, setAlertSummary] = useState<any>(null);
  const [pilotStats, setPilotStats] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    setAlerts(cbtPilotAlerts.getActiveAlerts());
    setAlertSummary(cbtPilotAlerts.getAlertSummary());
    setPilotStats(cbtPilotService.getPilotStats());
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    cbtPilotAlerts.acknowledgeAlert(alertId);
    loadData();
    toast({
      title: "Alert acknowledged",
      description: "Alert has been marked as acknowledged.",
    });
  };

  const handleClearAllAlerts = () => {
    if (confirm('Clear all alerts? This cannot be undone.')) {
      cbtPilotAlerts.clearAlerts();
      loadData();
      toast({
        title: "Alerts cleared",
        description: "All alerts have been cleared.",
      });
    }
  };

  const handleExportCSV = () => {
    const csvData = cbtPilotAlerts.exportCSV();
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbt-pilot-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Report exported",
      description: "CBT pilot metrics exported to CSV.",
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <XCircle className="h-4 w-4" />;
      case 'medium': return <AlertTriangle className="h-4 w-4" />;
      case 'low': return <Activity className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  if (!pilotStats?.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            CBT Pilot Monitor
          </CardTitle>
          <CardDescription>
            Real-time monitoring for CBT pilot safety and performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              CBT Pilot is not currently enabled. Enable it in pilot settings to see monitoring data.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            CBT Pilot Monitor
            {alertSummary?.activeAlerts > 0 && (
              <Badge variant="destructive">{alertSummary.activeAlerts}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Real-time monitoring for CBT pilot safety and performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{pilotStats?.totalUsers || 0}</div>
              <div className="text-xs text-muted-foreground">Pilot Users</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{alertSummary?.activeAlerts || 0}</div>
              <div className="text-xs text-muted-foreground">Active Alerts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{alertSummary?.highSeverityAlerts || 0}</div>
              <div className="text-xs text-muted-foreground">High Severity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {pilotStats?.silentStabilization?.usersInStabilization?.length || 0}
              </div>
              <div className="text-xs text-muted-foreground">In Stabilization</div>
            </div>
          </div>

          {/* Silent Stabilization Status */}
          {pilotStats?.silentStabilization && (
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription>
                Silent stabilization active: {pilotStats.silentStabilization.usersInStabilization?.length || 0} users 
                in observation mode, {pilotStats.silentStabilization.usersReady?.length || 0} ready for visible chips.
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            {alertSummary?.activeAlerts > 0 && (
              <Button size="sm" variant="outline" onClick={handleClearAllAlerts}>
                Clear All Alerts
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Alerts</CardTitle>
            <CardDescription>
              Alerts requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 p-3 border rounded-md">
                <div className="flex-shrink-0">
                  {getSeverityIcon(alert.severity)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getSeverityColor(alert.severity) as any} className="text-xs">
                      {alert.severity}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {alert.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{alert.message}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAcknowledgeAlert(alert.id)}
                >
                  Acknowledge
                </Button>
              </div>
            ))}
            {alerts.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">
                ... and {alerts.length - 10} more alerts
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Alerts State */}
      {alerts.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">All Clear</h3>
            <p className="text-sm text-muted-foreground">
              No active alerts. CBT pilot is operating within normal parameters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}