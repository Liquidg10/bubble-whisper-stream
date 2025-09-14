/**
 * Activation Ritual Integration - Production integration of ritual system
 * Connects rituals with app startup, task transitions, and user onboarding
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  Square, 
  SkipForward,
  Waves,
  Circle,
  CheckCircle2,
  Timer,
  Sparkles,
  Brain,
  Heart
} from 'lucide-react';
import { activationRitualService } from '@/services/activationRitualService';
import { useToast } from '@/hooks/use-toast';

interface RitualSession {
  id: string;
  type: 'startup' | 'context-switch' | 'overwhelm' | 'task-transition';
  startTime: number;
  endTime?: number;
  completed: boolean;
  breathCount: number;
  currentBreath: number;
  context?: {
    fromTask?: string;
    toTask?: string;
    triggerReason?: string;
  };
}

interface ActivationRitualIntegrationProps {
  showOnStartup?: boolean;
  onComplete?: () => void;
  triggerContext?: {
    type: 'startup' | 'context-switch' | 'overwhelm' | 'task-transition';
    metadata?: any;
  };
}

export const ActivationRitualIntegration: React.FC<ActivationRitualIntegrationProps> = ({
  showOnStartup = false,
  onComplete,
  triggerContext
}) => {
  const [currentSession, setCurrentSession] = useState<RitualSession | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [breathingPhase, setBreathingPhase] = useState<'inhale' | 'hold' | 'exhale' | 'pause'>('pause');
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [showRitual, setShowRitual] = useState(showOnStartup);
  const { toast } = useToast();

  // Breathing pattern timings (in seconds)
  const breathingPattern = {
    inhale: 4,
    hold: 4,
    exhale: 6,
    pause: 2
  };

  useEffect(() => {
    if (triggerContext) {
      startRitual(triggerContext.type, triggerContext.metadata);
    }
  }, [triggerContext]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && currentSession) {
      interval = setInterval(() => {
        updateBreathingCycle();
      }, 100); // Update every 100ms for smooth animation
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, breathingPhase, phaseProgress]);

  const startRitual = (type: RitualSession['type'], metadata?: any) => {
    const breathCount = type === 'overwhelm' ? 10 : type === 'startup' ? 5 : 3;
    
    const sessionId = activationRitualService.startRitual(
      type === 'startup' ? 'manual' : 
      type === 'context-switch' ? 'context-switch' :
      type === 'overwhelm' ? 'overwhelm-detected' : 'task-start',
      breathCount
    );
    
    const session: RitualSession = {
      id: sessionId,
      type,
      startTime: Date.now(),
      completed: false,
      breathCount,
      currentBreath: 0,
      context: metadata
    };
    
    setCurrentSession(session);
    setShowRitual(true);
    setIsActive(true);
    setBreathingPhase('inhale');
    setPhaseProgress(0);
    
    toast({
      title: "Ritual Started",
      description: getRitualDescription(type),
    });
  };

  const updateBreathingCycle = () => {
    if (!currentSession || !isActive) return;
    
    const phaseDuration = breathingPattern[breathingPhase] * 1000; // Convert to ms
    const increment = 100 / (phaseDuration / 100); // Progress per 100ms
    
    setPhaseProgress(prev => {
      const newProgress = prev + increment;
      
      if (newProgress >= 100) {
        // Move to next phase
        const nextPhase = getNextPhase(breathingPhase);
        setBreathingPhase(nextPhase);
        
        // If we completed a full breath cycle (back to inhale)
        if (nextPhase === 'inhale' && breathingPhase === 'pause') {
          setCurrentSession(prev => {
            if (!prev) return null;
            const newBreathCount = prev.currentBreath + 1;
            
            // Check if ritual is complete
            if (newBreathCount >= prev.breathCount) {
              completeRitual();
              return { ...prev, currentBreath: newBreathCount, completed: true };
            }
            
            return { ...prev, currentBreath: newBreathCount };
          });
        }
        
        return 0;
      }
      
      return newProgress;
    });
  };

  const getNextPhase = (current: typeof breathingPhase): typeof breathingPhase => {
    switch (current) {
      case 'inhale': return 'hold';
      case 'hold': return 'exhale';
      case 'exhale': return 'pause';
      case 'pause': return 'inhale';
      default: return 'inhale';
    }
  };

  const completeRitual = () => {
    if (!currentSession) return;
    
    activationRitualService.completeRitual(currentSession.id);
    setIsActive(false);
    
    setTimeout(() => {
      setShowRitual(false);
      setCurrentSession(null);
      onComplete?.();
    }, 2000); // Show completion state for 2 seconds
    
    toast({
      title: "Ritual Complete",
      description: "Well done! You're centered and ready to focus.",
    });
  };

  const pauseRitual = () => {
    setIsActive(false);
  };

  const resumeRitual = () => {
    setIsActive(true);
  };

  const skipRitual = () => {
    if (currentSession) {
      activationRitualService.cancelRitual(currentSession.id);
      setShowRitual(false);
      setCurrentSession(null);
      setIsActive(false);
      onComplete?.();
    }
  };

  const getRitualDescription = (type: RitualSession['type']): string => {
    switch (type) {
      case 'startup':
        return 'Welcome! Take a moment to center yourself before beginning.';
      case 'context-switch':
        return 'Transitioning between tasks. Let\'s reset your mental state.';
      case 'overwhelm':
        return 'Feeling overwhelmed? This ritual will help you regain clarity.';
      case 'task-transition':
        return 'Moving to a new task. Take a breath to maintain focus.';
      default:
        return 'Time for a mindful breathing ritual.';
    }
  };

  const getBreathingInstruction = (): string => {
    switch (breathingPhase) {
      case 'inhale':
        return 'Breathe in slowly...';
      case 'hold':
        return 'Hold your breath...';
      case 'exhale':
        return 'Breathe out gently...';
      case 'pause':
        return 'Pause and relax...';
      default:
        return 'Focus on your breathing...';
    }
  };

  const getPhaseIcon = () => {
    switch (breathingPhase) {
      case 'inhale':
        return <Circle className="h-8 w-8 text-blue-500" />;
      case 'hold':
        return <Square className="h-8 w-8 text-purple-500" />;
      case 'exhale':
        return <Waves className="h-8 w-8 text-green-500" />;
      case 'pause':
        return <Circle className="h-8 w-8 text-gray-500" />;
      default:
        return <Circle className="h-8 w-8" />;
    }
  };

  const getRitualTypeIcon = (type: string) => {
    switch (type) {
      case 'startup':
        return <Sparkles className="h-5 w-5 text-yellow-500" />;
      case 'context-switch':
        return <Brain className="h-5 w-5 text-blue-500" />;
      case 'overwhelm':
        return <Heart className="h-5 w-5 text-red-500" />;
      case 'task-transition':
        return <SkipForward className="h-5 w-5 text-green-500" />;
      default:
        return <Circle className="h-5 w-5" />;
    }
  };

  if (!showRitual || !currentSession) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {getRitualTypeIcon(currentSession.type)}
            <CardTitle className="capitalize">
              {currentSession.type.replace('-', ' ')} Ritual
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {getRitualDescription(currentSession.type)}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Breathing Animation */}
          <div className="text-center space-y-4">
            <div className="relative mx-auto w-32 h-32 flex items-center justify-center">
              {/* Animated circle for breathing */}
              <div 
                className={`absolute rounded-full border-4 transition-all duration-100 ${
                  breathingPhase === 'inhale' || breathingPhase === 'hold' 
                    ? 'w-28 h-28 border-primary' 
                    : 'w-20 h-20 border-muted-foreground'
                }`}
                style={{
                  transform: `scale(${0.7 + (phaseProgress / 100) * 0.3})`,
                  opacity: 0.3 + (phaseProgress / 100) * 0.7
                }}
              />
              <div className="z-10">
                {getPhaseIcon()}
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-medium capitalize">
                {breathingPhase}
              </h3>
              <p className="text-sm text-muted-foreground">
                {getBreathingInstruction()}
              </p>
              <Progress value={phaseProgress} className="w-full" />
            </div>
          </div>
          
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress</span>
              <span>{currentSession.currentBreath} / {currentSession.breathCount}</span>
            </div>
            <Progress 
              value={(currentSession.currentBreath / currentSession.breathCount) * 100} 
              className="w-full"
            />
          </div>
          
          {/* Completion Status */}
          {currentSession.completed && (
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-green-600 font-medium">Ritual Complete!</p>
              <p className="text-sm text-muted-foreground">
                You're centered and ready to focus.
              </p>
            </div>
          )}
          
          {/* Controls */}
          {!currentSession.completed && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={isActive ? pauseRitual : resumeRitual}
              >
                {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button variant="outline" size="sm" onClick={skipRitual}>
                Skip
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};