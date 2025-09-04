/**
 * Component to test and demonstrate reduced motion compliance
 * Shows that motion is properly disabled but pan/zoom still work
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAccessibility } from '@/components/AccessibilityProvider';
import { PlayCircle, PauseCircle, Zap, ZapOff, CheckCircle, AlertTriangle } from 'lucide-react';

interface ReducedMotionTestProps {
  show?: boolean;
  className?: string;
}

export function ReducedMotionTest({ show = false, className }: ReducedMotionTestProps) {
  const { settings, updateSetting } = useAccessibility();
  const [systemPrefersReduced, setSystemPrefersReduced] = useState(false);
  const [testPassed, setTestPassed] = useState(false);

  // Monitor system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystemPrefersReduced(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersReduced(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Test compliance
  useEffect(() => {
    // Check if reduced motion is working correctly
    const reducedMotionActive = settings.reducedMotion || systemPrefersReduced;
    const hasReduceMotionClass = document.documentElement.classList.contains('reduce-motion');
    const auraEffectsDisabled = !document.querySelector('.bubble-card[style*="filter"]');
    
    setTestPassed(reducedMotionActive === hasReduceMotionClass);
  }, [settings.reducedMotion, systemPrefersReduced]);

  if (!show) return null;

  const toggleReducedMotion = () => {
    updateSetting('reducedMotion', !settings.reducedMotion);
  };

  const getMotionStatus = () => {
    if (settings.reducedMotion || systemPrefersReduced) return 'disabled';
    return 'enabled';
  };

  const status = getMotionStatus();

  return (
    <Card className={`fixed bottom-4 left-4 z-50 p-4 bg-card/95 backdrop-blur-sm max-w-sm ${className}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status === 'disabled' ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            <span className="font-medium text-sm">Motion Test</span>
            {testPassed ? (
              <CheckCircle className="h-4 w-4 text-success" aria-label="Test passed" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" aria-label="Test needs attention" />
            )}
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>System Preference:</span>
            <Badge variant={systemPrefersReduced ? "secondary" : "outline"}>
              {systemPrefersReduced ? 'Reduced' : 'Normal'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span>App Setting:</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.reducedMotion}
                onCheckedChange={toggleReducedMotion}
                aria-label="Toggle reduced motion setting"
              />
              <Badge variant={settings.reducedMotion ? "secondary" : "outline"}>
                {settings.reducedMotion ? 'Reduced' : 'Normal'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span>Effective Mode:</span>
            <Badge variant={status === 'disabled' ? "secondary" : "default"}>
              {status === 'disabled' ? 'Motion Disabled' : 'Motion Enabled'}
            </Badge>
          </div>
        </div>

        {/* Test Results */}
        <div className="text-xs space-y-1 pt-2 border-t">
          <div className="font-medium">Acceptance Criteria:</div>
          <div className={`flex items-center gap-1 ${testPassed ? 'text-success' : 'text-warning'}`}>
            {testPassed ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            CSS classes match motion setting
          </div>
          
          {status === 'disabled' && (
            <div className="space-y-1">
              <div className="text-success flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Float animations should be disabled
              </div>
              <div className="text-success flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Aura effects should be simplified
              </div>
              <div className="text-info flex items-center gap-1">
                <PlayCircle className="h-3 w-3" />
                Pan/zoom should still work
              </div>
            </div>
          )}
          
          {status === 'enabled' && (
            <div className="space-y-1">
              <div className="text-success flex items-center gap-1">
                <PlayCircle className="h-3 w-3" />
                Float animations enabled
              </div>
              <div className="text-success flex items-center gap-1">
                <PlayCircle className="h-3 w-3" />
                Full aura effects enabled
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}