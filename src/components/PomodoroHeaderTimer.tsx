import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Timer, Pause, Play, SkipForward } from 'lucide-react';

export function PomodoroHeaderTimer() {
  const { settings, updateSettings } = useBubbleStore();
  const [showModal, setShowModal] = useState(false);

  if (!settings.pomodoroTimer?.isActive) {
    return null;
  }

  const { timeRemaining, currentPhase, cycleCount } = settings.pomodoroTimer;
  const { cyclesBeforeLongBreak } = settings.pomodoroCustomization || {};

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseEmoji = () => {
    switch (currentPhase) {
      case 'work': return '🍅';
      case 'break': return '☕';
      case 'longBreak': return '🛌';
      default: return '🍅';
    }
  };

  const getPhaseColor = () => {
    switch (currentPhase) {
      case 'work': return 'bg-accent-growth';
      case 'break': return 'bg-accent-joy';
      case 'longBreak': return 'bg-accent-calm';
      default: return 'bg-accent-growth';
    }
  };

  const progress = settings.pomodoroTimer.duration > 0 
    ? ((settings.pomodoroTimer.duration - timeRemaining) / settings.pomodoroTimer.duration) * 100 
    : 0;

  const pauseTimer = () => {
    updateSettings({
      pomodoroTimer: {
        ...settings.pomodoroTimer!,
        isActive: false
      }
    });
  };

  const resumeTimer = () => {
    updateSettings({
      pomodoroTimer: {
        ...settings.pomodoroTimer!,
        isActive: true,
        startTime: Date.now()
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowModal(true)}
        className="relative h-8 px-2 gap-1"
      >
        <div className="flex items-center gap-1">
          <Timer className="h-3 w-3" />
          <span className="text-xs font-mono">{formatTime(timeRemaining)}</span>
          <span className="text-xs">{getPhaseEmoji()}</span>
        </div>
        <div 
          className={`absolute bottom-0 left-0 h-0.5 transition-all duration-1000 ${getPhaseColor()}`}
          style={{ width: `${progress}%` }}
        />
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getPhaseEmoji()} Pomodoro Timer
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 text-center">
            <div className="text-4xl font-mono">
              {formatTime(timeRemaining)}
            </div>
            
            <Badge variant="secondary" className="text-sm">
              {currentPhase === 'work' ? 'Focus Time' : 
               currentPhase === 'break' ? 'Short Break' : 'Long Break'}
            </Badge>

            {cyclesBeforeLongBreak && (
              <p className="text-sm text-muted-foreground">
                Cycle {cycleCount}/{cyclesBeforeLongBreak}
              </p>
            )}

            <div className="flex gap-2 justify-center">
              <Button onClick={() => setShowModal(false)}>
                Continue
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={settings.pomodoroTimer?.startTime ? pauseTimer : resumeTimer}
              >
                {settings.pomodoroTimer?.startTime ? (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Resume
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}