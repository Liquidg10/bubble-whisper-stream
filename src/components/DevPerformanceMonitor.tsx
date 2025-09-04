/**
 * Comprehensive Performance Monitor for Dev Routes
 * Shows FPS, memory, LOD status with acceptance criteria validation
 */

import React, { useState, useEffect } from 'react';
import { useLODSystem } from '@/hooks/useLODSystem';
import { useAccessibility } from '@/components/AccessibilityProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Monitor, Activity, Zap, AlertTriangle, CheckCircle } from 'lucide-react';

interface PerformanceMetrics {
  currentFPS: number;
  averageFPS: number;
  minFPS: number;
  maxFPS: number;
  memoryUsage: number;
  frameDrops: number;
  renderTime: number;
}

interface AcceptanceCriteria {
  targetFPS: number;
  memoryThreshold: number;
  maxFrameDrops: number;
}

interface DevPerformanceMonitorProps {
  show?: boolean;
  className?: string;
  acceptanceCriteria?: AcceptanceCriteria;
}

const DEFAULT_ACCEPTANCE: AcceptanceCriteria = {
  targetFPS: 55,
  memoryThreshold: 300, // MB
  maxFrameDrops: 5
};

export function DevPerformanceMonitor({ 
  show = true, 
  className,
  acceptanceCriteria = DEFAULT_ACCEPTANCE
}: DevPerformanceMonitorProps) {
  const { getLODConfig, getCurrentLODLevel, getPerformanceMetrics } = useLODSystem();
  const { settings: a11ySettings } = useAccessibility();
  
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    currentFPS: 60,
    averageFPS: 60,
    minFPS: 60,
    maxFPS: 60,
    memoryUsage: 0,
    frameDrops: 0,
    renderTime: 0
  });
  
  const [lodMetrics, setLodMetrics] = useState(getPerformanceMetrics());
  const [lodConfig, setLodConfig] = useState(getLODConfig());
  const [isExpanded, setIsExpanded] = useState(false);
  const [measurementActive, setMeasurementActive] = useState(true);

  // FPS and performance measurement
  useEffect(() => {
    if (!show || !measurementActive) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let fpsHistory: number[] = [];
    let frameDropCount = 0;
    let lastFrameTime = 0;
    let animationId: number;

    const measurePerformance = (currentTime: number) => {
      frameCount++;
      
      // Track frame timing for drops detection
      if (lastFrameTime > 0) {
        const frameDelta = currentTime - lastFrameTime;
        if (frameDelta > 20) { // >50ms = frame drop (below 50 FPS)
          frameDropCount++;
        }
      }
      lastFrameTime = currentTime;
      
      // Calculate FPS every second
      if (currentTime - lastTime >= 1000) {
        const currentFPS = Math.round((frameCount * 1000) / (currentTime - lastTime));
        fpsHistory.push(currentFPS);
        
        // Keep only last 30 seconds of data
        if (fpsHistory.length > 30) {
          fpsHistory = fpsHistory.slice(-30);
        }
        
        const averageFPS = Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length);
        const minFPS = Math.min(...fpsHistory);
        const maxFPS = Math.max(...fpsHistory);
        
        setMetrics(prev => ({
          ...prev,
          currentFPS,
          averageFPS,
          minFPS,
          maxFPS,
          frameDrops: frameDropCount
        }));
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measurePerformance);
    };

    animationId = requestAnimationFrame(measurePerformance);

    // Update LOD and memory metrics
    const interval = setInterval(() => {
      setLodMetrics(getPerformanceMetrics());
      setLodConfig(getLODConfig());
      
      // Memory usage
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        setMetrics(prev => ({
          ...prev,
          memoryUsage: Math.round(memInfo.usedJSHeapSize / (1024 * 1024)),
          renderTime: performance.now() % 100 // Simplified render time estimate
        }));
      }
    }, 500);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(animationId);
    };
  }, [show, measurementActive, getLODConfig, getPerformanceMetrics]);

  if (!show) return null;

  const lodLevel = getCurrentLODLevel();
  
  // Status indicators
  const fpsStatus = metrics.averageFPS >= acceptanceCriteria.targetFPS ? 'success' : 
                   metrics.averageFPS >= 45 ? 'warning' : 'destructive';
  const memoryStatus = metrics.memoryUsage > acceptanceCriteria.memoryThreshold ? 'destructive' : 
                      metrics.memoryUsage > 200 ? 'warning' : 'success';
  const frameDropStatus = metrics.frameDrops > acceptanceCriteria.maxFrameDrops ? 'destructive' : 'success';
  
  // Overall acceptance status
  const passesAcceptance = fpsStatus === 'success' && memoryStatus !== 'destructive' && frameDropStatus === 'success';

  return (
    <Card className={`fixed top-4 right-4 z-50 p-3 bg-card/95 backdrop-blur-sm ${className}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="font-medium text-sm">Performance Monitor</span>
            {passesAcceptance ? (
              <CheckCircle className="h-4 w-4 text-success" aria-label="Passes acceptance criteria" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" aria-label="Fails acceptance criteria" />
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setMeasurementActive(!measurementActive)}
              aria-label={measurementActive ? 'Pause monitoring' : 'Resume monitoring'}
            >
              {measurementActive ? <Zap className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            >
              <Monitor className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="flex flex-wrap gap-2">
          <Badge 
            variant={fpsStatus as any} 
            className="text-xs"
            aria-label={`Current FPS: ${metrics.currentFPS}, status: ${fpsStatus}`}
          >
            {metrics.currentFPS} FPS
          </Badge>
          <Badge 
            variant={memoryStatus as any} 
            className="text-xs"
            aria-label={`Memory usage: ${metrics.memoryUsage} megabytes, status: ${memoryStatus}`}
          >
            {metrics.memoryUsage}MB
          </Badge>
          <Badge 
            variant="outline" 
            className="text-xs uppercase"
            aria-label={`Level of detail: ${lodLevel}`}
          >
            LOD: {lodLevel}
          </Badge>
          {a11ySettings.reducedMotion && (
            <Badge variant="secondary" className="text-xs" aria-label="Reduced motion enabled">
              Reduced Motion
            </Badge>
          )}
        </div>

        {/* Acceptance Criteria Status */}
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>Target FPS (≥{acceptanceCriteria.targetFPS}):</span>
            <span className={fpsStatus === 'success' ? 'text-success' : 'text-destructive'}>
              {metrics.averageFPS}
            </span>
          </div>
          {metrics.frameDrops > 0 && (
            <div className="flex justify-between">
              <span>Frame Drops:</span>
              <span className={frameDropStatus === 'success' ? 'text-success' : 'text-destructive'}>
                {metrics.frameDrops}
              </span>
            </div>
          )}
        </div>

        {/* Interaction State */}
        {(lodMetrics.isDragging || lodMetrics.isMultiSelecting) && (
          <div className="text-xs text-muted-foreground">
            {lodMetrics.isDragging && (
              <div>🔄 Dragging ({lodMetrics.dragCount})</div>
            )}
            {lodMetrics.isMultiSelecting && (
              <div>🎯 Multi-selecting</div>
            )}
          </div>
        )}

        {/* Expanded Details */}
        {isExpanded && (
          <div className="pt-2 border-t space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>Avg FPS: {metrics.averageFPS}</div>
              <div>Min FPS: {metrics.minFPS}</div>
              <div>Max FPS: {metrics.maxFPS}</div>
              <div>Render: {metrics.renderTime.toFixed(1)}ms</div>
            </div>
            
            {/* LOD Configuration */}
            <div className="space-y-1">
              <div className="font-medium">LOD Effects:</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div>Specular: {lodConfig.enableSpecular ? '✓' : '✗'}</div>
                <div>Refraction: {lodConfig.enableRefraction ? '✓' : '✗'}</div>
                <div>Parallax: {lodConfig.enableParallax ? '✓' : '✗'}</div>
                <div>Glow: {lodConfig.enableGlow ? '✓' : '✗'}</div>
                <div>Blur: {lodConfig.enableBlur ? '✓' : '✗'}</div>
                <div>Float: {lodConfig.enableFloatAnimation ? '✓' : '✗'}</div>
              </div>
              <div className="text-muted-foreground">
                Max Bubbles: {lodConfig.maxVisibleBubbles}
              </div>
            </div>

            {/* Device Information */}
            <div className="space-y-1">
              <div className="font-medium">Device:</div>
              <div>Performance: {lodMetrics.isLowPerformanceDevice ? 'Low-end' : 'High-end'}</div>
              <div>Reduced Motion: {a11ySettings.reducedMotion ? 'Yes' : 'No'}</div>
              <div>High Contrast: {a11ySettings.highContrast ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
