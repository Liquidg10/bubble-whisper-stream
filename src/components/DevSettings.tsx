import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFeatureFlags } from '@/components/FeatureFlags';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Cog, Eye, EyeOff, Zap, Activity, Layers } from 'lucide-react';

export function DevSettings() {
  const { flags, updateFlag } = useFeatureFlags();
  const { settings, updateSettings } = useBubbleStore();

  const handleMotionToggle = (enabled: boolean) => {
    updateSettings({ reducedMotion: !enabled });
  };

  const handleLODToggle = (enabled: boolean) => {
    updateFlag('performanceMonitoringEnabled', enabled);
  };

  const handleOverlaysToggle = (enabled: boolean) => {
    updateFlag('debugMode', enabled);
  };

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Cog className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Dev Settings</h1>
        <Badge variant="secondary">Development</Badge>
      </div>

      {/* Motion & Animation Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Motion & Animation
          </CardTitle>
          <CardDescription>
            Control animation systems across both bubble and atomic views
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Motion Enabled</label>
              <p className="text-xs text-muted-foreground">
                Enable/disable all animations and motion
              </p>
            </div>
            <Switch
              checked={!settings.reducedMotion}
              onCheckedChange={handleMotionToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Performance & LOD */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance & LOD
          </CardTitle>
          <CardDescription>
            Level of Detail and performance monitoring controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Performance Monitoring</label>
              <p className="text-xs text-muted-foreground">
                Show FPS counter and performance metrics
              </p>
            </div>
            <Switch
              checked={flags.performanceMonitoringEnabled}
              onCheckedChange={handleLODToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Debug & Overlays */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Debug & Overlays
          </CardTitle>
          <CardDescription>
            Debug panels, console logs, and development overlays
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Debug Mode</label>
              <p className="text-xs text-muted-foreground">
                Show debug panels and development tools
              </p>
            </div>
            <Switch
              checked={flags.debugMode}
              onCheckedChange={handleOverlaysToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Toggle experimental and optional features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(flags).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium capitalize">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </label>
                <p className="text-xs text-muted-foreground">
                  {key === 'cbtEnabled' && 'Cognitive Behavioral Therapy features'}
                  {key === 'glimmersEnabled' && 'Positive moment notifications'}
                  {key === 'adaptiveRemindersEnabled' && 'Smart reminder adjustments'}
                  {key === 'performanceMonitoringEnabled' && 'FPS and performance tracking'}
                  {key === 'debugMode' && 'Development and debug tools'}
                </p>
              </div>
              <Switch
                checked={value}
                onCheckedChange={(checked) => updateFlag(key as keyof typeof flags, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common development tasks and resets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button 
              variant="outline"
              onClick={() => localStorage.clear()}
            >
              Clear LocalStorage
            </Button>
            <Button 
              variant="outline"
              onClick={() => location.reload()}
            >
              Reload App
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}