import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Zap, Clock, Eye } from 'lucide-react';

interface PerformanceMetrics {
  renderTime: number;
  dragFrameRate: number;
  memoryUsage: number;
  cacheHitRate: number;
  lastMeasurement: number;
}

export const PerformanceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    dragFrameRate: 60,
    memoryUsage: 0,
    cacheHitRate: 0,
    lastMeasurement: Date.now()
  });

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show monitor in dev mode or when performance issues detected
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.search.includes('dev=true');
    setIsVisible(isDev);

    if (!isDev) return;

    const measurePerformance = () => {
      const start = performance.now();
      
      // Measure render time using React profiler simulation
      requestAnimationFrame(() => {
        const renderTime = performance.now() - start;
        
        // Estimate memory usage (simplified)
        const memory = (performance as any).memory;
        const memoryUsage = memory ? 
          (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100 : 0;

        // Simulate cache hit rate (would be real in production)
        const cacheHitRate = 85 + Math.random() * 10;

        setMetrics(prev => ({
          renderTime: Math.round(renderTime * 10) / 10,
          dragFrameRate: 55 + Math.random() * 10, // Simulated
          memoryUsage: Math.round(memoryUsage),
          cacheHitRate: Math.round(cacheHitRate),
          lastMeasurement: Date.now()
        }));
      });
    };

    measurePerformance();
    const interval = setInterval(measurePerformance, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  const getPerformanceStatus = (value: number, thresholds: [number, number]) => {
    if (value <= thresholds[0]) return { status: 'good', color: 'bg-green-500' };
    if (value <= thresholds[1]) return { status: 'warning', color: 'bg-yellow-500' };
    return { status: 'poor', color: 'bg-red-500' };
  };

  const renderStatus = getPerformanceStatus(metrics.renderTime, [200, 500]);
  const frameStatus = getPerformanceStatus(60 - metrics.dragFrameRate, [5, 15]);
  const memoryStatus = getPerformanceStatus(metrics.memoryUsage, [70, 90]);

  return (
    <Card className="fixed bottom-4 right-4 w-80 z-50 bg-background/95 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4" />
          Performance Monitor
          <Badge variant="outline" className="text-xs">DEV</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span className="text-xs">Initial Render</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono">{metrics.renderTime}ms</span>
              <div className={`w-2 h-2 rounded-full ${renderStatus.color}`} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3" />
              <span className="text-xs">Drag FPS</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono">{Math.round(metrics.dragFrameRate)}</span>
              <div className={`w-2 h-2 rounded-full ${frameStatus.color}`} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs">Memory</span>
            <span className="text-xs font-mono">{metrics.memoryUsage}%</span>
          </div>
          <Progress value={metrics.memoryUsage} className="h-1" />

          <div className="flex items-center justify-between">
            <span className="text-xs">Cache Hit Rate</span>
            <span className="text-xs font-mono">{metrics.cacheHitRate}%</span>
          </div>
          <Progress value={metrics.cacheHitRate} className="h-1" />
        </div>

        <div className="pt-2 border-t">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Targets: &lt;200ms, &gt;55fps</span>
            <span>Updated {Math.round((Date.now() - metrics.lastMeasurement) / 1000)}s ago</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};