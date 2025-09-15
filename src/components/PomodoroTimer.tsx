import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Timer, 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  CheckCircle2,
  Coffee,
  Brain
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { pomodoroService } from '@/services/pomodoroService';
import { SessionCelebration } from '@/components/SessionCelebration';

export function PomodoroTimer() {
  const [showCelebration, setShowCelebration] = useState(false);
  const { settings, updateSettings } = useBubbleStore();

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

  // Get timer state from pomodoroService
  const timerState = pomodoroService.getState();

  const startTimer = (phase: 'work' | 'break' | 'longBreak' = 'work', duration?: number) => {
    pomodoroService.startTimer(phase, duration);
  };

  const pauseTimer = () => {
    pomodoroService.pauseTimer();
  };

  const resumeTimer = () => {
    pomodoroService.resumeTimer();
  };

  const resetTimer = () => {
    pomodoroService.resetTimer();
  };

  const skipPhase = () => {
    pomodoroService.skipPhase();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseInfo = () => {
    switch (timerState.currentPhase) {
      case 'work':
        return { 
          emoji: '🍅', 
          title: 'Focus Time', 
          color: 'bg-red-500', 
          icon: <Brain className="h-5 w-5" />
        };
      case 'break':
        return { 
          emoji: '☕', 
          title: 'Short Break', 
          color: 'bg-green-500', 
          icon: <Coffee className="h-5 w-5" />
        };
      case 'longBreak':
        return { 
          emoji: '🛌', 
          title: 'Long Break', 
          color: 'bg-blue-500', 
          icon: <Coffee className="h-5 w-5" />
        };
      default:
        return { 
          emoji: '🍅', 
          title: 'Ready to Focus', 
          color: 'bg-gray-500', 
          icon: <Timer className="h-5 w-5" />
        };
    }
  };

  // Quick presets for easy setup
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

  if (showCelebration) {
    return (
      <SessionCelebration
        sessionType="pomodoro"
        phase={timerState.currentPhase}
        onComplete={() => setShowCelebration(false)}
        onRestart={() => {
          setShowCelebration(false);
          startTimer();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Timer Display */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          {getPhaseInfo().icon}
          <Badge variant="secondary" className="text-sm">
            {getPhaseInfo().title} {getPhaseInfo().emoji}
          </Badge>
        </div>
        
        <div className="text-4xl font-mono font-bold">
          {formatTime(timerState.timeRemaining)}
        </div>
        
        <Progress 
          value={((timerState.duration - timerState.timeRemaining) / timerState.duration) * 100} 
          className="w-full"
        />
        
        <div className="text-sm text-muted-foreground">
          Cycle {timerState.cycleCount} • {formatTime(timerState.duration)} sessions
        </div>
      </div>

      <div className="flex justify-center gap-2">
        {timerState.duration === 0 ? (
          <Button onClick={() => startTimer('work')} className="gap-2">
            <Play className="h-4 w-4" />
            Start Pomodoro
          </Button>
        ) : (
          <>
            {timerState.isActive ? (
              <Button onClick={pauseTimer} variant="outline" className="gap-2">
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            ) : (
              <Button onClick={resumeTimer} className="gap-2">
                <Play className="h-4 w-4" />
                Resume
              </Button>
            )}
            <Button onClick={resetTimer} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button onClick={skipPhase} variant="outline" className="gap-2">
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
          </>
        )}
      </div>

      {/* Settings Panel - Always Visible */}
      <Card>
        <CardHeader>
          <CardTitle>Timer Settings</CardTitle>
          <CardDescription>Customize your Pomodoro experience</CardDescription>
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
              onClick={() => startTimer('work')} 
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
}