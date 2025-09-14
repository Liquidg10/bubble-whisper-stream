/**
 * Auto-Write Rate Limiting Panel - Monitor auto-write usage and rate limits
 * Integrates with calendarWriteService to display usage statistics and warnings
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Settings,
  Download,
  RefreshCw
} from 'lucide-react';
import { calendarWriteService } from '@/services/calendarWriteService';
import { toast } from 'sonner';

interface AutoWriteStats {
  dailyCount: number;
  weeklyCount: number;
  canAutoWrite: boolean;
  successRate: number;
  confidenceDistribution: {
    high: number;    // >85%
    medium: number;  // 60-85%
    low: number;     // <60%
  };
  timeDistribution: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  degradationEvents: {
    rateLimited: number;
    lowConfidence: number;
    userOverrides: number;
  };
}

interface RateLimitConfig {
  dailyLimit: number;
  weeklyLimit: number;
  warningThreshold: number; // Percentage (e.g., 80%)
}

export function AutoWriteRateLimitPanel() {
  const [stats, setStats] = useState<AutoWriteStats>({
    dailyCount: 0,
    weeklyCount: 0,
    canAutoWrite: true,
    successRate: 0,
    confidenceDistribution: { high: 0, medium: 0, low: 0 },
    timeDistribution: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    degradationEvents: { rateLimited: 0, lowConfidence: 0, userOverrides: 0 }
  });
  const [rateLimits] = useState<RateLimitConfig>({
    dailyLimit: 2,
    weeklyLimit: 10,
    warningThreshold: 80
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadAutoWriteStats = async () => {
    setLoading(true);
    try {
      // Get real auto-write stats from service
      const basicStats = await calendarWriteService.getAutoWriteStats();
      
      // Simulate additional metrics (in real app, these would come from analytics)
      const mockStats: AutoWriteStats = {
        ...basicStats,
        successRate: Math.random() * 40 + 60, // 60-100%
        confidenceDistribution: {
          high: Math.floor(Math.random() * 20) + 10,
          medium: Math.floor(Math.random() * 15) + 5,
          low: Math.floor(Math.random() * 10) + 2
        },
        timeDistribution: {
          morning: Math.floor(Math.random() * 8) + 2,
          afternoon: Math.floor(Math.random() * 12) + 5,
          evening: Math.floor(Math.random() * 6) + 2,
          night: Math.floor(Math.random() * 3) + 1
        },
        degradationEvents: {
          rateLimited: Math.floor(Math.random() * 3),
          lowConfidence: Math.floor(Math.random() * 5),
          userOverrides: Math.floor(Math.random() * 4)
        }
      };

      setStats(mockStats);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading auto-write stats:', error);
      toast.error('Failed to load auto-write statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAutoWriteStats();
    const interval = setInterval(loadAutoWriteStats, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getDailyUsagePercentage = () => {
    return (stats.dailyCount / rateLimits.dailyLimit) * 100;
  };

  const getWeeklyUsagePercentage = () => {
    return (stats.weeklyCount / rateLimits.weeklyLimit) * 100;
  };

  const getRateLimitStatus = () => {
    const dailyPct = getDailyUsagePercentage();
    const weeklyPct = getWeeklyUsagePercentage();
    
    if (dailyPct >= 100 || weeklyPct >= 100) return 'exceeded';
    if (dailyPct >= rateLimits.warningThreshold || weeklyPct >= rateLimits.warningThreshold) return 'warning';
    return 'good';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'exceeded': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'good': return 'text-success';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'exceeded': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning': return <Clock className="h-4 w-4 text-warning" />;
      case 'good': return <CheckCircle className="h-4 w-4 text-success" />;
      default: return null;
    }
  };

  const exportUsageReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      stats,
      rateLimits,
      status: getRateLimitStatus(),
      recommendations: generateRecommendations()
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `auto-write-usage-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Usage report exported');
  };

  const generateRecommendations = () => {
    const recommendations = [];
    const status = getRateLimitStatus();
    
    if (status === 'exceeded') {
      recommendations.push('Rate limit exceeded - auto-write disabled until tomorrow');
      recommendations.push('Consider reviewing confidence thresholds');
    } else if (status === 'warning') {
      recommendations.push('Approaching rate limit - consider spacing out auto-writes');
      recommendations.push('Review confidence scores for recent auto-writes');
    }
    
    if (stats.successRate < 80) {
      recommendations.push('Success rate below 80% - review auto-write criteria');
    }
    
    if (stats.degradationEvents.userOverrides > 2) {
      recommendations.push('High user override rate - adjust confidence thresholds');
    }
    
    return recommendations;
  };

  const status = getRateLimitStatus();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <CardTitle>Auto-Write Rate Limiting</CardTitle>
              <div className="flex items-center gap-1">
                {getStatusIcon(status)}
                <Badge variant={status === 'exceeded' ? 'destructive' : 
                              status === 'warning' ? 'secondary' : 'default'}>
                  {status.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadAutoWriteStats}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportUsageReport}
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getStatusColor(status)}`}>
                {stats.dailyCount}/{rateLimits.dailyLimit}
              </div>
              <div className="text-xs text-muted-foreground">Daily Usage</div>
              <Progress value={getDailyUsagePercentage()} className="mt-2 h-2" />
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getStatusColor(status)}`}>
                {stats.weeklyCount}/{rateLimits.weeklyLimit}
              </div>
              <div className="text-xs text-muted-foreground">Weekly Usage</div>
              <Progress value={getWeeklyUsagePercentage()} className="mt-2 h-2" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {stats.successRate.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </div>
            <div className="text-center">
              <Badge variant={stats.canAutoWrite ? 'default' : 'destructive'} className="text-sm">
                {stats.canAutoWrite ? 'AVAILABLE' : 'LIMITED'}
              </Badge>
              <div className="text-xs text-muted-foreground mt-1">Auto-Write Status</div>
            </div>
          </div>

          <Tabs defaultValue="usage" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="confidence">Confidence</TabsTrigger>
              <TabsTrigger value="patterns">Patterns</TabsTrigger>
              <TabsTrigger value="degradation">Degradation</TabsTrigger>
            </TabsList>

            <TabsContent value="usage">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Daily Usage ({stats.dailyCount}/{rateLimits.dailyLimit})</span>
                    <span className={getStatusColor(status)}>
                      {getDailyUsagePercentage().toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={getDailyUsagePercentage()} />
                  {getDailyUsagePercentage() >= rateLimits.warningThreshold && (
                    <p className="text-xs text-warning mt-1">
                      Approaching daily limit - {rateLimits.dailyLimit - stats.dailyCount} remaining
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Weekly Usage ({stats.weeklyCount}/{rateLimits.weeklyLimit})</span>
                    <span className={getStatusColor(status)}>
                      {getWeeklyUsagePercentage().toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={getWeeklyUsagePercentage()} />
                  {getWeeklyUsagePercentage() >= rateLimits.warningThreshold && (
                    <p className="text-xs text-warning mt-1">
                      Approaching weekly limit - {rateLimits.weeklyLimit - stats.weeklyCount} remaining
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Success Rate</span>
                    <span className="text-success">{stats.successRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={stats.successRate} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="confidence">
              <div className="space-y-4">
                <h4 className="font-medium">Confidence Distribution</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>High Confidence (&gt;85%)</span>
                      <span className="font-medium">{stats.confidenceDistribution.high}</span>
                    </div>
                    <Progress value={(stats.confidenceDistribution.high / (stats.confidenceDistribution.high + stats.confidenceDistribution.medium + stats.confidenceDistribution.low)) * 100} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Medium Confidence (60-85%)</span>
                      <span className="font-medium">{stats.confidenceDistribution.medium}</span>
                    </div>
                    <Progress value={(stats.confidenceDistribution.medium / (stats.confidenceDistribution.high + stats.confidenceDistribution.medium + stats.confidenceDistribution.low)) * 100} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Low Confidence (&lt;60%)</span>
                      <span className="font-medium">{stats.confidenceDistribution.low}</span>
                    </div>
                    <Progress value={(stats.confidenceDistribution.low / (stats.confidenceDistribution.high + stats.confidenceDistribution.medium + stats.confidenceDistribution.low)) * 100} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="patterns">
              <div className="space-y-4">
                <h4 className="font-medium">Time of Day Distribution</h4>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(stats.timeDistribution).map(([time, count]) => (
                    <div key={time} className="flex justify-between items-center">
                      <span className="text-sm capitalize">{time}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{count}</span>
                        <div className="w-16">
                          <Progress value={(count / Math.max(...Object.values(stats.timeDistribution))) * 100} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="degradation">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Degradation Events
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">{stats.degradationEvents.rateLimited}</div>
                    <div className="text-xs text-muted-foreground">Rate Limited</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-warning">{stats.degradationEvents.lowConfidence}</div>
                    <div className="text-xs text-muted-foreground">Low Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-secondary">{stats.degradationEvents.userOverrides}</div>
                    <div className="text-xs text-muted-foreground">User Overrides</div>
                  </div>
                </div>

                {generateRecommendations().length > 0 && (
                  <div className="mt-4">
                    <h5 className="font-medium mb-2">Recommendations</h5>
                    <ul className="space-y-1 text-sm">
                      {generateRecommendations().map((rec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}