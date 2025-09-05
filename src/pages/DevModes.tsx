/**
 * Dev Page for Ambient Modes
 * Toggle modes and see policy deltas
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ambientModeService, AMBIENT_MODES, AmbientMode, AmbientModeConfig } from '@/services/ambientModeService';
import { Separator } from '@/components/ui/separator';

export default function DevModes() {
  const [currentMode, setCurrentMode] = useState<AmbientMode>(ambientModeService.getCurrentMode());
  const [inferenceEnabled, setInferenceEnabled] = useState(ambientModeService.isInferenceEnabled());
  const [sampleTexts, setSampleTexts] = useState({
    reminder: "You need to complete your task deadline today",
    cbt: "This thought might be wrong. Let's challenge it.",
    notification: "Important! New message received!",
    general: "You failed to save. Please try again."
  });

  useEffect(() => {
    const unsubscribe = ambientModeService.subscribe((mode) => {
      setCurrentMode(mode);
    });

    return unsubscribe;
  }, []);

  const handleModeChange = (mode: AmbientMode) => {
    ambientModeService.setMode(mode);
  };

  const handleInferenceToggle = (enabled: boolean) => {
    ambientModeService.toggleInference(enabled);
    setInferenceEnabled(enabled);
  };

  const testInference = () => {
    // Simulate patterns for testing
    const testPatterns = [
      { name: 'High Stress', data: { stressLevel: 8, activityLevel: 3, recentSnoozes: 4 } },
      { name: 'Work Focus', data: { stressLevel: 3, activityLevel: 8, timeOfDay: 10 } },
      { name: 'Low Energy', data: { stressLevel: 6, activityLevel: 1, recentSnoozes: 2 } },
    ];

    testPatterns.forEach(pattern => {
      const inferred = ambientModeService.inferModeFromPatterns(pattern.data);
      console.log(`[Inference Test] ${pattern.name}:`, inferred);
    });
  };

  const renderModeCard = (modeId: AmbientMode, config: AmbientModeConfig) => (
    <Card key={modeId} className={`cursor-pointer transition-colors ${
      currentMode === modeId ? 'border-primary bg-primary/5' : ''
    }`} onClick={() => handleModeChange(modeId)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-2xl">{config.icon}</span>
          {config.name}
          {currentMode === modeId && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Copy Tone: <Badge variant="outline">{config.copyTone}</Badge></div>
          <div>Notifications: <Badge variant="outline">{config.notificationCadence}</Badge></div>
          <div>Glimmers: <Badge variant="outline">{config.glimmerFrequency}</Badge></div>
          <div>Focus: <Badge variant="outline">{config.focusModeIntensity}</Badge></div>
          <div>CBT: <Badge variant="outline">{config.cbtApproach}</Badge></div>
          <div>Reminders: <Badge variant="outline">{config.reminderUrgency}</Badge></div>
        </div>
      </CardContent>
    </Card>
  );

  const renderCopyComparison = (context: keyof typeof sampleTexts, text: string) => {
    const originalText = text;
    const modifiedText = ambientModeService.getModeCopy(text, context);
    
    return (
      <div className="space-y-2">
        <Label className="font-medium capitalize">{context}</Label>
        <div className="grid gap-2">
          <div className="p-3 border rounded bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">Original</div>
            <div className="text-sm">{originalText}</div>
          </div>
          <div className="p-3 border rounded bg-primary/5">
            <div className="text-xs text-muted-foreground mb-1">
              {AMBIENT_MODES[currentMode].name} Mode
            </div>
            <div className="text-sm">{modifiedText}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Ambient Modes Dev</h1>
        <p className="text-muted-foreground">
          Test and configure behavioral modes that retune app behavior
        </p>
      </div>

      {/* Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Active Mode</CardTitle>
          <CardDescription>
            Select an ambient mode to change app behavior and copy tone
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(AMBIENT_MODES).map(config => 
              renderModeCard(config.id, config)
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inference Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Mode Inference</CardTitle>
          <CardDescription>
            Automatically suggest modes based on user patterns (opt-in)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="inference-toggle" className="flex flex-col gap-1">
              <span>Enable Mode Inference</span>
              <span className="text-sm text-muted-foreground">
                App will suggest mode changes based on patterns
              </span>
            </Label>
            <Switch
              id="inference-toggle"
              checked={inferenceEnabled}
              onCheckedChange={handleInferenceToggle}
            />
          </div>
          
          {inferenceEnabled && (
            <Button onClick={testInference} variant="outline">
              Test Inference Patterns
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Policy Deltas */}
      <Card>
        <CardHeader>
          <CardTitle>Policy Deltas</CardTitle>
          <CardDescription>
            See how copy changes based on the current mode
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(sampleTexts).map(([context, text]) => 
            renderCopyComparison(context as keyof typeof sampleTexts, text)
          )}
        </CardContent>
      </Card>

      {/* Deferral Testing */}
      <Card>
        <CardHeader>
          <CardTitle>Deferral Policy</CardTitle>
          <CardDescription>
            Current mode's approach to deferring actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {(['low', 'medium', 'high'] as const).map(urgency => (
              <div key={urgency} className="space-y-2">
                <Label className="font-medium capitalize">{urgency} Urgency</Label>
                {(['reminder', 'notification', 'prompt'] as const).map(action => (
                  <div key={action} className="flex items-center justify-between p-2 border rounded">
                    <span className="capitalize">{action}</span>
                    <Badge variant={
                      ambientModeService.shouldDefer(action, urgency) ? 'destructive' : 'default'
                    }>
                      {ambientModeService.shouldDefer(action, urgency) ? 'Deferred' : 'Active'}
                    </Badge>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}