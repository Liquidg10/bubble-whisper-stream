/**
 * Performance Monitor Component
 * Shows real-time FPS and LOD information for debugging
 */

import React, { useState, useEffect } from 'react';
import { useLODSystem } from '@/hooks/useLODSystem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Monitor, Zap, ZapOff } from 'lucide-react';

interface PerformanceMonitorProps {
  show?: boolean;
  className?: string;
}

export function PerformanceMonitor({ show = false, className }: PerformanceMonitorProps) {
  const { getLODConfig, getCurrentLODLevel, getPerformanceMetrics } = useLODSystem();
  const [metrics, setMetrics] = useState(getPerformanceMetrics());
  const [lodConfig, setLodConfig] = useState(getLODConfig());
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!show) return;

    const interval = setInterval(() => {
      setMetrics(getPerformanceMetrics());
      setLodConfig(getLODConfig());
    }, 100); // Update 10x per second

    return () => clearInterval(interval);
  }, [show, getLODConfig, getPerformanceMetrics]);

  if (!show) return null;

  const lodLevel = getCurrentLODLevel();
  const fpsColor = metrics.averageFPS >= 55 ? 'success' : 
                  metrics.averageFPS >= 45 ? 'warning' : 'destructive';

  return (
    <div className={`fixed top-4 right-4 z-50 space-y-2 ${className}`}>
      <div className="bg-card/95 backdrop-blur-sm border rounded-lg p-3 text-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">Performance</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Monitor className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={fpsColor as any} className="text-xs">
            {Math.round(metrics.averageFPS)} FPS
          </Badge>
          <Badge variant="outline" className="text-xs uppercase">
            {lodLevel}
          </Badge>
        </div>

        {metrics.isDragging && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ZapOff className="h-3 w-3" />
            Dragging ({metrics.dragCount})
          </div>
        )}

        {metrics.isMultiSelecting && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ZapOff className="h-3 w-3" />
            Multi-select
          </div>
        )}

        {isExpanded && (
          <div className="mt-3 pt-2 border-t space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>Specular: {lodConfig.enableSpecular ? '✓' : '✗'}</div>
              <div>Refraction: {lodConfig.enableRefraction ? '✓' : '✗'}</div>
              <div>Parallax: {lodConfig.enableParallax ? '✓' : '✗'}</div>
              <div>Glow: {lodConfig.enableGlow ? '✓' : '✗'}</div>
              <div>Blur: {lodConfig.enableBlur ? '✓' : '✗'}</div>
              <div>Float: {lodConfig.enableFloatAnimation ? '✓' : '✗'}</div>
            </div>
            <div className="text-muted-foreground">
              Max bubbles: {lodConfig.maxVisibleBubbles}
            </div>
            <div className="text-muted-foreground">
              Device: {metrics.isLowPerformanceDevice ? 'Low-end' : 'High-end'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}