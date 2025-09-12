/**
 * P19: Unified Telemetry Dashboard
 * Shows week-over-week trends for all P19 metrics
 * Includes canary rollout status and privacy controls
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Shield,
  Users,
  Target,
  Calendar,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Settings
} from 'lucide-react';
import { metricsService, type MetricType } from '@/services/metricsService';
import { taskCanaryService } from '@/services/taskCanaryService';
import { privacyConsentService } from '@/services/privacyConsentService';

interface TrendData {
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
}

export function TelemetryDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [timeWindow, setTimeWindow] = useState(7 * 24 * 60 * 60 * 1000); // 7 days
  const [consentSettings, setConsentSettings] = useState(privacyConsentService.getConsentSettings());

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Listen for consent changes
  useEffect(() => {
    const handleConsentUpdate = (event: CustomEvent) => {
      setConsentSettings(event.detail);
    };

    window.addEventListener('privacyConsentUpdated', handleConsentUpdate as EventListener);
    return () => window.removeEventListener('privacyConsentUpdated', handleConsentUpdate as EventListener);
  }, []);

  const getSuggestionMetrics = (): { impressions: TrendData; accepts: TrendData; dismisses: TrendData; undos: TrendData } => {
    const current = metricsService.getMetrics(timeWindow);
    const previous = metricsService.getMetrics(timeWindow * 2).filter(m => 
      m.timestamp < Date.now() - timeWindow
    );

    const calcTrend = (type: MetricType): TrendData => {
      const currentCount = current.filter(m => m.type === type).length;
      const previousCount = previous.filter(m => m.type === type).length;
      const change = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(change) > 5) {
        trend = change > 0 ? 'up' : 'down';
      }

      return { current: currentCount, previous: previousCount, trend, change };
    };

    return {
      impressions: calcTrend('suggestion_impression'),
      accepts: calcTrend('suggestion_accept'),
      dismisses: calcTrend('suggestion_dismiss'),
      undos: calcTrend('suggestion_undo')
    };
  };

  const getPlanningMetrics = (): { starts: TrendData; completions: TrendData; abandons: TrendData } => {
    const current = metricsService.getMetrics(timeWindow);
    const previous = metricsService.getMetrics(timeWindow * 2).filter(m => 
      m.timestamp < Date.now() - timeWindow
    );

    const calcTrend = (type: MetricType): TrendData => {
      const currentCount = current.filter(m => m.type === type).length;
      const previousCount = previous.filter(m => m.type === type).length;
      const change = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(change) > 5) {
        trend = change > 0 ? 'up' : 'down';
      }

      return { current: currentCount, previous: previousCount, trend, change };
    };

    return {
      starts: calcTrend('planning_mode_start'),
      completions: calcTrend('planning_mode_complete'),
      abandons: calcTrend('planning_mode_abandon')
    };
  };

  const getCalendarMetrics = (): { drafts: TrendData; conversions: TrendData; manual: TrendData } => {
    const current = metricsService.getMetrics(timeWindow);
    const previous = metricsService.getMetrics(timeWindow * 2).filter(m => 
      m.timestamp < Date.now() - timeWindow
    );

    const calcTrend = (type: MetricType): TrendData => {
      const currentCount = current.filter(m => m.type === type).length;
      const previousCount = previous.filter(m => m.type === type).length;
      const change = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(change) > 5) {
        trend = change > 0 ? 'up' : 'down';
      }

      return { current: currentCount, previous: previousCount, trend, change };
    };

    return {
      drafts: calcTrend('calendar_draft_created'),
      conversions: calcTrend('calendar_draft_to_send'),
      manual: calcTrend('calendar_send_manual')
    };
  };

  const canaryStats = taskCanaryService.getCanaryStats();

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const MetricCard = ({ 
    title, 
    value, 
    trend, 
    change, 
    icon: Icon 
  }: { 
    title: string; 
    value: number; 
    trend: 'up' | 'down' | 'stable'; 
    change: number; 
    icon: React.ComponentType<any> 
  }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendIcon trend={trend} />
            <span className="text-xs text-muted-foreground">
              {Math.abs(change).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  const suggestionMetrics = getSuggestionMetrics();
  const planningMetrics = getPlanningMetrics();
  const calendarMetrics = getCalendarMetrics();

  const handleConsentToggle = (key: keyof typeof consentSettings, value: boolean) => {
    privacyConsentService.updateConsentSettings({ [key]: value });
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">P19 Telemetry Dashboard</h2>
          <p className="text-muted-foreground">
            Week-over-week trends, canary rollout status, and privacy controls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <select 
            value={timeWindow} 
            onChange={(e) => setTimeWindow(Number(e.target.value))}
            className="text-sm border rounded px-2 py-1"
          >
            <option value={24 * 60 * 60 * 1000}>24 hours</option>
            <option value={7 * 24 * 60 * 60 * 1000}>7 days</option>
            <option value={30 * 24 * 60 * 60 * 1000}>30 days</option>
          </select>
        </div>
      </div>

      {!consentSettings.telemetryEnabled && (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Telemetry collection is disabled. Some metrics may not be available.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="suggestions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="planning">Planning Mode</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="canary">Task Canary</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Impressions"
              value={suggestionMetrics.impressions.current}
              trend={suggestionMetrics.impressions.trend}
              change={suggestionMetrics.impressions.change}
              icon={Activity}
            />
            <MetricCard
              title="Accepts"
              value={suggestionMetrics.accepts.current}
              trend={suggestionMetrics.accepts.trend}
              change={suggestionMetrics.accepts.change}
              icon={CheckCircle2}
            />
            <MetricCard
              title="Dismisses"
              value={suggestionMetrics.dismisses.current}
              trend={suggestionMetrics.dismisses.trend}
              change={suggestionMetrics.dismisses.change}
              icon={Minus}
            />
            <MetricCard
              title="Undos"
              value={suggestionMetrics.undos.current}
              trend={suggestionMetrics.undos.trend}
              change={suggestionMetrics.undos.change}
              icon={AlertTriangle}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Suggestion System Health</CardTitle>
              <CardDescription>Over-nudge detection and user fatigue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Accept Rate</span>
                  <span className="text-sm font-mono">
                    {suggestionMetrics.accepts.current > 0 && suggestionMetrics.impressions.current > 0
                      ? ((suggestionMetrics.accepts.current / suggestionMetrics.impressions.current) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <Progress 
                  value={
                    suggestionMetrics.accepts.current > 0 && suggestionMetrics.impressions.current > 0
                      ? (suggestionMetrics.accepts.current / suggestionMetrics.impressions.current) * 100
                      : 0
                  } 
                  className="h-2" 
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planning" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Sessions Started"
              value={planningMetrics.starts.current}
              trend={planningMetrics.starts.trend}
              change={planningMetrics.starts.change}
              icon={Brain}
            />
            <MetricCard
              title="Completed"
              value={planningMetrics.completions.current}
              trend={planningMetrics.completions.trend}
              change={planningMetrics.completions.change}
              icon={CheckCircle2}
            />
            <MetricCard
              title="Abandoned"
              value={planningMetrics.abandons.current}
              trend={planningMetrics.abandons.trend}
              change={planningMetrics.abandons.change}
              icon={AlertTriangle}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Planning Mode Success Rate</CardTitle>
              <CardDescription>Percentage of started sessions that completed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Completion Rate</span>
                  <span className="text-sm font-mono">
                    {planningMetrics.starts.current > 0
                      ? ((planningMetrics.completions.current / planningMetrics.starts.current) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <Progress 
                  value={
                    planningMetrics.starts.current > 0
                      ? (planningMetrics.completions.current / planningMetrics.starts.current) * 100
                      : 0
                  } 
                  className="h-2" 
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Drafts Created"
              value={calendarMetrics.drafts.current}
              trend={calendarMetrics.drafts.trend}
              change={calendarMetrics.drafts.change}
              icon={Calendar}
            />
            <MetricCard
              title="Draft→Send"
              value={calendarMetrics.conversions.current}
              trend={calendarMetrics.conversions.trend}
              change={calendarMetrics.conversions.change}
              icon={CheckCircle2}
            />
            <MetricCard
              title="Manual Send"
              value={calendarMetrics.manual.current}
              trend={calendarMetrics.manual.trend}
              change={calendarMetrics.manual.change}
              icon={Target}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Calendar Conversion Rate</CardTitle>
              <CardDescription>Manual tracking of draft→send conversion</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Conversion Rate</span>
                  <span className="text-sm font-mono">
                    {calendarMetrics.drafts.current > 0
                      ? ((calendarMetrics.conversions.current / calendarMetrics.drafts.current) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <Progress 
                  value={
                    calendarMetrics.drafts.current > 0
                      ? (calendarMetrics.conversions.current / calendarMetrics.drafts.current) * 100
                      : 0
                  } 
                  className="h-2" 
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canary" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Canary Status
                </CardTitle>
                <CardDescription>Task system rollout progress</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Current Phase</span>
                  <Badge variant={canaryStats.enabled ? "default" : "secondary"}>
                    {canaryStats.currentPhase}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total Users</span>
                  <span className="text-sm font-mono">{canaryStats.totalUsers}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Phase 1 (5%)</span>
                    <span>{canaryStats.phaseUsers.phase1}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Phase 2 (25%)</span>
                    <span>{canaryStats.phaseUsers.phase2}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Phase 3 (100%)</span>
                    <span>{canaryStats.phaseUsers.phase3}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Stability Metrics
                </CardTitle>
                <CardDescription>Attempted vs completed tasks delta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Success Rate</span>
                  <span className="text-sm font-mono">
                    {(canaryStats.stabilityMetrics.successRate * 100).toFixed(1)}%
                  </span>
                </div>
                <Progress 
                  value={canaryStats.stabilityMetrics.successRate * 100} 
                  className="h-2" 
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Attempted: {canaryStats.stabilityMetrics.attempted}</div>
                  <div>Completed: {canaryStats.stabilityMetrics.completed}</div>
                  <div>Errors: {canaryStats.stabilityMetrics.errors}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Canary Controls</CardTitle>
              <CardDescription>Manual canary management (dev only)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => taskCanaryService.advancePhase()}
                  disabled={!canaryStats.enabled}
                >
                  Advance Phase
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => taskCanaryService.rollback('Manual rollback')}
                  disabled={!canaryStats.enabled}
                >
                  Rollback
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => taskCanaryService.setCanaryEnabled(!canaryStats.enabled)}
                >
                  {canaryStats.enabled ? 'Disable' : 'Enable'} Canary
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Privacy Consent
              </CardTitle>
              <CardDescription>No PII leaves device without explicit consent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Telemetry Collection</div>
                    <div className="text-xs text-muted-foreground">Basic usage metrics</div>
                  </div>
                  <Switch
                    checked={consentSettings.telemetryEnabled}
                    onCheckedChange={(checked) => handleConsentToggle('telemetryEnabled', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Cloud Sync</div>
                    <div className="text-xs text-muted-foreground">Sync data across devices</div>
                  </div>
                  <Switch
                    checked={consentSettings.cloudSyncEnabled}
                    onCheckedChange={(checked) => handleConsentToggle('cloudSyncEnabled', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Analytics</div>
                    <div className="text-xs text-muted-foreground">Product improvement analytics</div>
                  </div>
                  <Switch
                    checked={consentSettings.analyticsEnabled}
                    onCheckedChange={(checked) => handleConsentToggle('analyticsEnabled', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Personal Data Sharing</div>
                    <div className="text-xs text-muted-foreground">Share personal data for insights</div>
                  </div>
                  <Switch
                    checked={consentSettings.personalDataSharing}
                    onCheckedChange={(checked) => handleConsentToggle('personalDataSharing', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Privacy Controls
              </CardTitle>
              <CardDescription>One-tap privacy actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => privacyConsentService.pauseLearning()}
                >
                  Pause Learning
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => privacyConsentService.redactLastNDays(7)}
                >
                  Redact Last 7 Days
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => privacyConsentService.moveToDeepLayer()}
                >
                  Move to Deep Layer
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const exported = privacyConsentService.exportUserData({
                      includePersonalData: false,
                      includeMetrics: true,
                      includeBehaviorData: false,
                      format: 'json'
                    });
                    console.log('Exported data:', exported);
                  }}
                >
                  Export Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}