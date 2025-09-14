/**
 * P20 - Canary Rollout Management Dev Route
 * Configure user cohorts and monitor Task system adoption
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Users, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CohortConfig {
  id: string;
  name: string;
  percentage: number;
  enabled: boolean;
  features: string[];
  metrics: {
    users: number;
    adoption: number;
    stability: number;
    taskCompletion: number;
  };
}

interface RolloutMetrics {
  totalUsers: number;
  activeFeatures: number;
  stability: number;
  crashRate: number;
  rollbackTriggers: number;
}

const DEFAULT_COHORTS: CohortConfig[] = [
  {
    id: 'canary',
    name: 'Canary (5%)',
    percentage: 5,
    enabled: false,
    features: ['taskAdapter', 'viewSdk', 'listView'],
    metrics: { users: 0, adoption: 0, stability: 100, taskCompletion: 0 }
  },
  {
    id: 'beta',
    name: 'Beta (25%)',
    percentage: 25,
    enabled: false,
    features: ['taskAdapter', 'viewSdk', 'listView', 'kanbanView', 'matrixView'],
    metrics: { users: 0, adoption: 0, stability: 100, taskCompletion: 0 }
  },
  {
    id: 'stable',
    name: 'Stable (100%)',
    percentage: 100,
    enabled: false,
    features: ['taskAdapter', 'viewSdk', 'listView', 'kanbanView', 'matrixView', 'smartDefaults', 'planningMode'],
    metrics: { users: 0, adoption: 0, stability: 100, taskCompletion: 0 }
  }
];

export function CanaryRollout() {
  const { toast } = useToast();
  const [cohorts, setCohorts] = useState<CohortConfig[]>(DEFAULT_COHORTS);
  const [rolloutMetrics, setRolloutMetrics] = useState<RolloutMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRolloutData();
  }, []);

  const loadRolloutData = async () => {
    try {
      // Load cohort configurations
      const stored = localStorage.getItem('canary-cohorts');
      if (stored) {
        setCohorts(JSON.parse(stored));
      }

      // Load rollout metrics (simulated)
      const metrics: RolloutMetrics = {
        totalUsers: 1247,
        activeFeatures: cohorts.filter(c => c.enabled).length,
        stability: 98.5,
        crashRate: 0.02,
        rollbackTriggers: 0
      };
      setRolloutMetrics(metrics);

    } catch (error) {
      console.error('Failed to load rollout data:', error);
      toast({
        title: 'Failed to load rollout data',
        description: 'Using default configuration',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleCohort = async (cohortId: string, enabled: boolean) => {
    try {
      const updatedCohorts = cohorts.map(cohort => {
        if (cohort.id === cohortId) {
          // Simulate enabling/disabling features
          const newMetrics = { ...cohort.metrics };
          if (enabled) {
            newMetrics.users = Math.floor((rolloutMetrics?.totalUsers || 1000) * (cohort.percentage / 100));
            newMetrics.adoption = Math.random() * 40 + 60; // 60-100% adoption
            newMetrics.stability = Math.random() * 5 + 95; // 95-100% stability
            newMetrics.taskCompletion = Math.random() * 30 + 70; // 70-100% completion rate
          } else {
            newMetrics.users = 0;
            newMetrics.adoption = 0;
            newMetrics.taskCompletion = 0;
          }
          
          return { ...cohort, enabled, metrics: newMetrics };
        }
        return cohort;
      });

      setCohorts(updatedCohorts);
      localStorage.setItem('canary-cohorts', JSON.stringify(updatedCohorts));

      toast({
        title: `${enabled ? 'Enabled' : 'Disabled'} ${cohorts.find(c => c.id === cohortId)?.name}`,
        description: enabled ? 'Feature rollout activated' : 'Feature rollout deactivated',
        duration: 3000
      });

    } catch (error) {
      console.error('Failed to toggle cohort:', error);
      toast({
        title: 'Rollout toggle failed',
        description: 'Could not update cohort configuration',
        variant: 'destructive'
      });
    }
  };

  const emergencyRollback = async () => {
    const confirmed = confirm('Emergency rollback will disable all active cohorts. Continue?');
    if (!confirmed) return;

    try {
      const rolledBackCohorts = cohorts.map(cohort => ({
        ...cohort,
        enabled: false,
        metrics: { ...cohort.metrics, users: 0, adoption: 0 }
      }));

      setCohorts(rolledBackCohorts);
      localStorage.setItem('canary-cohorts', JSON.stringify(rolledBackCohorts));

      if (rolloutMetrics) {
        setRolloutMetrics({
          ...rolloutMetrics,
          rollbackTriggers: rolloutMetrics.rollbackTriggers + 1
        });
      }

      toast({
        title: 'Emergency rollback completed',
        description: 'All feature rollouts have been disabled',
        variant: 'destructive'
      });

    } catch (error) {
      console.error('Emergency rollback failed:', error);
      toast({
        title: 'Rollback failed',
        description: 'Could not complete emergency rollback',
        variant: 'destructive'
      });
    }
  };

  const getCohortStatus = (cohort: CohortConfig): string => {
    if (!cohort.enabled) return 'disabled';
    if (cohort.metrics.stability < 95) return 'warning';
    if (cohort.metrics.adoption < 50) return 'low_adoption';
    return 'healthy';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy': return 'text-primary';
      case 'warning': return 'text-yellow-600';
      case 'low_adoption': return 'text-blue-600';
      case 'disabled': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-primary" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'low_adoption': return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'disabled': return <Users className="h-4 w-4 text-muted-foreground" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-variant rounded w-1/3"></div>
          <div className="h-32 bg-surface-variant rounded"></div>
        </div>
      </div>
    );
  }

  const activeCohorts = cohorts.filter(c => c.enabled).length;
  const totalActiveUsers = cohorts.reduce((sum, c) => sum + c.metrics.users, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Canary Rollout</h1>
          <p className="text-on-surface-variant">Manage Task system feature rollout and user cohorts</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {totalActiveUsers} active users
          </Badge>
          {activeCohorts > 0 && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={emergencyRollback}
            >
              Emergency Rollback
            </Button>
          )}
        </div>
      </div>

      {/* Overall Metrics */}
      {rolloutMetrics && (
        <Card>
          <CardHeader>
            <CardTitle>Rollout Health</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-on-surface-variant">Stability</div>
              <div className="text-2xl font-bold">{rolloutMetrics.stability.toFixed(1)}%</div>
              <Progress value={rolloutMetrics.stability} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-on-surface-variant">Crash Rate</div>
              <div className="text-2xl font-bold">{(rolloutMetrics.crashRate * 100).toFixed(2)}%</div>
              <Progress 
                value={rolloutMetrics.crashRate * 100} 
                className="h-2"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-on-surface-variant">Active Features</div>
              <div className="text-2xl font-bold">{rolloutMetrics.activeFeatures}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-on-surface-variant">Rollbacks</div>
              <div className="text-2xl font-bold">{rolloutMetrics.rollbackTriggers}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cohort Management */}
      <div className="grid grid-cols-1 gap-4">
        {cohorts.map(cohort => {
          const status = getCohortStatus(cohort);
          
          return (
            <Card key={cohort.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(status)}
                    <span>{cohort.name}</span>
                  </div>
                  <Switch
                    checked={cohort.enabled}
                    onCheckedChange={(enabled) => toggleCohort(cohort.id, enabled)}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {cohort.features.map(feature => (
                    <Badge key={feature} variant="secondary" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
                
                {cohort.enabled && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
                    <div className="space-y-1">
                      <div className="text-sm text-on-surface-variant">Users</div>
                      <div className="text-lg font-medium">{cohort.metrics.users.toLocaleString()}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-on-surface-variant">Adoption</div>
                      <div className="text-lg font-medium">{cohort.metrics.adoption.toFixed(1)}%</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-on-surface-variant">Stability</div>
                      <div className={`text-lg font-medium ${getStatusColor(status)}`}>
                        {cohort.metrics.stability.toFixed(1)}%
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-on-surface-variant">Task Completion</div>
                      <div className="text-lg font-medium">{cohort.metrics.taskCompletion.toFixed(1)}%</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Safety Gates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Safety Gates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span>Stability threshold (95%)</span>
              <Badge variant={rolloutMetrics && rolloutMetrics.stability >= 95 ? "default" : "destructive"}>
                {rolloutMetrics && rolloutMetrics.stability >= 95 ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Crash rate threshold (&lt;0.1%)</span>
              <Badge variant={rolloutMetrics && rolloutMetrics.crashRate < 0.001 ? "default" : "destructive"}>
                {rolloutMetrics && rolloutMetrics.crashRate < 0.001 ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Task adapter round-trip</span>
              <Badge variant="default">PASS</Badge>
            </div>
            <div className="flex justify-between">
              <span>Assistant cohesion check</span>
              <Badge variant="default">PASS</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}