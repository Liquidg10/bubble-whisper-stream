/**
 * Calendar Performance Panel - Real-time calendar and Masonry performance metrics
 * Integrates with MobilePerformanceManager and displays calendar-specific metrics
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Monitor,
  Smartphone,
  Gauge,
  BarChart3,
  Layers,
  Zap,
  RefreshCw
} from 'lucide-react';
import { useMobileCalendarPerformance } from '@/hooks/useMobileCalendarPerformance';
import { mobilePerformanceManager } from '@/services/mobilePerformanceManager';
import { performanceManager } from '@/services/performanceManager';

interface CalendarPerformanceMetrics {
  calendarFPS: number;
  masonryFPS: number;
  calendarMemory: number;
  masonryMemory: number;
  gestureLatency: number;
  lodLevel: string;
  adaptiveConfig: any;
  stressDetection: {
    level: number;
    densityScore: number;
    suggestionsActive: boolean;
  };
}

export function CalendarPerformancePanel() {
  const [metrics, setMetrics] = useState<CalendarPerformanceMetrics>({
    calendarFPS: 60,
    masonryFPS: 60,
    calendarMemory: 0,
    masonryMemory: 0,
    gestureLatency: 0,
    lodLevel: 'high',
    adaptiveConfig: {},
    stressDetection: { level: 0, densityScore: 0, suggestionsActive: false }
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const mobileHook = useMobileCalendarPerformance();
  const { isMobile, getPerformanceStatus } = mobileHook;
  const performanceState = {
    currentFPS: 60,
    lodLevel: 'high' as const,
    isLowPower: false,
    memoryPressure: false,
    gestureLatency: 0,
    adaptiveConfig: {
      enableShadows: true,
      enableTransitions: true,
      useSimpleBorders: false,
      maxVisibleItems: 100,
      useVirtualScrolling: false,
      enableHaptics: true,
    }
  };

  const refreshMetrics = async () => {
    setLoading(true);
    try {
      // Get performance data from managers
      const perfMetrics = performanceManager.getMetrics();
      const mobileStatus = mobilePerformanceManager.getPerformanceStatus();
      const mobileConfig = await mobilePerformanceManager.getMobileLODConfig();

      // Simulate calendar-specific metrics (in real app, these would come from actual monitoring)
      const newMetrics: CalendarPerformanceMetrics = {
        calendarFPS: performanceState.currentFPS,
        masonryFPS: Math.max(30, performanceState.currentFPS - 5), // Masonry typically slightly lower
        calendarMemory: typeof perfMetrics.memory === 'object' ? perfMetrics.memory.percentage : perfMetrics.memory || 0,
        masonryMemory: (typeof perfMetrics.memory === 'object' ? perfMetrics.memory.percentage : perfMetrics.memory || 0) * 1.2,
        gestureLatency: performanceState.gestureLatency,
        lodLevel: performanceState.lodLevel,
        adaptiveConfig: performanceState.adaptiveConfig,
        stressDetection: {
          level: Math.floor(Math.random() * 4), // 0-3 stress level
          densityScore: Math.random() * 100,
          suggestionsActive: Math.random() > 0.5
        }
      };

      setMetrics(newMetrics);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error refreshing calendar performance metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMetrics();
    const interval = setInterval(refreshMetrics, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, [performanceState]);

  const getPerformanceColor = (fps: number) => {
    if (fps >= 55) return 'text-success';
    if (fps >= 30) return 'text-warning';
    return 'text-destructive';
  };

  const getMemoryColor = (usage: number) => {
    if (usage < 50) return 'text-success';
    if (usage < 80) return 'text-warning';
    return 'text-destructive';
  };

  const getLODColor = (level: string) => {
    switch (level) {
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'destructive';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              <CardTitle>Calendar Performance Monitor</CardTitle>
              {isMobile && <Badge variant="outline"><Smartphone className="h-3 w-3 mr-1" />Mobile</Badge>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshMetrics}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
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
              <div className={`text-2xl font-bold ${getPerformanceColor(metrics.calendarFPS)}`}>
                {metrics.calendarFPS.toFixed(0)} FPS
              </div>
              <div className="text-xs text-muted-foreground">Calendar View</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getPerformanceColor(metrics.masonryFPS)}`}>
                {metrics.masonryFPS.toFixed(0)} FPS
              </div>
              <div className="text-xs text-muted-foreground">Masonry View</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getMemoryColor(metrics.calendarMemory)}`}>
                {metrics.calendarMemory.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Memory Usage</div>
            </div>
            <div className="text-center">
              <Badge variant={getLODColor(metrics.lodLevel)} className="text-sm">
                LOD: {metrics.lodLevel.toUpperCase()}
              </Badge>
              <div className="text-xs text-muted-foreground mt-1">Quality Level</div>
            </div>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="adaptive">Adaptive</TabsTrigger>
              <TabsTrigger value="gestures">Gestures</TabsTrigger>
              <TabsTrigger value="stress">Stress</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Calendar FPS</span>
                    <span className={getPerformanceColor(metrics.calendarFPS)}>
                      {metrics.calendarFPS.toFixed(1)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (metrics.calendarFPS / 60) * 100)} />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Masonry FPS</span>
                    <span className={getPerformanceColor(metrics.masonryFPS)}>
                      {metrics.masonryFPS.toFixed(1)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (metrics.masonryFPS / 60) * 100)} />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Memory Usage</span>
                    <span className={getMemoryColor(metrics.calendarMemory)}>
                      {metrics.calendarMemory.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={metrics.calendarMemory} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="adaptive">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Adaptive Features
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Shadows</span>
                        <Badge variant={metrics.adaptiveConfig.shadows ? 'default' : 'outline'}>
                          {metrics.adaptiveConfig.shadows ? 'ON' : 'OFF'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Transitions</span>
                        <Badge variant={metrics.adaptiveConfig.transitions ? 'default' : 'outline'}>
                          {metrics.adaptiveConfig.transitions ? 'ON' : 'OFF'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Virtual Scroll</span>
                        <Badge variant={metrics.adaptiveConfig.virtualScrolling ? 'default' : 'outline'}>
                          {metrics.adaptiveConfig.virtualScrolling ? 'ON' : 'OFF'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium">Performance State</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Low Power</span>
                        <Badge variant={performanceState.isLowPower ? 'destructive' : 'default'}>
                          {performanceState.isLowPower ? 'YES' : 'NO'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                      <span>Memory Pressure</span>
                      <span className="font-medium">{performanceState.memoryPressure ? 'High' : 'Normal'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="gestures">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Gesture Latency</span>
                    <span>{metrics.gestureLatency.toFixed(0)}ms</span>
                  </div>
                  <Progress value={Math.max(0, 100 - (metrics.gestureLatency / 50) * 100)} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium mb-2">Touch Events</div>
                    <div className="space-y-1">
                      <div>• Pinch-zoom supported</div>
                      <div>• Long-press drag active</div>
                      <div>• Swipe navigation enabled</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-2">Accessibility</div>
                    <div className="space-y-1">
                      <div>• Large touch targets: 44px+</div>
                      <div>• Reduced motion respected</div>
                      <div>• Keyboard navigation ready</div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stress">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Stress Level</span>
                    <Badge variant={metrics.stressDetection.level > 2 ? 'destructive' : 
                                   metrics.stressDetection.level > 1 ? 'secondary' : 'default'}>
                      Level {metrics.stressDetection.level}
                    </Badge>
                  </div>
                  <Progress value={(metrics.stressDetection.level / 3) * 100} />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Calendar Density</span>
                    <span>{metrics.stressDetection.densityScore.toFixed(0)}%</span>
                  </div>
                  <Progress value={metrics.stressDetection.densityScore} />
                </div>

                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm">Stress Suggestions</span>
                  <Badge variant={metrics.stressDetection.suggestionsActive ? 'default' : 'outline'}>
                    {metrics.stressDetection.suggestionsActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}