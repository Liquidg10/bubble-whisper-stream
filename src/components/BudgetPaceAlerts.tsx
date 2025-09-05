import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle } from "lucide-react";
import { budgetService, BudgetPaceAlert } from "@/services/budgetService";
import { isFeatureEnabled } from "@/config/flags";

interface BudgetPaceAlertsProps {
  className?: string;
}

export function BudgetPaceAlerts({ className }: BudgetPaceAlertsProps) {
  const [alerts, setAlerts] = useState<BudgetPaceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = async () => {
    try {
      const data = await budgetService.getPaceAlerts();
      setAlerts(data.filter(alert => alert.percentSpent > 0)); // Only show envelopes with spending
    } catch (error) {
      console.error('Error loading pace alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFeatureEnabled('budget')) {
      loadAlerts();
      
      // Refresh alerts every hour
      const interval = setInterval(loadAlerts, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, []);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'medium':
        return <TrendingUp className="w-5 h-5 text-warning" />;
      default:
        return <CheckCircle className="w-5 h-5 text-success" />;
    }
  };

  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'destructive' as const;
      case 'medium':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  if (!isFeatureEnabled('budget') || loading) {
    return null;
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Budget Pace Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Alert key={alert.envelopeId} className="border-l-4" style={{
              borderLeftColor: alert.severity === 'high' ? 'hsl(var(--destructive))' : 
                              alert.severity === 'medium' ? 'hsl(var(--warning))' : 'hsl(var(--success))'
            }}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1 space-y-2">
                    <AlertDescription className="font-medium">
                      {alert.message}
                    </AlertDescription>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{alert.percentSpent}% spent</span>
                      <span>•</span>
                      <span>{alert.percentThroughMonth}% through month</span>
                      {alert.isOnPace ? (
                        <Badge variant="outline" className="ml-auto">
                          <TrendingDown className="w-3 h-3 mr-1" />
                          On pace
                        </Badge>
                      ) : (
                        <Badge variant={getSeverityVariant(alert.severity)} className="ml-auto">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          Over pace
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}