/**
 * Development menu - accessible via Ctrl/Cmd+Shift+D
 * Lists all dev routes and shows system state
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Zap, Settings, TestTube } from 'lucide-react';
import { getActiveFlags, toggleFeatureFlag, type FeatureFlag } from '@/config/flags';
import { isDebugMode, enableDebugMode, disableDebugMode } from '@/devtools/devLog';

interface DevRoute {
  path: string;
  name: string;
  description: string;
}

const devRoutes: DevRoute[] = [
  {
    path: '/dev/voice',
    name: 'Realtime Voice',
    description: 'Full-duplex voice testing with latency monitoring'
  },
  {
    path: '/dev/vision',
    name: 'Vision Analysis',
    description: 'AI vision testing with photo analysis and Joy detection'
  },
  {
    path: '/dev/bubbles-basic',
    name: 'Bubbles Basic',
    description: 'Basic bubble canvas testing'
  },
  {
    path: '/dev/bubbles-stress',
    name: 'Bubbles Stress',
    description: 'Performance stress testing with many bubbles'
  },
  {
    path: '/dev/atomic-basic',
    name: 'Atomic Basic',
    description: 'Basic atomic view interactions'
  },
  {
    path: '/dev/atomic-stress',
    name: 'Atomic Stress',
    description: 'Atomic view performance testing'
  },
  {
    path: '/dev/atomic-unified',
    name: 'Atomic Unified',
    description: 'Unified atomic interactions testing'
  },
  {
    path: '/dev/photo',
    name: 'Photo Bulletproof',
    description: 'Bulletproof photo rendering tests (all scenarios)'
  },
  {
    path: '/dev/focus',
    name: 'Focus Mode',
    description: 'Task outliner and Pomodoro timer testing'
  },
  {
    path: '/dev/prioritizer',
    name: 'Prioritizer',
    description: 'Intelligent priority scoring and suggestions'
  }
];

interface DevMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DevMenu({ isOpen, onClose }: DevMenuProps) {
  const [flags, setFlags] = useState(getActiveFlags());
  const [debugMode, setDebugMode] = useState(isDebugMode());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fps, setFps] = useState(0);

  // Monitor reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Monitor FPS
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };

    if (isOpen) {
      animationId = requestAnimationFrame(measureFPS);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isOpen]);

  // Listen for flag changes
  useEffect(() => {
    const handleFlagChange = () => setFlags(getActiveFlags());
    window.addEventListener('featureFlagChanged', handleFlagChange);
    window.addEventListener('featureFlagsCleared', handleFlagChange);
    
    return () => {
      window.removeEventListener('featureFlagChanged', handleFlagChange);
      window.removeEventListener('featureFlagsCleared', handleFlagChange);
    };
  }, []);

  const handleToggleFlag = (flag: FeatureFlag) => {
    const newValue = !flags[flag];
    toggleFeatureFlag(flag, newValue);
    setFlags(prev => ({ ...prev, [flag]: newValue }));
  };

  const handleToggleDebug = () => {
    if (debugMode) {
      disableDebugMode();
    } else {
      enableDebugMode();
    }
    setDebugMode(!debugMode);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            <CardTitle>Development Menu</CardTitle>
            <Badge variant="outline">Ctrl/Cmd+Shift+D</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* System Status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-mono">{fps}</div>
              <div className="text-xs text-muted-foreground">FPS</div>
            </div>
            <div className="text-center">
              <Badge variant={reducedMotion ? "destructive" : "secondary"}>
                {reducedMotion ? "Reduced" : "Normal"}
              </Badge>
              <div className="text-xs text-muted-foreground">Motion</div>
            </div>
            <div className="text-center">
              <Badge variant={debugMode ? "default" : "outline"}>
                {debugMode ? "ON" : "OFF"}
              </Badge>
              <div className="text-xs text-muted-foreground">Debug</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-mono">
                {Object.values(flags).filter(Boolean).length}
              </div>
              <div className="text-xs text-muted-foreground">Flags Active</div>
            </div>
          </div>

          {/* Dev Routes */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Dev Routes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {devRoutes.map((route) => (
                <Link
                  key={route.path}
                  to={route.path}
                  className="block p-3 rounded border hover:bg-accent transition-colors"
                  onClick={onClose}
                >
                  <div className="font-medium">{route.name}</div>
                  <div className="text-sm text-muted-foreground">{route.description}</div>
                  <div className="text-xs text-muted-foreground mt-1">{route.path}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Feature Flags */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Feature Flags
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(flags).map(([flag, enabled]) => (
                <div key={flag} className="flex items-center justify-between p-2 rounded border">
                  <span className="text-sm font-mono">{flag}</span>
                  <Button
                    variant={enabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleToggleFlag(flag as FeatureFlag)}
                  >
                    {enabled ? "ON" : "OFF"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Debug Controls */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Debug Controls</h3>
            <div className="flex gap-2">
              <Button
                variant={debugMode ? "default" : "outline"}
                onClick={handleToggleDebug}
              >
                {debugMode ? "Disable" : "Enable"} Debug Logging
              </Button>
              <Link to="/" onClick={onClose}>
                <Button variant="outline">Back to App</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}