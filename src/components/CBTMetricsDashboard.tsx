/**
 * PROMPT 10: CBT Metrics Dashboard
 * Comprehensive metrics display for dev panel
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Download, RefreshCw, Target, TrendingUp, Users, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

import { cbtMetricsService } from '@/services/cbtMetricsService';
import { cbtPilotService } from '@/services/cbtPilotService';
import { cbtABTestingService } from '@/services/cbtABTestingService';
import { cbtPerformanceTracker } from '@/services/cbtPerformanceTracker';
import { DevCBTPilotManager } from './DevCBTPilotManager';

export function CBTMetricsDashboard() {
  const [metrics, setMetrics] = useState(cbtMetricsService.getMetricsSummary());
  const [pilotStats, setPilotStats] = useState(cbtPilotService.getPilotStats());
  const [abResults, setABResults] = useState(cbtABTestingService.getComparativeResults());
  const [performance, setPerformance] = useState(cbtPerformanceTracker.getStats());
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = async () => {
    setRefreshing(true);
    try {
      setMetrics(cbtMetricsService.getMetricsSummary());
      setPilotStats(cbtPilotService.getPilotStats());
      setABResults(cbtABTestingService.getComparativeResults());
      setPerformance(cbtPerformanceTracker.getStats());
    } finally {
      setRefreshing(false);
    }
  };

  const exportMetrics = () => {
    const csv = cbtMetricsService.exportMetricsCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbt-metrics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportABData = () => {
    const csv = cbtABTestingService.exportTestDataCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbt-ab-test-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    refreshData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">CBT Metrics Dashboard</h2>
          <p className="text-muted-foreground">
            Performance monitoring and evaluation metrics for CBT assistance
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshData} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportMetrics} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prompts</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalPrompts}</div>
            <p className="text-xs text-muted-foreground">
              Interventions shown
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acceptance Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(metrics.overallAcceptanceRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Users found helpful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgLatency.toFixed(0)}ms</div>
            <p className="text-xs text-muted-foreground">
              Target: ≤50ms
            </p>
            <Progress 
              value={Math.min(100, (50 / Math.max(metrics.avgLatency, 1)) * 100)} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Precision Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.precisionScore > 0 ? (metrics.precisionScore * 100).toFixed(1) + '%' : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Manual labels required
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pilot">Pilot Cohort</TabsTrigger>
          <TabsTrigger value="ab-testing">A/B Testing</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily Prompts Trend</CardTitle>
                <CardDescription>
                  Intervention frequency over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={metrics.dailyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="promptsShown" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Acceptance vs Decline Rate</CardTitle>
                <CardDescription>
                  User feedback trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={metrics.dailyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => [(Number(value) * 100).toFixed(1) + '%', '']} />
                    <Line 
                      type="monotone" 
                      dataKey="acceptanceRate" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="Acceptance Rate"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="declineRate" 
                      stroke="hsl(var(--destructive))" 
                      strokeWidth={2}
                      name="Decline Rate"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Crisis Detection</CardTitle>
              <CardDescription>
                Emergency interventions triggered
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <span className="text-2xl font-bold">{metrics.totalCrisisHits}</span>
                  <span className="text-sm text-muted-foreground">Total crisis hits</span>
                </div>
                {metrics.totalCrisisHits > 0 && (
                  <Badge variant="destructive">
                    Requires immediate attention
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pilot" className="space-y-4">
          <DevCBTPilotManager />
        </TabsContent>

        <TabsContent value="ab-testing" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Chip Wording A/B Test</h3>
              <p className="text-sm text-muted-foreground">{abResults.summary}</p>
            </div>
            <Button onClick={exportABData} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export A/B Data
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Variant Performance</CardTitle>
              <CardDescription>
                Acceptance rates by wording variant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={abResults.metrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="variantId" />
                  <YAxis />
                  <Tooltip formatter={(value) => [(Number(value) * 100).toFixed(1) + '%', 'Acceptance Rate']} />
                  <Bar 
                    dataKey="acceptanceRate" 
                    fill="hsl(var(--primary))"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {abResults.metrics.map(variant => (
              <Card key={variant.variantId}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {variant.variantId}
                    {abResults.winner === variant.variantId && (
                      <Badge variant="default">Winner</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Impressions</span>
                    <span className="font-mono">{variant.impressions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Acceptances</span>
                    <span className="font-mono">{variant.acceptances}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Rate</span>
                    <span className="font-mono">{(variant.acceptanceRate * 100).toFixed(1)}%</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Stats</CardTitle>
                <CardDescription>
                  Latency and processing metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Average Total Time</span>
                  <span className="font-mono">{performance.avgTotalTime.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>95th Percentile</span>
                  <span className="font-mono">{performance.p95TotalTime.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate (≤50ms)</span>
                  <span className="font-mono">{performance.successRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Sample Count</span>
                  <span className="font-mono">{performance.sampleCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pipeline Breakdown</CardTitle>
                <CardDescription>
                  Time spent in each stage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Observer Time</span>
                  <span className="font-mono">{performance.avgObserverTime.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Policy Time</span>
                  <span className="font-mono">{performance.avgPolicyTime.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Render Time</span>
                  <span className="font-mono">{performance.avgRenderTime.toFixed(2)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Memory Usage</span>
                  <span className="font-mono">{(performance.memoryUsage / 1024).toFixed(1)}KB</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}