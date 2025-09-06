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
import { hapticsService } from '@/services/haptics';
import { useToast } from '@/hooks/use-toast';
import { SessionCelebration } from './SessionCelebration';

export function PomodoroTimer() {
  const { settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  const [showSettings, setShowSettings] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const isActive = settings.pomodoroTimer?.isActive || false;
  const timeRemaining = settings.pomodoroTimer?.timeRemaining || 0;
  const currentPhase = settings.pomodoroTimer?.currentPhase || 'work';
  const cycleCount = settings.pomodoroTimer?.cycleCount || 0;

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

  // Timer countdown logic
  useEffect(() => {
    if (!isActive || !settings.pomodoroTimer?.startTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - settings.pomodoroTimer!.startTime!) / 1000);
      const newTimeRemaining = Math.max(0, settings.pomodoroTimer!.duration - elapsed);

      if (newTimeRemaining === 0) {
        handlePhaseComplete();
        return;
      }

      updateSettings({
        pomodoroTimer: {
          ...settings.pomodoroTimer!,
          timeRemaining: newTimeRemaining
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, settings.pomodoroTimer?.startTime]);

  const handlePhaseComplete = () => {
    // Stop current timer
    updateSettings({
      pomodoroTimer: {
        ...settings.pomodoroTimer!,
        isActive: false,
        startTime: null
      }
    });

    // Trigger haptics and celebration
    if (customization.hapticEnabled) {
      hapticsService.success();
    }

    const currentCycle = settings.pomodoroTimer?.cycleCount || 0;
    let nextPhase: 'work' | 'break' | 'longBreak';
    let nextCycleCount = currentCycle;
    let celebrationMessage = customization.celebrationMessage;

    if (currentPhase === 'work') {
      nextCycleCount = currentCycle + 1;
      
      if (nextCycleCount >= customization.cyclesBeforeLongBreak) {
        nextPhase = 'longBreak';
        nextCycleCount = 0;
        celebrationMessage = "Excellent work cycle complete! Time for a long break 🛌";
      } else {
        nextPhase = 'break';
        celebrationMessage = "Great focus! Time for a short break ☕";
      }
    } else {
      nextPhase = 'work';
      celebrationMessage = "Break's over! Ready to focus again? 🍅";
    }

    // Update phase and cycle count
    const nextDuration = nextPhase === 'work' 
      ? customization.workDuration
      : nextPhase === 'break'
      ? customization.shortBreakDuration
      : customization.longBreakDuration;

    updateSettings({
      pomodoroTimer: {
        ...settings.pomodoroTimer!,
        currentPhase: nextPhase,
        cycleCount: nextCycleCount,
        duration: nextDuration,
        timeRemaining: nextDuration
      }
    });

    // Show celebration
    setShowCelebration(true);
    
    toast({
      title: "Phase Complete!",
      description: celebrationMessage,
    });

    // Auto-start next phase if enabled
    const shouldAutoStart = (nextPhase === 'work' && customization.autoStartWork) ||
                           (nextPhase !== 'work' && customization.autoStartBreaks);
    
    if (shouldAutoStart) {
      setTimeout(() => startTimer(nextPhase, nextDuration), 3000);
    }
  };

  const startTimer = (phase = currentPhase, duration?: number) => {
    const timerDuration = duration || (phase === 'work' 
      ? customization.workDuration
      : phase === 'break'
      ? customization.shortBreakDuration
      : customization.longBreakDuration);

    const startTime = Date.now();
    updateSettings({
      pomodoroTimer: {
        isActive: true,
        timeRemaining: timerDuration,
        duration: timerDuration,
        startTime,
        currentPhase: phase,
        cycleCount: settings.pomodoroTimer?.cycleCount || 0
      }
    });

    toast({
      title: `${phase === 'work' ? 'Focus' : 'Break'} Session Started`,
      description: `${Math.floor(timerDuration / 60)} minutes of ${phase === 'work' ? 'focused work' : 'well-deserved rest'}`,
    });
  };

  const pauseTimer = () => {
    updateSettings({
      pomodoroTimer: {
        ...settings.pomodoroTimer!,
        isActive: false,
        startTime: null
      }
    });
  };

  const resetTimer = () => {
    const defaultDuration = customization.workDuration;
    updateSettings({
      pomodoroTimer: {
        isActive: false,
        timeRemaining: defaultDuration,
        duration: defaultDuration,
        startTime: null,
        currentPhase: 'work',
        cycleCount: 0
      }
    });
  };

  const skipPhase = () => {
    handlePhaseComplete();
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
  const progress = settings.pomodoroTimer?.duration ? 
    ((settings.pomodoroTimer.duration - timeRemaining) / settings.pomodoroTimer.duration) * 100 : 0;

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