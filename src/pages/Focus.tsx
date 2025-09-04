import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, SkipForward, CheckCircle, RotateCcw, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ttsService } from '@/services/tts';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { TaskStep } from '@/services/outliner';

interface FocusSession {
  id: string;
  steps: TaskStep[];
  currentStepIndex: number;
  sessionStarted: number;
  totalFocusTime: number; // in seconds
  totalBreakTime: number; // in seconds
  completed: boolean;
}

interface TimerState {
  timeLeft: number; // in seconds
  isRunning: boolean;
  isBreak: boolean;
  cycleCount: number;
}

const FOCUS_DURATION = 25 * 60; // 25 minutes
const SHORT_BREAK = 5 * 60; // 5 minutes
const LONG_BREAK = 15 * 60; // 15 minutes

export const Focus: React.FC = () => {
  const { addBubble } = useBubbleStore();
  const { toast } = useToast();
  
  const [session, setSession] = useState<FocusSession | null>(null);
  const [timer, setTimer] = useState<TimerState>({
    timeLeft: FOCUS_DURATION,
    isRunning: false,
    isBreak: false,
    cycleCount: 0,
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [sessionLog, setSessionLog] = useState<string[]>([]);

  // Mock steps for demo (in production, these would come from selected task)
  const mockSteps: TaskStep[] = [
    { id: '1', title: 'Review requirements and plan approach', estMins: 25 },
    { id: '2', title: 'Complete first draft', estMins: 25 },
    { id: '3', title: 'Review and refine', estMins: 25 },
    { id: '4', title: 'Finalize and submit', estMins: 15 },
  ];

  useEffect(() => {
    if (timer.isRunning && timer.timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimer(prev => ({
          ...prev,
          timeLeft: Math.max(0, prev.timeLeft - 1)
        }));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timer.isRunning, timer.timeLeft]);

  // Handle timer completion
  useEffect(() => {
    if (timer.timeLeft === 0 && timer.isRunning) {
      handleTimerComplete();
    }
  }, [timer.timeLeft, timer.isRunning]);

  const startSession = () => {
    const newSession: FocusSession = {
      id: crypto.randomUUID(),
      steps: mockSteps,
      currentStepIndex: 0,
      sessionStarted: Date.now(),
      totalFocusTime: 0,
      totalBreakTime: 0,
      completed: false,
    };
    
    setSession(newSession);
    setSessionLog([`Started focus session at ${new Date().toLocaleTimeString()}`]);
    
    // TTS brief
    if (mockSteps[0]) {
      ttsService.speak(
        `Starting focus session. First step: ${mockSteps[0].title}. You have 25 minutes. Let's begin.`,
        { context: 'focus-mode', tone: 'encouraging' }
      );
    }
    
    toast({
      title: "Focus Session Started",
      description: "25-minute timer is ready. Press Space to start.",
    });
  };

  const toggleTimer = () => {
    setTimer(prev => ({ ...prev, isRunning: !prev.isRunning }));
    
    if (!timer.isRunning) {
      addSessionLog(`${timer.isBreak ? 'Break' : 'Focus'} timer started`);
    } else {
      addSessionLog(`${timer.isBreak ? 'Break' : 'Focus'} timer paused`);
    }
  };

  const handleTimerComplete = () => {
    setTimer(prev => ({ ...prev, isRunning: false }));
    
    if (timer.isBreak) {
      // Break completed, start next focus session
      const nextBreakDuration = timer.cycleCount % 4 === 3 ? LONG_BREAK : SHORT_BREAK;
      setTimer(prev => ({
        ...prev,
        timeLeft: FOCUS_DURATION,
        isBreak: false,
      }));
      
      addSessionLog(`Break completed. Ready for next focus session.`);
      
      ttsService.speak(
        "Break time is over. Ready to focus again?",
        { context: 'focus-mode', tone: 'encouraging' }
      );
      
      toast({
        title: "Break Complete",
        description: "Ready for the next focus session",
      });
    } else {
      // Focus session completed
      if (session) {
        setSession(prev => prev ? {
          ...prev,
          totalFocusTime: prev.totalFocusTime + FOCUS_DURATION,
        } : null);
      }
      
      const isLongBreak = timer.cycleCount % 4 === 3;
      const breakDuration = isLongBreak ? LONG_BREAK : SHORT_BREAK;
      
      setTimer(prev => ({
        ...prev,
        timeLeft: breakDuration,
        isBreak: true,
        cycleCount: prev.cycleCount + 1,
      }));
      
      addSessionLog(`Focus session completed. Starting ${isLongBreak ? 'long' : 'short'} break.`);
      
      ttsService.speak(
        `Great work! Focus session complete. Time for a ${isLongBreak ? '15-minute long' : '5-minute'} break.`,
        { context: 'focus-mode', tone: 'celebratory' }
      );
      
      toast({
        title: "Focus Session Complete!",
        description: `Time for a ${isLongBreak ? 'long' : 'short'} break`,
      });
    }
  };

  const completeCurrentStep = () => {
    if (!session) return;
    
    const currentStep = session.steps[session.currentStepIndex];
    addSessionLog(`Completed step: ${currentStep.title}`);
    
    if (session.currentStepIndex < session.steps.length - 1) {
      setSession(prev => prev ? {
        ...prev,
        currentStepIndex: prev.currentStepIndex + 1,
      } : null);
      
      const nextStep = session.steps[session.currentStepIndex + 1];
      ttsService.speak(
        `Step completed! Next: ${nextStep.title}`,
        { context: 'focus-mode', tone: 'encouraging' }
      );
    } else {
      // All steps completed
      completeSession();
    }
  };

  const completeSession = async () => {
    if (!session) return;
    
    setSession(prev => prev ? { ...prev, completed: true } : null);
    setTimer(prev => ({ ...prev, isRunning: false }));
    
    addSessionLog(`Session completed at ${new Date().toLocaleTimeString()}`);
    
    // Create focus session bubble
    const sessionBubble: Bubble = {
      id: crypto.randomUUID(),
      type: 'Memory',
      content: `Focus Session: Completed ${session.steps.length} steps in ${Math.round(session.totalFocusTime / 60)} minutes`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: Math.random() * 400,
      y: Math.random() * 400,
      size: 0.8,
      tags: [
        { id: crypto.randomUUID(), name: 'Focus Session', emoji: '🎯' },
        { id: crypto.randomUUID(), name: `${session.steps.length} steps`, emoji: '📝' },
      ],
      metadata: {
        focusSession: {
          duration: session.totalFocusTime,
          stepsCompleted: session.steps.length,
          log: sessionLog,
        }
      }
    };
    
    await addBubble(sessionBubble);
    
    ttsService.speak(
      "Congratulations! Focus session complete. Great work today.",
      { context: 'focus-mode', tone: 'celebratory' }
    );
    
    toast({
      title: "Session Complete! 🎉",
      description: "Focus session logged as a memory bubble",
    });
  };

  const addSessionLog = (entry: string) => {
    setSessionLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${entry}`]);
  };

  const resetSession = () => {
    setSession(null);
    setTimer({
      timeLeft: FOCUS_DURATION,
      isRunning: false,
      isBreak: false,
      cycleCount: 0,
    });
    setSessionLog([]);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (session) {
          toggleTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [session, timer.isRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = timer.isBreak 
    ? ((timer.cycleCount % 4 === 3 ? LONG_BREAK : SHORT_BREAK) - timer.timeLeft) / (timer.cycleCount % 4 === 3 ? LONG_BREAK : SHORT_BREAK) * 100
    : (FOCUS_DURATION - timer.timeLeft) / FOCUS_DURATION * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Focus Mode</h1>
          <p className="text-muted-foreground">Pomodoro technique with task breakdown</p>
        </div>

        {!session ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Start Focus Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Demo Steps:</h3>
                  <div className="space-y-2">
                    {mockSteps.map((step, index) => (
                      <div key={step.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span>{step.title}</span>
                        <Badge variant="secondary" className="text-xs">{step.estMins}min</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={startSession} className="w-full">
                  Start Focus Session
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Timer Display */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="text-6xl font-mono font-bold text-primary">
                    {formatTime(timer.timeLeft)}
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant={timer.isBreak ? "secondary" : "default"}>
                      {timer.isBreak ? 'Break Time' : 'Focus Time'}
                    </Badge>
                    <Badge variant="outline">
                      Cycle {timer.cycleCount + 1}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Current Step */}
            {!timer.isBreak && session.currentStepIndex < session.steps.length && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Current Step</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {session.steps[session.currentStepIndex].title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Step {session.currentStepIndex + 1} of {session.steps.length}
                      </p>
                    </div>
                    <Button
                      onClick={completeCurrentStep}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Complete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <Button
                onClick={toggleTimer}
                size="lg"
                className="bg-primary hover:bg-primary/90"
              >
                {timer.isRunning ? (
                  <>
                    <Pause className="h-5 w-5 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Start
                  </>
                )}
              </Button>
              
              <Button
                onClick={resetSession}
                variant="outline"
                size="lg"
              >
                <RotateCcw className="h-5 w-5 mr-2" />
                Reset
              </Button>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Press <Badge variant="outline" className="px-2 py-1 text-xs">Space</Badge> to start/pause timer
            </div>
          </div>
        )}
      </div>
    </div>
  );
};