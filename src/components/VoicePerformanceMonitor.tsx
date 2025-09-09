/**
 * Voice Performance Monitor - Real-time metrics dashboard
 * Phase 3: Live performance tracking and alerting
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { voiceMetricsService, VoicePerformanceSnapshot, VoiceMetricsSummary } from '@/services/voiceMetricsService';
import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface VoicePerformanceMonitorProps {
  updateInterval?: number;
}

export function VoicePerformanceMonitor({ updateInterval = 5000 }: VoicePerformanceMonitorProps) {
  const [snapshot, setSnapshot] = useState<VoicePerformanceSnapshot | null>(null);
  const [summary, setSummary] = useState<VoiceMetricsSummary | null>(null);
  const [performanceBudget, setPerformanceBudget] = useState<{ passed: boolean; violations: string[] }>({ passed: true, violations: [] });
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(() => {
      updateMetrics();
    }, updateInterval);

    // Initial update
    updateMetrics();

    return () => clearInterval(interval);
  }, [isMonitoring, updateInterval]);

  const updateMetrics = () => {
    const currentSnapshot = voiceMetricsService.getPerformanceSnapshot();
    const currentSummary = voiceMetricsService.getSummary();
    const budget = voiceMetricsService.checkPerformanceBudget();

    setSnapshot(currentSnapshot);
    setSummary(currentSummary);
    setPerformanceBudget(budget);

    // Update chart data
    const recentSnapshots = voiceMetricsService.getRecentSnapshots(20);
    const formattedData = recentSnapshots.map((snap, index) => ({
      time: new Date(snap.timestamp).toLocaleTimeString(),
      timeToChip: snap.avgTimeToChip,
      successRate: snap.successRate * 100,
      confusionRate: snap.confusionRate * 100,
    }));
    setChartData(formattedData);
  };

  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    if (!isMonitoring) {
      updateMetrics();
    }
  };

  const formatMs = (ms: number) => `${ms.toFixed(0)}ms`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'degrading': return <TrendingDown className="h-4 w-4 text-destructive" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getPerformanceColor = (value: number, threshold: number, inverse = false) => {
    const isGood = inverse ? value < threshold : value > threshold;
    return isGood ? 'text-success' : 'text-destructive';
  };

  if (!snapshot || !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Voice Performance Monitor
          </CardTitle>
          <CardDescription>Real-time voice system metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Button onClick={toggleMonitoring} variant="outline">
              Start Monitoring
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <CardTitle>Voice Performance Monitor</CardTitle>
              {isMonitoring && <Badge variant="outline" className="bg-success/10 text-success border-success">Live</Badge>}
            </div>
            <Button onClick={toggleMonitoring} variant="outline" size="sm">
              {isMonitoring ? 'Stop' : 'Start'} Monitoring
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Performance Budget Status */}
          <Alert className={performanceBudget.passed ? 'border-success bg-success/5' : 'border-destructive bg-destructive/5'}>
            <div className="flex items-center gap-2">
              {performanceBudget.passed ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <AlertDescription>
                Performance Budget: {performanceBudget.passed ? 'PASSED' : 'FAILED'}
                {!performanceBudget.passed && (
                  <div className="mt-2">
                    <ul className="list-disc list-inside text-sm">
                      {performanceBudget.violations.map((violation, i) => (
                        <li key={i}>{violation}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </div>
          </Alert>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Success Rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${getPerformanceColor(snapshot.successRate, 0.85)}`}>
                    {formatPercent(snapshot.successRate)}
                  </span>
                  {getTrendIcon(snapshot.performanceTrend)}
                </div>
                <Progress value={snapshot.successRate * 100} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {snapshot.totalSessions} sessions tracked
                </p>
              </CardContent>
            </Card>

            {/* Time to Chip */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Time to Chip</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${getPerformanceColor(snapshot.avgTimeToChip, 500, true)}`}>
                    {formatMs(snapshot.avgTimeToChip)}
                  </span>
                </div>
                <Progress 
                  value={Math.min(100, (500 - snapshot.avgTimeToChip) / 5)} 
                  className="mt-2" 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Target: &lt;500ms
                </p>
              </CardContent>
            </Card>

            {/* Confusion Rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Confusion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${getPerformanceColor(snapshot.confusionRate, 0.1, true)}`}>
                    {formatPercent(snapshot.confusionRate)}
                  </span>
                </div>
                <Progress value={snapshot.confusionRate * 100} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Target: &lt;10%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top Intents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Detected Intents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {snapshot.topIntents.slice(0, 5).map((intent, i) => (
                  <div key={intent.intent} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{intent.intent}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {intent.count} uses
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {formatPercent(intent.avgConfidence)} confidence
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Processing Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Avg Time to Chip</span>
                  <span className="font-medium">{formatMs(summary.performanceMetrics.avgTimeToChip)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">P95 Time to Chip</span>
                  <span className="font-medium">{formatMs(summary.performanceMetrics.p95TimeToChip)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Avg Processing Time</span>
                  <span className="font-medium">{formatMs(summary.performanceMetrics.avgProcessingTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">P95 Processing Time</span>
                  <span className="font-medium">{formatMs(summary.performanceMetrics.p95ProcessingTime)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Resource Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Audio Quality</span>
                  <span className="font-medium">{formatPercent(summary.resourceMetrics.avgAudioQuality)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Network Latency</span>
                  <span className="font-medium">{formatMs(summary.resourceMetrics.avgNetworkLatency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Memory Pressure</span>
                  <span className="font-medium">{formatPercent(summary.resourceMetrics.memoryPressure)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">User Experience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Acceptance Rate</span>
                  <span className="font-medium">{formatPercent(summary.successMetrics.acceptanceRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Completion Rate</span>
                  <span className="font-medium">{formatPercent(summary.successMetrics.completionRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Undo Rate</span>
                  <span className="font-medium">{formatPercent(summary.successMetrics.undoRate)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Detection Quality</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Intent Confidence</span>
                  <span className="font-medium">{formatPercent(summary.qualityMetrics.avgIntentConfidence)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Fallback Rate</span>
                  <span className="font-medium">{formatPercent(summary.qualityMetrics.fallbackRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Confusion Rate</span>
                  <span className="font-medium">{formatPercent(summary.qualityMetrics.confusionRate)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          {chartData.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Time to Chip Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="timeToChip" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Success vs Confusion Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="successRate" 
                        stroke="hsl(var(--success))" 
                        strokeWidth={2}
                        dot={false}
                        name="Success Rate %"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="confusionRate" 
                        stroke="hsl(var(--destructive))" 
                        strokeWidth={2}
                        dot={false}
                        name="Confusion Rate %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}