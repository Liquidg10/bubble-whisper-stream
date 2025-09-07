import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Timer, Pause, Play, SkipForward } from 'lucide-react';
import { pomodoroService } from '@/services/pomodoroService';

export function PomodoroHeaderTimer() {
  const { settings } = useBubbleStore();
  const [showModal, setShowModal] = useState(false);

  const timerState = pomodoroService.getState();
  if (timerState.duration === 0) {
    return null;
  }

  const { timeRemaining, currentPhase, cycleCount, isActive } = timerState;
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

  const progress = timerState.duration > 0 
    ? ((timerState.duration - timeRemaining) / timerState.duration) * 100 
    : 0;

  const isPaused = !isActive;

  const handleTogglePause = () => {
    if (isPaused) {
      pomodoroService.resumeTimer();
    } else {
      pomodoroService.pauseTimer();
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="default"
        onClick={() => setShowModal(true)}
        className="relative h-12 px-4 gap-3 bg-accent-primary/10 hover:bg-accent-primary/20 border border-accent-primary/30"
      >
        <div className="flex items-center gap-3">
          <Timer className="h-4 w-4 text-accent-primary" />
          <span className="text-base font-mono font-semibold text-accent-primary">{formatTime(timeRemaining)}</span>
          <span className="text-base">{getPhaseEmoji()}</span>
          {isPaused && <Pause className="h-4 w-4 text-accent-flow animate-pulse" />}
        </div>
        <div 
          className={`absolute bottom-0 left-0 h-2 transition-all duration-1000 ${getPhaseColor()} rounded-full`}
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
                onClick={handleTogglePause}
              >
                {isPaused ? (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Pause
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  pomodoroService.skipPhase();
                  setShowModal(false);
                }}
              >
                <SkipForward className="h-4 w-4 mr-1" />
                Skip
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}