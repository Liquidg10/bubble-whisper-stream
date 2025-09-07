import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Timer, 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  Settings2,
  Coffee,
  Brain
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { SessionCelebration } from './SessionCelebration';
import { pomodoroService } from '@/services/pomodoroService';

export function PomodoroTimer() {
  const { settings, updateSettings } = useBubbleStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const timer = settings.pomodoroTimer;
  const isActive = timer?.isActive || false;
  const timeRemaining = timer?.timeRemaining || 0;
  const currentPhase = timer?.currentPhase || 'work';
  const cycleCount = timer?.cycleCount || 0;
  const isPaused = timer && !timer.startTime;

  // Default customization values
  const customization = {
    workDuration: 25 * 60, // 25 minutes in seconds
    shortBreakDuration: 5 * 60, // 5 minutes
    longBreakDuration: 15 * 60, // 15 minutes
    cyclesBeforeLongBreak: 4,
    celebrationMessage: "Great focus session! 🍅",
    hapticEnabled: true,
    autoStartBreaks: false,
    autoStartWork: false,
    ...settings.pomodoroCustomization
  };

  // Remove countdown logic - now handled by pomodoroService

  // Phase complete handling moved to pomodoroService

  const startTimer = (phase = currentPhase, duration?: number) => {
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
    switch (currentPhase) {
      case 'work':
        return { 
          emoji: '🍅', 
          title: 'Focus Time', 
          color: 'bg-accent-growth', 
          icon: Brain 
        };
      case 'break':
        return { 
          emoji: '☕', 
          title: 'Short Break', 
          color: 'bg-accent-joy', 
          icon: Coffee 
        };
      case 'longBreak':
        return { 
          emoji: '🛌', 
          title: 'Long Break', 
          color: 'bg-accent-calm', 
          icon: Coffee 
        };
      default:
        return { 
          emoji: '🍅', 
          title: 'Focus Time', 
          color: 'bg-accent-growth', 
          icon: Brain 
        };
    }
  };

  const phaseInfo = getPhaseInfo();
  const progress = timer?.duration ? 
    ((timer.duration - timeRemaining) / timer.duration) * 100 : 0;

  if (showCelebration) {
    return (
      <SessionCelebration
        sessionType="pomodoro"
        phase={currentPhase}
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Pomodoro Timer
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timer Display */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <phaseInfo.icon className="h-6 w-6" />
              <Badge variant="secondary" className="text-sm">
                {phaseInfo.title} {phaseInfo.emoji}
              </Badge>
            </div>
            
            <div className="text-6xl font-mono font-bold">
              {formatTime(timeRemaining)}
            </div>

            <div className="text-sm text-muted-foreground">
              Cycle {cycleCount + 1}/{customization.cyclesBeforeLongBreak}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-1000 ${phaseInfo.color}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 justify-center">
            {!isActive ? (
              <Button onClick={() => startTimer()} className="gap-2">
                <Play className="h-4 w-4" />
                Start {phaseInfo.title}
              </Button>
            ) : isPaused ? (
              <Button onClick={resumeTimer} className="gap-2">
                <Play className="h-4 w-4" />
                Resume {phaseInfo.title}
              </Button>
            ) : (
              <Button onClick={pauseTimer} variant="outline" className="gap-2">
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            )}
            
            <Button onClick={resetTimer} variant="outline" size="sm">
              <RotateCcw className="h-4 w-4" />
            </Button>
            
            <Button onClick={skipPhase} variant="outline" size="sm">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Panel */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Pomodoro Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Work Duration: {Math.floor(customization.workDuration / 60)} minutes</Label>
                <Slider
                  value={[customization.workDuration / 60]}
                  onValueChange={([value]) => 
                    updateSettings({
                      pomodoroCustomization: {
                        ...customization,
                        workDuration: value * 60
                      }
                    })
                  }
                  min={15}
                  max={60}
                  step={5}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Short Break: {Math.floor(customization.shortBreakDuration / 60)} minutes</Label>
                <Slider
                  value={[customization.shortBreakDuration / 60]}
                  onValueChange={([value]) => 
                    updateSettings({
                      pomodoroCustomization: {
                        ...customization,
                        shortBreakDuration: value * 60
                      }
                    })
                  }
                  min={3}
                  max={15}
                  step={1}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Long Break: {Math.floor(customization.longBreakDuration / 60)} minutes</Label>
                <Slider
                  value={[customization.longBreakDuration / 60]}
                  onValueChange={([value]) => 
                    updateSettings({
                      pomodoroCustomization: {
                        ...customization,
                        longBreakDuration: value * 60
                      }
                    })
                  }
                  min={10}
                  max={30}
                  step={5}
                  className="mt-2"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-breaks">Auto-start breaks</Label>
                <Switch
                  id="auto-breaks"
                  checked={customization.autoStartBreaks}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      pomodoroCustomization: {
                        ...customization,
                        autoStartBreaks: checked
                      }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-work">Auto-start work sessions</Label>
                <Switch
                  id="auto-work"
                  checked={customization.autoStartWork}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      pomodoroCustomization: {
                        ...customization,
                        autoStartWork: checked
                      }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="haptic">Haptic feedback</Label>
                <Switch
                  id="haptic"
                  checked={customization.hapticEnabled}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      pomodoroCustomization: {
                        ...customization,
                        hapticEnabled: checked
                      }
                    })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}