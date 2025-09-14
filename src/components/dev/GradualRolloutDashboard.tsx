/**
 * Gradual Rollout Dashboard - Dev Tools for Feature Rollout Management
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  getRolloutStatus, 
  setRolloutOverride, 
  clearRolloutOverrides,
  shouldShowFeature 
} from '@/utils/gradualRollout';
import { Zap, Users, RotateCcw, CheckCircle, XCircle } from 'lucide-react';

export function GradualRolloutDashboard() {
  const [rolloutStatus, setRolloutStatus] = React.useState(getRolloutStatus());
  
  const refreshStatus = () => {
    setRolloutStatus(getRolloutStatus());
  };

  const handleOverride = (featureName: string, enabled: boolean) => {
    setRolloutOverride(featureName, enabled);
    refreshStatus();
  };

  const handleClearOverrides = () => {
    clearRolloutOverrides();
    refreshStatus();
  };

  React.useEffect(() => {
    refreshStatus();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gradual Rollout Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and control feature rollout percentages and user cohorts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshStatus}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleClearOverrides}>
            Clear Overrides
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(rolloutStatus).map(([featureName, status]) => (
          <Card key={featureName}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{featureName}</span>
                {status.enabled ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Rollout Percentage</span>
                  <span className="font-medium">{status.percentage}%</span>
                </div>
                <Progress value={status.percentage} className="h-2" />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span>User Hash</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {status.userHash}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span>Currently Active</span>
                <Badge variant={status.enabled ? 'default' : 'secondary'}>
                  {status.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>

              {status.killSwitch && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <XCircle className="h-3 w-3" />
                  <span>Kill Switch Active</span>
                </div>
              )}

              <div className="pt-2 border-t space-y-2">
                <div className="text-xs text-muted-foreground">Dev Override</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={shouldShowFeature(featureName)}
                      onCheckedChange={(checked) => handleOverride(featureName, checked)}
                    />
                    <span className="text-sm">Force Enable</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Rollout Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {Object.values(rolloutStatus).filter(s => s.enabled).length}
              </div>
              <div className="text-sm text-muted-foreground">Active Features</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">
                {Object.values(rolloutStatus).length}
              </div>
              <div className="text-sm text-muted-foreground">Total Features</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {Object.values(rolloutStatus).filter(s => s.killSwitch).length}
              </div>
              <div className="text-sm text-muted-foreground">Kill Switches</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {Math.round(
                  Object.values(rolloutStatus).reduce((sum, s) => sum + s.percentage, 0) /
                  Object.values(rolloutStatus).length
                )}%
              </div>
              <div className="text-sm text-muted-foreground">Avg. Rollout</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}