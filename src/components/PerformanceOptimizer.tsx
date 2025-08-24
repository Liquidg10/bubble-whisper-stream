import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Gauge, 
  Clock, 
  MemoryStick, 
  Zap, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  searchLatency: number;
  batteryImpact: number;
  syncLatency: number;
  renderTime: number;
}

interface PerformanceTargets {
  fps: { min: 55, target: 60 };
  memoryUsage: { max: 300, target: 250 }; // MB
  searchLatency: { max: 400, target: 200 }; // ms
  batteryImpact: { max: 3, target: 2 }; // %/hour
}

export function PerformanceOptimizer() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memoryUsage: 245,
    searchLatency: 180,
    batteryImpact: 2.1,
    syncLatency: 120,
    renderTime: 16.7
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const targets: PerformanceTargets = {
    fps: { min: 55, target: 60 },
    memoryUsage: { max: 300, target: 250 },
    searchLatency: { max: 400, target: 200 },
    batteryImpact: { max: 3, target: 2 }
  };

  useEffect(() => {
    // Monitor performance in real-time
    const interval = setInterval(() => {
      // Simulate real performance monitoring
      setMetrics(prev => ({
        ...prev,
        fps: 58 + Math.random() * 4,
        memoryUsage: 240 + Math.random() * 20,
        searchLatency: 150 + Math.random() * 100,
        batteryImpact: 1.8 + Math.random() * 0.6,
        syncLatency: 100 + Math.random() * 50,
        renderTime: 15 + Math.random() * 5
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (value: number, target: any) => {
    if (target.min && value < target.min) return 'destructive';
    if (target.max && value > target.max) return 'destructive';
    if (target.target && Math.abs(value - target.target) / target.target < 0.1) return 'success';
    return 'warning';
  };

  const getStatusIcon = (value: number, target: any) => {
    const status = getStatusColor(value, target);
    if (status === 'success') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === 'destructive') return <AlertTriangle className="h-4 w-4 text-red-500" />;
    return <TrendingUp className="h-4 w-4 text-yellow-500" />;
  };

  const optimizePerformance = async () => {
    setIsOptimizing(true);
    
    // Simulate optimization process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Apply optimizations
    setMetrics(prev => ({
      ...prev,
      fps: Math.min(60, prev.fps + 2),
      memoryUsage: Math.max(200, prev.memoryUsage - 20),
      searchLatency: Math.max(150, prev.searchLatency - 30),
      batteryImpact: Math.max(1.5, prev.batteryImpact - 0.3)
    }));
    
    setIsOptimizing(false);
  };

  return (
    <div className="space-y-6">
      {/* Overall Performance Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Performance Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-green-600">94</div>
            <div className="flex-1">
              <Progress value={94} className="h-2" />
              <div className="text-xs text-muted-foreground mt-1">
                Excellent performance - all targets met
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* FPS */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {getStatusIcon(metrics.fps, targets.fps)}
              Frame Rate (FPS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.fps.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">
              Target: ≥{targets.fps.min} fps
            </div>
            <Progress 
              value={(metrics.fps / 60) * 100} 
              className="h-1 mt-2"
            />
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {getStatusIcon(metrics.memoryUsage, targets.memoryUsage)}
              Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.memoryUsage.toFixed(0)} MB</div>
            <div className="text-xs text-muted-foreground">
              Target: ≤{targets.memoryUsage.max} MB
            </div>
            <Progress 
              value={(metrics.memoryUsage / targets.memoryUsage.max) * 100} 
              className="h-1 mt-2"
            />
          </CardContent>
        </Card>

        {/* Search Latency */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {getStatusIcon(metrics.searchLatency, targets.searchLatency)}
              Search Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.searchLatency.toFixed(0)} ms</div>
            <div className="text-xs text-muted-foreground">
              Target: ≤{targets.searchLatency.max} ms
            </div>
            <Progress 
              value={Math.max(0, (targets.searchLatency.max - metrics.searchLatency) / targets.searchLatency.max * 100)} 
              className="h-1 mt-2"
            />
          </CardContent>
        </Card>

        {/* Battery Impact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {getStatusIcon(metrics.batteryImpact, targets.batteryImpact)}
              Battery Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.batteryImpact.toFixed(1)}%/h</div>
            <div className="text-xs text-muted-foreground">
              Target: ≤{targets.batteryImpact.max}%/hour
            </div>
            <Progress 
              value={Math.max(0, (targets.batteryImpact.max - metrics.batteryImpact) / targets.batteryImpact.max * 100)} 
              className="h-1 mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Advanced Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Advanced Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sync Latency:</span>
              <span>{metrics.syncLatency.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Render Time:</span>
              <span>{metrics.renderTime.toFixed(1)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Canvas FPS:</span>
              <span>{(metrics.fps - 2).toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI Response:</span>
              <span>1.2s</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optimization Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Performance Optimization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All performance targets are currently being met. The app is running optimally.
              </AlertDescription>
            </Alert>
            
            <button
              onClick={optimizePerformance}
              disabled={isOptimizing}
              className="w-full p-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
            >
              {isOptimizing ? 'Optimizing...' : 'Run Performance Optimization'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}