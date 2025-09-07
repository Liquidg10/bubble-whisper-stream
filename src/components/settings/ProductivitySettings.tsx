import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Timer, Play, Pause, RotateCcw } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { pomodoroService } from '@/services/pomodoroService';

export const ProductivitySettings: React.FC = () => {
  const { settings, updateSettings } = useBubbleStore();
  const timerState = pomodoroService.getState();
  
  const customization = {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoStartBreaks: false,
    autoStartWork: false,
    hapticFeedback: true,
    ...(settings.pomodoroCustomization ? {
      workDuration: Math.floor(settings.pomodoroCustomization.workDuration / 60),
      shortBreakDuration: Math.floor(settings.pomodoroCustomization.shortBreakDuration / 60),
      longBreakDuration: Math.floor(settings.pomodoroCustomization.longBreakDuration / 60),
      autoStartBreaks: settings.pomodoroCustomization.autoStartBreaks,
      autoStartWork: settings.pomodoroCustomization.autoStartWork,
      hapticFeedback: settings.pomodoroCustomization.hapticEnabled
    } : {})
  };

  const formatMinutes = (seconds: number) => Math.floor(seconds / 60);
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimerAction = (action: string) => {
    switch (action) {
      case 'start':
        pomodoroService.startTimer('work');
        break;
      case 'pause':
        pomodoroService.pauseTimer();
        break;
      case 'resume':
        pomodoroService.resumeTimer();
        break;
      case 'clear':
        pomodoroService.resetTimer();
        break;
    }
  };

  const presets = [
    { name: 'Classic', work: 25, shortBreak: 5, longBreak: 15 },
    { name: 'Extended', work: 45, shortBreak: 10, longBreak: 30 },
    { name: 'Sprint', work: 15, shortBreak: 3, longBreak: 10 }
  ];

  const applyPreset = (preset: typeof presets[0]) => {
    updateSettings({
      pomodoroCustomization: {
        ...settings.pomodoroCustomization,
        workDuration: preset.work * 60,
        shortBreakDuration: preset.shortBreak * 60,
        longBreakDuration: preset.longBreak * 60
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Pomodoro Timer
          </CardTitle>
          <CardDescription>
            Focus technique using timed work sessions and breaks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Timer Status */}
          {timerState.duration > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Current Session</span>
                <Badge variant={timerState.isActive ? "default" : "secondary"}>
                  {timerState.isActive ? "Active" : "Paused"}
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-lg font-mono">{formatTime(timerState.timeRemaining)}</span>
                <span className="text-sm text-muted-foreground capitalize">{timerState.currentPhase}</span>
                <div className="flex gap-2 ml-auto">
                  {timerState.isActive ? (
                    <Button size="sm" variant="outline" onClick={() => handleTimerAction('pause')}>
                      <Pause className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleTimerAction('resume')}>
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleTimerAction('clear')}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Presets */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Quick Presets</Label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className="flex flex-col p-3 h-auto"
                >
                  <span className="font-medium">{preset.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {preset.work}/{preset.shortBreak}/{preset.longBreak}m
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Duration Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Work Duration: {customization.workDuration} minutes
              </Label>
              <Slider
                value={[customization.workDuration]}
                onValueChange={([value]) => 
                  updateSettings({
                    pomodoroCustomization: { 
                      ...settings.pomodoroCustomization, 
                      workDuration: value * 60 
                    }
                  })
                }
                min={5}
                max={60}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Short Break: {customization.shortBreakDuration} minutes
              </Label>
              <Slider
                value={[customization.shortBreakDuration]}
                onValueChange={([value]) => 
                  updateSettings({
                    pomodoroCustomization: { 
                      ...settings.pomodoroCustomization, 
                      shortBreakDuration: value * 60 
                    }
                  })
                }
                min={1}
                max={15}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Long Break: {customization.longBreakDuration} minutes
              </Label>
              <Slider
                value={[customization.longBreakDuration]}
                onValueChange={([value]) => 
                  updateSettings({
                    pomodoroCustomization: { 
                      ...settings.pomodoroCustomization, 
                      longBreakDuration: value * 60 
                    }
                  })
                }
                min={5}
                max={45}
                step={5}
                className="w-full"
              />
            </div>
          </div>

          {/* Auto-start Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-start Breaks</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically start break sessions
                </p>
              </div>
              <Switch
                checked={customization.autoStartBreaks}
                onCheckedChange={(checked) =>
                  updateSettings({
                    pomodoroCustomization: { 
                      ...settings.pomodoroCustomization, 
                      autoStartBreaks: checked 
                    }
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-start Work</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically start work sessions after breaks
                </p>
              </div>
              <Switch
                checked={customization.autoStartWork}
                onCheckedChange={(checked) =>
                  updateSettings({
                    pomodoroCustomization: { 
                      ...settings.pomodoroCustomization, 
                      autoStartWork: checked 
                    }
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Haptic Feedback</Label>
                <p className="text-xs text-muted-foreground">
                  Vibrate on phase transitions (mobile)
                </p>
              </div>
              <Switch
                checked={customization.hapticFeedback}
                onCheckedChange={(checked) =>
                  updateSettings({
                    pomodoroCustomization: { 
                      ...settings.pomodoroCustomization, 
                      hapticEnabled: checked 
                    }
                  })
                }
              />
            </div>
          </div>

          {/* Start Timer Button */}
          {timerState.duration === 0 && (
            <Button 
              onClick={() => handleTimerAction('start')} 
              className="w-full"
              size="lg"
            >
              <Timer className="h-4 w-4 mr-2" />
              Start Pomodoro Session
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};