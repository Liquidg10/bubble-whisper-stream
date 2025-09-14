/**
 * Phase 4: /dev/perf overlay
 * Live performance metrics overlay for development
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Monitor, Cpu, Zap, Eye, EyeOff } from 'lucide-react';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  target: number;
}

interface RenderMetric {
  component: string;
  renderTime: number;
  rerenderCount: number;
  lastRender: number;
}

export function PerfOverlay() {
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [renderMetrics, setRenderMetrics] = useState<RenderMetric[]>([]);
  const [fps, setFps] = useState(60);

  useEffect(() => {
    // FPS monitoring
    let lastTime = performance.now();
    let frameCount = 0;

    const measureFps = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        setFps(Math.round(frameCount * 1000 / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFps);
    };

    const rafId = requestAnimationFrame(measureFps);

    // Performance metrics monitoring
    const metricsInterval = setInterval(() => {
      const memoryInfo = (performance as any).memory;
      
      const newMetrics: PerformanceMetric[] = [
        {
          name: 'FPS',
          value: fps,
          unit: 'fps',
          status: fps >= 55 ? 'good' : fps >= 30 ? 'warning' : 'critical',
          target: 60
        },
        {
          name: 'Heap Used',
          value: memoryInfo ? Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024) : 0,
          unit: 'MB',
          status: memoryInfo?.usedJSHeapSize < 50 * 1024 * 1024 ? 'good' : 'warning',
          target: 50
        },
        {
          name: 'Heap Total',
          value: memoryInfo ? Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024) : 0,
          unit: 'MB',
          status: memoryInfo?.totalJSHeapSize < 100 * 1024 * 1024 ? 'good' : 'warning',
          target: 100
        },
        {
          name: 'DOM Nodes',
          value: document.querySelectorAll('*').length,
          unit: 'nodes',
          status: document.querySelectorAll('*').length < 1000 ? 'good' : 'warning',
          target: 1000
        }
      ];

      setMetrics(newMetrics);

      // Simulate component render tracking
      const simulatedRenders: RenderMetric[] = [
        {
          component: 'BubbleView',
          renderTime: Math.random() * 16 + 2,
          rerenderCount: Math.floor(Math.random() * 5),
          lastRender: Date.now()
        },
        {
          component: 'TaskCard',
          renderTime: Math.random() * 8 + 1,
          rerenderCount: Math.floor(Math.random() * 3),
          lastRender: Date.now()
        },
        {
          component: 'ListView',
          renderTime: Math.random() * 12 + 3,
          rerenderCount: Math.floor(Math.random() * 4),
          lastRender: Date.now()
        }
      ];

      setRenderMetrics(simulatedRenders);
    }, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(metricsInterval);
    };
  }, [fps]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'good': return 'default';
      case 'warning': return 'secondary';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-80">
      <Card className="bg-background/95 backdrop-blur-sm border-muted">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Monitor className="h-4 w-4" />
              Performance Monitor
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Switch
                checked={isVisible}
                onCheckedChange={setIsVisible}
              />
            </div>
          </div>
        </CardHeader>
        
        {!isMinimized && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">System Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                {metrics.map((metric) => (
                  <div key={metric.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">{metric.name}</span>
                      <Badge variant={getStatusVariant(metric.status)} className="text-xs">
                        {metric.value}{metric.unit}
                      </Badge>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          metric.status === 'good' ? 'bg-green-500' :
                          metric.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ 
                          width: `${Math.min(100, (metric.value / metric.target) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Component Renders</div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {renderMetrics.map((render) => (
                  <div key={render.component} className="flex items-center justify-between text-xs">
                    <span>{render.component}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {render.renderTime.toFixed(1)}ms
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {render.rerenderCount}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Target: ≥60 FPS, ≤16ms render</span>
                <Badge variant={fps >= 55 ? "default" : "destructive"} className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  {fps} FPS
                </Badge>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}